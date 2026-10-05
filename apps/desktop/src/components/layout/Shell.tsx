import { Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useProjectStore } from "@/stores/project";

function parseProjectId(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match?.[1] ?? null;
}

export function Shell() {
  const location = useLocation();
  const projects = useProjectStore((s) => s.projects);
  const projectId = parseProjectId(location.pathname);
  const project = projectId
    ? projects.find((p) => p.id === projectId)
    : undefined;

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1 h-4" />
            <span className="truncate text-sm text-muted-foreground">
              {project ? (
                <>
                  Sentinel
                  <span className="mx-1.5 text-border">/</span>
                  <span className="text-foreground">{project.name}</span>
                </>
              ) : (
                "Sentinel"
              )}
            </span>
          </header>
          <main className="flex-1 px-8 py-8">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
