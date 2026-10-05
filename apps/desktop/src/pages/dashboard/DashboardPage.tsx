import { useEffect } from "react";
import { Link } from "react-router-dom";
import { FolderKanban, LayoutDashboard } from "lucide-react";
import { useProjectStore } from "@/stores/project";
import { Button } from "@/components/ui/button";
import { PageEmptyState } from "@/components/layout/page-empty-state";
import { PageShell } from "@/components/layout/page-shell";

export function DashboardPage() {
  const { projects, loading, loadProjects } = useProjectStore();

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

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

  return (
    <PageShell title="Dashboard">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border px-4 py-3">
          <p className="text-sm text-muted-foreground">Projetos</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {loading ? "…" : projects.length}
          </p>
        </div>
        <div className="rounded-xl border border-border px-4 py-3">
          <p className="text-sm text-muted-foreground">Ambientes</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {loading
              ? "…"
              : projects.reduce((sum, p) => sum + p.environments.length, 0)}
          </p>
        </div>
        <div className="rounded-xl border border-border px-4 py-3">
          <p className="text-sm text-muted-foreground">Findings / scans</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Abra um projeto para ver findings e o último scan.
          </p>
        </div>
      </div>
      <div className="mt-6">
        <Button variant="outline" render={<Link to="/projects" />}>
          Ver projetos
        </Button>
      </div>
    </PageShell>
  );
}
