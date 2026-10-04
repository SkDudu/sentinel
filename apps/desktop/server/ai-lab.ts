import { analyzeEndpoint } from "@sw/api-parser";
import { generateTestData } from "@sw/ai-data-generator";
import { interpretFindings, type AiClient } from "@sw/ai";
import type { Endpoint, Finding, TestCase, TestPersona } from "@sw/core";

export async function generateAiCasesForEndpoints(input: {
  endpoints: Endpoint[];
  personas: TestPersona[];
  client: AiClient | null;
  maxAiCases: number;
  allowPersonaSeed: boolean;
}): Promise<{
  cases: TestCase[];
  rejected: Array<{ id: string; name: string; reason: string }>;
  mode: "ai" | "persona-seed";
}> {
  if (!input.client && !input.allowPersonaSeed) {
    throw new Error(
      "AI desabilitada e seed de personas desligado — configure Settings → AI",
    );
  }

  const cases: TestCase[] = [];
  const rejected: Array<{ id: string; name: string; reason: string }> = [];
  const mode: "ai" | "persona-seed" = input.client ? "ai" : "persona-seed";
  const perEndpoint = Math.max(
    1,
    Math.floor(input.maxAiCases / Math.max(1, input.endpoints.length)),
  );

  for (const endpoint of input.endpoints) {
    const analyzed = analyzeEndpoint(endpoint);
    const bundle = await generateTestData(
      analyzed,
      {
        normal: false,
        validationErrors: false,
        edgeCases: false,
        typeConfusion: false,
        boundaryValues: false,
        businessLogic: false,
        aiGenerated: true,
      },
      {
        client: input.client ?? undefined,
        maxAiCases: perEndpoint,
        requireReview: true,
        personas: input.personas,
        allowPersonaSeed: !input.client && input.allowPersonaSeed,
      },
    );

    for (const testCase of bundle.aiGenerated) {
      cases.push({
        ...testCase,
        tags: [
          ...testCase.tags.filter((t) => t !== "approved"),
          `endpoint:${endpoint.id}`,
          "needs-review",
        ],
      });
    }
    rejected.push(...bundle.rejectedAi);
  }

  return { cases, rejected, mode };
}

export async function interpretProjectFindings(
  client: AiClient,
  findings: Finding[],
): Promise<string> {
  return interpretFindings(client, findings);
}
