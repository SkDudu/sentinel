import type { HttpRequest, HttpResponse } from "@sw/core";
import type { ExecutorOptions, RequestExecutor } from "./types.js";

function headersToRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return await response.text();
    }
  }
  return response.text();
}

export class HttpExecutor implements RequestExecutor {
  readonly name = "http";

  constructor(private readonly options: ExecutorOptions = {}) {}

  async execute(request: HttpRequest): Promise<HttpResponse> {
    const controller = new AbortController();
    const timeout = this.options.timeoutMs ?? 30_000;
    const timer = setTimeout(() => controller.abort(), timeout);
    const started = performance.now();

    try {
      const init: RequestInit = {
        method: request.method,
        headers: request.headers,
        signal: controller.signal,
      };

      if (
        request.body !== undefined &&
        request.method !== "GET" &&
        request.method !== "HEAD"
      ) {
        init.body =
          typeof request.body === "string"
            ? request.body
            : JSON.stringify(request.body);

        if (!request.headers["content-type"] && !request.headers["Content-Type"]) {
          init.headers = {
            ...request.headers,
            "Content-Type": "application/json",
          };
        }
      }

      const response = await fetch(request.url, init);
      const body = await parseBody(response);

      return {
        status: response.status,
        headers: headersToRecord(response.headers),
        body,
        durationMs: Math.round(performance.now() - started),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Placeholder for future OWASP ZAP integration — not used in MVP. */
export class ZapExecutor implements RequestExecutor {
  readonly name = "zap";

  async execute(_request: HttpRequest): Promise<HttpResponse> {
    throw new Error("ZapExecutor not implemented yet — use HttpExecutor");
  }
}
