import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertCircle, Workflow } from "lucide-react";
import { FlowSchema, type Flow } from "@sw/core";
import { api, type FlowRunResultDto, type FlowStepStatus } from "@/services/api";
import { useProjectStore } from "@/stores/project";
import { BackLink } from "@/components/dashboardblocks/page-header";
import { PageEmptyState } from "@/components/layout/page-empty-state";
import { PageShell } from "@/components/layout/page-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { EnvironmentSelect } from "./EnvironmentSelect";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

const STATUS_VARIANT: Record<FlowStepStatus, "secondary" | "destructive" | "outline"> = {
  passed: "secondary",
  failed: "destructive",
  error: "destructive",
  skipped: "outline",
};

const textareaClass =
  "min-h-[28rem] w-full rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export type StepRunState = Record<string, { status: FlowStepStatus; message?: string }>;

function parseFlow(text: string, id: string): { flow?: Flow; error?: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "JSON inválido" };
  }
  const parsed = FlowSchema.safeParse({ ...(raw as object), id });
  if (parsed.success) return { flow: parsed.data };
  const issue = parsed.error.issues[0];
  return { error: issue ? `${issue.path.join(".") || "flow"}: ${issue.message}` : "Fluxo inválido" };
}

export function writeSteps(flow: Flow) {
  return [...flow.setup, ...flow.steps, ...flow.teardown].filter(
    (step) => !SAFE.has(step.request.method),
  );
}

export function FlowEditorPage() {
  const { projectId, flowId } = useParams<{ projectId: string; flowId: string }>();
  const navigate = useNavigate();
  const { projects, loadProjects, setActiveProject } = useProjectStore();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [text, setText] = useState("");
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const [stepState, setStepState] = useState<StepRunState>({});
  const [result, setResult] = useState<FlowRunResultDto | null>(null);
  const [openStep, setOpenStep] = useState<string | null>(null);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (projectId) setActiveProject(projectId);
  }, [projectId, setActiveProject]);

  const project = projects.find((item) => item.id === projectId);
  const environment = project?.environments.find((env) => env.id === environmentId);

  useEffect(() => {
    if (!environmentId && project?.environments[0]) {
      setEnvironmentId(project.environments[0].id);
    }
  }, [project, environmentId]);

  useEffect(() => {
    if (!projectId || !flowId) return;
    void api
      .getFlow(projectId, flowId)
      .then((stored) => {
        setFlow(stored.flow);
        const { id: _id, ...rest } = stored.flow;
        setText(JSON.stringify(rest, null, 2));
      })
      .catch(() => setMissing(true));
  }, [projectId, flowId]);

  const parsed = useMemo(() => (flowId ? parseFlow(text, flowId) : {}), [text, flowId]);
  const draft = parsed.flow ?? null;
  const dirty = draft !== null && flow !== null && JSON.stringify(draft) !== JSON.stringify(flow);
  const blocked = Boolean(environment?.productionSafetyMode && draft && writeSteps(draft).length > 0);

  async function onSave() {
    if (!projectId || !draft) return;
    setBusy(true);
    try {
      const saved = await api.updateFlow(projectId, draft);
      setFlow(saved.flow);
      toast.add({ title: "Fluxo salvo.", type: "success" });
    } catch (err) {
      toast.add({
        title: "Algo deu errado",
        description: err instanceof Error ? err.message : "Falha ao salvar",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onRun() {
    if (!projectId || !draft || !environmentId) return;
    setBusy(true);
    setStepState({});
    setResult(null);
    try {
      if (dirty) setFlow((await api.updateFlow(projectId, draft)).flow);
      const scan = await api.runScan(
        { projectId, environmentId, flowIds: [draft.id], flowsOnly: true },
        {
          onEvent: (event) => {
            if (event.type === "flow-step") {
              setStepState((prev) => ({
                ...prev,
                [event.stepId]: { status: event.status, message: event.message },
              }));
            }
          },
        },
      );
      const run = scan.flows?.[0] ?? null;
      setResult(run);
      toast.add({
        title: run ? `Fluxo ${run.status}` : "Fluxo executado",
        description: run?.message ?? `${scan.findings.length} findings`,
        type: run?.status === "passed" ? "success" : "error",
      });
    } catch (err) {
      toast.add({
        title: "Algo deu errado",
        description: err instanceof Error ? err.message : "Falha ao rodar",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  if (missing) {
    return (
      <PageShell title="Fluxo">
        <PageEmptyState
          icon={Workflow}
          title="Fluxo não encontrado"
          description="Ele pode ter sido removido."
          action={<Button onClick={() => void navigate(`/projects/${projectId}/flows`)}>Ver fluxos</Button>}
        />
      </PageShell>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink href={`/projects/${projectId}/flows`}>Fluxos</BackLink>
      <PageShell
        title={draft?.name ?? flow?.name ?? "Fluxo"}
        actions={
          <>
            {project ? (
              <EnvironmentSelect
                environments={project.environments}
                value={environmentId}
                onChange={setEnvironmentId}
              />
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={busy || !draft || !environmentId || blocked || draft.steps.length === 0}
              onClick={() => void onRun()}
            >
              {busy ? <Spinner data-icon="inline-start" /> : null}
              Rodar
            </Button>
            <Button type="button" disabled={busy || !dirty} onClick={() => void onSave()}>
              Salvar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {blocked ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Production Safety ligado em {environment?.name}</AlertTitle>
              <AlertDescription>
                Fluxo tem método de escrita ({draft ? writeSteps(draft).map((s) => s.label).join(", ") : ""}) e não roda neste ambiente.
              </AlertDescription>
            </Alert>
          ) : null}
          {parsed.error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Fluxo inválido</AlertTitle>
              <AlertDescription>{parsed.error}</AlertDescription>
            </Alert>
          ) : null}

          <textarea
            value={text}
            spellCheck={false}
            onChange={(event) => setText(event.target.value)}
            className={textareaClass}
          />

          {draft && (Object.keys(stepState).length > 0 || result) ? (
            <FlowRunSteps
              flow={draft}
              state={stepState}
              result={result}
              openStep={openStep}
              onToggle={(id) => setOpenStep((prev) => (prev === id ? null : id))}
            />
          ) : null}
        </div>
      </PageShell>
    </div>
  );
}

function FlowRunSteps({
  flow,
  state,
  result,
  openStep,
  onToggle,
}: {
  flow: Flow;
  state: StepRunState;
  result: FlowRunResultDto | null;
  openStep: string | null;
  onToggle: (id: string) => void;
}) {
  const steps = [
    ...flow.setup.map((s) => ({ ...s, phase: "setup" })),
    ...flow.steps.map((s) => ({ ...s, phase: "steps" })),
    ...flow.teardown.map((s) => ({ ...s, phase: "teardown" })),
  ];
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        Último run{result ? ` · ${result.status}` : "…"}
      </p>
      <ul className="space-y-1.5">
        {steps.map((step) => {
          const key = `${step.phase}:${step.id}`;
          const run = state[step.id];
          const detail = result?.steps.find((s) => s.stepId === step.id && s.phase === step.phase);
          return (
            <li key={key} className="rounded-md border px-3 py-2 text-sm">
              <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => onToggle(key)}>
                <span className="w-16 text-xs text-muted-foreground">{step.phase}</span>
                <span className="font-mono text-xs">{step.request.method}</span>
                <span className="flex-1 truncate">{step.label}</span>
                {run ? <Badge variant={STATUS_VARIANT[run.status]}>{run.status}</Badge> : null}
              </button>
              {run?.message ? <p className="mt-1 text-xs text-muted-foreground">{run.message}</p> : null}
              {openStep === key && detail ? (
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-[11px]">
                  {JSON.stringify({ request: detail.request, response: detail.response }, null, 2)}
                </pre>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
