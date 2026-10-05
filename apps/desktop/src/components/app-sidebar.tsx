import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bug,
  FolderKanban,
  LayoutDashboard,
  Radar,
  Route,
  Server,
  Settings,
  Shield,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useProjectStore } from "@/stores/project";

const globalLinks = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/projects", label: "Projetos", icon: FolderKanban },
  { to: "/settings", label: "Configurações", icon: Settings },
] as const;

function projectLinks(projectId: string) {
  return [
    {
      to: `/projects/${projectId}`,
      label: "Dashboard",
      icon: LayoutDashboard,
      end: true,
    },
    {
      to: `/projects/${projectId}/environments`,
      label: "Ambientes",
      icon: Server,
    },
    {
      to: `/projects/${projectId}/endpoints`,
      label: "Endpoints",
      icon: Route,
    },
    {
      to: `/projects/${projectId}/scans`,
      label: "Scans / AI Lab",
      icon: Radar,
    },
    {
      to: `/projects/${projectId}/findings`,
      label: "Findings",
      icon: Bug,
    },
  ] as const;
}

function parseProjectId(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match?.[1] ?? null;
}

function pathActive(pathname: string, to: string, end?: boolean) {
  if (end) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const projects = useProjectStore((s) => s.projects);
  const projectId = parseProjectId(location.pathname);
  const project = projectId
    ? projects.find((p) => p.id === projectId)
    : undefined;
  const inProject = Boolean(projectId);

  const links = inProject && projectId ? projectLinks(projectId) : globalLinks;

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Sentinel"
              className="pointer-events-none"
            >
              <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Shield className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold tracking-tight">
                  Sentinel
                </span>
                <span className="truncate text-xs text-sidebar-foreground/70">
                  {inProject
                    ? (project?.name ?? "Projeto")
                    : "Local workbench"}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {inProject ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Voltar a Projetos"
                    onClick={() => {
                      void navigate("/projects");
                    }}
                  >
                    <ArrowLeft />
                    <span>Projetos</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        <SidebarGroup>
          <SidebarGroupLabel>
            {inProject ? "Projeto" : "App"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {links.map((link) => {
                const end = "end" in link ? Boolean(link.end) : false;
                const isActive = pathActive(location.pathname, link.to, end);
                return (
                  <SidebarMenuItem key={link.to}>
                    <SidebarMenuButton
                      tooltip={link.label}
                      isActive={isActive}
                      render={<NavLink to={link.to} end={end} />}
                    >
                      <link.icon />
                      <span>{link.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {inProject ? (
          <SidebarGroup>
            <SidebarGroupLabel>App</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Configurações"
                    isActive={pathActive(location.pathname, "/settings")}
                    render={<NavLink to="/settings" />}
                  >
                    <Settings />
                    <span>Configurações</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
