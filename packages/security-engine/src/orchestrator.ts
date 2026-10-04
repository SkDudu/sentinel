import { analyzeEndpoint } from "@sw/api-parser";
import {
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
  /** When true, skip AI cases that were not explicitly approved. */
  approvedAiCaseIds?: string[];
  ai?: AiDataGeneratorOptions;
  registry?: TestRegistry;
  executor: RequestExecutor;
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

    const approved = new Set(input.approvedAiCaseIds ?? []);
    const aiCases = bundle.aiGenerated.filter((c) =>
      input.ai?.requireReview === false ? true : approved.has(c.id),
    );

    return {
      analyzed,
      cases: [...bundle.deterministic, ...bundle.businessLogic, ...aiCases, ...pluginCases],
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
