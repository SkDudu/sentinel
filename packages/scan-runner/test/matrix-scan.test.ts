import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemorySecretStore, personaSecretRef } from "@sw/auth";
import {
  AccessRuleRepository,
  createSqliteDb,
  EndpointRepository,
  EnvironmentRepository,
  FindingRepository,
  PersonaBindingRepository,
  ProjectRepository,
  TestResultRepository,
  TestRunRepository,
} from "@sw/database";
import { runProjectScan } from "../dist/index.js";

test("scan só-matriz: login por persona, BOLA e evidence redigida", async () => {
  const handle = createSqliteDb(join(mkdtempSync(join(tmpdir(), "sw-")), "t.db"));
  const db = handle.db;
  const project = await new ProjectRepository(db).create({ name: "p" });
  const env = await new EnvironmentRepository(db).create({
    projectId: project.id,
    name: "staging",
    baseUrl: "https://api.test",
  });
  const endpoints = new EndpointRepository(db);
  const [order, health] = await endpoints.replaceOpenApiEndpoints(project.id, env.id, [
    {
      id: "e-order",
      projectId: project.id,
      environmentId: env.id,
      method: "GET",
      path: "/orders/{id}",
      parameters: [{ name: "id", in: "path", required: true }],
      responses: [],
      tags: [],
      source: "openapi",
    },
    {
      id: "e-health",
      projectId: project.id,
      environmentId: env.id,
      method: "GET",
      path: "/health",
      parameters: [],
      responses: [],
      tags: [],
      source: "openapi",
    },
  ] as never);
  assert.ok(order && health);

  const bindings = new PersonaBindingRepository(db);
  const store = new MemorySecretStore();
  for (const [id, orderId] of [["alice", "ord_a"], ["bob", "ord_b"]] as const) {
    await bindings.upsert({
      environmentId: env.id,
      personaId: id,
      authType: "BEARER",
      fixtures: { orderId },
    });
    await store.set(personaSecretRef(env.id, id), `token-${id}`);
  }
  const accessRules = new AccessRuleRepository(db);
  await accessRules.replace(
    env.id,
    [{ endpointId: "e-order", personaId: "alice", expect: "own-only", pathFixtures: { id: "orderId" } }],
    await endpoints.listByEnvironment(env.id),
  );

  const seen: Array<{ url: string; auth?: string }> = [];
  const result = await runProjectScan(
    {
      projectId: project.id,
      environmentId: env.id,
      matrixOnly: true,
      personas: [
        { id: "alice", name: "Alice", fields: {}, tags: [] },
        { id: "bob", name: "Bob", fields: {}, tags: [] },
      ] as never,
      executor: {
        async execute(request) {
          seen.push({ url: request.url, auth: request.headers.Authorization });
          return { status: 200, headers: {}, body: { ok: true }, durationMs: 1 };
        },
      },
    },
    {
      projects: new ProjectRepository(db),
      environments: new EnvironmentRepository(db),
      endpoints,
      findings: new FindingRepository(db),
      runs: new TestRunRepository(db),
      testResults: new TestResultRepository(db),
      personaBindings: bindings,
      accessRules,
    },
    store,
  );

  assert.equal(result.endpointsScanned, 1, "só endpoints com regra");
  assert.deepEqual(result.run.categories, ["authorization"]);
  assert.deepEqual(
    seen.map((s) => s.url).sort(),
    ["https://api.test/orders/ord_a", "https://api.test/orders/ord_b"],
  );
  assert.ok(seen.every((s) => s.auth === "Bearer token-alice"));

  const bola = result.findings.find((f) => f.title.startsWith("BOLA"));
  assert.ok(bola, "BOLA no objeto de Bob");
  assert.equal(bola.request?.headers.Authorization, "[redacted]");
  handle.close();
});
