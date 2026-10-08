import { test } from "node:test";
import assert from "node:assert/strict";
import { idorTest } from "../dist/index.js";

const endpoint = {
  id: "33333333-3333-4333-8333-333333333333",
  projectId: "22222222-2222-4222-8222-222222222222",
  method: "GET" as const,
  path: "/users/{userId}/orders/{orderId}",
  parameters: [
    { name: "userId", in: "path" as const, required: true },
    { name: "orderId", in: "path" as const, required: true },
  ],
  responses: [],
  tags: [],
  source: "openapi" as const,
};

function ctx(personas?: Record<string, unknown>, productionSafetyMode = false) {
  return {
    endpoint,
    analyzed: { endpoint, fields: [] },
    variables: {},
    baseUrl: "https://api.test",
    authHeaders: { Authorization: "Bearer env" },
    productionSafetyMode,
    personas,
  } as never;
}

const personas = {
  alice: {
    id: "alice",
    name: "Alice",
    headers: { Authorization: "Bearer alice" },
    fixtures: { userId: "1", orderId: "ord_a" },
  },
  bob: {
    id: "bob",
    name: "Bob",
    headers: { Cookie: "sid=bob" },
    fixtures: { userId: "2", orderId: "ord_b" },
  },
};

test("sem personas mantém o fallback 999999", async () => {
  const cases = await idorTest.generateCases(ctx());
  assert.deepEqual(
    cases.map((c) => c.mutations.otherUserId),
    ["999999", "999999"],
  );
});

test("com personas: objeto de B pedido com a credencial de A", async () => {
  const context = ctx(personas);
  const cases = await idorTest.generateCases(context);
  const bobOrder = cases.find((c) => c.id === "idor-orderId-bob")!;
  assert.equal(bobOrder.mutations.attackerPersona, "alice");

  const request = await idorTest.execute!(context, bobOrder);
  assert.equal(request.url, "https://api.test/users/2/orders/ord_b");
  assert.equal(request.headers.Authorization, "Bearer alice");
  assert.equal(request.headers.Cookie, undefined);

  const finding = await idorTest.analyse(context, bobOrder, request, {
    status: 200,
    headers: {},
    durationMs: 1,
  });
  assert.equal((finding as { confidence: number }).confidence, 85);
});

test("Safety ligado não usa objeto real em método de escrita", async () => {
  const write = { ...endpoint, method: "DELETE" as const };
  const context = { ...ctx(personas, true), endpoint: write, analyzed: { endpoint: write, fields: [] } };
  assert.equal((await idorTest.generateCases(context as never)).length, 0);
});
