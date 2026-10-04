import {
  Severity,
  TestCaseSource,
  TestCategory,
  type Finding,
  type HttpRequest,
} from "@sw/core";
import type { SecurityTest, TestContext, TestExecutor } from "../types.js";
import { buildJsonRequest, makeFinding } from "../utils.js";

function resolveBurst(ctx: TestContext) {
  const configured = ctx.rateLimit?.requests ?? 30;
  const concurrency = ctx.rateLimit?.concurrency ?? 5;
  const expectedStatus = ctx.rateLimit?.expectedStatus ?? 429;

  if (ctx.productionSafetyMode) {
    return {
      requests: Math.min(configured, 5),
      concurrency: 1,
      expectedStatus,
      delayMs: 200,
    };
  }

  return {
    requests: Math.min(configured, 60),
    concurrency: Math.min(concurrency, 10),
    expectedStatus,
    delayMs: 0,
  };
}

export const rateLimitBurstTest: SecurityTest = {
  id: "rate-limit.burst",
  name: "Rate limit burst",
  category: TestCategory.RATE_LIMIT,
  severity: Severity.MEDIUM,
  description:
    "Sends a controlled burst and expects HTTP 429 (or configured status). Caps hard under Production Safety Mode.",

  generateCases(ctx) {
    // Skip clearly unsafe verbs on production safety unless explicitly allowed.
    if (
      ctx.productionSafetyMode &&
      ["DELETE", "PUT", "PATCH"].includes(ctx.endpoint.method)
    ) {
      return [];
    }

    const burst = resolveBurst(ctx);
    return [
      {
        id: "burst",
        name: `Burst ${burst.requests} requests`,
        source: TestCaseSource.DETERMINISTIC,
        category: TestCategory.RATE_LIMIT,
        mutations: { ...burst },
        tags: [
          "rate-limit",
          ctx.productionSafetyMode ? "production-safety" : "lab",
        ],
      },
    ];
  },

  async run(ctx, testCase, executor) {
    const requests = Number(testCase.mutations.requests ?? 5);
    const concurrency = Number(testCase.mutations.concurrency ?? 1);
    const expectedStatus = Number(testCase.mutations.expectedStatus ?? 429);
    const delayMs = Number(testCase.mutations.delayMs ?? 0);

    const base: HttpRequest = buildJsonRequest(ctx, { body: {} });
    const statuses: number[] = [];

    for (let i = 0; i < requests; i += concurrency) {
      const batch = Array.from(
        { length: Math.min(concurrency, requests - i) },
        () => executor.execute(base),
      );
      const responses = await Promise.all(batch);
      statuses.push(...responses.map((r) => r.status));
      if (delayMs > 0 && i + concurrency < requests) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    const hitLimit = statuses.some((s) => s === expectedStatus);
    if (hitLimit) return null;

    const lastStatus = statuses[statuses.length - 1] ?? 0;
    const finding: Finding = makeFinding(ctx, {
      testId: this.id,
      testCaseId: testCase.id,
      title: `No rate limit detected after ${requests} requests`,
      severity: ctx.productionSafetyMode ? Severity.LOW : Severity.MEDIUM,
      confidence: 55,
      evidence: `Sent ${requests} requests (concurrency ${concurrency}); statuses=${statuses.join(",")}. Expected ${expectedStatus}. Last=${lastStatus}.`,
      request: base,
      recommendation:
        "Apply per-IP/per-token rate limiting and return 429 with Retry-After.",
    });
    return finding;
  },

  analyse() {
    return null;
  },
};

export const rateLimitTests: SecurityTest[] = [rateLimitBurstTest];
