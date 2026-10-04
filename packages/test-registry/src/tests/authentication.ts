import {
  Severity,
  TestCaseSource,
  TestCategory,
  type Finding,
  type HttpRequest,
  type HttpResponse,
} from "@sw/core";
import type { SecurityTest, TestContext } from "../types.js";
import { buildJsonRequest, hasAuthHeaders, makeFinding } from "../utils.js";

/** Unsigned JWT with exp in the past — probes expiry handling. */
const EXPIRED_JWT =
  "eyJhbGciOiJub25lIn0.eyJzdWIiOiJzZW50aW5lbCIsImV4cCI6MTYwMDAwMDAwMH0.";

function authFinding(
  ctx: TestContext,
  testId: string,
  testCaseId: string,
  title: string,
  request: HttpRequest,
  response: HttpResponse,
  recommendation: string,
): Finding | null {
  if (response.status < 200 || response.status >= 300) return null;
  return makeFinding(ctx, {
    testId,
    testCaseId,
    title,
    severity: Severity.HIGH,
    confidence: 80,
    evidence: `Expected 401/403 for broken auth, got HTTP ${response.status}.`,
    request,
    response,
    recommendation,
  });
}

export const missingAuthTest: SecurityTest = {
  id: "authentication.missing-auth",
  name: "Missing authentication",
  category: TestCategory.AUTHENTICATION,
  severity: Severity.HIGH,
  description: "Calls protected endpoints without auth headers.",
  requirements: ["auth"],

  generateCases(ctx) {
    if (!hasAuthHeaders(ctx)) return [];
    return [
      {
        id: "missing-auth",
        name: "No Authorization header",
        source: TestCaseSource.DETERMINISTIC,
        category: TestCategory.AUTHENTICATION,
        mutations: { stripAuth: true },
        tags: ["authentication", "missing-auth"],
      },
    ];
  },

  execute(ctx) {
    return buildJsonRequest(ctx, { stripAuth: true, body: {} });
  },

  analyse(ctx, testCase, request, response) {
    return authFinding(
      ctx,
      this.id,
      testCase.id,
      "Endpoint accessible without authentication",
      request,
      response,
      "Require valid credentials and return 401/403 when Authorization is absent.",
    );
  },
};

export const invalidAuthTest: SecurityTest = {
  id: "authentication.invalid-token",
  name: "Invalid authentication token",
  category: TestCategory.AUTHENTICATION,
  severity: Severity.HIGH,
  description: "Sends a clearly invalid bearer/API token.",
  requirements: ["auth"],

  generateCases(ctx) {
    if (!hasAuthHeaders(ctx)) return [];
    return [
      {
        id: "invalid-token",
        name: "Invalid bearer token",
        source: TestCaseSource.DETERMINISTIC,
        category: TestCategory.AUTHENTICATION,
        mutations: { auth: "invalid" },
        tags: ["authentication", "invalid-token"],
      },
    ];
  },

  execute(ctx) {
    return buildJsonRequest(ctx, {
      body: {},
      headers: { Authorization: "Bearer sentinel-invalid-token" },
    });
  },

  analyse(ctx, testCase, request, response) {
    return authFinding(
      ctx,
      this.id,
      testCase.id,
      "Endpoint accepted an invalid authentication token",
      request,
      response,
      "Reject malformed or unknown tokens with 401.",
    );
  },
};

export const expiredAuthTest: SecurityTest = {
  id: "authentication.expired-token",
  name: "Expired authentication token",
  category: TestCategory.AUTHENTICATION,
  severity: Severity.HIGH,
  description: "Sends a JWT with exp in the past.",
  requirements: ["auth"],

  generateCases(ctx) {
    if (!hasAuthHeaders(ctx)) return [];
    return [
      {
        id: "expired-token",
        name: "Expired JWT",
        source: TestCaseSource.DETERMINISTIC,
        category: TestCategory.AUTHENTICATION,
        mutations: { auth: "expired" },
        tags: ["authentication", "expired-token"],
      },
    ];
  },

  execute(ctx) {
    return buildJsonRequest(ctx, {
      body: {},
      headers: { Authorization: `Bearer ${EXPIRED_JWT}` },
    });
  },

  analyse(ctx, testCase, request, response) {
    return authFinding(
      ctx,
      this.id,
      testCase.id,
      "Endpoint accepted an expired token",
      request,
      response,
      "Validate JWT exp/nbf and reject expired credentials with 401.",
    );
  },
};

export const authenticationTests: SecurityTest[] = [
  missingAuthTest,
  invalidAuthTest,
  expiredAuthTest,
];
