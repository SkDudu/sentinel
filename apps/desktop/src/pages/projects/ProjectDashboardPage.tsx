import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Bug, FolderKanban, Radar, Server } from "lucide-react";
import { useProjectStore } from "@/stores/project";
import { Button } from "@/components/ui/button";
import { PageEmptyState } from "@/components/layout/page-empty-state";
import { PageShell } from "@/components/layout/page-shell";

export function ProjectDashboardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { projects, loadProjects, setActiveProject } = useProjectStore();

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (projectId) setActiveProject(projectId);
  }, [projectId, setActiveProject]);

  const project = projects.find((p) => p.id === projectId);

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

  return (
    <PageShell title={project.name}>
      {project.description ? (
        <p className="mb-6 text-sm text-muted-foreground">
          {project.description}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          variant="outline"
          className="h-auto flex-col items-start gap-1 px-4 py-3"
          render={<Link to={`${base}/environments`} />}
        >
          <Server className="size-4 text-muted-foreground" />
          <span className="font-medium">Ambientes</span>
          <span className="text-xs font-normal text-muted-foreground">
            {project.environments.length === 0
              ? "Configure base URL e auth"
              : `${project.environments.length} ambiente${project.environments.length === 1 ? "" : "s"}`}
          </span>
        </Button>
        <Button
          variant="outline"
          className="h-auto flex-col items-start gap-1 px-4 py-3"
          render={<Link to={`${base}/scans`} />}
        >
          <Radar className="size-4 text-muted-foreground" />
          <span className="font-medium">Scans / AI Lab</span>
          <span className="text-xs font-normal text-muted-foreground">
            Execução e histórico
          </span>
        </Button>
        <Button
          variant="outline"
          className="h-auto flex-col items-start gap-1 px-4 py-3"
          render={<Link to={`${base}/findings`} />}
        >
          <Bug className="size-4 text-muted-foreground" />
          <span className="font-medium">Findings</span>
          <span className="text-xs font-normal text-muted-foreground">
            Lista e evidência
          </span>
        </Button>
      </div>
    </PageShell>
  );
}
