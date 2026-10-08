import { Fragment, useEffect, useMemo, useState } from "react";
import type { Finding, ScanRun } from "@sw/core";
import { CheckIcon, ChevronDownIcon, CopyIcon } from "lucide-react";
import {
  BreakdownBar,
  BreakdownLegend,
} from "@/components/dashboardblocks/breakdown";
import { KPI2 } from "@/components/dashboardblocks/kpi/kpi-02";
import {
  Property,
  PropertyList,
  RecordLayout,
} from "@/components/dashboardblocks/record-detail";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { api } from "@/services/api";
import { findingDisplayPt, severityLabelPt, testLabelPt } from "@/lib/finding-pt";
import { cn } from "@/lib/utils";
import { scanSuitesLabel } from "./scan-scope";

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "var(--destructive)",
  HIGH: "color-mix(in oklab, var(--destructive) 75%, orange)",
  MEDIUM: "oklch(0.75 0.15 75)",
  LOW: "oklch(0.7 0.12 145)",
  INFO: "var(--muted-foreground)",
};

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

function runStatusLevel(
  status: ScanRun["status"],
): "operational" | "degraded" | "partial" | "major" | "unknown" {
  switch (status) {
    case "COMPLETED":
      return "operational";
    case "FAILED":
      return "major";
    case "CANCELLED":
      return "partial";
    case "RUNNING":
      return "degraded";
    default:
      return "unknown";
  }
}

function severityLevel(
  severity: Finding["severity"],
): "operational" | "degraded" | "partial" | "major" | "unknown" {
  switch (severity) {
    case "CRITICAL":
    case "HIGH":
      return "major";
    case "MEDIUM":
      return "degraded";
    case "LOW":
      return "partial";
    default:
      return "unknown";
  }
}

function endpointFromUrl(url: string | undefined): {
  path: string;
  host?: string;
} {
  if (!url) return { path: "—" };
  try {
    const parsed = new URL(url);
    return { path: parsed.pathname + parsed.search, host: parsed.host };
  } catch {
    return { path: url };
  }
}

function redactHeader(key: string, value: string): string {
  const lower = key.toLowerCase();
  if (lower === "authorization" || lower === "cookie" || lower === "x-api-key") {
    if (value.toLowerCase().startsWith("bearer ")) {
      const token = value.slice(7);
      return `Bearer ${token.slice(0, 6)}…`;
    }
    if (value.toLowerCase().startsWith("basic ")) return "Basic ***";
    return "***";
  }
  return value;
}

function formatBody(body: unknown): string {
  if (body === undefined) return "";
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}

function formatHeaders(
  headers: Record<string, string> | undefined,
): string {
  if (!headers || Object.keys(headers).length === 0) return "(nenhum)";
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${redactHeader(key, value)}`)
    .join("\n");
}

function truncateText(value: string, max = 4_000): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n… [truncado ${value.length - max} chars]`;
}

/** Contexto do run em markdown, pronto para colar numa IA (secrets redigidos). */
function buildRunContextForAi(detail: {
  run: ScanRun;
  findings: Finding[];
  results: {
    passed: number;
    failed: number;
    total: number;
    byTest: Array<{ testId: string; passed: number; failed: number }>;
  };
}): string {
  const { run, findings, results } = detail;
  const lines: string[] = [
    "# Sentinel — contexto do scan run",
    "",
    "Use este relatório para analisar falhas de segurança de API, priorizar findings e sugerir correções. Headers sensíveis (Authorization, Cookie, API key) estão redigidos.",
    "",
    "## Run",
    `- id: ${run.id}`,
    `- status: ${run.status}`,
    `- suites: ${scanSuitesLabel(run.categories)}`,
    `- projectId: ${run.projectId}`,
    `- environmentId: ${run.environmentId}`,
    `- startedAt: ${run.startedAt ?? "—"}`,
    `- finishedAt: ${run.finishedAt ?? "—"}`,
    `- casos: ${run.completedCases}/${run.totalCases}`,
    `- findings: ${run.findingsCount}`,
    "",
    "## Resumo de execução",
    `- total: ${results.total}`,
    `- passou: ${results.passed}`,
    `- falhou: ${results.failed}`,
    "",
  ];

  if (results.byTest.length > 0) {
    lines.push("## Resultados por teste", "");
    for (const row of results.byTest) {
      lines.push(
        `- ${testLabelPt(row.testId)} (\`${row.testId}\`): passou ${row.passed}, falhou ${row.failed}`,
      );
    }
    lines.push("");
  }

  const bySeverity = new Map<string, number>();
  for (const finding of findings) {
    bySeverity.set(
      finding.severity,
      (bySeverity.get(finding.severity) ?? 0) + 1,
    );
  }
  if (bySeverity.size > 0) {
    lines.push("## Achados por severidade", "");
    for (const key of ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]) {
      const count = bySeverity.get(key) ?? 0;
      if (count > 0) lines.push(`- ${severityLabelPt(key)}: ${count}`);
    }
    lines.push("");
  }

  lines.push(`## Achados (${findings.length})`, "");
  if (findings.length === 0) {
    lines.push("Nenhum finding neste run.", "");
  } else {
    findings.forEach((finding, index) => {
      const display = findingDisplayPt(finding);
      const method = finding.request?.method ?? "?";
      const { path, host } = endpointFromUrl(finding.request?.url);
      lines.push(
        `### ${index + 1}. ${display.title}`,
        `- severidade: ${display.severityLabel} (${finding.severity})`,
        `- confiança: ${finding.confidence}%`,
        `- status: ${finding.status}`,
        `- teste: ${display.testLabel} (\`${finding.testId}\`)`,
      );
      if (finding.testCaseId) {
        lines.push(`- caso: \`${finding.testCaseId}\``);
      }
      lines.push(
        `- endpoint: \`${method} ${path}\``,
      );
      if (host) lines.push(`- host: ${host}`);
      if (finding.endpointId) {
        lines.push(`- endpointId: ${finding.endpointId}`);
      }
      lines.push("", "#### Evidência", "", finding.evidence || "(vazia)", "");
      if (finding.recommendation) {
        lines.push(
          "#### Recomendação",
          "",
          finding.recommendation,
          "",
        );
      }
      if (finding.request) {
        lines.push(
          "#### Request",
          "",
          "```http",
          `${finding.request.method} ${finding.request.url}`,
          formatHeaders(finding.request.headers),
        );
        const body = formatBody(finding.request.body);
        if (body) {
          lines.push("", truncateText(body));
        }
        lines.push("```", "");
      }
      if (finding.response) {
        lines.push(
          "#### Response",
          "",
          "```http",
          `HTTP ${finding.response.status}`,
          formatHeaders(finding.response.headers),
        );
        const body = formatBody(finding.response.body);
        if (body) {
          lines.push("", truncateText(body));
        }
        lines.push("```", "");
      }
    });
  }

  lines.push(
    "## Pedido",
    "",
    "Analise os findings, diga o que é falso positivo vs risco real, priorize o que corrigir primeiro e proponha patches/config concretas (headers, auth, validação, rate limit).",
    "",
  );

  return lines.join("\n");
}

function FindingCard({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  const request = finding.request;
  const response = finding.response;
  const endpoint = endpointFromUrl(request?.url);
  const method = request?.method ?? "—";
  const path = endpoint.path;
  const display = findingDisplayPt(finding);

  return (
    <li className="min-w-0 overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full min-w-0 items-start gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <StatusBadge
          hideIcon
          status={severityLevel(finding.severity)}
          label={display.severityLabel}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium">{display.title}</p>
          <p className="font-mono text-xs text-muted-foreground">
            <span className="text-foreground/80">{method}</span> {path}
          </p>
          <p className="text-muted-foreground line-clamp-2 break-words text-xs">
            {display.evidence}
          </p>
        </div>
        <ChevronDownIcon
          className={cn(
            "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="min-w-0 space-y-4 overflow-hidden border-t px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground mb-1 text-[11px] font-medium uppercase tracking-wide">
                Onde
              </p>
              <p className="font-mono text-xs">
                {method} {path}
              </p>
              {endpoint.host ? (
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Host: {endpoint.host}
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-muted-foreground mb-1 text-[11px] font-medium uppercase tracking-wide">
                Teste
              </p>
              <p className="text-xs">{display.testLabel}</p>
              <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">
                {finding.testId}
              </p>
              {finding.testCaseId ? (
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                  Caso: {finding.testCaseId}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <p className="text-muted-foreground mb-1 text-[11px] font-medium uppercase tracking-wide">
              O que aconteceu
            </p>
            <p className="text-sm break-words [overflow-wrap:anywhere]">
              {display.evidence}
            </p>
            {display.recommendation ? (
              <p className="text-muted-foreground mt-2 text-xs">
                <span className="font-medium text-foreground">
                  Recomendação:{" "}
                </span>
                {display.recommendation}
              </p>
            ) : null}
          </div>

          {request ? (
            <div>
              <p className="text-muted-foreground mb-1 text-[11px] font-medium uppercase tracking-wide">
                O que o Sentinel enviou
              </p>
              <ScrollArea className="h-48 rounded-lg bg-muted/40">
                <pre className="px-3 py-2 font-mono text-[11px] leading-5 whitespace-pre-wrap">
                  {`${request.method} ${request.url}\n`}
                  {Object.entries(request.headers ?? {})
                    .map(([key, value]) => `${key}: ${redactHeader(key, value)}`)
                    .join("\n")}
                  {request.body !== undefined
                    ? `\n\n${formatBody(request.body)}`
                    : ""}
                </pre>
              </ScrollArea>
            </div>
          ) : null}

          {response ? (
            <div>
              <p className="text-muted-foreground mb-1 text-[11px] font-medium uppercase tracking-wide">
                Resposta da API ({response.status}
                {typeof response.durationMs === "number"
                  ? ` · ${response.durationMs} ms`
                  : ""}
                )
              </p>
              <ScrollArea className="h-40 rounded-lg bg-muted/40">
                <pre className="px-3 py-2 font-mono text-[11px] leading-5 whitespace-pre-wrap">
                  {Object.entries(response.headers ?? {})
                    .slice(0, 12)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join("\n")}
                  {response.body !== undefined
                    ? `\n\n${formatBody(response.body)}`
                    : ""}
                </pre>
              </ScrollArea>
            </div>
          ) : !request ? (
            <p className="text-muted-foreground text-xs">
              Sem request/response gravados neste finding.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

type RunDetail = Awaited<ReturnType<typeof api.getRunDetail>>;
type RunResultItem = RunDetail["results"]["items"][number];

function ResultCaseItem({ item }: { item: RunResultItem }) {
  const [open, setOpen] = useState(false);
  const { request, response } = item;
  const { path } = endpointFromUrl(request?.url);

  return (
    <li className="min-w-0 overflow-hidden rounded-lg ring-1 ring-foreground/10">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <StatusBadge
          hideIcon
          status={item.passed ? "operational" : "major"}
          label={item.passed ? "Passou" : "Falhou"}
        />
        <p className="min-w-0 flex-1 truncate font-mono text-xs">
          <span className="text-foreground/80">{request?.method ?? "—"}</span>{" "}
          {path}
        </p>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {response ? `HTTP ${response.status}` : "sem resposta"}
          {typeof response?.durationMs === "number"
            ? ` · ${response.durationMs} ms`
            : ""}
        </span>
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="min-w-0 space-y-3 border-t px-3 py-3">
          <p className="text-muted-foreground truncate font-mono text-[11px]">
            Caso: {item.testCaseId}
          </p>
          {item.notes ? (
            <p className="text-xs break-words [overflow-wrap:anywhere]">
              <span className="font-medium">Notas: </span>
              {item.notes}
            </p>
          ) : null}
          {request ? (
            <div>
              <p className="text-muted-foreground mb-1 text-[11px] font-medium uppercase tracking-wide">
                Request
              </p>
              <ScrollArea className="h-40 rounded-lg bg-muted/40">
                <pre className="px-3 py-2 font-mono text-[11px] leading-5 whitespace-pre-wrap">
                  {`${request.method} ${request.url}\n`}
                  {formatHeaders(request.headers)}
                  {request.body !== undefined
                    ? `\n\n${truncateText(formatBody(request.body))}`
                    : ""}
                </pre>
              </ScrollArea>
            </div>
          ) : null}
          {response ? (
            <div>
              <p className="text-muted-foreground mb-1 text-[11px] font-medium uppercase tracking-wide">
                Response
              </p>
              <ScrollArea className="h-40 rounded-lg bg-muted/40">
                <pre className="px-3 py-2 font-mono text-[11px] leading-5 whitespace-pre-wrap">
                  {`HTTP ${response.status}\n`}
                  {formatHeaders(response.headers)}
                  {response.body !== undefined
                    ? `\n\n${truncateText(formatBody(response.body))}`
                    : ""}
                </pre>
              </ScrollArea>
            </div>
          ) : null}
          {!request && !response ? (
            <p className="text-muted-foreground text-xs">
              Sem request/response gravados neste caso.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function ScanRunDetailDialog({
  runId,
  open,
  onOpenChange,
}: {
  runId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [copied, setCopied] = useState(false);
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !runId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setCopied(false);
    setExpandedTestId(null);
    void api
      .getRunDetail(runId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Falha ao carregar run");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, runId]);

  const severitySegments = useMemo(() => {
    if (!detail) return [];
    const counts = new Map<string, number>();
    for (const finding of detail.findings) {
      counts.set(finding.severity, (counts.get(finding.severity) ?? 0) + 1);
    }
    const order = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
    return order
      .filter((key) => (counts.get(key) ?? 0) > 0)
      .map((key) => ({
        label: severityLabelPt(key),
        value: counts.get(key) ?? 0,
        color: SEVERITY_COLOR[key] ?? "var(--muted-foreground)",
      }));
  }, [detail]);

  const findingsByEndpoint = useMemo(() => {
    if (!detail) return [];
    const groups = new Map<string, Finding[]>();
    for (const finding of detail.findings) {
      const method = finding.request?.method ?? "?";
      const path = endpointFromUrl(finding.request?.url).path;
      const key = `${method} ${path}`;
      const list = groups.get(key) ?? [];
      list.push(finding);
      groups.set(key, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [detail]);

  const itemsByTest = useMemo(() => {
    const groups = new Map<string, RunResultItem[]>();
    for (const item of detail?.results.items ?? []) {
      const list = groups.get(item.testId) ?? [];
      list.push(item);
      groups.set(item.testId, list);
    }
    return groups;
  }, [detail]);

  const run = detail?.run;

  async function onCopyForAi() {
    if (!detail) return;
    try {
      const text = buildRunContextForAi(detail);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.add({
        title: "Contexto copiado",
        description: "Cole numa IA para analisar o run.",
        type: "success",
      });
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.add({
        title: "Falha ao copiar",
        description: "Não foi possível escrever na área de transferência.",
        type: "error",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] max-h-[80vh] w-[80vw] max-w-[80vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[80vw]">
        <DialogHeader className="shrink-0 gap-2 border-b px-6 py-4">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <DialogTitle>
              Run {runId ? runId.slice(0, 8) : "—"}
            </DialogTitle>
            {run ? (
              <StatusBadge
                status={runStatusLevel(run.status)}
                label={formatRunStatus(run.status)}
              />
            ) : null}
          </div>
          <DialogDescription>
            {loading
              ? "Carregando detalhe do run…"
              : run?.startedAt
                ? `${scanSuitesLabel(run.categories)} · Início ${new Date(run.startedAt).toLocaleString("pt-BR")}${
                    run.finishedAt
                      ? ` · fim ${new Date(run.finishedAt).toLocaleTimeString("pt-BR", { hour12: false })}`
                      : ""
                  }`
                : "Detalhe do scan run"}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="p-6">
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
            {loading && !detail ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : null}
            {detail && run ? (
              <RecordLayout
                aside={
                  <div className="flex flex-col gap-4">
                    <div>
                      <h3 className="mb-3 text-sm font-medium">Propriedades</h3>
                      <PropertyList>
                        <Property label="ID">
                          <span className="font-mono text-xs">{run.id}</span>
                        </Property>
                        <Property label="Status">
                          {formatRunStatus(run.status)}
                        </Property>
                        <Property label="Suites">
                          {scanSuitesLabel(run.categories)}
                        </Property>
                        <Property label="Início">
                          {run.startedAt
                            ? new Date(run.startedAt).toLocaleString("pt-BR")
                            : "—"}
                        </Property>
                        <Property label="Fim">
                          {run.finishedAt
                            ? new Date(run.finishedAt).toLocaleString("pt-BR")
                            : "—"}
                        </Property>
                        <Property label="Ambiente">
                          <span className="font-mono text-xs">
                            {run.environmentId.slice(0, 8)}
                          </span>
                        </Property>
                      </PropertyList>
                    </div>
                    {severitySegments.length > 0 ? (
                      <div>
                        <h3 className="mb-3 text-sm font-medium">
                          Achados por severidade
                        </h3>
                        <BreakdownBar segments={severitySegments} />
                        <BreakdownLegend
                          className="mt-3"
                          items={severitySegments}
                        />
                      </div>
                    ) : null}
                  </div>
                }
              >
                <div className="grid grid-cols-2 gap-3 @xl/record:grid-cols-4">
                  <KPI2
                    title="Casos"
                    value={run.completedCases}
                    format={() => `${run.completedCases}/${run.totalCases}`}
                  />
                  <KPI2 title="Passou" value={detail.results.passed} />
                  <KPI2 title="Falhou" value={detail.results.failed} />
                  <KPI2 title="Achados" value={run.findingsCount} />
                </div>

                {detail.results.byTest.length > 0 ? (
                  <div>
                    <h3 className="mb-1 text-sm font-medium">
                      Resultados por teste
                    </h3>
                    <p className="text-muted-foreground mb-3 text-xs">
                      Clique num teste para ver cada caso executado (request e
                      resposta).
                    </p>
                    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Teste</TableHead>
                            <TableHead className="text-right">Passou</TableHead>
                            <TableHead className="text-right">Falhou</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.results.byTest.map((row) => {
                            const expanded = expandedTestId === row.testId;
                            const items = itemsByTest.get(row.testId) ?? [];
                            return (
                              <Fragment key={row.testId}>
                                <TableRow
                                  className="cursor-pointer"
                                  onClick={() =>
                                    setExpandedTestId(
                                      expanded ? null : row.testId,
                                    )
                                  }
                                >
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <ChevronDownIcon
                                        className={cn(
                                          "size-3.5 shrink-0 text-muted-foreground transition-transform",
                                          !expanded && "-rotate-90",
                                        )}
                                      />
                                      <div>
                                        <p className="text-xs">
                                          {testLabelPt(row.testId)}
                                        </p>
                                        <p className="text-muted-foreground font-mono text-[11px]">
                                          {row.testId}
                                        </p>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {row.passed}
                                  </TableCell>
                                  <TableCell
                                    className={cn(
                                      "text-right tabular-nums",
                                      row.failed > 0 &&
                                        "text-amber-600 dark:text-amber-400",
                                    )}
                                  >
                                    {row.failed}
                                  </TableCell>
                                </TableRow>
                                {expanded ? (
                                  <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={3} className="whitespace-normal">
                                      <ul className="space-y-2">
                                        {items.map((item) => (
                                          <ResultCaseItem
                                            key={item.id}
                                            item={item}
                                          />
                                        ))}
                                      </ul>
                                    </TableCell>
                                  </TableRow>
                                ) : null}
                              </Fragment>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : null}

                <div>
                  <h3 className="mb-1 text-sm font-medium">
                    Achados ({detail.findings.length})
                  </h3>
                  <p className="text-muted-foreground mb-3 text-xs">
                    Agrupados por endpoint. Clique para ver request, resposta e
                    recomendação.
                  </p>
                  {detail.findings.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum finding neste run.
                    </p>
                  ) : (
                    <div className="space-y-5">
                      {findingsByEndpoint.map(([endpointKey, items]) => (
                        <div key={endpointKey} className="space-y-2">
                          <p className="font-mono text-xs font-medium">
                            {endpointKey}
                            <span className="text-muted-foreground font-sans font-normal">
                              {" "}
                              · {items.length} achado
                              {items.length === 1 ? "" : "s"}
                            </span>
                          </p>
                          <ul className="space-y-2">
                            {items.map((finding) => (
                              <FindingCard key={finding.id} finding={finding} />
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </RecordLayout>
            ) : null}
          </div>
        </ScrollArea>

        <DialogFooter className="mx-0 mb-0 shrink-0 sm:justify-between">
          <p className="text-muted-foreground self-center text-xs">
            “Copiar para IA” exporta resumo, testes e findings (secrets
            redigidos).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!detail || loading}
              onClick={() => void onCopyForAi()}
            >
              {copied ? (
                <CheckIcon className="size-3.5" />
              ) : (
                <CopyIcon className="size-3.5" />
              )}
              {copied ? "Copiado" : "Copiar para IA"}
            </Button>
            <Button type="button" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
