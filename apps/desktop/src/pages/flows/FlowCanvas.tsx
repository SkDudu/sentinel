import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ANONYMOUS_PERSONA,
  sampleRequestBody,
  type Endpoint,
  type Flow,
  type FlowStep,
  type Resource,
} from "@sw/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { toast } from "@/components/ui/toast";
import {
  canConnect,
  flowToGraph,
  graphToFlow,
  missingVars,
  PHASES,
  uniqueStepId,
  type FlowPhase,
  type NodeRunStatus,
  type StepNode,
} from "./flow-graph";
import { StepPanel } from "./StepPanel";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
const ACTOR_COLORS = [
  "border-l-sky-500",
  "border-l-violet-500",
  "border-l-amber-500",
  "border-l-emerald-500",
  "border-l-rose-500",
];
const STATUS_RING: Record<NodeRunStatus, string> = {
  passed: "ring-2 ring-emerald-500",
  failed: "ring-2 ring-destructive",
  error: "ring-2 ring-amber-500",
  skipped: "opacity-60",
};

export type ActorOption = { id: string; name: string };

function actorColor(actors: ActorOption[], id: string): string {
  if (id === ANONYMOUS_PERSONA) return "border-l-muted-foreground";
  const index = actors.findIndex((actor) => actor.id === id);
  return ACTOR_COLORS[(index < 0 ? 0 : index) % ACTOR_COLORS.length]!;
}

type ViewData = StepNode["data"] & {
  actorName: string;
  color: string;
  warnings?: string[];
};

function StepNodeView({ data, selected }: NodeProps<StepNode>) {
  const view = data as ViewData;
  return (
    <div
      className={cn(
        "w-60 rounded-md border border-l-4 bg-card px-3 py-2 text-xs shadow-sm",
        view.color,
        selected && "border-ring",
        view.status && STATUS_RING[view.status],
      )}
    >
      <Handle type="target" position={Position.Top} />
      <div className="mb-1 flex items-center gap-1.5">
        <Badge variant="outline" className="px-1 text-[10px]">
          {view.phase}
        </Badge>
        <span className="font-mono font-semibold">{view.step.request.method}</span>
        {view.blocked ? (
          <Badge variant="destructive" className="px-1 text-[10px]">
            Safety
          </Badge>
        ) : null}
        {view.status ? (
          <span className="ml-auto text-[10px] text-muted-foreground">{view.status}</span>
        ) : null}
      </div>
      <p className="truncate font-medium">{view.step.label}</p>
      <p className="truncate font-mono text-[10px] text-muted-foreground">{view.step.request.path}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {view.actorName} · espera {Array.isArray(view.step.expect.status) ? view.step.expect.status.join("|") : view.step.expect.status}
      </p>
      {view.warnings?.length ? (
        <p className="mt-1 text-[10px] text-amber-500">sem origem: {view.warnings.map((v) => `{{${v}}}`).join(" ")}</p>
      ) : null}
      {view.message && view.status !== "passed" ? (
        <p className="mt-1 line-clamp-2 text-[10px] text-destructive">{view.message}</p>
      ) : null}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes: NodeTypes = { step: StepNodeView };

function camel(value: string): string {
  return value.replace(/[-_\s]+(\w)/g, (_, c: string) => c.toUpperCase()).replace(/s$/, "");
}

function templated(path: string): string {
  return path.replace(/\{(\w+)\}/g, "{{fixtures.$1}}");
}

function shape(path: string): string {
  return path.replace(/\{\{[^}]*\}\}|\{[^}]*\}/g, "{}");
}

export function FlowCanvas({
  flow,
  onChange,
  endpoints,
  resources,
  actors,
  runState,
  safety,
}: {
  flow: Flow;
  onChange: (flow: Flow) => void;
  endpoints: Endpoint[];
  resources: Resource[];
  actors: ActorOption[];
  runState: Record<string, { status: NodeRunStatus; message?: string }>;
  safety: boolean;
}) {
  const initial = useMemo(() => flowToGraph(flow), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [nodes, setNodes, onNodesChange] = useNodesState<StepNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [bodySyncKey, setBodySyncKey] = useState(0);
  const [generatingBody, setGeneratingBody] = useState(false);

  const base = useMemo(
    () => ({ id: flow.id, name: flow.name, description: flow.description }),
    [flow.id, flow.name, flow.description],
  );
  const current = useMemo(() => graphToFlow(base, nodes, edges), [base, nodes, edges]);

  const lastEmitted = useRef<string | null>(null);
  useEffect(() => {
    const serialized = JSON.stringify(current);
    if (lastEmitted.current === null) {
      lastEmitted.current = serialized;
      return;
    }
    if (serialized === lastEmitted.current) return;
    lastEmitted.current = serialized;
    onChange(current);
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps

  const warnings = useMemo(() => missingVars(current), [current]);
  const labels = useMemo(
    () => new Map(flowToGraph(current).edges.map((edge) => [edge.id, edge.label])),
    [current],
  );

  const viewNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          actorName:
            node.data.step.actor === ANONYMOUS_PERSONA
              ? "anônimo"
              : (actors.find((a) => a.id === node.data.step.actor)?.name ?? node.data.step.actor),
          color: actorColor(actors, node.data.step.actor),
          warnings: warnings[node.id],
          blocked: safety && !SAFE.has(node.data.step.request.method),
          status: runState[node.id]?.status,
          message: runState[node.id]?.message,
        },
      })),
    [nodes, actors, warnings, safety, runState],
  );
  const viewEdges = useMemo(
    () => edges.map((edge) => ({ ...edge, label: labels.get(edge.id) ?? edge.label })),
    [edges, labels],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!canConnect(edges, connection)) return;
      setEdges((prev) =>
        addEdge({ ...connection, id: `${connection.source}->${connection.target}` }, prev),
      );
    },
    [edges, setEdges],
  );

  /** Novo nó no fim da cadeia, ligado ao último passo sem saída. */
  const appendStep = useCallback(
    (step: Omit<FlowStep, "id">, phase: FlowPhase, after?: string) => {
      const id = uniqueStepId(nodes, step.label);
      const anchor =
        (after && nodes.find((n) => n.id === after)) ??
        [...nodes].reverse().find((n) => !edges.some((e) => e.source === n.id));
      const position = anchor
        ? { x: anchor.position.x, y: anchor.position.y + 130 }
        : { x: 320, y: 0 };
      setNodes((prev) => [...prev, { id, type: "step", position, data: { step: { ...step, id }, phase } }]);
      if (anchor && canConnect(edges, { source: anchor.id, target: id })) {
        setEdges((prev) => [...prev, { id: `${anchor.id}->${id}`, source: anchor.id, target: id }]);
      }
      setSelectedId(id);
    },
    [nodes, edges, setNodes, setEdges],
  );

  function addEndpoint(endpoint: Endpoint) {
    const body = SAFE.has(endpoint.method) ? undefined : sampleRequestBody(endpoint.requestBodySchema);
    appendStep(
      {
        label: `${endpoint.method} ${endpoint.path}`,
        actor: actors[0]?.id ?? ANONYMOUS_PERSONA,
        request: { method: endpoint.method, path: templated(endpoint.path), ...(body ? { body } : {}) },
        extract: [],
        expect: { status: "2xx" },
      },
      "steps",
    );
  }

  const selected = nodes.find((node) => node.id === selectedId) ?? null;

  /** Após o create de um recurso, sugere o read ligando id → {{<recurso>Id}}. */
  const suggestion = useMemo(() => {
    if (!selected) return null;
    const { method, path } = selected.data.step.request;
    const byId = new Map(endpoints.map((e) => [e.id, e]));
    for (const resource of resources) {
      const create = byId.get(resource.operations.create ?? "");
      const read = byId.get(resource.operations.read ?? "");
      if (!create || !read || create.method !== method || shape(create.path) !== shape(path)) continue;
      const idVar = `${camel(resource.name)}Id`;
      return { resource, read, idVar };
    }
    return null;
  }, [selected, endpoints, resources]);

  const bodyHint = useMemo(() => {
    if (!selected || SAFE.has(selected.data.step.request.method)) return null;
    const { method, path } = selected.data.step.request;
    const endpoint = endpoints.find((e) => e.method === method && shape(e.path) === shape(path));
    if (!endpoint) return null;
    return sampleRequestBody(endpoint.requestBodySchema)
      ? null
      : "OpenAPI não descreve o body deste endpoint — preencha à mão.";
  }, [selected, endpoints]);

  function applySuggestion() {
    if (!selected || !suggestion) return;
    const { read, idVar, resource } = suggestion;
    const hasExtract = selected.data.step.extract.some((rule) => "as" in rule && rule.as === idVar);
    if (!hasExtract) {
      updateStep(selected.id, {
        ...selected.data.step,
        extract: [...selected.data.step.extract, { kind: "jsonPath", path: "id", as: idVar }],
      });
    }
    appendStep(
      {
        label: `Ler ${resource.name}`,
        actor: selected.data.step.actor,
        request: {
          method: read.method,
          path: read.path.replace(/\{(\w+)\}/g, (_, name: string) =>
            name === resource.idParam ? `{{${idVar}}}` : `{{fixtures.${name}}}`,
          ),
        },
        extract: [],
        expect: { status: "2xx" },
      },
      selected.data.phase,
      selected.id,
    );
  }

  async function generateBody() {
    if (!selected) return;
    const { method, path } = selected.data.step.request;
    const endpoint = endpoints.find((e) => e.method === method && shape(e.path) === shape(path));
    setGeneratingBody(true);
    try {
      const { body } = await api.generateStepBody({
        method,
        path,
        summary: endpoint?.summary,
        requestBodySchema: endpoint?.requestBodySchema,
      });
      updateStep(selected.id, {
        ...selected.data.step,
        request: { ...selected.data.step.request, body },
      });
      setBodySyncKey((n) => n + 1);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "";
      const technical = !raw || /not found/i.test(raw) || /\/api\//.test(raw);
      toast.add({
        title: "Não deu para gerar o body",
        description: technical
          ? "Tente de novo. Se continuar, reinicie o Sentinel."
          : raw,
        type: "error",
      });
    } finally {
      setGeneratingBody(false);
    }
  }

  function updateStep(id: string, step: FlowStep, phase?: FlowPhase) {
    setNodes((prev) =>
      prev.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, step, phase: phase ?? node.data.phase } }
          : node,
      ),
    );
  }

  function removeStep(id: string) {
    setNodes((prev) => prev.filter((node) => node.id !== id));
    setEdges((prev) => prev.filter((edge) => edge.source !== id && edge.target !== id));
    setSelectedId(null);
  }

  function relayout() {
    const rows: Record<FlowPhase, number> = { setup: 0, steps: 0, teardown: 0 };
    const order = PHASES.flatMap((phase) => current[phase].map((step) => ({ id: step.id, phase })));
    const column: Record<FlowPhase, number> = { setup: 0, steps: 320, teardown: 640 };
    const positions = new Map(
      order.map(({ id, phase }) => [id, { x: column[phase], y: rows[phase]++ * 130 }]),
    );
    setNodes((prev) => prev.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position })));
  }

  const q = query.trim().toLowerCase();
  const palette = endpoints
    .filter(
      (e) =>
        !q ||
        e.path.toLowerCase().includes(q) ||
        e.method.toLowerCase() === q ||
        e.tags.some((tag) => tag.toLowerCase().includes(q)),
    )
    .slice(0, 60);

  return (
    <div className="grid h-[38rem] grid-cols-[15rem_minmax(0,1fr)_18rem] overflow-hidden rounded-lg border">
      <div className="flex min-h-0 flex-col border-r">
        <div className="space-y-2 border-b p-2">
          <Input
            value={query}
            placeholder="Buscar endpoint…"
            onChange={(event) => setQuery(event.target.value)}
            className="h-8"
          />
          <p className="text-[11px] text-muted-foreground">
            Clique para adicionar ao fim do fluxo. {endpoints.length > palette.length ? `${palette.length} de ${endpoints.length}.` : ""}
          </p>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <ul className="p-1">
            {palette.map((endpoint) => (
              <li key={endpoint.id}>
                <button
                  type="button"
                  onClick={() => addEndpoint(endpoint)}
                  className="w-full truncate rounded px-2 py-1 text-left font-mono text-[11px] hover:bg-muted"
                  title={endpoint.summary ?? endpoint.path}
                >
                  <span className="mr-1.5 font-semibold">{endpoint.method}</span>
                  {endpoint.path}
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </div>

      <div className="relative min-h-0">
        <ReactFlow
          nodes={viewNodes}
          edges={viewEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={(connection) => canConnect(edges, connection)}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId(null)}
          colorMode="dark"
          fitView
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
        <div className="absolute top-2 right-2 flex gap-1">
          <Button type="button" size="xs" variant="outline" onClick={relayout}>
            Organizar
          </Button>
        </div>
      </div>

      <div className="min-h-0 border-l">
        {selected ? (
          <StepPanel
            key={selected.id}
            step={selected.data.step}
            phase={selected.data.phase}
            actors={actors}
            suggestion={
              suggestion
                ? `Ler ${suggestion.resource.name} criado (${suggestion.read.method} ${suggestion.read.path})`
                : null
            }
            onSuggest={applySuggestion}
            bodyHint={bodyHint}
            bodySyncKey={bodySyncKey}
            generatingBody={generatingBody}
            onGenerateBody={() => void generateBody()}
            onChange={(step, phase) => updateStep(selected.id, step, phase)}
            onRemove={() => removeStep(selected.id)}
          />
        ) : (
          <p className="p-3 text-xs text-muted-foreground">
            Selecione um passo para editar ator, request, extract e expectativa.
            Ligue passos arrastando da base de um nó ao topo de outro: um
            caminho, sem ciclo.
          </p>
        )}
      </div>
    </div>
  );
}
