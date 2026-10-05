import type { HttpRequest, HttpResponse } from "@sw/core";
import type { RequestExecutor } from "./types.js";

export interface ZapExecutorOptions {
  /** ZAP API base, e.g. http://127.0.0.1:8080 */
  apiBaseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

function buildRawHttpRequest(request: HttpRequest): string {
  const url = new URL(request.url);
  const path = `${url.pathname}${url.search}`;
  const lines = [`${request.method.toUpperCase()} ${path} HTTP/1.1`, `Host: ${url.host}`];

  for (const [key, value] of Object.entries(request.headers)) {
    if (/^host$/i.test(key)) continue;
    lines.push(`${key}: ${value}`);
  }

  let body = "";
  if (
    request.body !== undefined &&
    request.method !== "GET" &&
    request.method !== "HEAD"
  ) {
    body =
      typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body);
    if (
      !Object.keys(request.headers).some((k) =>
        /^content-type$/i.test(k),
      )
    ) {
      lines.push("Content-Type: application/json");
    }
    lines.push(`Content-Length: ${Buffer.byteLength(body)}`);
  }

  lines.push("");
  lines.push(body);
  return lines.join("\r\n");
}

function parseZapSendRequest(payload: unknown): HttpResponse {
  const root = payload as {
    sendRequest?: string;
    ResponseHeader?: string;
    ResponseBody?: string;
  };

  const raw =
    typeof root.sendRequest === "string"
      ? root.sendRequest
      : typeof (payload as { Result?: string }).Result === "string"
        ? (payload as { Result: string }).Result
        : JSON.stringify(payload);

  // ZAP often returns nested JSON string.
  let headerBlock = "";
  let bodyText = "";
  try {
    const nested = JSON.parse(raw) as {
      responseHeader?: string;
      responseBody?: string;
      ResponseHeader?: string;
      ResponseBody?: string;
    };
    headerBlock =
      nested.responseHeader ?? nested.ResponseHeader ?? root.ResponseHeader ?? "";
    bodyText =
      nested.responseBody ?? nested.ResponseBody ?? root.ResponseBody ?? "";
  } catch {
    headerBlock = raw;
  }

  const statusMatch = headerBlock.match(/HTTP\/\d(?:\.\d)?\s+(\d{3})/i);
  const status = statusMatch ? Number(statusMatch[1]) : 0;
  const headers: Record<string, string> = {};
  for (const line of headerBlock.split(/\r?\n/).slice(1)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }

  let body: unknown = bodyText;
  const contentType =
    headers["Content-Type"] ?? headers["content-type"] ?? "";
  if (contentType.includes("application/json") && bodyText) {
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = bodyText;
    }
  }

  return { status, headers, body, durationMs: 0 };
}

/**
 * Optional OWASP ZAP adapter — sends requests through ZAP's REST API.
 * Requires a running ZAP instance; never used by default.
 */
export class ZapExecutor implements RequestExecutor {
  readonly name = "zap";

  constructor(private readonly options: ZapExecutorOptions) {}

  async execute(request: HttpRequest): Promise<HttpResponse> {
    const started = performance.now();
    const apiBase = this.options.apiBaseUrl.replace(/\/$/, "");
    const params = new URLSearchParams({
      request: buildRawHttpRequest(request),
      followRedirects: "false",
    });
    if (this.options.apiKey) params.set("apikey", this.options.apiKey);

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? 30_000,
    );

    try {
      const response = await fetch(
        `${apiBase}/JSON/core/action/sendRequest/?${params.toString()}`,
        { method: "GET", signal: controller.signal },
      );

      if (!response.ok) {
        throw new Error(
          `ZAP API error: HTTP ${response.status} (is ZAP running at ${apiBase}?)`,
        );
      }

      const payload = (await response.json()) as unknown;
      const parsed = parseZapSendRequest(payload);
      return {
        ...parsed,
        durationMs: Math.round(performance.now() - started),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
