import {
  ANONYMOUS_PERSONA,
  Severity,
  TestCaseSource,
  TestCategory,
  type AccessRule,
  type TestCase,
} from "@sw/core";
import type { PersonaContext, SecurityTest, TestContext } from "../types.js";
import {
  endpointUrl,
  fillPathParams,
  makeFinding,
  SAFE_METHODS,
  withoutAuth,
} from "../utils.js";

type Mode = "rule" | "own" | "foreign";

const is2xx = (status: number) => status >= 200 && status < 300;

function pathParamNames(ctx: TestContext): string[] {
  return ctx.endpoint.parameters.filter((p) => p.in === "path").map((p) => p.name);
}

/** own-only sem mapa explícito: fixture com o mesmo nome do param. */
function fixtureMap(ctx: TestContext, rule: AccessRule): Record<string, string> {
  return (
    rule.pathFixtures ??
    Object.fromEntries(pathParamNames(ctx).map((name) => [name, name]))
  );
}

function ownsAll(persona: PersonaContext, map: Record<string, string>): boolean {
  const keys = Object.values(map);
  return keys.length > 0 && keys.every((key) => persona.fixtures[key] !== undefined);
}

function pathValues(
  ctx: TestContext,
  map: Record<string, string>,
  owner?: PersonaContext,
): Record<string, string> {
  const values: Record<string, string> = { ...ctx.variables, ...owner?.fixtures };
  for (const [param, key] of Object.entries(map)) {
    const value = owner?.fixtures[key];
    if (value !== undefined) values[param] = value;
  }
  return values;
}

function actorLabel(ctx: TestContext, personaId: string): string {
  return personaId === ANONYMOUS_PERSONA
    ? "anônimo"
    : (ctx.personas?.[personaId]?.name ?? personaId);
}

/**
 * Matriz endpoint × persona: cada regra vira request com a credencial da
 * persona (ou sem credencial para "anonymous") e compara com o esperado.
 */
export const accessMatrixTest: SecurityTest = {
  id: "authorization.matrix",
  name: "Access matrix (BFLA / BOLA)",
  category: TestCategory.AUTHORIZATION,
  severity: Severity.CRITICAL,
  description:
    "Executa a matriz de acesso declarada: deny que responde 2xx vira BFLA, objeto de outra persona em own-only vira BOLA.",
  requirements: ["personas", "access-rules"],

  generateCases(ctx) {
    const rules = (ctx.accessRules ?? []).filter(
      (rule) => rule.endpointId === ctx.endpoint.id,
    );
    if (rules.length === 0) return [];
    if (ctx.productionSafetyMode && !SAFE_METHODS.has(ctx.endpoint.method)) {
      return [];
    }

    const personas = ctx.personas ?? {};
    const cases: TestCase[] = [];
    const push = (id: string, name: string, mutations: Record<string, unknown>) =>
      cases.push({
        id,
        name,
        source: TestCaseSource.DETERMINISTIC,
        category: TestCategory.AUTHORIZATION,
        severityHint: Severity.CRITICAL,
        mutations,
        tags: ["authorization", "matrix"],
      });

    for (const rule of rules) {
      const anonymous = rule.personaId === ANONYMOUS_PERSONA;
      const persona = personas[rule.personaId];
      // Persona sem login no ambiente não entra: resultado seria do ambiente.
      if (!anonymous && !persona) continue;
      const label = actorLabel(ctx, rule.personaId);

      if (rule.expect !== "own-only") {
        push(`matrix-${rule.personaId}`, `Matriz: ${label} → ${rule.expect}`, {
          personaId: rule.personaId,
          expect: rule.expect,
          mode: "rule" satisfies Mode,
        });
        continue;
      }
      if (anonymous || !persona) continue;

      const map = fixtureMap(ctx, rule);
      if (!ownsAll(persona, map)) continue;
      push(`matrix-${rule.personaId}-own`, `Matriz: ${label} no próprio objeto`, {
        personaId: rule.personaId,
        expect: rule.expect,
        mode: "own" satisfies Mode,
        ownerPersona: persona.id,
      });
      for (const other of Object.values(personas)) {
        if (other.id === persona.id || !ownsAll(other, map)) continue;
        push(
          `matrix-${rule.personaId}-foreign-${other.id}`,
          `Matriz: ${label} no objeto de ${other.name}`,
          {
            personaId: rule.personaId,
            expect: rule.expect,
            mode: "foreign" satisfies Mode,
            ownerPersona: other.id,
          },
        );
      }
    }
    return cases;
  },

  execute(ctx, testCase) {
    const personaId = String(testCase.mutations.personaId);
    const rule = ctx.accessRules?.find(
      (r) => r.endpointId === ctx.endpoint.id && r.personaId === personaId,
    );
    const actor = ctx.personas?.[personaId];
    const owner =
      ctx.personas?.[String(testCase.mutations.ownerPersona)] ?? actor;
    const map = rule ? fixtureMap(ctx, rule) : {};
    const path = fillPathParams(ctx.endpoint.path, pathValues(ctx, map, owner));
    const write = !SAFE_METHODS.has(ctx.endpoint.method);
    return {
      method: ctx.endpoint.method,
      url: endpointUrl(ctx, path),
      headers: {
        ...(actor ? actor.headers : withoutAuth(ctx.authHeaders)),
        ...(write ? { "Content-Type": "application/json" } : {}),
      },
      ...(write ? { body: {} } : {}),
    };
  },

  analyse(ctx, testCase, request, response) {
    const personaId = String(testCase.mutations.personaId);
    const expect = String(testCase.mutations.expect);
    const mode = String(testCase.mutations.mode) as Mode;
    const label = actorLabel(ctx, personaId);
    const owner = ctx.personas?.[String(testCase.mutations.ownerPersona)];
    const target = `${ctx.endpoint.method} ${ctx.endpoint.path}`;
    const denied = response.status === 401 || response.status === 403;
    const base = { testId: this.id, testCaseId: testCase.id, request, response };

    if (mode === "rule" && expect === "deny" && is2xx(response.status)) {
      const critical =
        personaId === ANONYMOUS_PERSONA || !SAFE_METHODS.has(ctx.endpoint.method);
      return makeFinding(ctx, {
        ...base,
        title: `BFLA: ${label} acessou ${target}`,
        severity: critical ? Severity.CRITICAL : Severity.HIGH,
        confidence: 85,
        evidence: `Matriz diz deny para ${label}; resposta HTTP ${response.status}.`,
        recommendation:
          "Checar permissão da função no servidor (role/escopo) antes de executar a operação.",
      });
    }
    if (mode === "rule" && expect === "allow" && denied) {
      return makeFinding(ctx, {
        ...base,
        title: `Regressão de permissão: ${label} negado em ${target}`,
        severity: Severity.LOW,
        confidence: 70,
        evidence: `Matriz diz allow para ${label}; resposta HTTP ${response.status}.`,
        recommendation: "Confirmar se a permissão mudou de propósito; senão corrigir a regra.",
      });
    }
    if (mode === "foreign" && is2xx(response.status)) {
      return makeFinding(ctx, {
        ...base,
        title: `BOLA: ${label} acessou objeto de ${owner?.name ?? "outra persona"} em ${target}`,
        severity: Severity.CRITICAL,
        confidence: 90,
        evidence: `own-only: objeto de ${owner?.name ?? "outra persona"} respondeu HTTP ${response.status} para ${label}.`,
        recommendation:
          "Validar dono do objeto no servidor: o caller só acessa recursos que possui.",
      });
    }
    if (mode === "own" && (denied || response.status === 404)) {
      return makeFinding(ctx, {
        ...base,
        title: `Regressão: ${label} sem acesso ao próprio objeto em ${target}`,
        severity: Severity.LOW,
        confidence: 60,
        evidence: `own-only: objeto da própria persona respondeu HTTP ${response.status}. Fixture pode estar desatualizada.`,
        recommendation: "Conferir fixtures da persona no ambiente ou a regra de acesso.",
      });
    }
    return null;
  },
};
