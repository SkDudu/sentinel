import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bug,
  Pencil,
  Plus,
  Radar,
  Route,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { FindingStatus } from "@sw/core";
import { api, type ProjectDto } from "@/services/api";
import { useProjectStore } from "@/stores/project";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ProjectEditDialog } from "@/pages/projects/ProjectEditDialog";
import {
  EnvironmentFormDialog,
  type EnvironmentFormValues,
} from "@/pages/projects/EnvironmentFormDialog";

type ProjectStats = {
  endpoints: number;
  openFindings: number;
  recentRuns: number;
};

export function ProjectDetailDialog({
  project,
  open,
  onOpenChange,
  onDelete,
}: {
  project: ProjectDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const updateProject = useProjectStore((s) => s.updateProject);
  const createEnvironment = useProjectStore((s) => s.createEnvironment);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [envOpen, setEnvOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setEditOpen(false);
      setEnvOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !project) {
      setStats(null);
      return;
    }

    let cancelled = false;
    setStatsLoading(true);
    void Promise.all([
      api.listEndpoints(project.id),
      api.listFindings(project.id),
      api.listRuns(project.id),
    ])
      .then(([endpoints, findings, runs]) => {
        if (cancelled) return;
        setStats({
          endpoints: endpoints.length,
          openFindings: findings.filter(
            (f) => f.status === FindingStatus.OPEN,
          ).length,
          recentRuns: runs.length,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setStats({ endpoints: 0, openFindings: 0, recentRuns: 0 });
        }
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, project]);

  function openProject() {
    if (!project) return;
    setActiveProject(project.id);
    onOpenChange(false);
    void navigate(`/projects/${project.id}`);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          {project ? (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8 text-xl">{project.name}</DialogTitle>
                <DialogDescription>
                  {project.description?.trim()
                    ? project.description
                    : "Sem descrição"}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-3 gap-2">
                <StatTile
                  icon={Route}
                  label="Endpoints"
                  value={statsLoading ? "…" : String(stats?.endpoints ?? "—")}
                />
                <StatTile
                  icon={Bug}
                  label="Findings abertos"
                  value={
                    statsLoading ? "…" : String(stats?.openFindings ?? "—")
                  }
                />
                <StatTile
                  icon={Radar}
                  label="Scans"
                  value={statsLoading ? "…" : String(stats?.recentRuns ?? "—")}
                />
              </div>

              <Separator />

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Ambientes</h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEnvOpen(true)}
                  >
                    <Plus />
                    Ambiente
                  </Button>
                </div>
                {project.environments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum ambiente. Adicione Development ou Staging antes de
                    escanear.
                  </p>
                ) : (
                  <ScrollArea className="h-40 rounded-md">
                    <ul className="space-y-2 pr-3">
                      {project.environments.map((env) => (
                        <li
                          key={env.id}
                          className="rounded-lg border border-border px-3 py-2"
                        >
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-sm font-medium">{env.name}</span>
                            {env.productionSafetyMode ? (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                                <ShieldAlert className="size-3" />
                                safety
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                            {env.baseUrl}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Auth {env.authType}
                            {env.secretConfigured
                              ? " · secret ✓"
                              : env.authType !== "NONE"
                                ? " · sem secret"
                                : ""}
                            {Object.keys(env.headers ?? {}).length > 0
                              ? ` · ${Object.keys(env.headers).length} header(s)`
                              : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
              </div>

              <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditOpen(true)}
                  >
                    <Pencil />
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={onDelete}
                  >
                    <Trash2 />
                    Excluir
                  </Button>
                </div>
                <Button type="button" onClick={openProject}>
                  Abrir projeto
                </Button>
              </DialogFooter>
            </>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ProjectEditDialog
        project={project}
        open={editOpen}
        busy={busy}
        onOpenChange={setEditOpen}
        onSubmit={async (values) => {
          if (!project) return;
          setBusy(true);
          try {
            await updateProject(project.id, values);
            setEditOpen(false);
          } finally {
            setBusy(false);
          }
        }}
      />

      <EnvironmentFormDialog
        open={envOpen}
        mode={envOpen ? { kind: "create" } : null}
        busy={busy}
        onOpenChange={setEnvOpen}
        onSubmit={async (values: EnvironmentFormValues) => {
          if (!project) return;
          setBusy(true);
          try {
            await createEnvironment(project.id, values);
            setEnvOpen(false);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Route;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="text-[11px] leading-none">{label}</span>
      </div>
      <p className="mt-1.5 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}
