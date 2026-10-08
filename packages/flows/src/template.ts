export interface FlowActor {
  id: string;
  name: string;
  headers: Record<string, string>;
  /** Ids que a persona possui no ambiente (binding). */
  fixtures: Record<string, string>;
  /** Dados fake da persona (não secretos). */
  fields?: Record<string, unknown>;
}

export interface TemplateScope {
  vars: Record<string, string>;
  actor?: FlowActor;
  actors: Record<string, FlowActor>;
}

const TOKEN = /\{\{\s*([\w.-]+)\s*\}\}/g;
const WHOLE = /^\{\{\s*([\w.-]+)\s*\}\}$/;

export class TemplateError extends Error {}

function pick(source: unknown, path: string[]): unknown {
  let current = source;
  for (const part of path) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * `{{var}}`, `{{runId}}`, `{{prefix}}`, `{{fixtures.x}}`,
 * `{{persona.fields.x}}`, `{{personas.<id>.fixtures.x}}`.
 */
export function resolveToken(expr: string, scope: TemplateScope): unknown {
  const [root, ...rest] = expr.split(".");
  if (root === "fixtures") return pick(scope.actor?.fixtures, rest);
  if (root === "persona") return pick(scope.actor, rest);
  if (root === "personas") {
    const [id, ...path] = rest;
    return pick(id ? scope.actors[id] : undefined, path);
  }
  return rest.length === 0 ? scope.vars[expr] : undefined;
}

function resolveOrThrow(expr: string, scope: TemplateScope): unknown {
  const value = resolveToken(expr, scope);
  if (value === undefined || value === null) {
    throw new TemplateError(`variável não resolvida: {{${expr}}}`);
  }
  return value;
}

export function renderString(value: string, scope: TemplateScope): string {
  return value.replace(TOKEN, (_, expr: string) => {
    const resolved = resolveOrThrow(expr, scope);
    return typeof resolved === "string" ? resolved : JSON.stringify(resolved);
  });
}

/** Template inteiro (`"{{x}}"`) mantém o tipo original do valor. */
export function renderValue(value: unknown, scope: TemplateScope): unknown {
  if (typeof value === "string") {
    const whole = value.match(WHOLE);
    return whole ? resolveOrThrow(whole[1]!, scope) : renderString(value, scope);
  }
  if (Array.isArray(value)) return value.map((item) => renderValue(item, scope));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, renderValue(item, scope)]),
    );
  }
  return value;
}

/** Variáveis `{{x}}` simples usadas num valor (para validação do editor). */
export function templateVars(value: unknown): string[] {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return [...text.matchAll(TOKEN)]
    .map((match) => match[1]!)
    .filter((expr) => !expr.includes("."));
}
