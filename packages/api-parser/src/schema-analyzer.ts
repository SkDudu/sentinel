import type { Endpoint, Parameter } from "@sw/core";

export type FieldSemantics =
  | "email"
  | "password"
  | "name"
  | "cpf"
  | "phone"
  | "role"
  | "id"
  | "token"
  | "url"
  | "date"
  | "unknown";

export interface AnalyzedField {
  parameter: Parameter;
  semantics: FieldSemantics;
  hints: string[];
}

export interface AnalyzedEndpoint {
  endpoint: Endpoint;
  fields: AnalyzedField[];
}

function detectSemantics(param: Parameter): FieldSemantics {
  const name = param.name.toLowerCase();
  const format = param.format?.toLowerCase();

  if (format === "email" || name.includes("email")) return "email";
  if (name.includes("password") || name.includes("senha")) return "password";
  if (name === "cpf" || name.includes("cpf")) return "cpf";
  if (name.includes("phone") || name.includes("telefone") || name === "mobile")
    return "phone";
  if (name === "role" || name === "perfil" || name.includes("role"))
    return "role";
  if (name.endsWith("id") || name === "id") return "id";
  if (name.includes("token") || name.includes("jwt")) return "token";
  if (format === "uri" || format === "url" || name.includes("url"))
    return "url";
  if (format === "date" || format === "date-time" || name.includes("date"))
    return "date";
  if (name.includes("name") || name.includes("nome")) return "name";
  return "unknown";
}

export function analyzeEndpoint(endpoint: Endpoint): AnalyzedEndpoint {
  const fields = endpoint.parameters.map((parameter) => {
    const semantics = detectSemantics(parameter);
    const hints: string[] = [];

    if (parameter.required) hints.push("required");
    if (parameter.type) hints.push(`type:${parameter.type}`);
    if (semantics !== "unknown") hints.push(`semantics:${semantics}`);

    return { parameter, semantics, hints };
  });

  return { endpoint, fields };
}
