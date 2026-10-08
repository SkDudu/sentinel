import { test } from "node:test";
import assert from "node:assert/strict";
import { FlowSchema } from "@sw/core";
import { generateFlowSkeletons, renderValue, runFlow } from "../dist/index.js";

const actors = {
  alice: {
    id: "alice",
    name: "Alice",
    headers: { Authorization: "Bearer alice" },
    fixtures: { store: "s1" },
    fields: { email: "alice@test.dev", age: 30 },
  },
  bob: { id: "bob", name: "Bob", headers: { Authorization: "Bearer bob" }, fixtures: {} },
};

const flow = FlowSchema.parse({
  id: "f1",
  name: "Pedido de outra persona",
  steps: [
    {
      id: "create",
      label: "Alice cria pedido",
      actor: "alice",
      request: {
        method: "POST",
        path: "/stores/{{fixtures.store}}/orders",
        body: { note: "{{prefix}}", email: "{{persona.fields.email}}", age: "{{persona.fields.age}}" },
      },
      extract: [{ kind: "jsonPath", path: "id", as: "orderId" }],
      expect: { status: "2xx" },
    },
    {
      id: "steal",
      label: "Bob lê pedido de Alice",
      actor: "bob",
      request: { method: "GET", path: "/orders/{{orderId}}" },
      expect: { status: "4xx" },
      severityOnFail: "CRITICAL",
    },
  ],
  teardown: [
    {
      id: "cleanup",
      label: "Alice apaga",
      actor: "alice",
      request: { method: "DELETE", path: "/orders/{{orderId}}" },
      expect: { status: [204] },
    },
  ],
});

function executor(status: Record<string, number>) {
  const calls: Array<{ method: string; url: string; body?: unknown; auth?: string }> = [];
  return {
    calls,
    async execute(request: { method: string; url: string; body?: unknown; headers: Record<string, string> }) {
      calls.push({ method: request.method, url: request.url, body: request.body, auth: request.headers.Authorization });
      return {
        status: status[request.method] ?? 200,
        headers: {},
        // Envelope { data: ... } exercita o fallback do jsonPath.
        body: { data: { id: 77 } },
        durationMs: 1,
      };
    },
  };
}

test("templates mantêm tipo quando o valor é o template inteiro", () => {
  const out = renderValue(
    { a: "{{persona.fields.age}}", b: "id-{{personas.alice.fixtures.store}}" },
    { vars: {}, actor: actors.alice, actors },
  );
  assert.deepEqual(out, { a: 30, b: "id-s1" });
});

test("B lê objeto de A com 200 → finding CRITICAL; teardown roda", async () => {
  const exec = executor({ POST: 201, GET: 200, DELETE: 204 });
  const result = await runFlow({
    flow,
    projectId: "22222222-2222-4222-8222-222222222222",
    runId: "run1",
    baseUrl: "https://api.test/",
    executor: exec,
    actors,
    endpoints: [{ id: "ep-read", method: "GET", path: "/orders/{order}" }],
  });

  assert.equal(result.status, "failed");
  assert.deepEqual(exec.calls.map((c) => `${c.method} ${c.url}`), [
    "POST https://api.test/stores/s1/orders",
    "GET https://api.test/orders/77",
    "DELETE https://api.test/orders/77",
  ]);
  assert.deepEqual(exec.calls[0]!.body, { note: "sentinel-run1", email: "alice@test.dev", age: 30 });
  assert.equal(exec.calls[1]!.auth, "Bearer bob");

  const [finding] = result.findings;
  assert.equal(finding?.testId, "flow:f1:steal");
  assert.equal(finding?.severity, "CRITICAL");
  assert.equal(finding?.endpointId, "ep-read");
  assert.equal(finding?.request?.headers.Authorization, "[redacted]");
});

test("negado corretamente → passed, sem finding", async () => {
  const result = await runFlow({
    flow,
    projectId: "p",
    runId: "run2",
    baseUrl: "https://api.test",
    executor: executor({ POST: 201, GET: 403, DELETE: 204 }),
    actors,
  });
  assert.equal(result.status, "passed");
  assert.equal(result.findings.length, 0);
});

test("Production Safety bloqueia fluxo com escrita sem enviar nada", async () => {
  const exec = executor({});
  const result = await runFlow({
    flow,
    projectId: "p",
    runId: "run3",
    baseUrl: "https://api.test",
    executor: exec,
    actors,
    productionSafetyMode: true,
  });
  assert.equal(result.status, "blocked");
  assert.equal(exec.calls.length, 0);
  assert.match(result.message ?? "", /Production Safety/);
});

test("falha no setup pula o resto e não vira finding", async () => {
  const withSetup = FlowSchema.parse({ ...flow, setup: [flow.steps[0]], steps: [flow.steps[1]] });
  const result = await runFlow({
    flow: withSetup,
    projectId: "p",
    runId: "run4",
    baseUrl: "https://api.test",
    executor: executor({ POST: 500 }),
    actors,
  });
  assert.equal(result.status, "error");
  assert.equal(result.findings.length, 0);
  assert.equal(result.steps.find((s) => s.stepId === "steal")?.status, "skipped");
});

test("esqueletos: CRUD e BOLA cruzado a partir do grafo", () => {
  const endpoints = [
    { id: "c", projectId: "p", method: "POST", path: "/orders", parameters: [], responses: [], tags: [],
      requestBodySchema: { type: "object", properties: { note: { type: "string" }, qty: { type: "integer" } } } },
    { id: "r", projectId: "p", method: "GET", path: "/orders/{order}", parameters: [], responses: [], tags: [] },
    { id: "d", projectId: "p", method: "DELETE", path: "/orders/{order}", parameters: [], responses: [], tags: [] },
  ] as never[];
  const flows = generateFlowSkeletons({
    endpoints,
    resources: [{ name: "orders", idParam: "order", operations: { create: "c", read: "r", delete: "d" } }],
    relations: [],
    personaIds: ["alice", "bob"],
  });
  assert.deepEqual(flows.map((f) => f.id), ["skeleton-crud-orders", "skeleton-bola-orders"]);
  const bola = flows[1]!;
  assert.equal(bola.steps[0]!.request.path, "/orders/{{orderId}}");
  assert.equal(bola.steps[0]!.actor, "bob");
  assert.deepEqual(bola.setup[0]!.request.body, { note: "{{prefix}}", qty: 1 });
  assert.equal(bola.teardown[0]!.request.method, "DELETE");
  assert.ok(flows.every((f) => FlowSchema.safeParse(f).success));
});
