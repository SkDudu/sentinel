import { randomUUID } from "node:crypto";
import { analyzeEndpoint } from "@sw/api-parser";
import {
  FindingStatus,
  Severity,
  type Endpoint,
  type Finding,
  type TestCase,
  type TestDataOptions,
  type Variable,
} from "@sw/core";
import { generateTestData, type AiDataGeneratorOptions } from "@sw/ai-data-generator";
import { sortFindings } from "@sw/findings";
import type { RequestExecutor } from "@sw/http-client";
import {
  createDefaultRegistry,
  type SecurityTest,
  type TestContext,
  type TestRegistry,
} from "@sw/test-registry";

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

function interpolate(
  value: string,
  variables: Record<string, string>,
): string {
  return value.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? "");
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
    let executed = 0;

    for (const testCase of prepared.cases) {
      const pluginId = testCase.tags
        .find((t) => t.startsWith("plugin:"))
        ?.replace("plugin:", "");
      const test: SecurityTest | undefined = pluginId
        ? this.registry.get(pluginId)
        : undefined;

      let request = test?.execute
        ? await test.execute(prepared.context, {
            ...testCase,
            id: testCase.id.replace(`${pluginId}:`, ""),
          })
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

      if (testCase.mutations.stripAuth) {
        const { Authorization: _a, ...rest } = request.headers;
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

        if (test) {
          const result = await test.analyse(
            prepared.context,
            { ...testCase, id: testCase.id.replace(`${pluginId}:`, "") },
            request,
            response,
          );
          if (result) {
            findings.push(...(Array.isArray(result) ? result : [result]));
          }
        } else {
          const heuristic = analyseGenericCase(
            prepared.context,
            testCase,
            request,
            response,
          );
          if (heuristic) findings.push(heuristic);
        }
      } catch (error) {
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
      }
    }

    return {
      context: prepared.context,
      cases: prepared.cases,
      findings: sortFindings(findings),
      executed,
    };
  }
}

function analyseGenericCase(
  ctx: TestContext,
  testCase: TestCase,
  request: { method: string; url: string; headers: Record<string, string>; body?: unknown },
  response: { status: number; headers: Record<string, string>; body?: unknown; durationMs: number },
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
