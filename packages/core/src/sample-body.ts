type JsonSchema = Record<string, unknown>;

const SKIP = /^(id|created_?at|updated_?at|deleted_?at)$/i;

function sampleValue(schema: JsonSchema, depth: number): unknown {
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (Array.isArray(schema.allOf) || schema.properties) return sampleObject(schema, depth);

  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type;
  switch (type) {
    case "string":
      switch (schema.format) {
        case "email":
          return "{{prefix}}@example.test";
        case "date":
          return "2030-01-01";
        case "date-time":
          return "2030-01-01T00:00:00Z";
        case "uuid":
          return "00000000-0000-4000-8000-000000000000";
        case "uri":
        case "url":
          return "https://example.test/{{prefix}}";
        default:
          return "{{prefix}}";
      }
    case "integer":
    case "number":
      return typeof schema.minimum === "number" ? schema.minimum : 1;
    case "boolean":
      return true;
    case "array": {
      const items = schema.items as JsonSchema | undefined;
      return items && typeof items === "object" ? [sampleValue(items, depth + 1)] : [];
    }
    case "object":
      return sampleObject(schema, depth);
    default:
      return undefined;
  }
}

function sampleObject(schema: JsonSchema, depth: number): Record<string, unknown> | undefined {
  if (depth > 4) return undefined;
  const parts = [schema, ...((schema.allOf as JsonSchema[] | undefined) ?? [])];
  const body: Record<string, unknown> = {};
  for (const part of parts) {
    const properties = (part?.properties ?? {}) as Record<string, JsonSchema>;
    for (const [name, property] of Object.entries(properties)) {
      if (SKIP.test(name) || !property || typeof property !== "object" || property.readOnly) continue;
      const value = sampleValue(property, depth + 1);
      if (value !== undefined) body[name] = value;
    }
  }
  return Object.keys(body).length > 0 ? body : undefined;
}

/**
 * Body de exemplo a partir do schema OpenAPI: example/default/enum primeiro,
 * texto livre com `{{prefix}}` para rastrear o que o fluxo criou.
 */
export function sampleRequestBody(schema: unknown): Record<string, unknown> | undefined {
  return schema && typeof schema === "object" ? sampleObject(schema as JsonSchema, 0) : undefined;
}
