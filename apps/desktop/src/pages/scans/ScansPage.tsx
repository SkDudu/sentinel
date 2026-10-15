import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import type { Endpoint, ScanRun } from "@sw/core";
import { AuthType } from "@sw/core";
import { api, type ProjectDto, type ScanLogEvent } from "@/services/api";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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
}: {
  project: ProjectDto;
  environmentId: string;
}) {

  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [endpointsLoading, setEndpointsLoading] = useState(false);
  const [runs, setRuns] = useState<ScanRun[]>([]);
  const [bearerToken, setBearerToken] = useState("");
  const [variablesJson, setVariablesJson] = useState(
    '{\n  "userId": "1",\n  "otherUserId": "999999"\n}',
  );
  const [busy, setBusy] = useState(false);
  const [scanAbort, setScanAbort] = useState<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgress>(() =>
    createIdleScanProgress(0),
  );
  const [scanDialogOpen, setScanDialogOpen] = useState(false);

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
    return () => {
      cancelled = true;
    };
  }, [project.id, environmentId]);

  const endpointIds = useMemo(
    () => endpoints.map((item) => item.id),
    [endpoints],
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
    setScanProgress((prev) => setScanCancelling(prev));
    scanAbort.abort();
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

      <ScanRunDialog
        open={scanDialogOpen}
        onOpenChange={setScanDialogOpen}
        progress={scanProgress}
        onCancel={onCancelScan}
      />
    </div>
  );
}
