import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canConnect,
  flowToGraph,
  graphToFlow,
  missingVars,
  uniqueStepId,
} from "../src/pages/flows/flow-graph.ts";

const step = (id: string, method: string, path: string, extract: unknown[] = []) => ({
  id,
  label: id,
  actor: "alice",
  request: { method, path },
  extract,
  expect: { status: "2xx" },
});

const flow = {
  id: "f1",
  name: "BOLA",
  setup: [step("create", "POST", "/orders", [{ kind: "jsonPath", path: "id", as: "orderId" }])],
  steps: [step("steal", "GET", "/orders/{{orderId}}")],
  teardown: [step("cleanup", "DELETE", "/orders/{{orderId}}")],
} as never;

test("flow → grafo → flow preserva ordem, fases e posição", () => {
  const { nodes, edges } = flowToGraph(flow);
  assert.deepEqual(edges.map((e) => `${e.source}->${e.target}`), ["create->steal", "steal->cleanup"]);
  assert.equal(edges[0]!.label, "{{orderId}}");
  assert.deepEqual(nodes.map((n) => n.position.x), [0, 320, 640]);

  const back = graphToFlow({ id: "f1", name: "BOLA" }, nodes, edges);
  assert.deepEqual(back.setup.map((s) => s.id), ["create"]);
  assert.deepEqual(back.steps.map((s) => s.id), ["steal"]);
  assert.deepEqual(back.teardown.map((s) => s.id), ["cleanup"]);
  assert.deepEqual(back.steps[0]!.ui, { x: 320, y: 0 });
});

test("ordem segue as arestas, não a posição dos nós", () => {
  const { nodes } = flowToGraph({
    ...(flow as object),
    setup: [],
    teardown: [],
    steps: [step("a", "GET", "/a"), step("b", "GET", "/b"), step("c", "GET", "/c")],
  } as never);
  const back = graphToFlow({ id: "f", name: "x" }, nodes, [
    { id: "1", source: "c", target: "a" },
    { id: "2", source: "a", target: "b" },
  ]);
  assert.deepEqual(back.steps.map((s) => s.id), ["c", "a", "b"]);
});

test("conexão: rejeita ciclo, segunda saída e segunda entrada", () => {
  const edges = [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
  ];
  assert.equal(canConnect(edges, { source: "c", target: "a" }), false, "ciclo");
  assert.equal(canConnect(edges, { source: "a", target: "d" }), false, "a já tem saída");
  assert.equal(canConnect(edges, { source: "d", target: "b" }), false, "b já tem entrada");
  assert.equal(canConnect(edges, { source: "c", target: "d" }), true);
});

test("avisa variável que nenhum passo anterior extrai", () => {
  const bad = { ...(flow as object), setup: [] } as never;
  assert.deepEqual(missingVars(bad), { steal: ["orderId"], cleanup: ["orderId"] });
  assert.deepEqual(missingVars(flow), {});
  assert.equal(uniqueStepId([{ id: "get-orders" }], "GET /orders"), "get-orders-2");
});
