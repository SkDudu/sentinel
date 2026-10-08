import { test } from "node:test";
import assert from "node:assert/strict";
import { inferRelations, suggestAccessFromGraph } from "../dist/index.js";

const endpoint = (id: string, method: string, path: string) => ({
  id,
  projectId: "p",
  method,
  path,
  parameters: [],
  responses: [],
  tags: [],
});

test("grafo → matriz: anônimo deny, admin allow, own-only por fixture", () => {
  const endpoints = [
    endpoint("list", "GET", "/company-units"),
    endpoint("read", "GET", "/company-units/{company_unit}"),
    endpoint("nested", "GET", "/company-units/{company_unit}/orders/{order}"),
    endpoint("login", "POST", "/login"),
  ] as never[];
  const { resources } = inferRelations(endpoints);

  const rules = suggestAccessFromGraph({
    endpoints,
    resources,
    personas: [
      { id: "alice", role: "user", fixtureKeys: ["company_unit", "order_id"] },
      { id: "root", role: "Admin", fixtureKeys: [] },
      { id: "bob", fixtureKeys: [] },
    ],
  });
  const at = (endpointId: string, personaId: string) =>
    rules.find((r) => r.endpointId === endpointId && r.personaId === personaId);

  assert.equal(at("login", "anonymous"), undefined, "fora de recurso não entra");
  assert.equal(at("list", "anonymous")?.expect, "deny");
  assert.equal(at("list", "root")?.expect, "allow");
  assert.equal(at("list", "alice"), undefined, "coleção sem param fica para revisão");
  assert.deepEqual(at("nested", "alice")?.pathFixtures, {
    company_unit: "company_unit",
    order: "order_id",
  });
  assert.equal(at("read", "bob"), undefined);
});
