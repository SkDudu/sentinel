import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSqliteDb,
  EnvironmentRepository,
  FindingRepository,
  ProjectRepository,
  TestRunRepository,
} from "../dist/index.js";

test("remover ambiente com scans: apaga runs e findings do ambiente", async () => {
  const handle = createSqliteDb(join(mkdtempSync(join(tmpdir(), "sw-")), "t.db"));
  const project = await new ProjectRepository(handle.db).create({ name: "p" });
  const environments = new EnvironmentRepository(handle.db);
  const env = await environments.create({
    projectId: project.id,
    name: "dev",
    baseUrl: "http://localhost",
  });
  const runs = new TestRunRepository(handle.db);
  const run = await runs.create({ projectId: project.id, environmentId: env.id });
  const findings = new FindingRepository(handle.db);
  await findings.createMany(
    [
      {
        id: "f1",
        projectId: project.id,
        testId: "t",
        title: "x",
        severity: "LOW",
        confidence: 50,
        status: "OPEN",
        evidence: "e",
        recommendation: "",
        createdAt: new Date().toISOString(),
      } as never,
    ],
    run.id,
  );

  assert.equal(await environments.delete(env.id), true);
  assert.equal(await runs.getById(run.id), null);
  assert.deepEqual(await findings.listByProject(project.id), []);
  handle.close();
});
