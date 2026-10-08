import { createHash } from "node:crypto";
import type {
  Endpoint,
  Resource,
  ResourceOperation,
  ResourceRelation,
} from "@sw/core";

type JsonSchema = Record<string, unknown>;

const PARAM = /^\{(\w+)\}$|^:(\w+)$/;
/** Segmentos de ação, não de recurso (`/export/{format}`, `/auth/{mode}`). */
const ACTION_SEGMENTS = new Set([
  "export",
  "import",
  "download",
  "upload",
  "search",
  "dashboard",
  "auth",
  "me",
]);
const OWNER_FIELDS = new Set([
  "ownerid",
  "owner_id",
  "createdby",
  "created_by",
  "userid",
  "user_id",
]);

function paramName(segment: string): string | undefined {
  const match = segment.match(PARAM);
  return match ? (match[1] ?? match[2]) : undefined;
}

function segmentsOf(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function singular(word: string): string {
  if (/ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/(ss|x|ch|sh|us)es$/.test(word)) return word.slice(0, -2);
  if (/[^s]s$/.test(word)) return word.slice(0, -1);
  return word;
}

/** "company-units" / "CompanyUnit" / "companyUnitId" → "company_unit". */
export function resourceKey(name: string): string {
  const snake = name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
  const parts = snake.split("_").filter(Boolean);
  const last = parts.pop() ?? "";
  return [...parts, singular(last)].join("_");
}

/** Campo FK → chave do recurso: "customer_id" / "customerId" → "customer". */
function foreignKeyOf(field: string): string | undefined {
  const match = field.match(/^(.+?)(?:_id|Id)$/);
  return match ? resourceKey(match[1]!) : undefined;
}

/** Chave de fixture da persona para um recurso (`id` genérico vira `<recurso>_id`). */
export function resourceFixtureKey(resource: Resource): string {
  return resource.idParam && resource.idParam !== "id"
    ? resource.idParam
    : `${resourceKey(resource.name)}_id`;
}

export function relationId(
  relation: Pick<ResourceRelation, "from" | "kind" | "to" | "via">,
): string {
  return createHash("sha1")
    .update(`${relation.from}|${relation.kind}|${relation.to}|${relation.via}`)
    .digest("hex")
    .slice(0, 16);
}

/** Último recurso do path e, se houver, o param que identifica o item. */
export function locateResource(
  path: string,
  resourceNames: ReadonlySet<string>,
): { name: string; param?: string; index: number } | undefined {
  const segments = segmentsOf(path);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index]!;
    if (resourceNames.has(segment)) {
      return { name: segment, param: paramName(segments[index + 1] ?? ""), index };
    }
  }
  return undefined;
}

function schemaProperties(schema: unknown): Record<string, JsonSchema> {
  if (!schema || typeof schema !== "object") return {};
  const node = schema as JsonSchema;
  if (node.type === "array" && node.items) return schemaProperties(node.items);
  const properties = (node.properties ?? {}) as Record<string, JsonSchema>;
  // Envelope comum: { data: {...} }.
  const data = properties.data;
  return data && !properties.id ? { ...properties, ...schemaProperties(data) } : properties;
}

function idSource(endpoint: Endpoint): { source: string; confidence: number } {
  for (const response of endpoint.responses) {
    if (!response.status.startsWith("2") || !response.schema) continue;
    const top = (response.schema as JsonSchema).properties as
      | Record<string, unknown>
      | undefined;
    if (top?.id) return { source: "response.id", confidence: 80 };
    const data = (top?.data as JsonSchema | undefined)?.properties as
      | Record<string, unknown>
      | undefined;
    if (data?.id) return { source: "response.data.id", confidence: 80 };
  }
  return { source: "response.id", confidence: 60 };
}

/**
 * Recursos e relações a partir do contrato. Sem IA:
 * links (100) → path aninhado (90) → create→read (80/60) → FK/dono (60).
 */
export function inferRelations(endpoints: Endpoint[]): {
  resources: Resource[];
  relations: ResourceRelation[];
} {
  const resourceNames = new Set<string>();
  const idParams = new Map<string, Map<string, number>>();
  for (const endpoint of endpoints) {
    const segments = segmentsOf(endpoint.path);
    segments.forEach((segment, index) => {
      const param = paramName(segments[index + 1] ?? "");
      if (!param || paramName(segment) || ACTION_SEGMENTS.has(segment)) return;
      resourceNames.add(segment);
      const counts = idParams.get(segment) ?? new Map<string, number>();
      counts.set(param, (counts.get(param) ?? 0) + 1);
      idParams.set(segment, counts);
    });
  }

  const resources = new Map<string, Resource>();
  for (const name of resourceNames) {
    const counts = [...(idParams.get(name) ?? new Map<string, number>())].sort(
      (a, b) => Number(a[0] === "id") - Number(b[0] === "id") || b[1] - a[1],
    );
    resources.set(name, { name, idParam: counts[0]?.[0], operations: {} });
  }

  const byKey = new Map<string, string>();
  for (const name of resourceNames) {
    if (!byKey.has(resourceKey(name))) byKey.set(resourceKey(name), name);
  }

  const relations = new Map<string, ResourceRelation>();
  const add = (
    input: Omit<ResourceRelation, "id" | "status" | "evidence"> & {
      evidence: string;
    },
  ) => {
    const id = relationId(input);
    const existing = relations.get(id);
    if (existing) {
      if (!existing.evidence.includes(input.evidence)) {
        existing.evidence.push(input.evidence);
      }
      existing.confidence = Math.max(existing.confidence, input.confidence);
      return;
    }
    relations.set(id, {
      ...input,
      id,
      evidence: [input.evidence],
      status: "suggested",
    });
  };

  const byOperationId = new Map(
    endpoints.filter((e) => e.operationId).map((e) => [e.operationId!, e]),
  );

  for (const endpoint of endpoints) {
    const located = locateResource(endpoint.path, resourceNames);
    if (!located) continue;
    const segments = segmentsOf(endpoint.path);
    const resource = resources.get(located.name)!;
    const isItem = Boolean(located.param) && located.index + 2 === segments.length;
    const isCollection = located.index + 1 === segments.length;

    let operation: ResourceOperation | undefined;
    if (isCollection) {
      operation =
        endpoint.method === "GET" ? "list" : endpoint.method === "POST" ? "create" : undefined;
    } else if (isItem) {
      operation =
        endpoint.method === "GET"
          ? "read"
          : endpoint.method === "PUT" || endpoint.method === "PATCH"
            ? "update"
            : endpoint.method === "DELETE"
              ? "delete"
              : undefined;
    }
    if (operation && !resource.operations[operation]) {
      resource.operations[operation] = endpoint.id;
    }

    // Path aninhado: /users/{userId}/orders → orders parent users.
    const parentIndex = located.index - 2;
    const parentParam = paramName(segments[located.index - 1] ?? "");
    const parent = segments[parentIndex];
    if (parentParam && parent && resources.has(parent) && parent !== located.name) {
      add({
        from: located.name,
        to: parent,
        kind: "parent",
        via: parentParam,
        evidence: endpoint.id,
        confidence: 90,
        origin: "path",
      });
    }

    // links explícitos.
    for (const response of endpoint.responses) {
      for (const link of response.links ?? []) {
        const target = link.operationId ? byOperationId.get(link.operationId) : undefined;
        const targetResource = target && locateResource(target.path, resourceNames);
        if (!target || !targetResource) continue;
        for (const [param, expression] of Object.entries(link.parameters)) {
          const pointer = expression.match(/^\$response\.body#\/(.+)$/)?.[1];
          add({
            from: located.name,
            to: targetResource.name,
            kind: "produces",
            via: param,
            source: pointer ? `response.${pointer.replace(/\//g, ".")}` : expression,
            evidence: endpoint.id,
            confidence: 100,
            origin: "links",
          });
        }
      }
    }

    // FK e dono em body/response.
    const fields: Array<[string, JsonSchema | undefined, string]> = [
      ...endpoint.parameters
        .filter((p) => p.in === "body")
        .map((p): [string, JsonSchema | undefined, string] => [
          p.name,
          p.schema as JsonSchema | undefined,
          "body",
        ]),
      ...endpoint.responses
        .filter((r) => r.status.startsWith("2"))
        .flatMap((r) =>
          Object.entries(schemaProperties(r.schema)).map(
            ([name, schema]): [string, JsonSchema | undefined, string] => [
              name,
              schema,
              "response",
            ],
          ),
        ),
    ];
    const selfKey = resourceKey(located.name);
    for (const [field, schema, where] of fields) {
      const lower = field.toLowerCase();
      if (OWNER_FIELDS.has(lower) && selfKey !== "user") {
        add({
          from: located.name,
          to: byKey.get("user") ?? "users",
          kind: "owner",
          via: `${where}.${field}`,
          evidence: endpoint.id,
          confidence: 60,
          origin: "field",
        });
        continue;
      }
      const component =
        typeof schema?.["x-component"] === "string"
          ? resourceKey(schema["x-component"] as string)
          : undefined;
      const key = foreignKeyOf(field) ?? component;
      const target = key ? byKey.get(key) : undefined;
      if (target && key !== selfKey) {
        add({
          from: located.name,
          to: target,
          kind: "reference",
          via: `${where}.${field}`,
          evidence: endpoint.id,
          confidence: 60,
          origin: "field",
        });
      }
    }
  }

  // create → read do mesmo recurso.
  for (const resource of resources.values()) {
    const create = resource.operations.create;
    if (!create || !resource.operations.read || !resource.idParam) continue;
    const endpoint = endpoints.find((e) => e.id === create)!;
    const { source, confidence } = idSource(endpoint);
    add({
      from: resource.name,
      to: resource.name,
      kind: "produces",
      via: resource.idParam,
      source,
      evidence: create,
      confidence,
      origin: "path",
    });
    const produced = relations.get(
      relationId({ from: resource.name, kind: "produces", to: resource.name, via: resource.idParam }),
    )!;
    if (!produced.evidence.includes(resource.operations.read)) {
      produced.evidence.push(resource.operations.read);
    }
  }

  return {
    resources: [...resources.values()].sort((a, b) => a.name.localeCompare(b.name)),
    relations: [...relations.values()].sort(
      (a, b) => b.confidence - a.confidence || a.from.localeCompare(b.from),
    ),
  };
}

/**
 * Reimport: inferência nova + revisão antiga. Mantém status de quem casa
 * pelo id estável; `manual`/`ai` e `confirmed` sobrevivem mesmo sem evidência nova.
 */
export function mergeRelations(
  existing: ResourceRelation[],
  inferred: ResourceRelation[],
): ResourceRelation[] {
  const previous = new Map(existing.map((relation) => [relation.id, relation]));
  const out = inferred.map((relation) => {
    const old = previous.get(relation.id);
    return old ? { ...relation, status: old.status } : relation;
  });
  const seen = new Set(out.map((relation) => relation.id));
  for (const relation of existing) {
    if (seen.has(relation.id)) continue;
    if (
      relation.origin === "manual" ||
      relation.origin === "ai" ||
      relation.status === "confirmed"
    ) {
      out.push({ ...relation, evidence: [] });
    }
  }
  return out;
}
