import {
  TestCaseSource,
  TestCategory,
  type TestCase,
  type TestDataOptions,
} from "@sw/core";
import type { AnalyzedEndpoint, FieldSemantics } from "@sw/api-parser";
import { builtinPersonas } from "./personas.js";

const SEMANTIC_CASES: Partial<Record<FieldSemantics, Array<{ name: string; value: unknown; tag: string }>>> = {
  email: [
    { name: "valid", value: "usuario@email.com", tag: "normal" },
    { name: "missing-domain", value: "usuario@", tag: "validation" },
    { name: "missing-local", value: "@email.com", tag: "validation" },
    { name: "space-inside", value: "usuario @email.com", tag: "edge" },
    { name: "double-at", value: "usuario@@email.com", tag: "validation" },
    { name: "no-tld", value: "usuario@email", tag: "validation" },
  ],
  password: [
    { name: "valid", value: "MinhaSenha123!", tag: "normal" },
    { name: "too-short", value: "123", tag: "validation" },
    { name: "leading-space", value: " Senha123!", tag: "edge" },
    { name: "trailing-space", value: "Senha123! ", tag: "edge" },
    { name: "space-middle", value: "Minha Senha123!", tag: "edge" },
    { name: "only-spaces", value: "        ", tag: "edge" },
  ],
  name: [
    { name: "valid", value: "João Silva", tag: "normal" },
    { name: "leading-space", value: " João", tag: "edge" },
    { name: "trailing-space", value: "João ", tag: "edge" },
    { name: "multi-space", value: "João    Silva", tag: "edge" },
    { name: "only-spaces", value: "     ", tag: "edge" },
    { name: "unicode-emoji", value: "João 👨‍💻", tag: "edge" },
  ],
  cpf: [
    { name: "valid-masked", value: "529.982.247-25", tag: "normal" },
    { name: "valid-raw", value: "52998224725", tag: "normal" },
    { name: "incomplete", value: "529.982", tag: "validation" },
    { name: "letters", value: "abc.def.ghi-jk", tag: "validation" },
    { name: "repeated", value: "111.111.111-11", tag: "validation" },
  ],
  phone: [
    { name: "br-valid", value: "+5511999999999", tag: "normal" },
    { name: "incomplete", value: "11999", tag: "validation" },
    { name: "spaces", value: "11 99999 9999", tag: "edge" },
    { name: "letters", value: "telefone", tag: "validation" },
  ],
  role: [
    { name: "user", value: "user", tag: "normal" },
    { name: "admin", value: "admin", tag: "business-logic" },
    { name: "unknown", value: "superadmin", tag: "business-logic" },
    { name: "case-variation", value: "Admin", tag: "edge" },
  ],
};

export function generateDeterministicCases(
  analyzed: AnalyzedEndpoint,
  options: TestDataOptions,
): TestCase[] {
  const cases: TestCase[] = [];

  if (options.normal || options.edgeCases || options.validationErrors) {
    for (const field of analyzed.fields.filter((f) => f.parameter.in === "body")) {
      const catalog = SEMANTIC_CASES[field.semantics] ?? [
        { name: "sample", value: "sample", tag: "normal" },
        { name: "empty", value: "", tag: "validation" },
        { name: "null", value: null, tag: "validation" },
      ];

      for (const entry of catalog) {
        if (entry.tag === "normal" && !options.normal) continue;
        if (entry.tag === "edge" && !options.edgeCases) continue;
        if (entry.tag === "validation" && !options.validationErrors) continue;
        if (entry.tag === "business-logic" && !options.businessLogic) continue;

        cases.push({
          id: `det-${field.parameter.name}-${entry.name}`,
          name: `${field.parameter.name}: ${entry.name}`,
          source: TestCaseSource.DETERMINISTIC,
          category: TestCategory.VALIDATION,
          mutations: { field: field.parameter.name, value: entry.value },
          tags: [entry.tag, field.semantics],
        });
      }
    }
  }

  if (options.boundaryValues) {
    for (const field of analyzed.fields.filter((f) => f.parameter.in === "body")) {
      cases.push({
        id: `boundary-oversize-${field.parameter.name}`,
        name: `${field.parameter.name}: oversized`,
        source: TestCaseSource.DETERMINISTIC,
        category: TestCategory.VALIDATION,
        mutations: {
          field: field.parameter.name,
          value: "A".repeat(10_000),
        },
        tags: ["boundary"],
      });
    }
  }

  if (options.businessLogic) {
    for (const persona of builtinPersonas) {
      cases.push({
        id: `persona-${persona.id}`,
        name: `Persona: ${persona.name}`,
        source: TestCaseSource.BUSINESS_LOGIC,
        category: TestCategory.BUSINESS_LOGIC,
        persona: persona.id,
        mutations: { ...persona.fields },
        tags: persona.tags,
      });
    }
  }

  return cases;
}
