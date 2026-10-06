import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FolderKanban, LayoutDashboard } from "lucide-react";
import { FindingStatus, Severity, type Finding, type ScanRun } from "@sw/core";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Breakdown2 } from "@/components/dashboardblocks/breakdown/breakdown-02";
import { PageEmptyState } from "@/components/layout/page-empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageShell } from "@/components/layout/page-shell";
import { api, type ProjectDto } from "@/services/api";
import { useProjectStore } from "@/stores/project";
import { cn } from "@/lib/utils";

const ALL = "all";

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

const SEVERITY_CATEGORIES = SEVERITY_LEVELS.map((level) => ({
  color: SEVERITY_COLOR[level],
  key: level,
  label: level,
}));

const PROJECT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--chart-3)",
  "var(--chart-5)",
];

type Bundle = {
  project: ProjectDto;
  findings: Finding[];
  runs: ScanRun[];
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

export function DashboardPage() {
  const { projects, loading, loadProjects } = useProjectStore();
  const [scope, setScope] = useState(ALL);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!projects.some((project) => project.id === scope)) {
      setScope(ALL);
    }
  }, [projects, scope]);

  useEffect(() => {
    if (projects.length === 0) {
      setBundles([]);
      setDataLoading(false);
      setDataError(null);
      return;
    }

    let cancelled = false;
    setDataLoading(true);
    setDataError(null);

    void Promise.all(
      projects.map(async (project) => {
        const [findings, runs] = await Promise.all([
          api.listFindings(project.id),
          api.listRuns(project.id),
        ]);
        return { project, findings, runs };
      }),
    )
      .then((rows) => {
        if (!cancelled) setBundles(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDataError(
            error instanceof Error ? error.message : "Falha ao agregar",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projects]);

  const projectItems = useMemo(
    () => [
      { label: "Todos", value: ALL },
      ...projects.map((project) => ({
        label: project.name,
        value: project.id,
      })),
    ],
    [projects],
  );

  const view = useMemo(() => {
    const scoped =
      scope === ALL
        ? bundles
        : bundles.filter((row) => row.project.id === scope);
    const findings = scoped.flatMap((row) => row.findings);
    const openFindings = findings.filter(isOpen);
    const runs = scoped
      .flatMap((row) =>
        row.runs.map((run) => ({
          run,
          projectName: row.project.name,
          environmentName:
            row.project.environments.find((env) => env.id === run.environmentId)
              ?.name ?? "—",
        })),
      )
      .sort((a, b) => runStamp(b.run).localeCompare(runStamp(a.run)));

    const byProject = scoped
      .map((row) => {
        const open = row.findings.filter(isOpen);
        const values = Object.fromEntries(
          SEVERITY_LEVELS.map((level) => [
            level,
            open.filter((finding) => finding.severity === level).length,
          ]),
        );
        return {
          id: row.project.id,
          label: row.project.name,
          open: open.length,
          values,
        };
      })
      .sort((a, b) => b.open - a.open || a.label.localeCompare(b.label));

    const latest = runs[0];
    const blockers = openFindings.filter(
      (finding) =>
        finding.severity === Severity.CRITICAL ||
        finding.severity === Severity.HIGH,
    ).length;

    return {
      projects: scoped.length,
      environments: scoped.reduce(
        (sum, row) => sum + row.project.environments.length,
        0,
      ),
      open: openFindings.length,
      blockers,
      latest,
      byProject,
      scans: runs.slice(0, 5),
    };
  }, [bundles, scope]);

  const pending = loading || dataLoading;

  if (!loading && projects.length === 0) {
    return (
      <PageShell title="Dashboard">
        <PageEmptyState
          icon={LayoutDashboard}
          title="Nada para agregar ainda"
          description="Crie um projeto para ver indicadores globais."
          action={
            <Button render={<Link to="/projects" />}>
              <FolderKanban />
              Ir para Projetos
            </Button>
          }
        />
      </PageShell>
    );
  }

  const kpis = [
    { label: "Projetos", value: pending ? "…" : String(view.projects) },
    { label: "Ambientes", value: pending ? "…" : String(view.environments) },
    { label: "Abertos", value: pending ? "…" : String(view.open) },
    {
      label: "Bloqueiam CI",
      value: pending ? "…" : String(view.blockers),
      alert: !pending && view.blockers > 0,
    },
    {
      label: "Último scan",
      value: pending
        ? "…"
        : relativeTime(view.latest ? runStamp(view.latest.run) : undefined),
      meta: pending ? undefined : view.latest?.run.status,
    },
  ];

  return (
    <PageShell
      title="Dashboard"
      actions={
        <Select
          items={projectItems}
          value={scope}
          onValueChange={(value) => {
            if (value != null) setScope(value);
          }}
        >
          <SelectTrigger className="min-w-40" aria-label="Projeto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectGroup>
              {projectItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      }
    >
      {dataError ? (
        <p className="mb-4 text-sm text-destructive">{dataError}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader>
              <CardDescription>{kpi.label}</CardDescription>
              <CardTitle
                className={cn(
                  "text-2xl font-semibold tracking-tight tabular-nums",
                  kpi.alert && "text-destructive",
                )}
              >
                {kpi.value}
              </CardTitle>
              {kpi.meta ? (
                <p className="mt-2 text-xs text-muted-foreground">{kpi.meta}</p>
              ) : null}
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid items-start gap-3 sm:grid-cols-2">
        <Breakdown2
          categories={view.byProject.map((project, index) => ({
            color: PROJECT_COLORS[index % PROJECT_COLORS.length]!,
            key: project.id,
            label: project.label,
          }))}
          description="Participação de cada projeto nos findings abertos"
          groupLabel="Severidade"
          groups={SEVERITY_LEVELS.map((level) => ({
            label: level,
            values: Object.fromEntries(
              view.byProject.map((project) => [
                project.id,
                pending ? 0 : (project.values[level] ?? 0),
              ]),
            ),
          }))}
          highlight={view.byProject[0]?.id ?? ""}
          title="Severidade"
        />
        <Breakdown2
          categories={SEVERITY_CATEGORIES}
          description="Mix de severidade dos findings abertos"
          groupLabel="Projeto"
          groups={
            pending
              ? view.byProject.map((row) => ({
                  label: row.label,
                  values: {},
                }))
              : view.byProject
          }
          highlight={Severity.CRITICAL}
          title="Por projeto"
        />
      </div>

      <section className="mt-6">
        <h3 className="mb-3 text-sm font-medium">Últimos scans</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Projeto</TableHead>
              <TableHead>Ambiente</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Findings</TableHead>
              <TableHead className="text-right">Quando</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.scans.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  {pending ? "Carregando…" : "Nenhum scan ainda."}
                </TableCell>
              </TableRow>
            ) : (
              view.scans.map(({ run, projectName, environmentName }) => (
                <TableRow key={run.id}>
                  <TableCell className="font-medium">{projectName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {environmentName}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-xs font-semibold",
                        run.status === "FAILED" || run.status === "CANCELLED"
                          ? "bg-destructive/15 text-destructive"
                          : run.status === "COMPLETED"
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {run.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {run.findingsCount}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {relativeTime(runStamp(run))}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </PageShell>
  );
}
