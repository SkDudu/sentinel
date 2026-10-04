import { randomUUID } from "node:crypto";
import {
  FindingStatus,
  Severity,
  TestCaseSource,
  TestCategory,
  type Finding,
  type HttpRequest,
  type HttpResponse,
  type TestCase,
} from "@sw/core";
import type { SecurityTest, TestContext } from "../types.js";

function baseBody(ctx: TestContext): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of ctx.analyzed.fields.filter(
    (f) => f.parameter.in === "body",
  )) {
    switch (field.semantics) {
      case "email":
        body[field.parameter.name] = "user@example.com";
        break;
      case "password":
        body[field.parameter.name] = "Senha123!";
        break;
      case "name":
        body[field.parameter.name] = "João Silva";
        break;
      case "role":
        body[field.parameter.name] = "user";
        break;
      default:
        if (field.parameter.type === "integer") {
          body[field.parameter.name] = 1;
        } else if (field.parameter.type === "boolean") {
          body[field.parameter.name] = true;
        } else {
          body[field.parameter.name] = "sample";
        }
    }
  }
  return body;
}

function buildRequest(
  ctx: TestContext,
  body: unknown,
  headers: Record<string, string> = {},
): HttpRequest {
  return {
    method: ctx.endpoint.method,
    url: `${ctx.baseUrl.replace(/\/$/, "")}${ctx.endpoint.path}`,
    headers: {
      ...ctx.authHeaders,
      "Content-Type": "application/json",
      ...headers,
    },
    body,
  };
}

export const missingRequiredFieldsTest: SecurityTest = {
  id: "validation.missing-required",
  name: "Missing required fields",
  category: TestCategory.VALIDATION,
  severity: Severity.MEDIUM,
  description: "Omits each required body field and checks API response.",

  generateCases(ctx) {
    const required = ctx.analyzed.fields.filter(
      (f) => f.parameter.in === "body" && f.parameter.required,
    );

    return required.map((field) => ({
      id: `missing-${field.parameter.name}`,
      name: `Missing ${field.parameter.name}`,
      source: TestCaseSource.DETERMINISTIC,
      category: TestCategory.VALIDATION,
      severityHint: Severity.MEDIUM,
      mutations: { omit: field.parameter.name },
      tags: ["validation", "missing"],
    }));
  },

  execute(ctx, testCase) {
    const body = baseBody(ctx);
    const omit = String(testCase.mutations.omit ?? "");
    delete body[omit];
    return buildRequest(ctx, body);
  },

  analyse(ctx, testCase, request, response): Finding | null {
    if (response.status >= 400 && response.status < 500) return null;

    return {
      id: randomUUID(),
      projectId: ctx.endpoint.projectId,
      endpointId: ctx.endpoint.id,
      testId: this.id,
      testCaseId: testCase.id,
      title: `Required field accepted when missing: ${String(testCase.mutations.omit)}`,
      severity: Severity.MEDIUM,
      confidence: 70,
      status: FindingStatus.OPEN,
      evidence: `Expected 4xx when omitting required field, got HTTP ${response.status}.`,
      request,
      response,
      recommendation:
        "Reject requests that omit required fields with a clear 4xx validation error.",
      createdAt: new Date().toISOString(),
    };
  },
};

export const nullAndEmptyFieldsTest: SecurityTest = {
  id: "validation.null-empty",
  name: "Null and empty values",
  category: TestCategory.VALIDATION,
  severity: Severity.LOW,
  description: "Sends null and empty-string values for each body field.",

  generateCases(ctx) {
    const cases: TestCase[] = [];
    for (const field of ctx.analyzed.fields.filter(
      (f) => f.parameter.in === "body",
    )) {
      cases.push(
        {
          id: `null-${field.parameter.name}`,
          name: `${field.parameter.name} = null`,
          source: TestCaseSource.DETERMINISTIC,
          category: TestCategory.VALIDATION,
          mutations: { field: field.parameter.name, value: null },
          tags: ["validation", "null"],
        },
        {
          id: `empty-${field.parameter.name}`,
          name: `${field.parameter.name} = ""`,
          source: TestCaseSource.DETERMINISTIC,
          category: TestCategory.VALIDATION,
          mutations: { field: field.parameter.name, value: "" },
          tags: ["validation", "empty"],
        },
      );
    }
    return cases;
  },

  execute(ctx, testCase) {
    const body = baseBody(ctx);
    const field = String(testCase.mutations.field ?? "");
    body[field] = testCase.mutations.value;
    return buildRequest(ctx, body);
  },

  analyse(ctx, testCase, request, response): Finding | null {
    if (response.status >= 400 && response.status < 500) return null;
    if (response.status >= 500) {
      return {
        id: randomUUID(),
        projectId: ctx.endpoint.projectId,
        endpointId: ctx.endpoint.id,
        testId: this.id,
        testCaseId: testCase.id,
        title: `Server error on null/empty input: ${testCase.name}`,
        severity: Severity.HIGH,
        confidence: 80,
        status: FindingStatus.OPEN,
        evidence: `HTTP ${response.status} for ${testCase.name}.`,
        request,
        response,
        recommendation: "Validate and reject null/empty inputs before processing.",
        createdAt: new Date().toISOString(),
      };
    }
    return null;
  },
};

export const wrongTypeFieldsTest: SecurityTest = {
  id: "validation.wrong-type",
  name: "Wrong types",
  category: TestCategory.VALIDATION,
  severity: Severity.MEDIUM,
  description: "Sends incorrect types for typed body fields.",

  generateCases(ctx) {
    return ctx.analyzed.fields
      .filter((f) => f.parameter.in === "body")
      .flatMap((field) => {
        const wrongValues: unknown[] =
          field.parameter.type === "integer" || field.parameter.type === "number"
            ? ["not-a-number", true, [], {}]
            : field.parameter.type === "boolean"
              ? ["yes", 1, [], {}]
              : [12345, true, [], {}];

        return wrongValues.map((value, index) => ({
          id: `wrong-type-${field.parameter.name}-${index}`,
          name: `${field.parameter.name} wrong type (${typeof value})`,
          source: TestCaseSource.DETERMINISTIC,
          category: TestCategory.VALIDATION,
          mutations: { field: field.parameter.name, value },
          tags: ["validation", "type-confusion"],
        }));
      });
  },

  execute(ctx, testCase) {
    const body = baseBody(ctx);
    const field = String(testCase.mutations.field ?? "");
    body[field] = testCase.mutations.value;
    return buildRequest(ctx, body);
  },

  analyse(
    ctx,
    testCase,
    request,
    response: HttpResponse,
  ): Finding | null {
    if (response.status >= 400 && response.status < 500) return null;
    return {
      id: randomUUID(),
      projectId: ctx.endpoint.projectId,
      endpointId: ctx.endpoint.id,
      testId: this.id,
      testCaseId: testCase.id,
      title: `Type confusion accepted: ${testCase.name}`,
      severity: Severity.MEDIUM,
      confidence: 65,
      status: FindingStatus.OPEN,
      evidence: `Expected validation failure, got HTTP ${response.status}.`,
      request,
      response,
      recommendation: "Enforce schema types and reject mismatched payloads.",
      createdAt: new Date().toISOString(),
    };
  },
};

export const validationTests: SecurityTest[] = [
  missingRequiredFieldsTest,
  nullAndEmptyFieldsTest,
  wrongTypeFieldsTest,
];
