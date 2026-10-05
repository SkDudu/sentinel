import type { Endpoint, Finding, Variable } from "@sw/core";
import type { RequestExecutor } from "@sw/http-client";

export interface CustomScannerContext {
  endpoint: Endpoint;
  baseUrl: string;
  authHeaders: Record<string, string>;
  variables: Record<string, string>;
  executor: RequestExecutor;
}

/**
 * Pluggable scanner beyond SecurityTest plugins.
 * Useful for wrappers around external tools.
 */
export interface CustomScanner {
  id: string;
  name: string;
  run(ctx: CustomScannerContext): Promise<Finding[]>;
}

export class CustomScannerRegistry {
  #scanners = new Map<string, CustomScanner>();

  register(scanner: CustomScanner) {
    if (this.#scanners.has(scanner.id)) {
      throw new Error(`Custom scanner already registered: ${scanner.id}`);
    }
    this.#scanners.set(scanner.id, scanner);
  }

  list() {
    return [...this.#scanners.values()];
  }

  get(id: string) {
    return this.#scanners.get(id);
  }

  async runAll(
    ctx: Omit<CustomScannerContext, "variables"> & {
      variables?: Variable[] | Record<string, string>;
    },
  ): Promise<Finding[]> {
    const variables = Array.isArray(ctx.variables)
      ? Object.fromEntries(ctx.variables.map((v) => [v.key, v.value]))
      : (ctx.variables ?? {});

    const findings: Finding[] = [];
    for (const scanner of this.list()) {
      const batch = await scanner.run({
        endpoint: ctx.endpoint,
        baseUrl: ctx.baseUrl,
        authHeaders: ctx.authHeaders,
        variables,
        executor: ctx.executor,
      });
      findings.push(...batch);
    }
    return findings;
  }
}
