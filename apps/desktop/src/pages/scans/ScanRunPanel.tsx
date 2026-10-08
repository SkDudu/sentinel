import { useEffect, useMemo, useState, type MouseEvent } from "react";
import type { Endpoint, ScanRun } from "@sw/core";
import type { EnvironmentDto } from "@/services/api";
import { LiveBadge, LiveNumber } from "@/components/dashboardblocks/realtime";
import { StatusBadge } from "@/components/dashboardblocks/status";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { ScanRunDetailDialog } from "./ScanRunDetailDialog";
import { ScanScopeDialog } from "./ScanScopeDialog";
import type { ScanProgress } from "./scan-progress";
import { scanSuitesLabel, type ScanScopePayload } from "./scan-scope";
import { cn } from "@/lib/utils";

export type { ScanScopePayload };

const RUNS_PAGE_SIZE = 25;

function pageItems(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 3) {
    return [1, 2, 3, 4, "ellipsis", total];
  }
  if (current >= total - 2) {
    return [1, "ellipsis", total - 3, total - 2, total - 1, total];
  }
  return [1, "ellipsis", current - 1, current, current + 1, "ellipsis", total];
}

function outcomeStatus(outcome: ScanProgress["outcome"]): {
  status:
    | "operational"
    | "degraded"
    | "partial"
    | "major"
    | "maintenance"
    | "unknown";
  label: string;
} {
  switch (outcome) {
    case "running":
      return { status: "degraded", label: "Em execução" };
    case "cancelling":
      return { status: "maintenance", label: "Cancelando" };
    case "done":
      return { status: "operational", label: "Concluído" };
    case "cancelled":
      return { status: "partial", label: "Cancelado" };
    case "failed":
      return { status: "major", label: "Falhou" };
    default:
      return { status: "unknown", label: "Pronto" };
  }
}

function formatRunStatus(status: ScanRun["status"]): string {
  switch (status) {
    case "COMPLETED":
      return "Concluído";
    case "FAILED":
      return "Falhou";
    case "CANCELLED":
      return "Cancelado";
    case "RUNNING":
      return "Rodando";
    default:
      return status;
  }
}

export function ScanRunPanel({
  environment,
  environmentId,
  endpoints = [],
  busy,
  progress,
  runs,
  dialogOpen,
  onDialogOpenChange,
  onRun,
  onCancel,
}: {
  environment: EnvironmentDto | undefined;
  environmentId: string;
  endpoints?: Endpoint[];
  busy: boolean;
  progress: ScanProgress;
  runs: ScanRun[];
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  onRun: (scope: ScanScopePayload) => void;
  onCancel: () => void;
}) {
  const live =
    progress.outcome === "running" || progress.outcome === "cancelling";
  const status = outcomeStatus(progress.outcome);
  const recentRuns = useMemo(
    () => runs.filter((run) => run.environmentId === environmentId),
    [runs, environmentId],
  );
  const percent = Math.round(progress.progress * 100);
  const [detailRunId, setDetailRunId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(recentRuns.length / RUNS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRuns = useMemo(() => {
    const start = (currentPage - 1) * RUNS_PAGE_SIZE;
    return recentRuns.slice(start, start + RUNS_PAGE_SIZE);
  }, [recentRuns, currentPage]);
  const pageNumbers = useMemo(
    () => pageItems(currentPage, totalPages),
    [currentPage, totalPages],
  );

  useEffect(() => {
    setPage(1);
  }, [environmentId]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const canOpenScope = Boolean(environmentId) && endpoints.length > 0;

  function openRunDetail(runId: string) {
    setDetailRunId(runId);
    setDetailOpen(true);
  }

  function handleConfirmScope(scope: ScanScopePayload) {
    setScopeOpen(false);
    onRun(scope);
  }

  function goToPage(next: number, event: MouseEvent) {
    event.preventDefault();
    if (next < 1 || next > totalPages || next === currentPage) return;
    setPage(next);
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-medium">Scan do ambiente</h2>
            <StatusBadge status={status.status} label={status.label} />
            {live ? (
              <LiveBadge
                label={
                  progress.outcome === "cancelling" ? "Cancelando" : "Ao vivo"
                }
                paused={progress.outcome === "cancelling"}
              />
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {environment ? environment.name : "Nenhum ambiente"}
            {" · "}
            <span className="font-mono text-xs">
              {endpoints.length} endpoints
            </span>
            {environment?.productionSafetyMode ? " · Safety ligado" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {live ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onDialogOpenChange(true)}
              >
                Ver progresso
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={progress.outcome === "cancelling"}
                onClick={onCancel}
              >
                {progress.outcome === "cancelling" ? "Cancelando…" : "Cancelar"}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              disabled={!canOpenScope || busy}
              onClick={() => setScopeOpen(true)}
            >
              Run scan
            </Button>
          )}
          {!live &&
          (progress.outcome === "done" ||
            progress.outcome === "cancelled" ||
            progress.outcome === "failed") ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onDialogOpenChange(true)}
            >
              Último run
            </Button>
          ) : null}
        </div>
      </div>

      {live ? (
        <Card>
          <CardHeader className="gap-1">
            <CardTitle className="text-base">Resumo ao vivo</CardTitle>
            <CardDescription>
              {progress.liveLabel ??
                `${progress.endpointsDone}/${progress.endpointsTotal || endpoints.length} endpoints · ${progress.findingsCount} findings`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={percent} className="w-full items-center">
              <ProgressLabel>Progresso</ProgressLabel>
              <ProgressValue />
            </Progress>
            <div className="flex flex-wrap gap-4 text-xs tabular-nums text-muted-foreground">
              <span>
                Endpoints{" "}
                <LiveNumber
                  className="text-foreground font-medium"
                  value={progress.endpointsDone}
                />
                /{progress.endpointsTotal || endpoints.length || "—"}
              </span>
              <span>
                Casos endpoint{" "}
                <LiveNumber
                  className="text-foreground font-medium"
                  value={progress.casesCompleted}
                />
                /{progress.casesTotal || "—"}
              </span>
              <span>
                Findings{" "}
                <LiveNumber
                  className="text-foreground font-medium"
                  value={progress.findingsCount}
                />
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {recentRuns.length > 0 ? (
        <Card>
          <CardHeader className="gap-1">
            <CardTitle className="text-base">Runs recentes</CardTitle>
            <CardDescription>
              {recentRuns.length} run{recentRuns.length === 1 ? "" : "s"} neste
              ambiente
              {totalPages > 1
                ? ` · página ${currentPage}/${totalPages}`
                : ""}
              {" · "}
              clique para ver findings e resultados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {pagedRuns.map((run) => {
                const running = run.status === "RUNNING";
                return (
                  <li key={run.id} className="first:pt-0 last:pb-0">
                    <button
                      type="button"
                      onClick={() => openRunDetail(run.id)}
                      className={cn(
                        "flex w-full flex-wrap items-center justify-between gap-2 rounded-lg py-2.5 text-left text-sm transition-colors",
                        "hover:bg-muted/50 focus-visible:ring-ring/50 outline-none focus-visible:ring-2",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-mono">{run.id.slice(0, 8)}</span>
                          {" · "}
                          <span className="text-foreground">
                            {scanSuitesLabel(run.categories)}
                          </span>
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {run.startedAt
                            ? new Date(run.startedAt).toLocaleString("pt-BR")
                            : "—"}
                          {run.finishedAt
                            ? ` → ${new Date(run.finishedAt).toLocaleTimeString("pt-BR", { hour12: false })}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs tabular-nums">
                        <span>
                          {running
                            ? "Em andamento…"
                            : `${run.completedCases}/${run.totalCases} casos`}
                        </span>
                        <StatusBadge
                          hideIcon
                          status={
                            run.status === "COMPLETED"
                              ? "operational"
                              : run.status === "FAILED"
                                ? "major"
                                : run.status === "CANCELLED"
                                  ? "partial"
                                  : run.status === "RUNNING"
                                    ? "degraded"
                                    : "unknown"
                          }
                          label={formatRunStatus(run.status)}
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
          {totalPages > 1 ? (
            <CardFooter className="border-t">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      text="Anterior"
                      aria-disabled={currentPage <= 1 || undefined}
                      tabIndex={currentPage <= 1 ? -1 : undefined}
                      className={cn(
                        currentPage <= 1 && "pointer-events-none opacity-50",
                      )}
                      onClick={(event) => goToPage(currentPage - 1, event)}
                    />
                  </PaginationItem>
                  {pageNumbers.map((item, index) =>
                    item === "ellipsis" ? (
                      <PaginationItem key={`ellipsis-${index}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={item}>
                        <PaginationLink
                          href="#"
                          isActive={item === currentPage}
                          onClick={(event) => goToPage(item, event)}
                        >
                          {item}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      text="Próxima"
                      aria-disabled={currentPage >= totalPages || undefined}
                      tabIndex={currentPage >= totalPages ? -1 : undefined}
                      className={cn(
                        currentPage >= totalPages &&
                          "pointer-events-none opacity-50",
                      )}
                      onClick={(event) => goToPage(currentPage + 1, event)}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </CardFooter>
          ) : null}
        </Card>
      ) : (
        <Card>
          <CardHeader className="gap-1">
            <CardTitle className="text-base">Runs recentes</CardTitle>
            <CardDescription>
              Nenhum scan neste ambiente ainda. Rode um scan pra ver o histórico
              aqui.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <ScanScopeDialog
        open={scopeOpen}
        onOpenChange={setScopeOpen}
        endpoints={endpoints}
        busy={busy}
        onConfirm={handleConfirmScope}
      />

      <ScanRunDetailDialog
        runId={detailRunId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
