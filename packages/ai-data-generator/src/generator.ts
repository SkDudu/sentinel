import {
  TestCaseSource,
  TestCategory,
  type TestCase,
  type TestDataOptions,
  type TestPersona,
} from "@sw/core";
import type { AiClient } from "@sw/ai";
import type { AnalyzedEndpoint } from "@sw/api-parser";
import { generateDeterministicCases } from "./deterministic.js";
import { builtinPersonas } from "./personas.js";

export interface GeneratedTestBundle {
  deterministic: TestCase[];
  aiGenerated: TestCase[];
  businessLogic: TestCase[];
  personas: TestPersona[];
  all: TestCase[];
}

export interface AiDataGeneratorOptions {
  client?: AiClient;
  maxAiCases?: number;
  /** Review gate: AI cases are returned but not auto-executed by the engine. */
  requireReview?: boolean;
}

function safetyFilter(cases: TestCase[]): TestCase[] {
  return cases.filter((c) => {
    const serialized = JSON.stringify(c.mutations);
    // Block obviously dangerous bulk/destructive markers from AI output
    if (/DROP\s+TABLE|;\s*--/i.test(serialized)) return false;
    if (serialized.length > 50_000) return false;
    return true;
  });
}

function parseAiCases(raw: string, max: number): TestCase[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1) return [];

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Array<{
      name?: string;
      description?: string;
      mutations?: Record<string, unknown>;
      persona?: string;
      tags?: string[];
    }>;

    return parsed.slice(0, max).map((item, index) => ({
      id: `ai-${index + 1}`,
      name: item.name ?? `AI case ${index + 1}`,
      description: item.description,
      source: TestCaseSource.AI,
      category: TestCategory.AI_GENERATED,
      persona: item.persona,
      mutations: item.mutations ?? {},
      tags: item.tags ?? ["ai"],
    }));
  } catch {
    return [];
  }
}

export async function generateTestData(
  analyzed: AnalyzedEndpoint,
  options: TestDataOptions,
  aiOptions: AiDataGeneratorOptions = {},
): Promise<GeneratedTestBundle> {
  const deterministic = generateDeterministicCases(analyzed, options).filter(
    (c) => c.source === TestCaseSource.DETERMINISTIC,
  );
  const businessLogic = generateDeterministicCases(analyzed, {
    ...options,
    normal: false,
    validationErrors: false,
    edgeCases: false,
    typeConfusion: false,
    boundaryValues: false,
    businessLogic: true,
    aiGenerated: false,
  }).filter((c) => c.source === TestCaseSource.BUSINESS_LOGIC);

  let aiGenerated: TestCase[] = [];

  if (options.aiGenerated && aiOptions.client) {
    const max = aiOptions.maxAiCases ?? 25;
    const prompt = {
      endpoint: {
        method: analyzed.endpoint.method,
        path: analyzed.endpoint.path,
      },
      fields: analyzed.fields.map((f) => ({
        name: f.parameter.name,
        type: f.parameter.type,
        required: f.parameter.required,
        semantics: f.semantics,
      })),
      instruction:
        "Gere casos de teste semânticos (usuários, emails inválidos, espaços, roles, combinações). Responda SOMENTE com JSON array de objetos {name, description, mutations, persona?, tags?}",
    };

    const raw = await aiOptions.client.complete([
      {
        role: "system",
        content:
          "You generate API test data matrices. Never invent destructive DB payloads. Output JSON array only.",
      },
      { role: "user", content: JSON.stringify(prompt) },
    ]);

    aiGenerated = safetyFilter(parseAiCases(raw, max));
  }

  const all = [...deterministic, ...businessLogic, ...aiGenerated];

  return {
    deterministic,
    aiGenerated,
    businessLogic,
    personas: builtinPersonas,
    all,
  };
}
