import { randomUUID } from "node:crypto";
import { parseSetCookie } from "@sw/auth";
import {
  ANONYMOUS_PERSONA,
  FindingStatus,
  Severity,
  redactRequest,
  redactResponse,
  type Finding,
  type Flow,
  type FlowStep,
  type HttpRequest,
  type HttpResponse,
} from "@sw/core";
import { renderString, renderValue, type FlowActor, type TemplateScope } from "./template.js";

export const SAFE_FLOW_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type FlowPhase = "setup" | "steps" | "teardown";
export type FlowStepStatus = "passed" | "failed" | "error" | "skipped";

export interface FlowStepResult {
  stepId: string;
  phase: FlowPhase;
  label: string;
  status: FlowStepStatus;
  message?: string;
  endpointId?: string;
  /** Já redigidos. */
  request?: HttpRequest;
  response?: HttpResponse;
}

export interface FlowRunResult {
  flowId: string;
  name: string;
  status: "passed" | "failed" | "error" | "blocked";
  message?: string;
  steps: FlowStepResult[];
  findings: Finding[];
}

export interface RunFlowInput {
  flow: Flow;
  projectId: string;
  runId: string;
  baseUrl: string;
  executor: { execute(request: HttpRequest): Promise<HttpResponse> };
  /** Personas autenticadas no ambiente. */
  actors: Record<string, FlowActor>;
  /** Headers do ambiente sem credencial (ator "anonymous"). */
  anonymousHeaders?: Record<string, string>;
  productionSafetyMode?: boolean;
  variables?: Record<string, string>;
  /** Liga passo ao endpoint do contrato (finding/test result). */
  endpoints?: Array<{ id: string; method: string; path: string }>;
  signal?: AbortSignal;
  onStep?: (result: FlowStepResult) => void;
}

const PHASES: FlowPhase[] = ["setup", "steps", "teardown"];

function shape(path: string): string {
  return path
    .split("?")[0]!
    .replace(/\{\{[^}]+\}\}|\{[^}]+\}|:\w+/g, "{}")
    .replace(/\/+$/, "");
}

function readRaw(body: unknown, path: string): unknown {
  let root = body;
  if (typeof root === "string") {
    try {
      root = JSON.parse(root);
    } catch {
      return undefined;
    }
  }
  const walk = (parts: string[]) => {
    let current = root;
    for (const part of parts) {
      if (current == null || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  };
  const parts = path.replace(/^\$\.?/, "").split(".").filter(Boolean);
  // Envelope comum `{ data: ... }`.
  return walk(parts) ?? (parts[0] === "data" ? undefined : walk(["data", ...parts]));
}

function sameValue(a: unknown, b: unknown): boolean {
  if (JSON.stringify(a) === JSON.stringify(b)) return true;
  const scalar = (v: unknown) => typeof v === "string" || typeof v === "number" || typeof v === "boolean";
  return scalar(a) && scalar(b) && String(a) === String(b);
}

function statusOk(expected: FlowStep["expect"]["status"], status: number): boolean {
  if (expected === "2xx") return status >= 200 && status < 300;
  if (expected === "4xx") return status >= 400 && status < 500;
  return expected.includes(status);
}

function describeExpect(expected: FlowStep["expect"]["status"]): string {
  return Array.isArray(expected) ? expected.join("|") : expected;
}

function headerValue(response: HttpResponse, name: string): string | undefined {
  const lower = name.toLowerCase();
  return Object.entries(response.headers).find(([key]) => key.toLowerCase() === lower)?.[1];
}

/** Extract da receita aplicado à resposta; devolve nomes que faltaram. */
function applyExtract(step: FlowStep, response: HttpResponse, vars: Record<string, string>): string[] {
  const missing: string[] = [];
  for (const rule of step.extract) {
    let value: unknown;
    let as: string;
    if (rule.kind === "jsonPath") {
      value = readRaw(response.body, rule.path);
      as = rule.as;
    } else if (rule.kind === "header") {
      value = headerValue(response, rule.name);
      as = rule.as;
    } else if (rule.kind === "cookie") {
      const lines = response.setCookies ?? [headerValue(response, "set-cookie") ?? ""];
      value = lines.map(parseSetCookie).find((c) => c?.name === rule.name)?.value;
      as = rule.as ?? rule.name;
    } else {
      const html = typeof response.body === "string" ? response.body : "";
      value = html.match(new RegExp(`name=["']${rule.name}["'][^>]*value=["']([^"']*)["']`, "i"))?.[1];
      as = rule.as;
    }
    if (value === undefined || value === null || value === "") missing.push(as);
    else vars[as] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return missing;
}

function checkJson(step: FlowStep, response: HttpResponse): string | undefined {
  for (const assertion of step.expect.json ?? []) {
    const value = readRaw(response.body, assertion.path);
    if (assertion.exists === true && value === undefined) return `${assertion.path} ausente`;
    if (assertion.exists === false && value !== undefined) return `${assertion.path} presente`;
    if (assertion.equals !== undefined && !sameValue(value, assertion.equals)) {
      return `${assertion.path} = ${JSON.stringify(value)}, esperado ${JSON.stringify(assertion.equals)}`;
    }
  }
  return undefined;
}

/** Métodos de escrita do fluxo (bloqueiam com Production Safety ligado). */
export function flowWriteSteps(flow: Flow): FlowStep[] {
  return PHASES.flatMap((phase) => flow[phase]).filter(
    (step) => !SAFE_FLOW_METHODS.has(step.request.method),
  );
}

/**
 * Executa `setup → steps → teardown` em ordem. Falha em `steps` vira
 * finding `flow:<flowId>:<stepId>`; teardown roda sempre (best-effort).
 */
export async function runFlow(input: RunFlowInput): Promise<FlowRunResult> {
  const { flow } = input;
  const results: FlowStepResult[] = [];
  const findings: Finding[] = [];
  const record = (result: FlowStepResult) => {
    results.push(result);
    input.onStep?.(result);
  };

  const writes = flowWriteSteps(flow);
  if (input.productionSafetyMode && writes.length > 0) {
    const sample = writes.slice(0, 3).map((s) => `${s.request.method} ${s.request.path}`).join(", ");
    const message = `Production Safety Mode ligado: fluxo tem método de escrita (${sample}) e foi bloqueado.`;
    for (const phase of PHASES) {
      for (const step of flow[phase]) {
        record({ stepId: step.id, phase, label: step.label, status: "skipped", message });
      }
    }
    return { flowId: flow.id, name: flow.name, status: "blocked", message, steps: results, findings };
  }

  const vars: Record<string, string> = {
    ...input.variables,
    runId: input.runId,
    prefix: `sentinel-${input.runId}`,
  };
  const byShape = new Map(
    (input.endpoints ?? []).map((e) => [`${e.method} ${shape(e.path)}`, e.id]),
  );

  const runStep = async (step: FlowStep, phase: FlowPhase): Promise<FlowStepResult> => {
    const endpointId = byShape.get(`${step.request.method} ${shape(step.request.path)}`);
    const base = { stepId: step.id, phase, label: step.label, ...(endpointId ? { endpointId } : {}) };
    const anonymous = step.actor === ANONYMOUS_PERSONA;
    const actor = input.actors[step.actor];
    if (!anonymous && !actor) {
      return { ...base, status: "error", message: `Persona ${step.actor} sem login neste ambiente.` };
    }

    let request: HttpRequest;
    try {
      const scope: TemplateScope = { vars, actor, actors: input.actors };
      const query = Object.entries(step.request.query ?? {})
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(renderString(value, scope))}`)
        .join("&");
      const hasBody = step.request.body !== undefined;
      request = {
        method: step.request.method,
        url: `${input.baseUrl.replace(/\/$/, "")}${renderString(step.request.path, scope)}${query ? `?${query}` : ""}`,
        headers: {
          ...(anonymous ? (input.anonymousHeaders ?? {}) : actor!.headers),
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
        },
        ...(hasBody ? { body: renderValue(step.request.body, scope) } : {}),
      };
    } catch (error) {
      return { ...base, status: "error", message: error instanceof Error ? error.message : "template inválido" };
    }

    let response: HttpResponse;
    try {
      response = await input.executor.execute(request);
    } catch (error) {
      return {
        ...base,
        status: "error",
        request: redactRequest(request),
        message: error instanceof Error ? error.message : "falha de rede",
      };
    }
    const evidence = { request: redactRequest(request), response: redactResponse(response) };

    if (!statusOk(step.expect.status, response.status)) {
      return {
        ...base,
        ...evidence,
        status: "failed",
        message: `esperado HTTP ${describeExpect(step.expect.status)}, obteve ${response.status}`,
      };
    }
    const jsonError = checkJson(step, response);
    if (jsonError) return { ...base, ...evidence, status: "failed", message: jsonError };
    const missing = applyExtract(step, response, vars);
    if (missing.length > 0) {
      return { ...base, ...evidence, status: "error", message: `extract sem valor: ${missing.join(", ")}` };
    }
    return { ...base, ...evidence, status: "passed" };
  };

  let broken: FlowStepResult | undefined;
  try {
    for (const phase of ["setup", "steps"] as const) {
      for (const step of flow[phase]) {
        if (broken || input.signal?.aborted) {
          record({
            stepId: step.id,
            phase,
            label: step.label,
            status: "skipped",
            message: broken ? `depois de falha em ${broken.label}` : "cancelado",
          });
          continue;
        }
        const result = await runStep(step, phase);
        record(result);
        if (result.status === "passed") continue;
        broken = result;
        if (phase === "steps" && result.status === "failed") {
          findings.push({
            id: randomUUID(),
            projectId: input.projectId,
            ...(result.endpointId ? { endpointId: result.endpointId } : {}),
            testId: `flow:${flow.id}:${step.id}`,
            testCaseId: step.id,
            title: `Fluxo "${flow.name}": ${step.label}`,
            severity: step.severityOnFail ?? Severity.MEDIUM,
            confidence: 70,
            status: FindingStatus.OPEN,
            evidence: `${step.request.method} ${step.request.path} como ${input.actors[step.actor]?.name ?? step.actor}: ${result.message}.`,
            request: result.request,
            response: result.response,
            recommendation: "Regra de negócio do fluxo não foi respeitada; revisar autorização/validação do passo.",
            createdAt: new Date().toISOString(),
          });
        }
      }
    }
  } finally {
    for (const step of flow.teardown) {
      record(await runStep(step, "teardown"));
    }
  }

  const status = !broken
    ? "passed"
    : broken.phase === "steps" && broken.status === "failed"
      ? "failed"
      : "error";
  const leftovers = results.filter((r) => r.phase === "teardown" && r.status !== "passed");
  const message = [
    broken ? `${broken.label}: ${broken.message}` : undefined,
    leftovers.length > 0 ? `teardown incompleto: ${leftovers.map((r) => r.label).join(", ")}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    flowId: flow.id,
    name: flow.name,
    status,
    ...(message ? { message } : {}),
    steps: results,
    findings,
  };
}
