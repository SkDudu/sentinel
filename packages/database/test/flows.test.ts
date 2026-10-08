import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteDb, FlowRepository, ProjectRepository } from "../dist/index.js";

test("flows: salvar, atualizar e cascade ao remover projeto", async () => {
  const handle = createSqliteDb(join(mkdtempSync(join(tmpdir(), "sw-")), "t.db"));
  const projects = new ProjectRepository(handle.db);
  const project = await projects.create({ name: "p" });
  const repo = new FlowRepository(handle.db);

  const step = {
    id: "s1",
    label: "Ler",
    actor: "anonymous",
    request: { method: "GET", path: "/health" },
    expect: { status: "2xx" },
  };
  await repo.save(project.id, { id: "f1", name: "Saúde", steps: [step] } as never);
  const saved = await repo.save(project.id, { id: "f1", name: "Saúde v2", steps: [step] } as never);
  assert.equal(saved.flow.name, "Saúde v2");
  assert.deepEqual(saved.flow.teardown, []);
  assert.equal((await repo.listByProject(project.id)).length, 1);

  await projects.delete(project.id);
  assert.equal((await repo.listByProject(project.id)).length, 0);
  handle.close();
});
