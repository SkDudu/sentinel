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
import { applySafetyFilter } from "./safety.js";

export interface GeneratedTestBundle {
  deterministic: TestCase[];
  aiGenerated: TestCase[];
  businessLogic: TestCase[];
  personas: TestPersona[];
  rejectedAi: Array<{ id: string; name: string; reason: string }>;
  all: TestCase[];
}

export interface AiDataGeneratorOptions {
  client?: AiClient;
  maxAiCases?: number;
  /** Review gate: AI cases returned for review; not auto-run unless approved. */
  requireReview?: boolean;
  personas?: TestPersona[];
  /** Offline seed from personas when no AI client. */
  allowPersonaSeed?: boolean;
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
      id: `ai-${Date.now().toString(36)}-${index + 1}`,
      name: item.name ?? `AI case ${index + 1}`,
      description: item.description,
      source: TestCaseSource.AI,
      category: TestCategory.AI_GENERATED,
      persona: item.persona,
      mutations: item.mutations ?? {},
      tags: [...(item.tags ?? ["ai"]), "needs-review"],
    }));
  } catch {
    return [];
  }
}

/** Persona → reviewable cases (offline). Still go through safety + review gate. */
export function seedCasesFromPersonas(
  analyzed: AnalyzedEndpoint,
  personas: TestPersona[],
  max = 20,
): TestCase[] {
  const bodyFields = analyzed.fields
    .filter((f) => f.parameter.in === "body" || f.parameter.in === "query")
    .map((f) => f.parameter.name);

  const seeded = personas.slice(0, max).map((persona, index) => {
    const mutations: Record<string, unknown> = {};
    for (const name of bodyFields) {
      if (name in persona.fields) {
        mutations[name] = persona.fields[name];
      }
    }
    if (Object.keys(mutations).length === 0) {
      Object.assign(mutations, persona.fields);
    }

    return {
      id: `persona-${persona.id}-${Date.now().toString(36)}-${index + 1}`,
      name: `Persona: ${persona.name}`,
      description:
        persona.description ??
        `Caso semântico a partir da persona ${persona.name}`,
      source: TestCaseSource.AI,
      category: TestCategory.AI_GENERATED,
      persona: persona.id,
      mutations,
      tags: ["ai", "persona-seed", "needs-review", ...(persona.tags ?? [])],
    } satisfies TestCase;
  });

  return applySafetyFilter(seeded).accepted;
}

export async function generateTestData(
  analyzed: AnalyzedEndpoint,
  options: TestDataOptions,
  aiOptions: AiDataGeneratorOptions = {},
): Promise<GeneratedTestBundle> {
  const personas = aiOptions.personas?.length
    ? aiOptions.personas
    : builtinPersonas;

  const deterministic = generateDeterministicCases(analyzed, options).filter(
    (c) => c.source === TestCaseSource.DETERMINISTIC,
  );
  const businessLogic = options.businessLogic
    ? generateDeterministicCases(analyzed, {
        ...options,
        normal: false,
        validationErrors: false,
        edgeCases: false,
        typeConfusion: false,
        boundaryValues: false,
        businessLogic: true,
        aiGenerated: false,
      }).filter((c) => c.source === TestCaseSource.BUSINESS_LOGIC)
    : [];

  let aiGenerated: TestCase[] = [];
  let rejectedAi: GeneratedTestBundle["rejectedAi"] = [];

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
      personas: personas.map((p) => ({
        id: p.id,
        name: p.name,
        fields: p.fields,
        tags: p.tags,
      })),
      instruction:
        "Gere casos de teste semânticos (emails inválidos, espaços, roles, combinações de persona). Responda SOMENTE com JSON array de objetos {name, description, mutations, persona?, tags?}. Sem SQL destrutivo, sem scripts, sem payloads enormes.",
    };

    const raw = await aiOptions.client.complete([
      {
        role: "system",
        content:
          "You generate API test data matrices for authorized security testing. Never invent destructive DB/RCE payloads. Output JSON array only.",
      },
      { role: "user", content: JSON.stringify(prompt) },
    ]);

    const filtered = applySafetyFilter(parseAiCases(raw, max));
    aiGenerated = filtered.accepted;
    rejectedAi = filtered.rejected;
  } else if (options.aiGenerated && aiOptions.allowPersonaSeed) {
    aiGenerated = seedCasesFromPersonas(
      analyzed,
      personas,
      aiOptions.maxAiCases ?? 20,
    );
  }

  const all = [...deterministic, ...businessLogic, ...aiGenerated];

  return {
    deterministic,
    aiGenerated,
    businessLogic,
    personas,
    rejectedAi,
    all,
  };
}
