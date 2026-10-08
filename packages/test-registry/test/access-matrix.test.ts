import { test } from "node:test";
import assert from "node:assert/strict";
import { accessMatrixTest } from "../dist/index.js";

const endpoint = {
  id: "e-order",
  projectId: "p",
  method: "GET" as const,
  path: "/orders/{id}",
  parameters: [{ name: "id", in: "path" as const, required: true }],
  responses: [],
  tags: [],
  source: "openapi" as const,
};

const personas = {
  alice: {
    id: "alice",
    name: "Alice",
    headers: { Authorization: "Bearer alice", "X-Tenant": "t1" },
    fixtures: { orderId: "ord_a" },
  },
  bob: {
    id: "bob",
    name: "Bob",
    headers: { Cookie: "sid=bob", "X-Tenant": "t1" },
    fixtures: { orderId: "ord_b" },
  },
};

function ctx(accessRules: unknown[], options: { method?: string; safety?: boolean } = {}) {
  const ep = { ...endpoint, method: options.method ?? "GET" };
  return {
    endpoint: ep,
    analyzed: { endpoint: ep, fields: [] },
    variables: {},
    baseUrl: "https://api.test",
    authHeaders: { Authorization: "Bearer env", "X-Tenant": "t1" },
    productionSafetyMode: options.safety ?? false,
    personas,
    accessRules,
  } as never;
}

const ok = { status: 200, headers: {}, durationMs: 1 };
const forbidden = { status: 403, headers: {}, durationMs: 1 };

test("own-only: caso próprio + objeto de cada outra persona", async () => {
  const context = ctx([
    { endpointId: "e-order", personaId: "alice", expect: "own-only", pathFixtures: { id: "orderId" } },
  ]);
  const cases = await accessMatrixTest.generateCases(context);
  assert.deepEqual(cases.map((c) => c.id), ["matrix-alice-own", "matrix-alice-foreign-bob"]);

  const foreign = cases[1]!;
  const request = await accessMatrixTest.execute!(context, foreign);
  assert.equal(request.url, "https://api.test/orders/ord_b");
  assert.equal(request.headers.Authorization, "Bearer alice");
  assert.equal(request.headers.Cookie, undefined);

  const finding = (await accessMatrixTest.analyse(context, foreign, request, ok)) as {
    severity: string;
  };
  assert.equal(finding.severity, "CRITICAL");
  assert.equal(await accessMatrixTest.analyse(context, foreign, request, forbidden), null);
});

test("anônimo com deny vai sem credencial; 2xx vira BFLA crítico", async () => {
  const context = ctx([{ endpointId: "e-order", personaId: "anonymous", expect: "deny" }]);
  const [anon] = await accessMatrixTest.generateCases(context);
  const request = await accessMatrixTest.execute!(context, anon!);
  assert.deepEqual(request.headers, { "X-Tenant": "t1" });
  const finding = (await accessMatrixTest.analyse(context, anon!, request, ok)) as {
    severity: string;
  };
  assert.equal(finding.severity, "CRITICAL");
});

test("allow negado é regressão LOW; persona sem login é ignorada", async () => {
  const context = ctx([
    { endpointId: "e-order", personaId: "bob", expect: "allow" },
    { endpointId: "e-order", personaId: "carol", expect: "deny" },
  ]);
  const cases = await accessMatrixTest.generateCases(context);
  assert.equal(cases.length, 1);
  const request = await accessMatrixTest.execute!(context, cases[0]!);
  const finding = (await accessMatrixTest.analyse(context, cases[0]!, request, forbidden)) as {
    severity: string;
  };
  assert.equal(finding.severity, "LOW");
});

test("Safety ligado: matriz não roda método de escrita", async () => {
  const context = ctx([{ endpointId: "e-order", personaId: "bob", expect: "deny" }], {
    method: "DELETE",
    safety: true,
  });
  assert.equal((await accessMatrixTest.generateCases(context)).length, 0);
});
