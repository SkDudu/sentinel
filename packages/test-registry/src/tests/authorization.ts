import {
  Severity,
  TestCaseSource,
  TestCategory,
} from "@sw/core";
import type { SecurityTest } from "../types.js";
import {
  buildJsonRequest,
  endpointUrl,
  hasAuthHeaders,
  makeFinding,
  pathIdParams,
} from "../utils.js";

/**
 * Controlled fixtures:
 * - {{userId}} own resource (optional)
 * - {{otherUserId}} foreign resource (default 999999 if unset)
 * - {{otherToken}} optional second-principal token for horizontal checks
 */
export const idorTest: SecurityTest = {
  id: "authorization.idor",
  name: "IDOR / object-level authorization",
  category: TestCategory.AUTHORIZATION,
  severity: Severity.CRITICAL,
  description:
    "Replaces path IDs with a controlled foreign fixture while keeping caller auth.",
  requirements: ["auth", "fixtures"],

  generateCases(ctx) {
    const ids = pathIdParams(ctx);
    if (ids.length === 0 || !hasAuthHeaders(ctx)) return [];

    return ids.map((param) => ({
      id: `idor-${param.name}`,
      name: `IDOR via path param ${param.name}`,
      source: TestCaseSource.DETERMINISTIC,
      category: TestCategory.AUTHORIZATION,
      severityHint: Severity.CRITICAL,
      mutations: {
        pathParam: param.name,
        otherUserId: ctx.variables.otherUserId ?? "999999",
      },
      tags: ["authorization", "idor", "fixture"],
    }));
  },

  execute(ctx, testCase) {
    const param = String(testCase.mutations.pathParam ?? "id");
    const foreign = String(
      testCase.mutations.otherUserId ?? ctx.variables.otherUserId ?? "999999",
    );
    let path = ctx.endpoint.path;
    path = path
      .replace(new RegExp(`\\{${param}\\}`, "g"), foreign)
      .replace(new RegExp(`:${param}\\b`, "g"), foreign);

    // Also replace literal {{userId}} placeholders if present.
    const url = endpointUrl(ctx, path).replace(
      encodeURIComponent(ctx.variables.userId ?? "__none__"),
      encodeURIComponent(foreign),
    );

    return buildJsonRequest(ctx, {
      url,
      body: {},
      headers: ctx.variables.otherToken
        ? { Authorization: `Bearer ${ctx.variables.otherToken}` }
        : undefined,
    });
  },

  analyse(ctx, testCase, request, response) {
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      return null;
    }
    if (response.status < 200 || response.status >= 300) return null;

    return makeFinding(ctx, {
      testId: this.id,
      testCaseId: testCase.id,
      title: `Possible IDOR on ${ctx.endpoint.method} ${ctx.endpoint.path}`,
      severity: Severity.CRITICAL,
      confidence: 65,
      evidence: `Foreign fixture id=${String(testCase.mutations.otherUserId)} returned HTTP ${response.status}. Confirm object ownership checks.`,
      request,
      response,
      recommendation:
        "Enforce object-level authorization: caller may only access resources they own.",
    });
  },
};

export const privilegeEscalationTest: SecurityTest = {
  id: "authorization.privilege",
  name: "Privilege escalation via role field",
  category: TestCategory.AUTHORIZATION,
  severity: Severity.HIGH,
  description:
    "Attempts to set privileged role/admin fields using controlled fixtures.",
  requirements: ["auth"],

  generateCases(ctx) {
    const roleFields = ctx.analyzed.fields.filter(
      (f) =>
        f.parameter.in === "body" &&
        (f.semantics === "role" || /role|perfil|admin|permission/i.test(f.parameter.name)),
    );
    if (roleFields.length === 0 || !hasAuthHeaders(ctx)) return [];

    return roleFields.map((field) => ({
      id: `priv-${field.parameter.name}`,
      name: `Privilege via ${field.parameter.name}`,
      source: TestCaseSource.DETERMINISTIC,
      category: TestCategory.AUTHORIZATION,
      severityHint: Severity.HIGH,
      mutations: {
        field: field.parameter.name,
        value: ctx.variables.adminRole ?? "admin",
      },
      tags: ["authorization", "privilege", "fixture"],
    }));
  },

  execute(ctx, testCase) {
    const body: Record<string, unknown> = {};
    for (const field of ctx.analyzed.fields.filter((f) => f.parameter.in === "body")) {
      if (field.parameter.name === String(testCase.mutations.field)) {
        body[field.parameter.name] = testCase.mutations.value ?? "admin";
      } else if (field.semantics === "email") {
        body[field.parameter.name] = ctx.variables.email ?? "user@example.com";
      } else if (field.semantics === "name") {
        body[field.parameter.name] = ctx.variables.name ?? "Sentinel User";
      } else if (field.parameter.type === "integer") {
        body[field.parameter.name] = Number(ctx.variables.userId ?? "1");
      } else {
        body[field.parameter.name] = "sample";
      }
    }
    return buildJsonRequest(ctx, { body });
  },

  analyse(ctx, testCase, request, response) {
    if (response.status < 200 || response.status >= 300) return null;
    return makeFinding(ctx, {
      testId: this.id,
      testCaseId: testCase.id,
      title: `Possible privilege escalation via ${String(testCase.mutations.field)}`,
      severity: Severity.HIGH,
      confidence: 60,
      evidence: `Server accepted privileged value "${String(testCase.mutations.value)}" with HTTP ${response.status}.`,
      request,
      response,
      recommendation:
        "Ignore client-supplied role/permission fields; assign privileges server-side.",
    });
  },
};

export const authorizationTests: SecurityTest[] = [
  idorTest,
  privilegeEscalationTest,
];
