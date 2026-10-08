import type { HttpRequest, HttpResponse } from "./schemas.js";

const SECRET_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "proxy-authorization",
]);
const SECRET_FIELD = /password|passwd|senha|token|secret/i;
export const REDACTED = "[redacted]";

function redactHeaders(headers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      SECRET_HEADERS.has(name.toLowerCase()) ? REDACTED : value,
    ]),
  );
}

function redactBody(value: unknown, depth = 0): unknown {
  if (depth > 8) return value;
  if (typeof value === "string") {
    if (!value.startsWith("{") && !value.startsWith("[")) return value;
    try {
      return JSON.stringify(redactBody(JSON.parse(value), depth + 1));
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map((item) => redactBody(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SECRET_FIELD.test(key) && item != null && typeof item !== "object"
          ? REDACTED
          : redactBody(item, depth + 1),
      ]),
    );
  }
  return value;
}

/** Evidence/logs: sem Authorization, Cookie, Set-Cookie nem password|token|secret. */
export function redactRequest(request: HttpRequest): HttpRequest {
  return {
    ...request,
    headers: redactHeaders(request.headers ?? {}),
    body: redactBody(request.body),
  };
}

export function redactResponse(response: HttpResponse): HttpResponse {
  return {
    ...response,
    headers: redactHeaders(response.headers ?? {}),
    body: redactBody(response.body),
    ...(response.setCookies
      ? { setCookies: response.setCookies.map(() => REDACTED) }
      : {}),
  };
}
