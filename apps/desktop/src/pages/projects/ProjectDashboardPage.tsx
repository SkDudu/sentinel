import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FolderKanban, Bug, Server } from "lucide-react";
import {
  FindingStatus,
  Severity,
  type Endpoint,
  type Finding,
  type ScanRun,
} from "@sw/core";
import { ChartPanel6 } from "@/components/dashboardblocks/chart-panel/chart-panel-06";
import {
  DataTable1,
  type DataTable1Row,
} from "@/components/dashboardblocks/data-table/data-table-01";
import { KPI2 } from "@/components/dashboardblocks/kpi/kpi-02";
import { StatusBadge } from "@/components/dashboardblocks/status";
import { UsageMeter5 } from "@/components/dashboardblocks/usage-meter/usage-meter-05";
import { PageEmptyState } from "@/components/layout/page-empty-state";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/services/api";
import { useProjectStore } from "@/stores/project";

const SEVERITY_LEVELS = [
  Severity.CRITICAL,
  Severity.HIGH,
  Severity.MEDIUM,
  Severity.LOW,
  Severity.INFO,
] as const;

const SEVERITY_COLOR: Record<(typeof SEVERITY_LEVELS)[number], string> = {
  CRITICAL: "var(--destructive)",
  HIGH: "var(--warning)",
  MEDIUM: "var(--chart-1)",
  LOW: "var(--chart-3)",
  INFO: "color-mix(in oklab, var(--muted-foreground) 55%, transparent)",
};

function isOpen(finding: Finding) {
  return (
    finding.status === FindingStatus.OPEN ||
    finding.status === FindingStatus.CONFIRMED
  );
}

function runStamp(run: ScanRun) {
  return run.finishedAt ?? run.startedAt ?? "";
}

function relativeTime(iso?: string) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff) || diff < 0) return "—";
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.round(hours / 24);
  return `há ${days}d`;
}

function runStatusLevel(
  status: ScanRun["status"],
): "operational" | "degraded" | "partial" | "major" | "unknown" {
  switch (status) {
    case "COMPLETED":
      return "operational";
    case "RUNNING":
      return "degraded";
    case "CANCELLED":
      return "partial";
    case "FAILED":
      return "major";
    default:
      return "unknown";
  }
}

function formatRunStatus(status: ScanRun["status"]) {
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

export function ProjectDashboardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { projects, loadProjects, setActiveProject } = useProjectStore();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [runs, setRuns] = useState<ScanRun[]>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (projectId) setActiveProject(projectId);
  }, [projectId, setActiveProject]);

  const project = projects.find((p) => p.id === projectId);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setDataLoading(true);
    setDataError(null);
    void Promise.all([
      api.listFindings(projectId),
      api.listRuns(projectId),
      api.listEndpoints(projectId),
    ])
      .then(([nextFindings, nextRuns, nextEndpoints]) => {
        if (cancelled) return;
        setFindings(nextFindings);
        setRuns(nextRuns);
        setEndpoints(nextEndpoints);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setDataError(
          error instanceof Error ? error.message : "Falha ao carregar dashboard",
        );
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const view = useMemo(() => {
    const envs = project?.environments ?? [];
    const openFindings = findings.filter(isOpen);
    const blockers = openFindings.filter(
      (finding) =>
        finding.severity === Severity.CRITICAL ||
        finding.severity === Severity.HIGH,
    ).length;
    const sortedRuns = [...runs].sort((a, b) =>
      runStamp(b).localeCompare(runStamp(a)),
    );
    const latest = sortedRuns[0];

    const byEnvironment = envs.map((env) => {
      const envEndpoints = endpoints.filter((e) => e.environmentId === env.id);
      const lastRun = sortedRuns.find((run) => run.environmentId === env.id);
      return {
        id: env.id,
        label: env.name,
        endpoints: envEndpoints.length,
        lastRun,
      };
    });

    const severityCategories = SEVERITY_LEVELS.map((level) => ({
      color: SEVERITY_COLOR[level],
      label: level,
      value: openFindings.filter((finding) => finding.severity === level)
        .length,
    }))
      .filter((category) => category.value > 0)
      .sort((a, b) => b.value - a.value);

    const chartRuns = [...sortedRuns].reverse().slice(-12);
    const chartData = chartRuns.map((run) => ({
      label: run.startedAt
        ? new Date(run.startedAt).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
          })
        : run.id.slice(0, 6),
      findings: run.findingsCount,
      cases: run.completedCases,
    }));
    const lastFindings = chartData.at(-1)?.findings ?? 0;
    const prevFindings = chartData.at(-2)?.findings ?? lastFindings;
    const findingsTrend =
      prevFindings === 0
        ? lastFindings > 0
          ? 100
          : 0
        : ((lastFindings - prevFindings) / prevFindings) * 100;

    const topRoutes: DataTable1Row[] = (() => {
      const byEndpoint = new Map<
        string,
        { findings: number; blockers: number }
      >();
      for (const finding of openFindings) {
        if (!finding.endpointId) continue;
        const bucket = byEndpoint.get(finding.endpointId) ?? {
          findings: 0,
          blockers: 0,
        };
        bucket.findings += 1;
        if (
          finding.severity === Severity.CRITICAL ||
          finding.severity === Severity.HIGH
        ) {
          bucket.blockers += 1;
        }
        byEndpoint.set(finding.endpointId, bucket);
      }

      const envName = (environmentId?: string) =>
        envs.find((env) => env.id === environmentId)?.name ?? "—";

      return [...byEndpoint.entries()]
        .map(([endpointId, stats]) => {
          const endpoint = endpoints.find((item) => item.id === endpointId);
          if (!endpoint) return null;
          return {
            id: endpoint.id,
            method: endpoint.method,
            path: endpoint.path,
            environment: envName(endpoint.environmentId),
            findings: stats.findings,
            blockers: stats.blockers,
          } satisfies DataTable1Row;
        })
        .filter((row): row is DataTable1Row => row != null)
        .sort(
          (a, b) =>
            b.findings - a.findings ||
            b.blockers - a.blockers ||
            a.path.localeCompare(b.path),
        )
        .slice(0, 25);
    })();

    return {
      environments: envs.length,
      endpoints: endpoints.length,
      open: openFindings.length,
      blockers,
      scans: sortedRuns.length,
      latest,
      byEnvironment,
      severityCategories,
      chartData,
      findingsTrend,
      recentScans: sortedRuns.slice(0, 8),
      topRoutes,
    };
  }, [project, findings, runs, endpoints, projectId]);

  if (!projectId || (!project && projects.length > 0)) {
    return (
      <PageShell title="Projeto">
        <PageEmptyState
          icon={FolderKanban}
          title="Projeto não encontrado"
          description="Volte à lista e abra um projeto pelo card."
          action={
            <Button render={<Link to="/projects" />}>Ir para Projetos</Button>
          }
        />
      </PageShell>
    );
  }

  if (!project) {
    return (
      <PageShell title="Projeto">
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </PageShell>
    );
  }

  const base = `/projects/${project.id}`;
  const pending = dataLoading;

  return (
    <PageShell
      title={project.name}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link to={`${base}/environments`} />}
          >
            <Server />
            Ambientes
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={<Link to={`${base}/findings`} />}
          >
            <Bug />
            Findings
          </Button>
        </div>
      }
    >
      {project.description ? (
        <p className="mb-6 text-sm text-muted-foreground">
          {project.description}
        </p>
      ) : null}

      {dataError ? (
        <p className="mb-4 text-sm text-destructive">{dataError}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KPI2 title="Ambientes" value={pending ? 0 : view.environments} />
        <KPI2 title="Endpoints" value={pending ? 0 : view.endpoints} />
        <KPI2 title="Findings abertos" value={pending ? 0 : view.open} />
        <KPI2
          title="Critical / High"
          value={pending ? 0 : view.blockers}
        />
        <KPI2 title="Scans" value={pending ? 0 : view.scans} />
      </div>

      <div className="mt-6">
        <UsageMeter5
          title="Severidade"
          description="Findings abertos por severidade"
          unit="findings"
          limit={pending ? 1 : Math.max(view.open, 1)}
          categories={pending ? [] : view.severityCategories}
        />
      </div>

      <div className="mt-6">
        <DataTable1
          title="Rotas com mais erros"
          description={
            pending
              ? "Carregando…"
              : view.topRoutes.length === 0
                ? "Findings abertos agregados por endpoint"
                : `${view.topRoutes.length} rota${view.topRoutes.length === 1 ? "" : "s"} com findings abertos`
          }
          rows={pending ? [] : view.topRoutes}
          empty={
            pending
              ? "Carregando…"
              : "Nenhuma rota com findings abertos ainda."
          }
          onSelect={() => {
            void navigate(`${base}/findings`);
          }}
        />
      </div>

      {view.chartData.length > 0 ? (
        <div className="mt-6">
          <ChartPanel6
            title="Findings por scan"
            description="Volume de findings gerados nos últimos scans do projeto"
            headline="Findings"
            headlineHint="no último scan"
            labelHeading="Scan"
            formatter={(value) => String(value)}
            trend={Number.isFinite(view.findingsTrend) ? view.findingsTrend : 0}
            percentiles={[
              { key: "findings", label: "Findings" },
              { key: "cases", label: "Casos" },
            ]}
            data={view.chartData}
          />
        </div>
      ) : null}

      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium">Scans recentes</h3>
            <p className="text-muted-foreground text-xs">
              {view.latest
                ? `Último ${relativeTime(runStamp(view.latest))}`
                : "Nenhum scan neste projeto"}
            </p>
          </div>
          {view.byEnvironment[0] ? (
            <Button
              variant="outline"
              size="sm"
              render={
                <Link
                  to={`${base}/environments/${view.byEnvironment[0].id}/scan`}
                />
              }
            >
              Ir ao scan
            </Button>
          ) : null}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ambiente</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Casos</TableHead>
              <TableHead>Findings</TableHead>
              <TableHead className="text-right">Quando</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.recentScans.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  {pending ? "Carregando…" : "Nenhum scan ainda."}
                </TableCell>
              </TableRow>
            ) : (
              view.recentScans.map((run) => {
                const envName =
                  project.environments.find((env) => env.id === run.environmentId)
                    ?.name ?? "—";
                return (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">{envName}</TableCell>
                    <TableCell>
                      <StatusBadge
                        hideIcon
                        status={runStatusLevel(run.status)}
                        label={formatRunStatus(run.status)}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {run.completedCases}/{run.totalCases}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {run.findingsCount}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {relativeTime(runStamp(run))}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </section>
    </PageShell>
  );
}
