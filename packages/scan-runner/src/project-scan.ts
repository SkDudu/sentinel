import {
  AuthType,
  ScanStatus,
  type Endpoint,
  type Environment,
  type RateLimitConfig,
  type TestCase,
  type TestCategory,
  type TestDataOptions,
  type Variable,
} from "@sw/core";
import {
  resolveAuthHeaders,
  MemorySecretStore,
  OverlaySecretStore,
  type SecretStore,
  environmentSecretRef,
} from "@sw/auth";
import type {
  EndpointRepository,
  EnvironmentRepository,
  FindingRepository,
  ProjectRepository,
  TestResultInput,
  TestResultRepository,
  TestRunRepository,
} from "@sw/database";
import { HttpExecutor, type RequestExecutor } from "@sw/http-client";
import { TestOrchestrator } from "@sw/security-engine";
import type { TestRegistry } from "@sw/test-registry";

export interface ScanRequest {
  projectId: string;
  environmentId: string;
  endpointIds?: string[];
  /** Optional one-off override — never written to the vault. */
  bearerToken?: string;
  /** Reviewed AI cases only — never regenerated/auto-run. */
  approvedAiCases?: TestCase[];
  /** When true, skip deterministic plugins; run only approvedAiCases. */
  aiOnly?: boolean;
  /** Limit registry plugins (+ deterministic options) to these suites. */
  categories?: TestCategory[];
  /** Scan variables for {{token}} / {{userId}} interpolation + authz fixtures. */
  variables?: Variable[];
  rateLimit?: Partial<RateLimitConfig>;
  /** Optional custom executor (e.g. ZapExecutor). */
  executor?: RequestExecutor;
  registry?: TestRegistry;
  /** Cancel between endpoints/cases (and HTTP when executor supports it). */
  signal?: AbortSignal;
  /** Live progress. Must not throw. */
  onEvent?: (event: ScanProgressEvent) => void;
}

export type ScanProgressEvent =
  | { type: "start"; endpoints: number; runId: string }
  | {
      type: "endpoint";
      index: number;
      total: number;
      method: string;
      path: string;
    }
  | {
      type: "case";
      method: string;
      path: string;
      name: string;
      completed: number;
      total: number;
      findings: number;
    }
  | {
      type: "endpoint-done";
      method: string;
      path: string;
      executed: number;
      findings: number;
    };

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  requests: 30,
  windowSeconds: 10,
  concurrency: 5,
  expectedStatus: 429,
};

export async function runProjectScan(
  input: ScanRequest,
  repos: {
    projects: ProjectRepository;
    environments: EnvironmentRepository;
    endpoints: EndpointRepository;
    findings: FindingRepository;
    runs: TestRunRepository;
    testResults?: TestResultRepository;
  },
  secretStore: SecretStore,
) {
  const project = await repos.projects.getById(input.projectId);
  if (!project) throw new Error("Project not found");

  const environment = await repos.environments.getById(input.environmentId);
  if (!environment || environment.projectId !== input.projectId) {
    throw new Error("Environment not found for project");
  }

  let targetEndpoints = await repos.endpoints.listByEnvironment(
    input.environmentId,
  );
  if (input.endpointIds?.length) {
    const allow = new Set(input.endpointIds);
    targetEndpoints = targetEndpoints.filter((e) => allow.has(e.id));
  }
  if (targetEndpoints.length === 0) {
    throw new Error(
      "No endpoints to scan — import OpenAPI on this environment first",
    );
  }

  const approved = input.approvedAiCases ?? [];
  if (input.aiOnly && approved.length === 0) {
    throw new Error("No approved AI cases to run");
  }

  const authEnv = ensureSecretRef(environment, input.bearerToken);
  const overlay = new MemorySecretStore();
  if (input.bearerToken && authEnv.secretRef) {
    await overlay.set(authEnv.secretRef, input.bearerToken);
  }
  const store = new OverlaySecretStore(secretStore, overlay);

  const rateLimit: RateLimitConfig = {
    ...DEFAULT_RATE_LIMIT,
    ...input.rateLimit,
  };

  const executor =
    input.executor ??
    new HttpExecutor({
      timeoutMs: environment.productionSafetyMode ? 10_000 : 15_000,
      maxRequestsPerMinute: environment.productionSafetyMode
        ? 30
        : rateLimit.requests * 6,
      signal: input.signal,
    });
  const authHeaders = await resolveAuthHeaders(authEnv, store, { executor });

  const run = await repos.runs.create({
    projectId: input.projectId,
    environmentId: input.environmentId,
  });

  const orchestrator = new TestOrchestrator(input.registry);

  let totalCases = 0;
  let completedCases = 0;
  const allFindings = [];
  const allResults: TestResultInput[] = [];
  let cancelled = Boolean(input.signal?.aborted);

  const casesByEndpoint = groupCasesByEndpoint(approved, targetEndpoints);
  const sharedVariables: Variable[] = [...(input.variables ?? [])];

  input.onEvent?.({
    type: "start",
    endpoints: targetEndpoints.length,
    runId: run.id,
  });

  try {
    let index = 0;
    for (const endpoint of targetEndpoints as Endpoint[]) {
      if (input.signal?.aborted) {
        cancelled = true;
        break;
      }

      const extraCases = casesByEndpoint.get(endpoint.id) ?? [];
      if (input.aiOnly && extraCases.length === 0) continue;

      index += 1;
      input.onEvent?.({
        type: "endpoint",
        index,
        total: targetEndpoints.length,
        method: endpoint.method,
        path: endpoint.path,
      });

      const result = await orchestrator.run({
        endpoint,
        baseUrl: environment.baseUrl,
        authHeaders,
        variables: sharedVariables,
        executor,
        extraCases,
        skipPlugins: Boolean(input.aiOnly),
        categories: input.aiOnly ? undefined : input.categories,
        productionSafetyMode: environment.productionSafetyMode,
        rateLimit,
        signal: input.signal,
        onProgress: ({ completed, total, testCase, findings }) => {
          input.onEvent?.({
            type: "case",
            method: endpoint.method,
            path: endpoint.path,
            name: testCase.name,
            completed,
            total,
            findings,
          });
        },
        options: optionsForCategories(input.categories, Boolean(input.aiOnly)),
      });

      for (const [key, value] of Object.entries(result.context.variables)) {
        const existing = sharedVariables.find((v) => v.key === key);
        if (existing) existing.value = value;
        else sharedVariables.push({ key, value, source: "extract" });
      }

      totalCases += result.cases.length;
      completedCases += result.executed;
      allFindings.push(...result.findings);
      allResults.push(...result.results);

      input.onEvent?.({
        type: "endpoint-done",
        method: endpoint.method,
        path: endpoint.path,
        executed: result.executed,
        findings: result.findings.length,
      });

      if (result.cancelled) {
        cancelled = true;
        break;
      }
    }

    if (!cancelled && input.aiOnly && totalCases === 0) {
      throw new Error(
        "Approved AI cases do not match selected endpoints (set endpointId on cases)",
      );
    }

    await repos.findings.createMany(allFindings, run.id);
    if (repos.testResults && allResults.length > 0) {
      await repos.testResults.createMany(run.id, allResults);
    }

    const completed = await repos.runs.complete(run.id, {
      status: cancelled ? ScanStatus.CANCELLED : ScanStatus.COMPLETED,
      totalCases,
      completedCases,
      findingsCount: allFindings.length,
    });

    return {
      run: completed ?? run,
      findings: allFindings,
      endpointsScanned: targetEndpoints.length,
      totalCases,
      variables: sharedVariables,
      cancelled,
    };
  } catch (error) {
    await repos.findings.createMany(allFindings, run.id).catch(() => undefined);
    if (repos.testResults && allResults.length > 0) {
      await repos.testResults
        .createMany(run.id, allResults)
        .catch(() => undefined);
    }
    await repos.runs.complete(run.id, {
      status: input.signal?.aborted
        ? ScanStatus.CANCELLED
        : ScanStatus.FAILED,
      totalCases,
      completedCases,
      findingsCount: allFindings.length,
    });
    throw error;
  }
}

function optionsForCategories(
  categories: TestCategory[] | undefined,
  aiOnly: boolean,
): Partial<TestDataOptions> {
  if (aiOnly) {
    return {
      normal: false,
      validationErrors: false,
      edgeCases: false,
      typeConfusion: false,
      boundaryValues: false,
      businessLogic: false,
      aiGenerated: false,
    };
  }
  if (!categories?.length) {
    return {
      normal: true,
      validationErrors: true,
      edgeCases: true,
      typeConfusion: true,
      boundaryValues: false,
      businessLogic: false,
      aiGenerated: false,
    };
  }
  const allow = new Set(categories);
  const wantsValidation = allow.has("validation");
  return {
    // Sem suite de validação: não dispara matriz determinística genérica.
    normal: wantsValidation,
    validationErrors: wantsValidation,
    edgeCases: wantsValidation,
    typeConfusion: wantsValidation,
    boundaryValues: false,
    businessLogic: allow.has("business-logic"),
    aiGenerated: allow.has("ai-generated"),
  };
}

function groupCasesByEndpoint(
  cases: TestCase[],
  endpoints: Endpoint[],
): Map<string, TestCase[]> {
  const map = new Map<string, TestCase[]>();
  const fallbackId = endpoints[0]?.id;

  for (const testCase of cases) {
    const tagged = testCase.tags
      .find((t) => t.startsWith("endpoint:"))
      ?.replace("endpoint:", "");
    const endpointId = tagged ?? fallbackId;
    if (!endpointId) continue;
    const list = map.get(endpointId) ?? [];
    list.push(testCase);
    map.set(endpointId, list);
  }

  return map;
}

function ensureSecretRef(
  environment: Environment,
  bearerToken?: string,
): Environment {
  if (environment.secretRef) {
    if (bearerToken && environment.authType === AuthType.NONE) {
      return { ...environment, authType: AuthType.BEARER };
    }
    return environment;
  }

  return {
    ...environment,
    secretRef: environmentSecretRef(environment.id),
    authType:
      bearerToken && environment.authType === AuthType.NONE
        ? AuthType.BEARER
        : environment.authType,
  };
}
