import {
  Severity,
  TestCaseSource,
  TestCategory,
} from "@sw/core";
import type { SecurityTest } from "../types.js";
import { buildJsonRequest, endpointUrl, makeFinding } from "../utils.js";

const SECURITY_HEADERS = [
  "x-content-type-options",
  "x-frame-options",
  "strict-transport-security",
] as const;

export const corsTest: SecurityTest = {
  id: "http.cors",
  name: "CORS misconfiguration",
  category: TestCategory.HTTP,
  severity: Severity.MEDIUM,
  description: "OPTIONS preflight with untrusted Origin.",

  generateCases() {
    return [
      {
        id: "cors-evil-origin",
        name: "CORS reflect evil Origin",
        source: TestCaseSource.DETERMINISTIC,
        category: TestCategory.HTTP,
        mutations: { origin: "https://evil.sentinel.test" },
        tags: ["http", "cors"],
      },
    ];
  },

  execute(ctx, testCase) {
    const origin = String(
      testCase.mutations.origin ?? "https://evil.sentinel.test",
    );
    return buildJsonRequest(ctx, {
      method: "OPTIONS",
      url: endpointUrl(ctx),
      stripAuth: true,
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": ctx.endpoint.method,
        "Access-Control-Request-Headers": "authorization,content-type",
      },
      body: undefined,
    });
  },

  analyse(ctx, testCase, request, response) {
    const origin = String(testCase.mutations.origin);
    const allowOrigin =
      response.headers["access-control-allow-origin"] ??
      response.headers["Access-Control-Allow-Origin"];
    const allowCreds =
      response.headers["access-control-allow-credentials"] ??
      response.headers["Access-Control-Allow-Credentials"];

    if (!allowOrigin) return null;

    const reflects = allowOrigin === "*" || allowOrigin === origin;
    if (!reflects) return null;

    const critical = allowOrigin === "*" && /true/i.test(allowCreds ?? "");

    return makeFinding(ctx, {
      testId: this.id,
      testCaseId: testCase.id,
      title: critical
        ? "CORS allows any origin with credentials"
        : "CORS allows untrusted Origin",
      severity: critical ? Severity.HIGH : Severity.MEDIUM,
      confidence: 75,
      evidence: `ACAO=${allowOrigin}; credentials=${allowCreds ?? "n/a"}; probed Origin=${origin}.`,
      request,
      response,
      recommendation:
        "Allowlist trusted origins; never combine ACAO:* with Allow-Credentials:true.",
    });
  },
};

export const methodTamperTest: SecurityTest = {
  id: "http.methods",
  name: "Unexpected HTTP method",
  category: TestCategory.HTTP,
  severity: Severity.LOW,
  description: "Probes TRACE and a non-declared method.",

  generateCases(ctx) {
    const probes = ["TRACE"];
    if (ctx.endpoint.method !== "GET") probes.push("GET");
    else probes.push("DELETE");

    return probes.map((method) => ({
      id: `method-${method.toLowerCase()}`,
      name: `Method ${method}`,
      source: TestCaseSource.DETERMINISTIC,
      category: TestCategory.HTTP,
      mutations: { method },
      tags: ["http", "methods"],
    }));
  },

  execute(ctx, testCase) {
    return buildJsonRequest(ctx, {
      method: String(testCase.mutations.method ?? "TRACE"),
      body: {},
    });
  },

  analyse(ctx, testCase, request, response) {
    const method = String(testCase.mutations.method);
    if (method === "TRACE" && response.status < 400) {
      return makeFinding(ctx, {
        testId: this.id,
        testCaseId: testCase.id,
        title: "TRACE method enabled",
        severity: Severity.MEDIUM,
        confidence: 85,
        evidence: `TRACE returned HTTP ${response.status}.`,
        request,
        response,
        recommendation: "Disable TRACE on API gateways and app servers.",
      });
    }

    if (
      method !== ctx.endpoint.method &&
      method !== "TRACE" &&
      response.status >= 200 &&
      response.status < 300
    ) {
      return makeFinding(ctx, {
        testId: this.id,
        testCaseId: testCase.id,
        title: `Unexpected method ${method} accepted`,
        severity: Severity.LOW,
        confidence: 50,
        evidence: `${method} on ${ctx.endpoint.path} returned HTTP ${response.status}.`,
        request,
        response,
        recommendation: "Return 405 Method Not Allowed for undeclared verbs.",
      });
    }

    return null;
  },
};

export const securityHeadersTest: SecurityTest = {
  id: "http.security-headers",
  name: "Missing security headers",
  category: TestCategory.HTTP,
  severity: Severity.INFO,
  description: "Checks common hardening headers on a normal request.",

  generateCases() {
    return [
      {
        id: "security-headers",
        name: "Security response headers",
        source: TestCaseSource.DETERMINISTIC,
        category: TestCategory.HTTP,
        mutations: {},
        tags: ["http", "headers"],
      },
    ];
  },

  execute(ctx) {
    return buildJsonRequest(ctx, { body: {} });
  },

  analyse(ctx, testCase, request, response) {
    const missing = SECURITY_HEADERS.filter((header) => {
      const found = Object.keys(response.headers).some(
        (name) => name.toLowerCase() === header,
      );
      return !found;
    });

    if (missing.length === 0) return null;

    return makeFinding(ctx, {
      testId: this.id,
      testCaseId: testCase.id,
      title: "Missing security headers",
      severity: Severity.INFO,
      confidence: 40,
      evidence: `Missing: ${missing.join(", ")}.`,
      request,
      response,
      recommendation:
        "Add X-Content-Type-Options, X-Frame-Options, and HSTS (HTTPS) where applicable.",
    });
  },
};

export const httpTests: SecurityTest[] = [
  corsTest,
  methodTamperTest,
  securityHeadersTest,
];
