import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MemorySecretStore,
  personaSecretRef,
  resolvePersonaAuthHeaders,
} from "../dist/index.js";

const environment = {
  id: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  name: "staging",
  baseUrl: "https://api.test",
  authType: "BEARER" as const,
  secretRef: "env:1:auth",
  headers: { "X-App": "sentinel" },
  productionSafetyMode: false,
};

test("bearer persona usa o secret da persona, não o do ambiente", async () => {
  const store = new MemorySecretStore();
  await store.set("env:1:auth", "env-token");
  await store.set(personaSecretRef(environment.id, "bob"), "bob-token");
  const headers = await resolvePersonaAuthHeaders(
    environment,
    { environmentId: environment.id, personaId: "bob", authType: "BEARER", fixtures: {} },
    store,
  );
  assert.equal(headers.Authorization, "Bearer bob-token");
  assert.equal(headers["X-App"], "sentinel");
});

test("LOGIN_RECIPE troca só os secrets do vault da persona", async () => {
  const recipe = {
    version: 1 as const,
    steps: [
      {
        label: "login",
        role: "both" as const,
        request: {
          method: "POST" as const,
          url: "/login",
          bodyType: "json" as const,
          fields: {
            email: { kind: "secret" as const, key: "username" },
            password: { kind: "secret" as const, key: "password" },
          },
          headers: {},
        },
        extract: [
          { kind: "jsonPath" as const, path: "token", as: "token", emit: "bearer" as const },
        ],
      },
    ],
  };
  const sent: unknown[] = [];
  const executor = {
    async execute(request: { body?: unknown }) {
      sent.push(JSON.parse(String(request.body)));
      return { status: 200, headers: {}, body: { token: "t-alice" }, durationMs: 1 };
    },
  };
  const store = new MemorySecretStore();
  await store.set(
    personaSecretRef(environment.id, "alice"),
    JSON.stringify({ username: "alice@x.test", password: "pw" }),
  );
  const headers = await resolvePersonaAuthHeaders(
    { ...environment, authType: "LOGIN_RECIPE", loginRecipe: recipe },
    { environmentId: environment.id, personaId: "alice", authType: "LOGIN_RECIPE", fixtures: {} },
    store,
    { executor },
  );
  assert.deepEqual(sent, [{ email: "alice@x.test", password: "pw" }]);
  assert.equal(headers.Authorization, "Bearer t-alice");
});

test("receita com login literal é recusada para persona", async () => {
  const recipe = {
    version: 1 as const,
    steps: [
      {
        label: "login",
        role: "both" as const,
        request: {
          method: "POST" as const,
          url: "/login",
          bodyType: "form" as const,
          fields: {
            email: { kind: "literal" as const, value: "admin@x.test" },
            password: { kind: "secret" as const, key: "password" },
          },
          headers: {},
        },
        extract: [],
      },
    ],
  };
  await assert.rejects(
    resolvePersonaAuthHeaders(
      { ...environment, authType: "LOGIN_RECIPE", loginRecipe: recipe },
      { environmentId: environment.id, personaId: "x", authType: "LOGIN_RECIPE", fixtures: {} },
      new MemorySecretStore(),
      { executor: { execute: async () => ({ status: 200, headers: {}, durationMs: 1 }) } },
    ),
    /literal/,
  );
});
