import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSqliteDb,
  EnvironmentRepository,
  PersonaBindingRepository,
  ProjectRepository,
} from "../dist/index.js";

test("binding: upsert, leitura e cascade ao remover ambiente", async () => {
  const handle = createSqliteDb(join(mkdtempSync(join(tmpdir(), "sw-")), "t.db"));
  const project = await new ProjectRepository(handle.db).create({ name: "p" });
  const environments = new EnvironmentRepository(handle.db);
  const env = await environments.create({
    projectId: project.id,
    name: "staging",
    baseUrl: "https://api.test",
  });
  const bindings = new PersonaBindingRepository(handle.db);

  await bindings.upsert({
    environmentId: env.id,
    personaId: "alice",
    authType: "BEARER",
    fixtures: { userId: "1" },
  });
  await bindings.upsert({
    environmentId: env.id,
    personaId: "alice",
    authType: "COOKIE",
    fixtures: { userId: "2" },
  });

  const list = await bindings.listByEnvironment(env.id);
  assert.equal(list.length, 1);
  assert.equal(list[0]?.authType, "COOKIE");
  assert.deepEqual(list[0]?.fixtures, { userId: "2" });

  await environments.delete(env.id);
  assert.equal((await bindings.listByEnvironment(env.id)).length, 0);
  handle.close();
});
