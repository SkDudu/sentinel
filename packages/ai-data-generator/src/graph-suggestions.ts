import {
  ANONYMOUS_PERSONA,
  AccessExpectSchema,
  FlowSchema,
  RelationKindSchema,
  type AccessRule,
  type Endpoint,
  type Flow,
  type Resource,
  type ResourceRelation,
} from "@sw/core";
import type { AiClient } from "@sw/ai";
import { relationId } from "@sw/api-parser";
import { blockedPattern } from "./safety.js";

/**
 * O que a IA pode ver: contrato, grafo, nomes, roles e chaves de fixture.
 * Nunca credenciais nem valores de fixture.
 */
export interface GraphSuggestionInput {
  endpoints: Endpoint[];
  resources: Resource[];
  relations: ResourceRelation[];
  personas: Array<{ id: string; name: string; role?: string; fixtureKeys: string[] }>;
  /** Teto de endpoints no prompt; recursos do grafo entram primeiro. */
  maxEndpoints?: number;
}

export interface Rejected {
  item: string;
  reason: string;
}

const SYSTEM =
  "You help configure authorized API security tests. Output a JSON array only, no prose. Never include credentials, destructive SQL, scripts or shell payloads.";
const MAX_FLOW_STEPS = 20;
const MAX_FLOW_SIZE = 20_000;
const AI_RELATION_CONFIDENCE = 50;

function key(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

/** `/a/{id}`, `/a/{{x}}`, `/a/{{fixtures.y}}` → `/a/{}`. */
function shape(path: string): string {
  return path.split("?")[0]!.replace(/\{\{[^}]*\}\}|\{[^}]*\}/g, "{}").replace(/\/+$/, "");
}

function pathParams(path: string): string[] {
  return [...path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!);
}

function compact(input: GraphSuggestionInput) {
  const max = input.maxEndpoints ?? 300;
  const inGraph = new Set(input.resources.flatMap((r) => Object.values(r.operations)));
  const endpoints = [...input.endpoints]
    .sort((a, b) => Number(inGraph.has(b.id)) - Number(inGraph.has(a.id)))
    .slice(0, max)
    .map((e) => `${key(e.method, e.path)}${e.summary ? ` — ${e.summary}` : ""}`);
  return {
    endpoints,
    omittedEndpoints: Math.max(0, input.endpoints.length - endpoints.length),
    resources: input.resources.map((r) => ({
      name: r.name,
      idParam: r.idParam,
      operations: Object.keys(r.operations),
    })),
    relations: input.relations
      .filter((r) => r.status !== "rejected")
      .map((r) => `${r.from} -${r.kind}-> ${r.to} via ${r.via}`),
    personas: [
      { id: ANONYMOUS_PERSONA, name: "sem credencial", fixtureKeys: [] },
      ...input.personas.map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        fixtureKeys: p.fixtureKeys,
      })),
    ],
  };
}

async function ask(client: AiClient, payload: unknown): Promise<unknown[]> {
  const raw = await client.complete([
    { role: "system", content: SYSTEM },
    { role: "user", content: JSON.stringify(payload) },
  ]);
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("IA não devolveu um JSON array");
  const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error("IA não devolveu um JSON array");
  return parsed;
}

/** Body de um passo. JSON objeto. Placeholders `{{prefix}}` / `{{fixtures.*}}`. */
export async function generateStepBody(
  client: AiClient,
  input: {
    method: string;
    path: string;
    summary?: string;
    requestBodySchema?: unknown;
  },
): Promise<unknown> {
  const schema =
    input.requestBodySchema === undefined
      ? undefined
      : JSON.stringify(input.requestBodySchema).slice(0, 8_000);
  const raw = await client.complete([
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: JSON.stringify({
        instruction:
          "Gere o JSON body de UM request de teste autorizado. Responda SOMENTE um objeto JSON, sem markdown. Strings únicas usam {{prefix}}. IDs de path ou relações usam {{fixtures.<chave>}}. Sem credenciais, SQL, scripts ou payloads de ataque.",
        method: input.method,
        path: input.path,
        summary: input.summary,
        requestBodySchema: schema,
      }),
    },
  ]);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("A IA não devolveu um body utilizável. Tente de novo.");
  }
  const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("A IA não devolveu um body utilizável. Tente de novo.");
  }
  const serialized = JSON.stringify(parsed);
  if (serialized.length > 8_000) {
    throw new Error("O body ficou grande demais. Tente de novo.");
  }
  const hit = blockedPattern(serialized);
  if (hit) {
    throw new Error("O body sugerido não passou na revisão de segurança. Tente de novo.");
  }
  return parsed;
}

function describe(item: unknown): string {
  const text = JSON.stringify(item) ?? String(item);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

/** Matriz persona × endpoint sugerida; só endpoints e personas reais passam. */
export async function suggestAccessRules(
  client: AiClient,
  input: GraphSuggestionInput,
): Promise<{ rules: AccessRule[]; rejected: Rejected[] }> {
  const items = await ask(client, {
    ...compact(input),
    instruction:
      "Para cada endpoint relevante e cada persona, diga se deve acessar. Responda SOMENTE JSON array de {method, path, persona, expect, pathFixtures?}. expect: allow | deny | own-only. own-only exige pathFixtures {pathParam: fixtureKey} usando só fixtureKeys da persona. Use os paths exatamente como no contrato.",
  });

  const byKey = new Map(input.endpoints.map((e) => [key(e.method, e.path), e]));
  const personas = new Map(input.personas.map((p) => [p.id, p]));
  const rules: AccessRule[] = [];
  const rejected: Rejected[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const raw = (item ?? {}) as Record<string, unknown>;
    const reject = (reason: string) => rejected.push({ item: describe(item), reason });
    const endpoint =
      typeof raw.method === "string" && typeof raw.path === "string"
        ? byKey.get(key(raw.method, raw.path))
        : undefined;
    if (!endpoint) {
      reject("endpoint fora do contrato");
      continue;
    }
    const personaId = typeof raw.persona === "string" ? raw.persona : "";
    if (personaId !== ANONYMOUS_PERSONA && !personas.has(personaId)) {
      reject("persona desconhecida");
      continue;
    }
    const expect = AccessExpectSchema.safeParse(raw.expect);
    if (!expect.success) {
      reject("expect inválido");
      continue;
    }
    const rule: AccessRule = { endpointId: endpoint.id, personaId, expect: expect.data };
    if (expect.data === "own-only") {
      const fixtureKeys = new Set(personas.get(personaId)?.fixtureKeys ?? []);
      const params = new Set(pathParams(endpoint.path));
      const fixtures = Object.entries((raw.pathFixtures ?? {}) as Record<string, unknown>);
      const valid =
        fixtures.length > 0 &&
        fixtures.every(
          ([param, fixture]) =>
            params.has(param) && typeof fixture === "string" && fixtureKeys.has(fixture),
        );
      if (!valid) {
        reject("own-only sem pathFixtures válidos");
        continue;
      }
      rule.pathFixtures = Object.fromEntries(fixtures) as Record<string, string>;
    }
    const id = `${endpoint.id}|${personaId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    rules.push(rule);
  }
  return { rules, rejected };
}

/** Fluxos sugeridos; validados por schema, contrato, atores e safety filter. */
export async function suggestFlows(
  client: AiClient,
  input: GraphSuggestionInput,
): Promise<{ flows: Flow[]; rejected: Rejected[] }> {
  const items = await ask(client, {
    ...compact(input),
    instruction:
      "Sugira até 5 fluxos de lógica de negócio/autorização (ex.: A cria → B tenta ler/editar → espera 4xx). Responda SOMENTE JSON array de {name, description, setup, steps, teardown}. Passo: {id, label, actor, request: {method, path, body?}, extract: [{kind: 'jsonPath', path, as}], expect: {status: '2xx' | '4xx' | [códigos]}}. actor = id de persona. Use {{var}} de extract anteriores, {{prefix}} em dados criados e {{fixtures.<chave>}} para ids da persona. teardown apaga o que foi criado.",
  });

  const shapes = new Set(input.endpoints.map((e) => key(e.method, shape(e.path))));
  const actors = new Set([ANONYMOUS_PERSONA, ...input.personas.map((p) => p.id)]);
  const flows: Flow[] = [];
  const rejected: Rejected[] = [];

  items.forEach((item, index) => {
    const raw = (item ?? {}) as Record<string, unknown>;
    const reject = (reason: string) =>
      rejected.push({ item: typeof raw.name === "string" ? raw.name : describe(item), reason });
    const parsed = FlowSchema.safeParse({ ...raw, id: `ai-${index + 1}` });
    if (!parsed.success) {
      reject(`schema: ${parsed.error.issues[0]?.message ?? "inválido"}`);
      return;
    }
    const flow = parsed.data;
    const steps = [...flow.setup, ...flow.steps, ...flow.teardown];
    const serialized = JSON.stringify(flow);
    if (steps.length === 0 || steps.length > MAX_FLOW_STEPS) {
      reject(`fluxo precisa de 1–${MAX_FLOW_STEPS} passos`);
      return;
    }
    if (serialized.length > MAX_FLOW_SIZE) {
      reject("fluxo grande demais");
      return;
    }
    const hit = blockedPattern(serialized);
    if (hit) {
      reject(`padrão bloqueado: ${hit.source}`);
      return;
    }
    const badActor = steps.find((step) => !actors.has(step.actor));
    if (badActor) {
      reject(`ator desconhecido: ${badActor.actor}`);
      return;
    }
    const offContract = steps.find(
      (step) => !shapes.has(key(step.request.method, shape(step.request.path))),
    );
    if (offContract) {
      reject(`fora do contrato: ${offContract.request.method} ${offContract.request.path}`);
      return;
    }
    flows.push({
      ...flow,
      description: `Sugerido por IA (needs-review). ${flow.description ?? ""}`.trim(),
    });
  });
  return { flows, rejected };
}

/** Relações que a heurística não achou; entram como `suggested`, origem `ai`. */
export async function suggestRelations(
  client: AiClient,
  input: GraphSuggestionInput,
): Promise<{ relations: ResourceRelation[]; rejected: Rejected[] }> {
  const items = await ask(client, {
    ...compact(input),
    instruction:
      "Liste relações entre recursos que ainda NÃO estão em relations. Responda SOMENTE JSON array de {from, to, kind, via, reason}. kind: parent | reference | owner | produces. from/to = nomes em resources. via = param ou campo (ex.: userId, body.customer_id).",
  });

  const names = new Set(input.resources.map((r) => r.name));
  const known = new Set(input.relations.map((r) => r.id));
  const relations: ResourceRelation[] = [];
  const rejected: Rejected[] = [];

  for (const item of items) {
    const raw = (item ?? {}) as Record<string, unknown>;
    const reject = (reason: string) => rejected.push({ item: describe(item), reason });
    const kind = RelationKindSchema.safeParse(raw.kind);
    const from = typeof raw.from === "string" ? raw.from : "";
    const to = typeof raw.to === "string" ? raw.to : "";
    const via = typeof raw.via === "string" ? raw.via.trim() : "";
    if (!names.has(from) || !names.has(to)) {
      reject("recurso fora do grafo");
      continue;
    }
    if (!kind.success || !via) {
      reject("kind/via inválido");
      continue;
    }
    const base = { from, to, kind: kind.data, via };
    const id = relationId(base);
    if (known.has(id)) continue;
    known.add(id);
    const reason = typeof raw.reason === "string" ? raw.reason.slice(0, 200) : "";
    relations.push({
      ...base,
      id,
      evidence: reason ? [`IA: ${reason}`] : [],
      confidence: AI_RELATION_CONFIDENCE,
      origin: "ai",
      status: "suggested",
    });
  }
  return { relations, rejected };
}
