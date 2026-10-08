import { useEffect, useMemo, useRef, useState } from "react";
import {
  getChecklistProgress,
  StepIndicator,
  stepStateConfig,
  type StepState,
} from "@/components/dashboardblocks/checklist";
import {
  LiveBadge,
  LiveNumber,
  formatAgo,
  useInterval,
} from "@/components/dashboardblocks/realtime";
import { StatusBadge } from "@/components/dashboardblocks/status";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ScanEndpointChain } from "./ScanEndpointChain";
import type { ScanProgress } from "./scan-progress";

const STATE_LABEL_PT: Record<StepState, string> = {
  current: "Em andamento",
  done: "Concluído",
  skipped: "Interrompido",
  todo: "Pendente",
};

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

export function ScanRunDialog({
  open,
  onOpenChange,
  progress,
  onCancel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: ScanProgress;
  onCancel: () => void;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  const endpointsRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());
  const live =
    progress.outcome === "running" || progress.outcome === "cancelling";
  const checklist = useMemo(
    () => getChecklistProgress(progress.steps),
    [progress.steps],
  );
  const status = outcomeStatus(progress.outcome);
  const percent = Math.round(progress.progress * 100);

  useInterval(() => setNow(new Date()), live ? 5_000 : null);

  useEffect(() => {
    const root = logRef.current;
    if (!root) return;
    const viewport = root.querySelector(
      '[data-slot="scroll-area-viewport"]',
    ) as HTMLElement | null;
    const el = viewport ?? root;
    el.scrollTop = el.scrollHeight;
  }, [progress.activity, progress.liveLabel]);

  useEffect(() => {
    const running = endpointsRef.current?.querySelector(
      '[data-endpoint-state="running"]',
    );
    running?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [progress.endpointIndex, progress.endpoints]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={!live}
        className="flex h-[80vh] max-h-[80vh] w-[80vw] max-w-[80vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[80vw]"
      >
        <DialogHeader className="shrink-0 gap-3 border-b px-6 py-4">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <DialogTitle>Scan em andamento</DialogTitle>
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
          <DialogDescription>
            {progress.liveLabel ??
              (live
                ? "Acompanhe etapas, endpoints e atividade do run."
                : "Resumo do último run.")}
          </DialogDescription>
          <Progress value={percent} className="w-full items-center">
            <ProgressLabel>Progresso do scan</ProgressLabel>
            <ProgressValue />
          </Progress>
          <div className="flex flex-wrap gap-4 text-xs tabular-nums text-muted-foreground">
            <span>
              Endpoints{" "}
              <LiveNumber
                className="text-foreground font-medium"
                value={progress.endpointsDone}
              />
              /{progress.endpointsTotal || "—"}
            </span>
            <span>
              Casos{" "}
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
            <span>
              Etapas {checklist.done}/{checklist.total}
            </span>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
          <section className="min-h-0 border-b lg:border-r lg:border-b-0">
            <ScrollArea className="h-full p-5">
              <h3 className="mb-3 text-sm font-medium">Etapas</h3>
              <ol className="flex flex-col gap-3">
                {progress.steps.map((step, index) => {
                  const config = stepStateConfig[step.state];
                  return (
                    <li key={step.id} className="flex gap-3">
                      <StepIndicator index={index + 1} state={step.state} />
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <p className={cn("text-sm", config.text)}>
                            {step.title}
                          </p>
                          <span className="text-muted-foreground text-xs">
                            {STATE_LABEL_PT[step.state]}
                          </span>
                        </div>
                        <p className="text-muted-foreground text-xs">
                          {step.detail ?? step.description}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </ScrollArea>
          </section>

          <section className="flex min-h-0 flex-col border-b p-5 lg:border-r lg:border-b-0">
            <div ref={endpointsRef} className="flex min-h-0 flex-1 flex-col">
              <ScanEndpointChain endpoints={progress.endpoints} />
            </div>
          </section>

          <section className="flex min-h-0 flex-col p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Atividade</h3>
              {live ? <LiveBadge label="Stream" /> : null}
            </div>
            <div
              ref={logRef}
              aria-live="polite"
              aria-label="Log do scan"
              className="min-h-0 flex-1"
            >
              <ScrollArea className="h-full rounded-lg border border-border bg-muted/30">
                <div className="px-3 py-2 font-mono text-[11px] leading-5">
                  {progress.activity.length === 0 && !progress.liveLabel ? (
                    <p className="text-muted-foreground">Aguardando eventos…</p>
                  ) : (
                    <>
                      {progress.activity.map((item) => (
                        <p
                          key={item.id}
                          className={cn(
                            item.kind === "finding" &&
                              "text-amber-600 dark:text-amber-400",
                            item.kind === "done" && "text-foreground",
                            item.kind === "info" && "text-muted-foreground",
                          )}
                        >
                          <span className="text-muted-foreground/80">
                            {formatAgo(new Date(item.at), now)}
                          </span>
                          {"  "}
                          {item.text}
                        </p>
                      ))}
                      {progress.liveLabel ? (
                        <p className="text-foreground">{progress.liveLabel}</p>
                      ) : null}
                    </>
                  )}
                </div>
              </ScrollArea>
            </div>
          </section>
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0 sm:justify-between">
          <p className="text-muted-foreground self-center text-xs">
            {live
              ? "Minimizar não cancela o scan — use Cancelar."
              : "Pode fechar quando quiser."}
          </p>
          <div className="flex flex-wrap gap-2">
            {live ? (
              <Button
                type="button"
                variant="destructive"
                disabled={progress.outcome === "cancelling"}
                onClick={onCancel}
              >
                {progress.outcome === "cancelling"
                  ? "Cancelando…"
                  : "Cancelar scan"}
              </Button>
            ) : null}
            <Button
              type="button"
              variant={live ? "outline" : "default"}
              onClick={() => onOpenChange(false)}
            >
              {live ? "Minimizar" : "Fechar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
