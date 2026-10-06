import { randomUUID } from "node:crypto";
import type { Endpoint, Parameter } from "@sw/core";

type JsonSchema = Record<string, unknown>;

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  tags?: string[];
  parameters?: Array<{
    name: string;
    in: "path" | "query" | "header" | "cookie";
    required?: boolean;
    schema?: JsonSchema;
    description?: string;
  }>;
  requestBody?: {
    content?: Record<string, { schema?: JsonSchema }>;
  };
}

interface OpenApiDocument {
  openapi?: string;
  swagger?: string;
  paths?: Record<string, Record<string, OpenApiOperation>>;
}

const METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
] as const;

function bodyParameters(schema: JsonSchema | undefined): Parameter[] {
  if (!schema || typeof schema !== "object") return [];

  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set(
    Array.isArray(schema.required) ? (schema.required as string[]) : [],
  );

  return Object.entries(properties).map(([name, prop]) => ({
    name,
    in: "body" as const,
    required: required.has(name),
    type: typeof prop.type === "string" ? prop.type : undefined,
    format: typeof prop.format === "string" ? prop.format : undefined,
    schema: prop,
    description:
      typeof prop.description === "string" ? prop.description : undefined,
  }));
}

export function parseOpenApi(
  document: unknown,
  projectId: string,
  environmentId?: string,
): Endpoint[] {
  const doc = document as OpenApiDocument;
  if (!doc?.paths || typeof doc.paths !== "object") {
    throw new Error("Invalid OpenAPI document: missing paths");
  }

  const endpoints: Endpoint[] = [];

  for (const [path, pathItem] of Object.entries(doc.paths)) {
    for (const method of METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const parameters: Parameter[] = (operation.parameters ?? []).map((p) => ({
        name: p.name,
        in: p.in,
        required: Boolean(p.required),
        type:
          typeof p.schema?.type === "string"
            ? (p.schema.type as string)
            : undefined,
        format:
          typeof p.schema?.format === "string"
            ? (p.schema.format as string)
            : undefined,
        schema: p.schema,
        description: p.description,
      }));

      const jsonSchema =
        operation.requestBody?.content?.["application/json"]?.schema;
      parameters.push(...bodyParameters(jsonSchema));

      endpoints.push({
        id: randomUUID(),
        projectId,
        environmentId,
        method: method.toUpperCase() as Endpoint["method"],
        path,
        operationId: operation.operationId,
        summary: operation.summary,
        parameters,
        requestBodySchema: jsonSchema,
        tags: operation.tags ?? [],
        source: "openapi",
      });
    }
  }

  return endpoints;
}
