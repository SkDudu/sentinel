import {
  AuthType,
  ScanStatus,
  type Endpoint,
  type Environment,
  type RateLimitConfig,
  type TestCase,
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
  /** Scan variables for {{token}} / {{userId}} interpolation + authz fixtures. */
  variables?: Variable[];
  rateLimit?: Partial<RateLimitConfig>;
  /** Optional custom executor (e.g. ZapExecutor). */
  executor?: RequestExecutor;
  registry?: TestRegistry;
}

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
  },
  secretStore: SecretStore,
) {
  const project = await repos.projects.getById(input.projectId);
  if (!project) throw new Error("Project not found");

  const environment = await repos.environments.getById(input.environmentId);
  if (!environment || environment.projectId !== input.projectId) {
    throw new Error("Environment not found for project");
  }

  let targetEndpoints = await repos.endpoints.listByProject(input.projectId);
  if (input.endpointIds?.length) {
    const allow = new Set(input.endpointIds);
    targetEndpoints = targetEndpoints.filter((e) => allow.has(e.id));
  }
  if (targetEndpoints.length === 0) {
    throw new Error("No endpoints to scan — import OpenAPI first");
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
  const authHeaders = await resolveAuthHeaders(authEnv, store);

  const rateLimit: RateLimitConfig = {
    ...DEFAULT_RATE_LIMIT,
    ...input.rateLimit,
  };

  const run = await repos.runs.create({
    projectId: input.projectId,
    environmentId: input.environmentId,
  });

  const orchestrator = new TestOrchestrator(input.registry);
  const executor =
    input.executor ??
    new HttpExecutor({
      timeoutMs: environment.productionSafetyMode ? 10_000 : 15_000,
      maxRequestsPerMinute: environment.productionSafetyMode
        ? 30
        : rateLimit.requests * 6,
    });

  let totalCases = 0;
  let completedCases = 0;
  const allFindings = [];

  const casesByEndpoint = groupCasesByEndpoint(approved, targetEndpoints);
  const sharedVariables: Variable[] = [...(input.variables ?? [])];

  try {
    for (const endpoint of targetEndpoints as Endpoint[]) {
      const extraCases = casesByEndpoint.get(endpoint.id) ?? [];
      if (input.aiOnly && extraCases.length === 0) continue;

      const result = await orchestrator.run({
        endpoint,
        baseUrl: environment.baseUrl,
        authHeaders,
        variables: sharedVariables,
        executor,
        extraCases,
        skipPlugins: Boolean(input.aiOnly),
        productionSafetyMode: environment.productionSafetyMode,
        rateLimit,
        options: {
          normal: !input.aiOnly,
          validationErrors: !input.aiOnly,
          edgeCases: !input.aiOnly,
          typeConfusion: !input.aiOnly,
          boundaryValues: false,
          businessLogic: false,
          aiGenerated: false,
        },
      });

      for (const [key, value] of Object.entries(result.context.variables)) {
        const existing = sharedVariables.find((v) => v.key === key);
        if (existing) existing.value = value;
        else sharedVariables.push({ key, value, source: "extract" });
      }

      totalCases += result.cases.length;
      completedCases += result.executed;
      allFindings.push(...result.findings);
    }

    if (input.aiOnly && totalCases === 0) {
      throw new Error(
        "Approved AI cases do not match selected endpoints (set endpointId on cases)",
      );
    }

    await repos.findings.createMany(allFindings, run.id);
    const completed = await repos.runs.complete(run.id, {
      status: ScanStatus.COMPLETED,
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
    };
  } catch (error) {
    await repos.runs.complete(run.id, {
      status: ScanStatus.FAILED,
      totalCases,
      completedCases,
      findingsCount: allFindings.length,
    });
    throw error;
  }
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
