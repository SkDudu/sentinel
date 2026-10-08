import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestAccessRules, suggestFlows, suggestRelations } from "../dist/index.js";

const endpoint = (id: string, method: string, path: string) => ({
  id,
  projectId: "p",
  method,
  path,
  parameters: [],
  responses: [],
  tags: [],
});

const input = {
  endpoints: [
    endpoint("create", "POST", "/orders"),
    endpoint("read", "GET", "/orders/{orderId}"),
    endpoint("users", "GET", "/users/{userId}"),
  ],
  resources: [
    { name: "orders", idParam: "orderId", operations: { create: "create", read: "read" } },
    { name: "users", idParam: "userId", operations: { read: "users" } },
  ],
  relations: [],
  personas: [
    { id: "alice", name: "Alice", role: "user", fixtureKeys: ["order_id"] },
    { id: "bob", name: "Bob", fixtureKeys: [] },
  ],
} as never;

function fakeClient(answer: unknown) {
  const prompts: string[] = [];
  return {
    prompts,
    client: {
      async complete(messages: Array<{ content: string }>) {
        prompts.push(messages.map((m) => m.content).join("\n"));
        return `Claro:\n${JSON.stringify(answer)}`;
      },
    },
  };
}

test("suggestAccessRules: só endpoint/persona reais; own-only exige fixture da persona", async () => {
  const { client, prompts } = fakeClient([
    { method: "get", path: "/orders/{orderId}", persona: "alice", expect: "own-only", pathFixtures: { orderId: "order_id" } },
    { method: "GET", path: "/orders/{orderId}", persona: "bob", expect: "own-only", pathFixtures: { orderId: "order_id" } },
    { method: "GET", path: "/orders/{orderId}", persona: "anonymous", expect: "deny" },
    { method: "GET", path: "/admin", persona: "alice", expect: "deny" },
    { method: "GET", path: "/users/{userId}", persona: "mallory", expect: "allow" },
    { method: "GET", path: "/users/{userId}", persona: "bob", expect: "maybe" },
  ]);
  const { rules, rejected } = await suggestAccessRules(client as never, input);

  assert.deepEqual(rules, [
    { endpointId: "read", personaId: "alice", expect: "own-only", pathFixtures: { orderId: "order_id" } },
    { endpointId: "read", personaId: "anonymous", expect: "deny" },
  ]);
  assert.deepEqual(
    rejected.map((r) => r.reason),
    [
      "own-only sem pathFixtures válidos",
      "endpoint fora do contrato",
      "persona desconhecida",
      "expect inválido",
    ],
  );
  assert.match(prompts[0]!, /order_id/);
});

test("suggestFlows: valida schema, atores, contrato e safety; marca needs-review", async () => {
  const step = (id: string, actor: string, method: string, path: string, body?: unknown) => ({
    id,
    label: id,
    actor,
    request: { method, path, ...(body ? { body } : {}) },
    extract: id === "create" ? [{ kind: "jsonPath", path: "id", as: "orderId" }] : [],
    expect: { status: id === "create" ? "2xx" : "4xx" },
  });
  const { client } = fakeClient([
    { name: "BOLA pedido", steps: [step("create", "alice", "POST", "/orders"), step("steal", "bob", "GET", "/orders/{{orderId}}")] },
    { name: "Ator fantasma", steps: [step("x", "mallory", "GET", "/orders/{{orderId}}")] },
    { name: "Fora do contrato", steps: [step("x", "alice", "DELETE", "/everything")] },
    { name: "Perigoso", steps: [step("x", "alice", "POST", "/orders", { note: "1; DROP TABLE orders" })] },
    { name: "Sem passos", steps: [] },
  ]);
  const { flows, rejected } = await suggestFlows(client as never, input);

  assert.equal(flows.length, 1);
  assert.equal(flows[0]!.name, "BOLA pedido");
  assert.match(flows[0]!.description ?? "", /needs-review/);
  assert.deepEqual(
    rejected.map((r) => r.item),
    ["Ator fantasma", "Fora do contrato", "Perigoso", "Sem passos"],
  );
});

test("suggestRelations: só recursos do grafo, origem ai, status suggested", async () => {
  const { client } = fakeClient([
    { from: "orders", to: "users", kind: "owner", via: "body.user_id", reason: "pedido pertence a usuário" },
    { from: "orders", to: "users", kind: "owner", via: "body.user_id" },
    { from: "orders", to: "ghosts", kind: "reference", via: "ghostId" },
    { from: "orders", to: "users", kind: "likes", via: "x" },
  ]);
  const { relations, rejected } = await suggestRelations(client as never, input);

  assert.equal(relations.length, 1);
  assert.equal(relations[0]!.origin, "ai");
  assert.equal(relations[0]!.status, "suggested");
  assert.deepEqual(relations[0]!.evidence, ["IA: pedido pertence a usuário"]);
  assert.deepEqual(rejected.map((r) => r.reason), ["recurso fora do grafo", "kind/via inválido"]);
});
