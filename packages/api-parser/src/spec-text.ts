import { parse as parseYaml } from "yaml";

/** OpenAPI/Swagger source as text: JSON first, YAML fallback. */
export function parseSpecText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Spec vazio");

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      // YAML is a JSON superset; fall through for lenient input.
    }
  }

  let document: unknown;
  try {
    document = parseYaml(trimmed) as unknown;
  } catch (error) {
    throw new Error(
      `Spec não é JSON nem YAML válido: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("Spec precisa ser um objeto OpenAPI/Swagger");
  }
  return document;
}
