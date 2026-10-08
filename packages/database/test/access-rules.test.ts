import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AccessRuleRepository,
  createSqliteDb,
  EnvironmentRepository,
  ProjectRepository,
} from "../dist/index.js";

const endpoint = (id: string, method: string, path: string) => ({
  id,
  projectId: "p",
  method,
  path,
  parameters: [],
  responses: [],
  tags: [],
});

test("access rules: replace e remap por method + path no reimport", async () => {
  const handle = createSqliteDb(join(mkdtempSync(join(tmpdir(), "sw-")), "t.db"));
  const project = await new ProjectRepository(handle.db).create({ name: "p" });
  const env = await new EnvironmentRepository(handle.db).create({
    projectId: project.id,
    name: "staging",
    baseUrl: "https://api.test",
  });
  const rules = new AccessRuleRepository(handle.db);

  const saved = await rules.replace(
    env.id,
    [
      { endpointId: "e1", personaId: "alice", expect: "own-only", pathFixtures: { id: "orderId" } },
      { endpointId: "e2", personaId: "anonymous", expect: "deny" },
      { endpointId: "fora", personaId: "alice", expect: "allow" },
    ],
    [endpoint("e1", "GET", "/orders/{id}"), endpoint("e2", "DELETE", "/orders/{id}")] as never,
  );
  assert.equal(saved.length, 2);

  const dropped = await rules.remap(env.id, [endpoint("n1", "GET", "/orders/{id}")] as never);
  assert.equal(dropped, 1);
  assert.deepEqual(await rules.listByEnvironment(env.id), [
    { endpointId: "n1", personaId: "alice", expect: "own-only", pathFixtures: { id: "orderId" } },
  ]);
  handle.close();
});
