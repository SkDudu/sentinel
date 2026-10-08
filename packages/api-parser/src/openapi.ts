import { randomUUID } from "node:crypto";
import type { Endpoint, EndpointResponse, Parameter } from "@sw/core";

type JsonSchema = Record<string, unknown>;

interface OpenApiParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  schema?: JsonSchema;
  description?: string;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: {
    content?: Record<string, { schema?: JsonSchema }>;
  };
  responses?: Record<
    string,
    {
      description?: string;
      content?: Record<string, { schema?: JsonSchema }>;
    }
  >;
}

interface OpenApiPathItem {
  parameters?: OpenApiParameter[];
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  patch?: OpenApiOperation;
  delete?: OpenApiOperation;
  head?: OpenApiOperation;
  options?: OpenApiOperation;
}

interface OpenApiDocument {
  openapi?: string;
  swagger?: string;
  paths?: Record<string, OpenApiPathItem>;
  components?: Record<string, unknown>;
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

function resolveRef(
  document: OpenApiDocument,
  node: unknown,
  depth = 0,
): unknown {
  if (!node || typeof node !== "object" || depth > 10) return node;
  const obj = node as Record<string, unknown>;
  if (typeof obj.$ref === "string" && obj.$ref.startsWith("#/")) {
    let current: unknown = document;
    for (const part of obj.$ref.slice(2).split("/")) {
      if (!current || typeof current !== "object") return node;
      current = (current as Record<string, unknown>)[part];
    }
    const resolved = resolveRef(document, current, depth + 1);
    // Nome do component alimenta a inferência de relações.
    const component = obj.$ref.match(/^#\/components\/schemas\/([^/]+)$/)?.[1];
    return component && resolved && typeof resolved === "object"
      ? { ...(resolved as Record<string, unknown>), "x-component": component }
      : resolved;
  }

  if (obj.properties && typeof obj.properties === "object") {
    const properties = Object.fromEntries(
      Object.entries(obj.properties as Record<string, unknown>).map(
        ([key, value]) => [key, resolveRef(document, value, depth + 1)],
      ),
    );
    return { ...obj, properties };
  }

  if (Array.isArray(obj.items)) {
    return {
      ...obj,
      items: obj.items.map((item) => resolveRef(document, item, depth + 1)),
    };
  }
  if (obj.items && typeof obj.items === "object") {
    return { ...obj, items: resolveRef(document, obj.items, depth + 1) };
  }

  return obj;
}

function asSchema(
  document: OpenApiDocument,
  schema: JsonSchema | undefined,
): JsonSchema | undefined {
  if (!schema) return undefined;
  const resolved = resolveRef(document, schema);
  return resolved && typeof resolved === "object"
    ? (resolved as JsonSchema)
    : schema;
}

function mapParameters(
  document: OpenApiDocument,
  parameters: OpenApiParameter[] | undefined,
): Parameter[] {
  return (parameters ?? [])
    .map((raw) => resolveRef(document, raw) as OpenApiParameter)
    .filter((parameter) => Boolean(parameter?.name && parameter?.in))
    .map((parameter) => mapParameter(document, parameter));
}

function mapParameter(
  document: OpenApiDocument,
  parameter: OpenApiParameter,
): Parameter {
  const schema = asSchema(document, parameter.schema);
  return {
    name: parameter.name,
    in: parameter.in,
    required: Boolean(parameter.required),
    type: typeof schema?.type === "string" ? (schema.type as string) : undefined,
    format:
      typeof schema?.format === "string" ? (schema.format as string) : undefined,
    schema,
    description: parameter.description,
  };
}

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

function mapResponses(
  document: OpenApiDocument,
  operation: OpenApiOperation,
): EndpointResponse[] {
  const responses = operation.responses ?? {};
  return Object.entries(responses).map(([status, raw]) => {
    const response = resolveRef(document, raw) as
      | {
          description?: string;
          content?: Record<string, { schema?: JsonSchema }>;
          links?: Record<string, unknown>;
        }
      | undefined;
    const links = Object.entries(response?.links ?? {}).flatMap(
      ([name, rawLink]) => {
        const link = resolveRef(document, rawLink) as {
          operationId?: string;
          parameters?: Record<string, unknown>;
        } | null;
        if (!link || typeof link !== "object") return [];
        return [
          {
            name,
            operationId: link.operationId,
            parameters: Object.fromEntries(
              Object.entries(link.parameters ?? {}).filter(
                (entry): entry is [string, string] => typeof entry[1] === "string",
              ),
            ),
          },
        ];
      },
    );
    const content = response?.content ?? {};
    const contentType =
      "application/json" in content
        ? "application/json"
        : Object.keys(content)[0];
    const schema = contentType
      ? asSchema(document, content[contentType]?.schema)
      : undefined;
    return {
      status,
      description: response?.description,
      contentType,
      schema,
      ...(links.length > 0 ? { links } : {}),
    };
  });
}

function pickJsonBodySchema(
  document: OpenApiDocument,
  operation: OpenApiOperation,
): JsonSchema | undefined {
  const requestBody = resolveRef(document, operation.requestBody) as
    | OpenApiOperation["requestBody"]
    | undefined;
  const content = requestBody?.content ?? {};
  const json = content["application/json"]?.schema;
  if (json) return asSchema(document, json);
  const first = Object.values(content)[0]?.schema;
  return asSchema(document, first);
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

      const parameters: Parameter[] = [
        ...mapParameters(doc, pathItem.parameters),
        ...mapParameters(doc, operation.parameters),
      ];

      const jsonSchema = pickJsonBodySchema(doc, operation);
      parameters.push(...bodyParameters(jsonSchema));

      endpoints.push({
        id: randomUUID(),
        projectId,
        environmentId,
        method: method.toUpperCase() as Endpoint["method"],
        path,
        operationId: operation.operationId,
        summary: operation.summary,
        description: operation.description,
        parameters,
        requestBodySchema: jsonSchema,
        responses: mapResponses(doc, operation),
        tags: operation.tags ?? [],
        source: "openapi",
      });
    }
  }

  return endpoints;
}
