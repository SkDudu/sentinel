import type { HttpRequest, HttpResponse } from "@sw/core";

export interface RequestExecutor {
  readonly name: string;
  execute(request: HttpRequest): Promise<HttpResponse>;
}

export interface ExecutorOptions {
  timeoutMs?: number;
  /** Soft guard for production safety mode */
  maxRequestsPerMinute?: number;
  /** External cancel (scan abort); combined with timeout. */
  signal?: AbortSignal;
}
