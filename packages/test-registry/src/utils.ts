import { randomUUID } from "node:crypto";
import {
  FindingStatus,
  type Finding,
  type HttpRequest,
  type HttpResponse,
  type Severity,
} from "@sw/core";
import type { TestContext } from "./types.js";

export function interpolate(
  value: string,
  variables: Record<string, string>,
): string {
  return value.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? "");
}

export function interpolateUnknown(
  value: unknown,
  variables: Record<string, string>,
): unknown {
  if (typeof value === "string") return interpolate(value, variables);
  if (Array.isArray(value)) {
    return value.map((item) => interpolateUnknown(item, variables));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = interpolateUnknown(v, variables);
    }
    return out;
  }
  return value;
}

export function endpointUrl(ctx: TestContext, path = ctx.endpoint.path): string {
  return interpolate(
    `${ctx.baseUrl.replace(/\/$/, "")}${path}`,
    ctx.variables,
  );
}

export function buildJsonRequest(
  ctx: TestContext,
  overrides: Partial<HttpRequest> & { stripAuth?: boolean } = {},
): HttpRequest {
  const auth: Record<string, string> = { ...ctx.authHeaders };
  if (overrides.stripAuth) {
    delete auth.Authorization;
    delete auth.authorization;
    delete auth.Cookie;
    delete auth.cookie;
  }

  const headers: Record<string, string> = {
    ...auth,
    "Content-Type": "application/json",
    ...(overrides.headers ?? {}),
  };

  const body =
    overrides.body !== undefined
      ? interpolateUnknown(overrides.body, ctx.variables)
      : undefined;

  return {
    method: overrides.method ?? ctx.endpoint.method,
    url: overrides.url ?? endpointUrl(ctx),
    headers: Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k, interpolate(v, ctx.variables)]),
    ),
    body,
  };
}

export function readPath(value: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = value;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Apply mutations.extract map: { token: "body.access_token", id: "header.x-user-id" } */
export function applyExtracts(
  variables: Record<string, string>,
  extract: unknown,
  response: HttpResponse,
): void {
  if (!extract || typeof extract !== "object") return;

  for (const [key, spec] of Object.entries(extract as Record<string, unknown>)) {
    if (typeof spec !== "string") continue;
    const [root, ...rest] = spec.split(".");
    const path = rest.join(".");
    let raw: unknown;
    if (root === "body") raw = path ? readPath(response.body, path) : response.body;
    else if (root === "header" || root === "headers") {
      const headerName = path.toLowerCase();
      const match = Object.entries(response.headers).find(
        ([name]) => name.toLowerCase() === headerName,
      );
      raw = match?.[1];
    } else {
      raw = readPath(response.body, spec);
    }
    if (raw === undefined || raw === null) continue;
    variables[key] = typeof raw === "string" ? raw : JSON.stringify(raw);
  }
}

export function makeFinding(
  ctx: TestContext,
  input: {
    testId: string;
    testCaseId: string;
    title: string;
    severity: Severity;
    confidence: number;
    evidence: string;
    request?: HttpRequest;
    response?: HttpResponse;
    recommendation?: string;
  },
): Finding {
  return {
    id: randomUUID(),
    projectId: ctx.endpoint.projectId,
    endpointId: ctx.endpoint.id,
    testId: input.testId,
    testCaseId: input.testCaseId,
    title: input.title,
    severity: input.severity,
    confidence: input.confidence,
    status: FindingStatus.OPEN,
    evidence: input.evidence,
    request: input.request,
    response: input.response,
    recommendation: input.recommendation,
    createdAt: new Date().toISOString(),
  };
}

export function hasAuthHeaders(ctx: TestContext): boolean {
  return carriesAuth(ctx.authHeaders);
}

const AUTH_HEADER = /authorization|x-api-key|api-key|^cookie$/i;

export function carriesAuth(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((k) => AUTH_HEADER.test(k));
}

/** Mantém headers do ambiente (tenant, accept…) sem credencial. */
export function withoutAuth(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([k]) => !AUTH_HEADER.test(k)),
  );
}

export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Troca `{param}` / `:param` do path pelos valores dados. */
export function fillPathParams(
  path: string,
  values: Record<string, string>,
): string {
  return path.replace(/\{(\w+)\}|:(\w+)\b/g, (match, a?: string, b?: string) => {
    const value = values[(a ?? b)!];
    return value === undefined ? match : encodeURIComponent(value);
  });
}

export function pathIdParams(ctx: TestContext) {
  return ctx.endpoint.parameters.filter(
    (p) =>
      p.in === "path" &&
      (/id$/i.test(p.name) || p.name === "id" || /user/i.test(p.name)),
  );
}
