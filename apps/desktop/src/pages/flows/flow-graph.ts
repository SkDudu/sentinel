import type { Edge, Node } from "@xyflow/react";
import type { Flow, FlowStep } from "@sw/core";

export type FlowPhase = "setup" | "steps" | "teardown";
export type NodeRunStatus = "passed" | "failed" | "error" | "skipped";

export type StepNodeData = {
  step: FlowStep;
  phase: FlowPhase;
  status?: NodeRunStatus;
  message?: string;
  /** Método de escrita com Production Safety ligado. */
  blocked?: boolean;
};

export type StepNode = Node<StepNodeData, "step">;

export const PHASES: FlowPhase[] = ["setup", "steps", "teardown"];
const COLUMN: Record<FlowPhase, number> = { setup: 0, steps: 320, teardown: 640 };
const ROW = 130;
const BUILTIN_VARS = new Set(["runId", "prefix"]);
const TOKEN = /\{\{\s*([\w.-]+)\s*\}\}/g;

/** `{{x}}` simples (sem ponto) usados no request do passo. */
export function usedVars(step: FlowStep): string[] {
  const text = JSON.stringify(step.request);
  return [...new Set([...text.matchAll(TOKEN)].map((m) => m[1]!).filter((v) => !v.includes(".")))];
}

function extracted(step: FlowStep): string[] {
  return step.extract.map((rule) => ("as" in rule && rule.as ? rule.as : "name" in rule ? rule.name : ""));
}

function ordered(flow: Flow): Array<{ step: FlowStep; phase: FlowPhase }> {
  return PHASES.flatMap((phase) => flow[phase].map((step) => ({ step, phase })));
}

function edgeLabel(source: FlowStep, rest: FlowStep[]): string | undefined {
  const downstream = new Set(rest.flatMap(usedVars));
  const passed = extracted(source).filter((name) => downstream.has(name));
  return passed.length > 0 ? passed.map((name) => `{{${name}}}`).join(" ") : undefined;
}

/** Flow → nós em colunas por fase + arestas na ordem de execução. */
export function flowToGraph(flow: Flow): { nodes: StepNode[]; edges: Edge[] } {
  const items = ordered(flow);
  const rowInPhase: Record<FlowPhase, number> = { setup: 0, steps: 0, teardown: 0 };
  const nodes: StepNode[] = items.map(({ step, phase }) => {
    const row = rowInPhase[phase]++;
    return {
      id: step.id,
      type: "step",
      position: step.ui ?? { x: COLUMN[phase], y: row * ROW },
      data: { step, phase },
    };
  });
  const edges: Edge[] = items.slice(1).map(({ step }, index) => {
    const source = items[index]!.step;
    const label = edgeLabel(source, items.slice(index + 1).map((item) => item.step));
    return {
      id: `${source.id}->${step.id}`,
      source: source.id,
      target: step.id,
      ...(label ? { label } : {}),
    };
  });
  return { nodes, edges };
}

/**
 * Nós/arestas → Flow. Ordem = cadeias (sem ciclo, ≤1 saída/entrada) a partir
 * dos nós sem entrada, de cima para baixo; fase vem do próprio nó.
 */
export function graphToFlow(
  base: Pick<Flow, "id" | "name" | "description">,
  nodes: StepNode[],
  edges: Edge[],
): Flow {
  const next = new Map(edges.map((edge) => [edge.source, edge.target]));
  const hasIncoming = new Set(edges.map((edge) => edge.target));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const starts = nodes
    .filter((node) => !hasIncoming.has(node.id))
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);

  const order: StepNode[] = [];
  const seen = new Set<string>();
  for (const start of starts) {
    let current: StepNode | undefined = start;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      order.push(current);
      const target = next.get(current.id);
      current = target ? byId.get(target) : undefined;
    }
  }
  // Nó só alcançável por ciclo: entra no fim para não sumir.
  for (const node of nodes) if (!seen.has(node.id)) order.push(node);

  const flow: Flow = { ...base, setup: [], steps: [], teardown: [] };
  for (const node of order) {
    flow[node.data.phase].push({
      ...node.data.step,
      id: node.id,
      ui: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
    });
  }
  return flow;
}

/** Conexão válida no v1 sequencial: sem laço, ≤1 saída, ≤1 entrada, sem ciclo. */
export function canConnect(
  edges: Array<Pick<Edge, "source" | "target">>,
  connection: { source: string | null; target: string | null },
): boolean {
  const { source, target } = connection;
  if (!source || !target || source === target) return false;
  if (edges.some((edge) => edge.source === source || edge.target === target)) return false;
  const next = new Map(edges.map((edge) => [edge.source, edge.target]));
  for (let current: string | undefined = target; current; current = next.get(current)) {
    if (current === source) return false;
  }
  return true;
}

/** Passos que usam `{{var}}` que nenhum passo anterior extrai. */
export function missingVars(flow: Flow): Record<string, string[]> {
  const known = new Set(BUILTIN_VARS);
  const out: Record<string, string[]> = {};
  for (const { step } of ordered(flow)) {
    const missing = usedVars(step).filter((name) => !known.has(name));
    if (missing.length > 0) out[step.id] = missing;
    for (const name of extracted(step)) known.add(name);
  }
  return out;
}

/** Id de passo livre no fluxo ("get-orders", "get-orders-2"…). */
export function uniqueStepId(nodes: Array<{ id: string }>, wanted: string): string {
  const base = wanted.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "step";
  const taken = new Set(nodes.map((node) => node.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
