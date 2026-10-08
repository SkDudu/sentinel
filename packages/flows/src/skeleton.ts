import {
  Severity,
  type Endpoint,
  type Flow,
  type FlowStep,
  type Resource,
  type ResourceRelation,
} from "@sw/core";

function camel(value: string): string {
  return value
    .replace(/[-_\s]+(\w)/g, (_, c: string) => c.toUpperCase())
    .replace(/s$/, "");
}

/** Corpo mínimo a partir do schema: texto livre leva o prefixo do run. */
function sampleBody(schema: unknown): Record<string, unknown> | undefined {
  const properties = (schema as { properties?: Record<string, { type?: string }> } | undefined)
    ?.properties;
  if (!properties) return undefined;
  const body: Record<string, unknown> = {};
  for (const [name, property] of Object.entries(properties)) {
    if (/^(id|created_?at|updated_?at)$/i.test(name)) continue;
    if (property.type === "string") body[name] = "{{prefix}}";
    else if (property.type === "integer" || property.type === "number") body[name] = 1;
    else if (property.type === "boolean") body[name] = true;
  }
  return Object.keys(body).length > 0 ? body : undefined;
}

/** Item param → `{{var}}` extraído; demais params → fixture do ator. */
function templatePath(path: string, itemParam: string | undefined, idVar: string): string {
  return path.replace(/\{(\w+)\}|:(\w+)\b/g, (_, a?: string, b?: string) => {
    const name = (a ?? b)!;
    return name === itemParam ? `{{${idVar}}}` : `{{fixtures.${name}}}`;
  });
}

function idSourcePath(relations: ResourceRelation[], resource: string): string {
  const produced = relations.find(
    (r) => r.kind === "produces" && r.from === resource && r.to === resource && r.status !== "rejected",
  );
  return (produced?.source ?? "response.id").replace(/^response\./, "");
}

/**
 * Esqueletos a partir do grafo: CRUD (criar → ler → apagar) por recurso e,
 * com 2+ personas, BOLA cruzado (A cria, B lê e deve ser negado).
 */
export function generateFlowSkeletons(input: {
  endpoints: Endpoint[];
  resources: Resource[];
  relations: ResourceRelation[];
  personaIds: string[];
}): Flow[] {
  const byId = new Map(input.endpoints.map((e) => [e.id, e]));
  const [owner, other] = input.personaIds;
  if (!owner) return [];
  const flows: Flow[] = [];

  for (const resource of input.resources) {
    const create = byId.get(resource.operations.create ?? "");
    const read = byId.get(resource.operations.read ?? "");
    if (!create || !read) continue;
    const remove = byId.get(resource.operations.delete ?? "");
    const idVar = `${camel(resource.name)}Id`;
    const body = sampleBody(create.requestBodySchema);

    const createStep: FlowStep = {
      id: "create",
      label: `Criar ${resource.name}`,
      actor: owner,
      request: {
        method: create.method,
        path: templatePath(create.path, undefined, idVar),
        ...(body ? { body } : {}),
      },
      extract: [{ kind: "jsonPath", path: idSourcePath(input.relations, resource.name), as: idVar }],
      expect: { status: "2xx" },
    };
    const readPath = templatePath(read.path, resource.idParam, idVar);
    const teardown: FlowStep[] = remove
      ? [
          {
            id: "delete",
            label: `Apagar ${resource.name}`,
            actor: owner,
            request: { method: remove.method, path: templatePath(remove.path, resource.idParam, idVar) },
            extract: [],
            expect: { status: "2xx" },
          },
        ]
      : [];

    flows.push({
      id: `skeleton-crud-${resource.name}`,
      name: `CRUD ${resource.name}`,
      description: "Gerado do grafo de relacionamentos — revise corpo e expectativas.",
      setup: [],
      steps: [
        createStep,
        {
          id: "read",
          label: `Ler ${resource.name} criado`,
          actor: owner,
          request: { method: read.method, path: readPath },
          extract: [],
          expect: { status: "2xx" },
        },
      ],
      teardown,
    });

    if (other) {
      flows.push({
        id: `skeleton-bola-${resource.name}`,
        name: `BOLA ${resource.name}: outra persona lê`,
        description: "A cria, B tenta ler o objeto de A — deve ser negado.",
        setup: [createStep],
        steps: [
          {
            id: "foreign-read",
            label: `Outra persona lê ${resource.name}`,
            actor: other,
            request: { method: read.method, path: readPath },
            extract: [],
            expect: { status: "4xx" },
            severityOnFail: Severity.CRITICAL,
          },
        ],
        teardown,
      });
    }
  }
  return flows;
}
