import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import type { Endpoint, ScanRun, TestCase, TestPersona } from "@sw/core";
import { AuthType } from "@sw/core";
import { api, type ProjectDto, type ScanLogEvent } from "@/services/api";
import { LiveBadge } from "@/components/dashboardblocks/realtime";
import { Button } from "@/components/ui/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { AiLabPanel } from "./AiLabPanel";
import { ScanRunDialog } from "./ScanRunDialog";
import { ScanRunPanel, type ScanScopePayload } from "./ScanRunPanel";
import {
  beginScanProgress,
  createIdleScanProgress,
  finishScanProgress,
  reduceScanProgress,
  setScanCancelling,
  type ScanProgress,
} from "./scan-progress";

export function ScanWorkspace({
  project,
  environmentId,
  view,
}: {
  project: ProjectDto;
  environmentId: string;
  view: "scan" | "lab";
}) {

  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [endpointsLoading, setEndpointsLoading] = useState(false);
  const [runs, setRuns] = useState<ScanRun[]>([]);
  const [bearerToken, setBearerToken] = useState("");
  const [variablesJson, setVariablesJson] = useState(
    '{\n  "userId": "1",\n  "otherUserId": "999999"\n}',
  );
  const [busy, setBusy] = useState(false);
  const [scanPhase, setScanPhase] = useState<
    "idle" | "running" | "cancelling"
  >("idle");
  const [scanAbort, setScanAbort] = useState<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgress>(() =>
    createIdleScanProgress(0),
  );
  const [scanDialogOpen, setScanDialogOpen] = useState(false);

  const [aiCases, setAiCases] = useState<TestCase[]>([]);
  const [rejectedAi, setRejectedAi] = useState<
    Array<{ id: string; name: string; reason: string }>
  >([]);
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [genMode, setGenMode] = useState<string | null>(null);
  const [personas, setPersonas] = useState<TestPersona[]>([]);
  const [personaName, setPersonaName] = useState("");
  const [personaFieldsJson, setPersonaFieldsJson] = useState(
    '{\n  "email": "edge@example.com",\n  "role": "user"\n}',
  );
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);

  useEffect(() => {
    if (!environmentId) {
      setEndpoints([]);
      setEndpointsLoading(false);
      setScanProgress((prev) =>
        prev.outcome === "idle" ? createIdleScanProgress(0) : prev,
      );
      return;
    }
    let cancelled = false;
    setEndpointsLoading(true);
    void api
      .listEnvironmentEndpoints(environmentId)
      .then((items) => {
        if (cancelled) return;
        setEndpoints(items);
        setScanProgress((prev) =>
          prev.outcome === "idle"
            ? createIdleScanProgress(
                items.length,
                items.map((item) => ({
                  method: item.method,
                  path: item.path,
                })),
              )
            : prev,
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setEndpoints([]);
        setError(err instanceof Error ? err.message : "Falha ao carregar endpoints");
      })
      .finally(() => {
        if (!cancelled) setEndpointsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [environmentId]);

  useEffect(() => {
    let cancelled = false;
    void api
      .listRuns(project.id)
      .then((items) => {
        if (!cancelled) setRuns(items);
      })
      .catch(() => {
        if (!cancelled) setRuns([]);
      });
    void api.listPersonas(project.id).then(setPersonas);
    void api
      .getAiCases(project.id)
      .then((stored) => {
        if (cancelled) return;
        setAiCases(stored.cases);
        const next: Record<string, boolean> = {};
        for (const c of stored.cases) {
          next[c.id] = stored.approvedIds.includes(c.id);
        }
        setApproved(next);
        setRejectedAi(stored.rejected ?? []);
        setGenMode(stored.genMode ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setAiCases([]);
        setApproved({});
        setRejectedAi([]);
        setGenMode(null);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  // Recarrega histórico ao mudar projeto, ambiente ou aba Scan/Lab.
  useEffect(() => {
    let cancelled = false;
    void api
      .listRuns(project.id)
      .then((items) => {
        if (!cancelled) setRuns(items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [project.id, environmentId, view]);

  const endpointIds = useMemo(
    () => endpoints.map((item) => item.id),
    [endpoints],
  );

  const approvedCases = useMemo(
    () => aiCases.filter((c) => approved[c.id]),
    [aiCases, approved],
  );

  const environment = project?.environments.find((env) => env.id === environmentId);

  function parseVariables() {
    const raw = JSON.parse(variablesJson) as Record<string, unknown>;
    return Object.entries(raw).map(([key, value]) => ({
      key,
      value: typeof value === "string" ? value : JSON.stringify(value),
      source: "manual" as const,
    }));
  }

  async function persistAiCases(
    cases: TestCase[],
    approvedMap: Record<string, boolean>,
    extras?: {
      genMode?: string | null;
      rejected?: Array<{ id: string; name: string; reason: string }>;
    },
  ) {
    if (!project) return;
    await api.saveAiCases(project.id, {
      cases,
      approvedIds: Object.entries(approvedMap)
        .filter(([, v]) => v)
        .map(([id]) => id),
      genMode: extras?.genMode ?? genMode,
      rejected: extras?.rejected ?? rejectedAi,
    });
  }

  function onScanEvent(event: ScanLogEvent) {
    if (event.type === "start") {
      if (event.runId) {
        const runId = event.runId;
        setRuns((prev) => {
          if (prev.some((run) => run.id === runId)) return prev;
          return [
            {
              id: runId,
              projectId: project.id,
              environmentId,
              status: "RUNNING",
              startedAt: new Date().toISOString(),
              totalCases: 0,
              completedCases: 0,
              findingsCount: 0,
            },
            ...prev,
          ];
        });
      }
      void api.listRuns(project.id).then(setRuns).catch(() => undefined);
    }
    setScanProgress((prev) => reduceScanProgress(prev, event));
  }

  async function runScanJob(
    input: Parameters<typeof api.runScan>[0],
    successLabel: (result: Awaited<ReturnType<typeof api.runScan>>) => string,
  ) {
    if (!project) return;
    const abort = new AbortController();
    setScanAbort(abort);
    setBusy(true);
    setScanPhase("running");
    setError(null);
    const targetIds = new Set(input.endpointIds ?? endpointIds);
    const seeds = endpoints
      .filter((item) => targetIds.has(item.id))
      .map((item) => ({ method: item.method, path: item.path }));
    setScanProgress(
      beginScanProgress(
        seeds.length || targetIds.size,
        Boolean(environment?.productionSafetyMode),
        seeds,
      ),
    );
    setScanDialogOpen(true);
    try {
      const result = await api.runScan(input, {
        signal: abort.signal,
        onEvent: onScanEvent,
      });
      const summary =
        result.cancelled || result.run.status === "CANCELLED"
          ? `Scan cancelado: ${result.run.completedCases}/${result.totalCases} casos, ${result.findings.length} findings.`
          : successLabel(result);
      setScanProgress((prev) =>
        finishScanProgress(
          prev,
          result.cancelled || result.run.status === "CANCELLED"
            ? "cancelled"
            : "done",
          summary,
        ),
      );
      setRuns(await api.listRuns(project.id));
    } catch (err) {
      if (abort.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
        const summary = "Scan cancelado pelo usuário.";
        setScanProgress((prev) =>
          finishScanProgress(prev, "cancelled", summary),
        );
        setRuns(await api.listRuns(project.id));
      } else {
        const summary = err instanceof Error ? err.message : "Scan falhou";
        setError(summary);
        setScanProgress((prev) =>
          finishScanProgress(prev, "failed", summary),
        );
        setRuns(await api.listRuns(project.id));
      }
    } finally {
      setBusy(false);
      setScanPhase("idle");
      setScanAbort(null);
    }
  }

  async function onRun(scope: ScanScopePayload) {
    if (!project || !environmentId) return;
    let variables;
    try {
      variables = parseVariables();
    } catch {
      setError("Variáveis do scan não são JSON válido.");
      return;
    }
    await runScanJob(
      {
        projectId: project.id,
        environmentId,
        endpointIds: scope.endpointIds,
        categories: scope.categories,
        matrix: scope.matrix,
        matrixOnly: scope.matrixOnly,
        bearerToken:
          environment?.authType === AuthType.BASIC
            ? undefined
            : bearerToken || undefined,
        variables,
      },
      (result) =>
        `Scan concluído: ${result.endpointsScanned} endpoints, ${result.totalCases} casos, ${result.findings.length} findings.`,
    );
  }

  function onCancelScan() {
    if (!scanAbort) return;
    setScanPhase("cancelling");
    setScanProgress((prev) => setScanCancelling(prev));
    scanAbort.abort();
  }

  async function onGenerateAi() {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.generateAiCases({
        projectId: project.id,
        endpointIds,
        allowPersonaSeed: true,
      });
      const next: Record<string, boolean> = {};
      for (const c of result.cases) next[c.id] = false;
      setAiCases(result.cases);
      setRejectedAi(result.rejected);
      setGenMode(result.mode);
      setApproved(next);
      await persistAiCases(result.cases, next, {
        genMode: result.mode,
        rejected: result.rejected,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Geração AI falhou");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleApproved(caseId: string) {
    const next = { ...approved, [caseId]: !approved[caseId] };
    setApproved(next);
    try {
      await persistAiCases(aiCases, next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao persistir aprovação",
      );
    }
  }

  async function onClearAiCases() {
    if (!project) return;
    if (
      !window.confirm(
        "Limpar casos AI salvos deste projeto? Aprovações também serão apagadas.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.clearAiCases(project.id);
      setAiCases([]);
      setApproved({});
      setRejectedAi([]);
      setGenMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao limpar casos");
    } finally {
      setBusy(false);
    }
  }

  async function onRunApprovedAi() {
    if (!project || !environmentId || approvedCases.length === 0) return;
    let variables;
    try {
      variables = parseVariables();
    } catch {
      setError("Variáveis do scan não são JSON válido.");
      return;
    }
    const stamped = approvedCases.map((c) => ({
      ...c,
      tags: [...c.tags.filter((t) => t !== "needs-review"), "approved"],
    }));
    const stampedIds = new Set(stamped.map((c) => c.id));
    const nextCases = aiCases.map((c) =>
      stampedIds.has(c.id)
        ? (stamped.find((s) => s.id === c.id) ?? c)
        : c,
    );
    setAiCases(nextCases);
    try {
      await persistAiCases(nextCases, approved);
    } catch {
      // scan ainda pode rodar; persistência best-effort
    }
    await runScanJob(
      {
        projectId: project.id,
        environmentId,
        endpointIds,
        bearerToken:
          environment?.authType === AuthType.BASIC
            ? undefined
            : bearerToken || undefined,
        approvedAiCases: stamped,
        aiOnly: true,
        variables,
      },
      (result) =>
        `AI Lab: ${result.totalCases} casos aprovados, ${result.findings.length} findings.`,
    );
  }

  async function onSavePersona() {
    if (!project || !personaName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const fields = JSON.parse(personaFieldsJson) as Record<string, unknown>;
      if (editingPersonaId) {
        const existing = personas.find((p) => p.id === editingPersonaId);
        await api.updatePersona(project.id, editingPersonaId, {
          name: personaName.trim(),
          fields,
          tags: existing?.tags ?? ["custom"],
          description: existing?.description,
        });
      } else {
        await api.upsertPersona(project.id, {
          name: personaName.trim(),
          fields,
          tags: ["custom"],
        });
      }
      setPersonas(await api.listPersonas(project.id));
      setPersonaName("");
      setPersonaFieldsJson(
        '{\n  "email": "edge@example.com",\n  "role": "user"\n}',
      );
      setEditingPersonaId(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao salvar persona",
      );
    } finally {
      setBusy(false);
    }
  }

  function onEditPersona(persona: TestPersona) {
    setEditingPersonaId(persona.id);
    setPersonaName(persona.name);
    setPersonaFieldsJson(JSON.stringify(persona.fields, null, 2));
  }

  async function onDeletePersona(id: string) {
    if (!project) return;
    setBusy(true);
    try {
      await api.deletePersona(project.id, id);
      setPersonas(await api.listPersonas(project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao apagar persona");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Algo deu errado</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {view === "lab" && scanPhase !== "idle" ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2">
            <LiveBadge
              label={
                scanPhase === "cancelling" ? "Cancelando" : "Scan ao vivo"
              }
              paused={scanPhase === "cancelling"}
            />
            <span className="text-muted-foreground">
              {scanProgress.liveLabel ?? "Executando casos aprovados…"}
            </span>
          </span>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setScanDialogOpen(true)}
            >
              Ver progresso
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={scanPhase === "cancelling"}
              onClick={onCancelScan}
            >
              {scanPhase === "cancelling" ? "Cancelando…" : "Cancelar"}
            </Button>
          </div>
        </div>
      ) : null}
      {view === "scan" ? (
        <ScanRunPanel
          environment={environment}
          environmentId={environmentId}
          endpoints={endpoints}
          busy={busy || endpointsLoading}
          progress={scanProgress}
          runs={runs}
          dialogOpen={scanDialogOpen}
          onDialogOpenChange={setScanDialogOpen}
          onRun={(scope) => void onRun(scope)}
          onCancel={onCancelScan}
        />
      ) : (
        <AiLabPanel
          environment={environment}
          selectedCount={endpointIds.length}
          busy={busy || endpointsLoading}
          scanPhase={scanPhase}
          cases={aiCases}
          approved={approved}
          approvedCount={approvedCases.length}
          rejected={rejectedAi}
          genMode={genMode}
          personas={personas}
          personaName={personaName}
          personaFieldsJson={personaFieldsJson}
          editingPersonaId={editingPersonaId}
          onGenerate={() => void onGenerateAi()}
          onClear={() => void onClearAiCases()}
          onRunApproved={() => void onRunApprovedAi()}
          onToggleApproved={(id) => void onToggleApproved(id)}
          onPersonaName={setPersonaName}
          onPersonaFields={setPersonaFieldsJson}
          onSavePersona={() => void onSavePersona()}
          onEditPersona={onEditPersona}
          onCancelEdit={() => {
            setEditingPersonaId(null);
            setPersonaName("");
            setPersonaFieldsJson(
              '{\n  "email": "edge@example.com",\n  "role": "user"\n}',
            );
          }}
          onDeletePersona={(id) => void onDeletePersona(id)}
        />
      )}

      <ScanRunDialog
        open={scanDialogOpen}
        onOpenChange={setScanDialogOpen}
        progress={scanProgress}
        onCancel={onCancelScan}
      />
    </div>
  );
}
