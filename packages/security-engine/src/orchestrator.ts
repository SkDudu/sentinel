import { randomUUID } from "node:crypto";
import { analyzeEndpoint } from "@sw/api-parser";
import {
  FindingStatus,
  Severity,
  type Endpoint,
  type Finding,
  type HttpRequest,
  type HttpResponse,
  type RateLimitConfig,
  type TestCase,
  type TestDataOptions,
  type Variable,
} from "@sw/core";
import { generateTestData, type AiDataGeneratorOptions } from "@sw/ai-data-generator";
import { sortFindings } from "@sw/findings";
import type { RequestExecutor } from "@sw/http-client";
import {
  applyExtracts,
  createDefaultRegistry,
  interpolate,
  interpolateUnknown,
  type SecurityTest,
  type TestContext,
  type TestRegistry,
} from "@sw/test-registry";

export interface CaseExecutionResult {
  endpointId: string;
  testId: string;
  testCaseId: string;
  passed: boolean;
  request?: HttpRequest;
  response?: HttpResponse;
  notes?: string;
}

export interface OrchestratorInput {
  endpoint: Endpoint;
  baseUrl: string;
  authHeaders?: Record<string, string>;
  variables?: Variable[];
  options?: Partial<TestDataOptions>;
  /** Reviewed AI/manual cases — executed as-is, never regenerated. */
  extraCases?: TestCase[];
  /** Legacy filter if AI regenerated during prepare (prefer extraCases). */
  approvedAiCaseIds?: string[];
  ai?: AiDataGeneratorOptions;
  registry?: TestRegistry;
  executor: RequestExecutor;
  /** Skip registry plugins (AI-only run). */
  skipPlugins?: boolean;
  productionSafetyMode?: boolean;
  rateLimit?: RateLimitConfig;
  /** Abort between cases / in-flight HTTP when supported. */
  signal?: AbortSignal;
  onProgress?: (event: {
    completed: number;
    total: number;
    testCase: TestCase;
  }) => void;
}

export interface OrchestratorResult {
  context: TestContext;
  cases: TestCase[];
  findings: Finding[];
  executed: number;
  results: CaseExecutionResult[];
  cancelled: boolean;
}

const defaultOptions: TestDataOptions = {
  normal: true,
  validationErrors: true,
  edgeCases: true,
  typeConfusion: true,
  boundaryValues: true,
  businessLogic: false,
  aiGenerated: false,
};

function interpolateRequest(
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  },
  variables: Record<string, string>,
) {
  return {
    ...request,
    url: interpolate(request.url, variables),
    headers: Object.fromEntries(
      Object.entries(request.headers).map(([k, v]) => [
        k,
        interpolate(v, variables),
      ]),
    ),
    body: interpolateUnknown(request.body, variables),
  };
}

export class TestOrchestrator {
  constructor(private readonly registry: TestRegistry = createDefaultRegistry()) {}

  async prepare(input: OrchestratorInput) {
    const analyzed = analyzeEndpoint(input.endpoint);
    const options = { ...defaultOptions, ...input.options };
    const bundle = await generateTestData(analyzed, options, input.ai ?? {});

    const pluginCases: TestCase[] = [];
    const ctxPreview: TestContext = {
      endpoint: input.endpoint,
      analyzed,
      variables: Object.fromEntries(
        (input.variables ?? []).map((v) => [v.key, v.value]),
      ),
      baseUrl: input.baseUrl,
      authHeaders: input.authHeaders ?? {},
      productionSafetyMode: input.productionSafetyMode,
      rateLimit: input.rateLimit,
    };

    if (!input.skipPlugins) {
      for (const test of this.registry.list()) {
        const cases = await test.generateCases(ctxPreview);
        pluginCases.push(
          ...cases.map((c) => ({
            ...c,
            id: `${test.id}:${c.id}`,
            tags: [...c.tags, `plugin:${test.id}`],
          })),
        );
      }
    }

    const approved = new Set(input.approvedAiCaseIds ?? []);
    const aiCases = bundle.aiGenerated.filter((c) =>
      input.ai?.requireReview === false ? true : approved.has(c.id),
    );
    const extra = (input.extraCases ?? []).map((c) => ({
      ...c,
      tags: c.tags.includes("approved") ? c.tags : [...c.tags, "approved"],
    }));

    return {
      analyzed,
      cases: [
        ...bundle.deterministic,
        ...bundle.businessLogic,
        ...aiCases,
        ...extra,
        ...pluginCases,
      ],
      bundle,
      context: ctxPreview,
    };
  }

  async run(input: OrchestratorInput): Promise<OrchestratorResult> {
    const prepared = await this.prepare(input);
    const findings: Finding[] = [];
    const results: CaseExecutionResult[] = [];
    let executed = 0;
    let cancelled = false;

    for (const testCase of prepared.cases) {
      if (input.signal?.aborted) {
        cancelled = true;
        break;
      }

      const pluginId = testCase.tags
        .find((t) => t.startsWith("plugin:"))
        ?.replace("plugin:", "");
      const resolvedTestId = pluginId ?? "generic";
      const test: SecurityTest | undefined = pluginId
        ? this.registry.get(pluginId)
        : undefined;
      const caseForPlugin = {
        ...testCase,
        id: pluginId ? testCase.id.replace(`${pluginId}:`, "") : testCase.id,
      };

      if (test?.run) {
        try {
          const result = await test.run(
            prepared.context,
            caseForPlugin,
            input.executor,
          );
          executed += 1;
          input.onProgress?.({
            completed: executed,
            total: prepared.cases.length,
            testCase,
          });
          const produced = result
            ? Array.isArray(result)
              ? result
              : [result]
            : [];
          if (produced.length) findings.push(...produced);
          results.push({
            endpointId: prepared.context.endpoint.id,
            testId: resolvedTestId,
            testCaseId: testCase.id,
            passed: produced.length === 0,
            notes: produced.length
              ? `${produced.length} finding(s)`
              : undefined,
          });
        } catch (error) {
          if (input.signal?.aborted) {
            cancelled = true;
            break;
          }
          executed += 1;
          findings.push({
            id: randomUUID(),
            projectId: prepared.context.endpoint.projectId,
            endpointId: prepared.context.endpoint.id,
            testId: pluginId ?? "execution.error",
            testCaseId: testCase.id,
            title: `Request failed: ${testCase.name}`,
            severity: Severity.HIGH,
            confidence: 90,
            status: FindingStatus.OPEN,
            evidence:
              error instanceof Error ? error.message : "Unknown execution error",
            recommendation:
              "Verifique se a API alvo está no ar e se baseUrl/auth estão corretos.",
            createdAt: new Date().toISOString(),
          });
          results.push({
            endpointId: prepared.context.endpoint.id,
            testId: pluginId ?? "execution.error",
            testCaseId: testCase.id,
            passed: false,
            notes:
              error instanceof Error ? error.message : "Unknown execution error",
          });
        }
        continue;
      }

      let request = test?.execute
        ? await test.execute(prepared.context, caseForPlugin)
        : {
            method: prepared.context.endpoint.method,
            url: interpolate(
              `${prepared.context.baseUrl.replace(/\/$/, "")}${prepared.context.endpoint.path}`,
              prepared.context.variables,
            ),
            headers: {
              ...prepared.context.authHeaders,
              "Content-Type": "application/json",
            },
            body: testCase.mutations,
          };

      request = interpolateRequest(request, prepared.context.variables);

      if (testCase.mutations.stripAuth) {
        const { Authorization: _a, authorization: _b, ...rest } = request.headers;
        request = { ...request, headers: rest };
      }

      try {
        const response = await input.executor.execute(request);
        executed += 1;
        input.onProgress?.({
          completed: executed,
          total: prepared.cases.length,
          testCase,
        });

        applyExtracts(
          prepared.context.variables,
          testCase.mutations.extract,
          response,
        );

        let produced: Finding[] = [];
        if (test) {
          const result = await test.analyse(
            prepared.context,
            caseForPlugin,
            request,
            response,
          );
          if (result) {
            produced = Array.isArray(result) ? result : [result];
            findings.push(...produced);
          }
        } else {
          const heuristic = analyseGenericCase(
            prepared.context,
            testCase,
            request,
            response,
          );
          if (heuristic) {
            produced = [heuristic];
            findings.push(heuristic);
          }
        }

        results.push({
          endpointId: prepared.context.endpoint.id,
          testId: resolvedTestId,
          testCaseId: testCase.id,
          passed: produced.length === 0,
          request,
          response,
          notes: produced.length ? `${produced.length} finding(s)` : undefined,
        });
      } catch (error) {
        if (input.signal?.aborted) {
          cancelled = true;
          break;
        }
        executed += 1;
        input.onProgress?.({
          completed: executed,
          total: prepared.cases.length,
          testCase,
        });
        findings.push({
          id: randomUUID(),
          projectId: prepared.context.endpoint.projectId,
          endpointId: prepared.context.endpoint.id,
          testId: pluginId ?? "execution.error",
          testCaseId: testCase.id,
          title: `Request failed: ${testCase.name}`,
          severity: Severity.HIGH,
          confidence: 90,
          status: FindingStatus.OPEN,
          evidence:
            error instanceof Error ? error.message : "Unknown execution error",
          request,
          recommendation:
            "Verifique se a API alvo está no ar e se baseUrl/auth estão corretos.",
          createdAt: new Date().toISOString(),
        });
        results.push({
          endpointId: prepared.context.endpoint.id,
          testId: pluginId ?? "execution.error",
          testCaseId: testCase.id,
          passed: false,
          request,
          notes:
            error instanceof Error ? error.message : "Unknown execution error",
        });
      }
    }

    return {
      context: prepared.context,
      cases: prepared.cases,
      findings: sortFindings(findings),
      executed,
      results,
      cancelled,
    };
  }
}

function analyseGenericCase(
  ctx: TestContext,
  testCase: TestCase,
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  },
  response: {
    status: number;
    headers: Record<string, string>;
    body?: unknown;
    durationMs: number;
  },
): Finding | null {
  if (response.status >= 500) {
    return {
      id: randomUUID(),
      projectId: ctx.endpoint.projectId,
      endpointId: ctx.endpoint.id,
      testId: "ai.generic",
      testCaseId: testCase.id,
      title: `Server error on AI/extra case: ${testCase.name}`,
      severity: Severity.HIGH,
      confidence: 75,
      status: FindingStatus.OPEN,
      evidence: `HTTP ${response.status} for reviewed case ${testCase.id}.`,
      request,
      response,
      recommendation: "Validate and reject malformed/semantic edge inputs safely.",
      createdAt: new Date().toISOString(),
    };
  }

  if (
    testCase.expectedStatus?.length &&
    !testCase.expectedStatus.includes(response.status)
  ) {
    return {
      id: randomUUID(),
      projectId: ctx.endpoint.projectId,
      endpointId: ctx.endpoint.id,
      testId: "ai.expected-status",
      testCaseId: testCase.id,
      title: `Unexpected status for ${testCase.name}`,
      severity: Severity.MEDIUM,
      confidence: 60,
      status: FindingStatus.OPEN,
      evidence: `Expected ${testCase.expectedStatus.join("|")}, got ${response.status}.`,
      request,
      response,
      createdAt: new Date().toISOString(),
    };
  }

  return null;
}
