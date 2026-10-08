import { CheckIcon, CircleIcon, LoaderCircleIcon, MinusIcon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ScanEndpointItem } from "./scan-progress";

function statusFromState(
  state: ScanEndpointItem["state"],
): "complete" | "active" | "pending" | "skipped" {
  switch (state) {
    case "done":
      return "complete";
    case "running":
      return "active";
    case "skipped":
      return "skipped";
    default:
      return "pending";
  }
}

function StepIcon({ status }: { status: ReturnType<typeof statusFromState> }) {
  if (status === "complete") {
    return (
      <span className="bg-emerald-600 text-white flex size-6 shrink-0 items-center justify-center rounded-full">
        <CheckIcon className="size-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="border-primary text-primary bg-card flex size-6 shrink-0 items-center justify-center rounded-full border-2">
        <LoaderCircleIcon className="size-3.5 animate-spin" />
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span className="text-muted-foreground border-muted-foreground/50 bg-card flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed">
        <MinusIcon className="size-3.5" />
      </span>
    );
  }
  return (
    <span className="text-muted-foreground/50 border-muted-foreground/30 bg-card flex size-6 shrink-0 items-center justify-center rounded-full border">
      <CircleIcon className="size-2.5 fill-current" />
    </span>
  );
}

function endpointDetail(item: ScanEndpointItem): string {
  if (item.casesTotal > 0) {
    const cases = `${item.casesExecuted}/${item.casesTotal} casos`;
    if (item.findings > 0) {
      return `${cases} · ${item.findings} finding${item.findings === 1 ? "" : "s"}`;
    }
    return cases;
  }
  if (item.state === "queued") return "Aguardando…";
  if (item.state === "running") return "Executando…";
  if (item.findings > 0) {
    return `${item.casesExecuted} casos · ${item.findings} finding${item.findings === 1 ? "" : "s"}`;
  }
  return item.casesExecuted > 0 ? `${item.casesExecuted} casos` : "—";
}

export function ScanEndpointChain({
  endpoints,
  className,
}: {
  endpoints: ScanEndpointItem[];
  className?: string;
}) {
  const done = endpoints.filter((e) => e.state === "done").length;
  const active = endpoints.find((e) => e.state === "running");

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col rounded-lg border bg-card/50",
        className,
      )}
    >
      <div className="shrink-0 space-y-1 border-b px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">Endpoints</h3>
          <p className="text-muted-foreground text-xs tabular-nums">
            {done}/{endpoints.length} concluídos
          </p>
        </div>
        <p className="text-muted-foreground text-xs">
          {active
            ? `Em execução · ${active.method} ${active.path}`
            : done === endpoints.length && endpoints.length > 0
              ? "Trace do scan · todos concluídos"
              : "Trace do scan · fila de endpoints"}
        </p>
      </div>

      <ScrollArea className="h-0 min-h-0 flex-1 px-4 py-3">
        {endpoints.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Grupo de endpoints aparece quando o scan começa.
          </p>
        ) : (
          <ol className="flex flex-col">
            {endpoints.map((item, index) => {
              const status = statusFromState(item.state);
              const isLast = index === endpoints.length - 1;
              return (
                <li
                  key={item.key}
                  data-endpoint-state={item.state}
                  className="relative flex gap-3"
                >
                  <div className="flex w-6 shrink-0 flex-col items-center">
                    <StepIcon status={status} />
                    {!isLast ? (
                      <span
                        aria-hidden
                        className={cn(
                          "mt-1 w-px flex-1 min-h-4",
                          status === "complete"
                            ? "bg-emerald-600/40"
                            : "bg-border",
                        )}
                      />
                    ) : null}
                  </div>
                  <div
                    className={cn(
                      "min-w-0 flex-1 pb-4",
                      isLast && "pb-1",
                      status === "pending" && "opacity-60",
                      status === "skipped" && "opacity-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={cn(
                          "truncate font-mono text-xs",
                          status === "active" && "text-foreground font-medium",
                          status === "complete" && "text-muted-foreground",
                          status === "pending" && "text-muted-foreground/70",
                        )}
                      >
                        <span className="text-muted-foreground">
                          {item.method}
                        </span>{" "}
                        {item.path}
                      </p>
                      {item.state === "running" && item.casesTotal > 0 ? (
                        <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
                          {Math.round(
                            (item.casesExecuted / item.casesTotal) * 100,
                          )}
                          %
                        </span>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-[11px] tabular-nums">
                      {endpointDetail(item)}
                    </p>
                    {item.state === "running" && item.casesTotal > 0 ? (
                      <Progress
                        value={Math.round(
                          (item.casesExecuted / item.casesTotal) * 100,
                        )}
                        className="mt-2 w-full"
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </ScrollArea>
    </div>
  );
}
