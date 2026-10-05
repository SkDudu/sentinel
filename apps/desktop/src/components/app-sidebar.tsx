import { NavLink, useLocation } from "react-router-dom";
import {
  FolderKanban,
  Route,
  Radar,
  Bug,
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

const links = [
  { to: "/", label: "Projects", icon: FolderKanban, end: true },
  { to: "/endpoints", label: "Endpoints", icon: Route },
  { to: "/scans", label: "Scans / AI Lab", icon: Radar },
  { to: "/findings", label: "Findings", icon: Bug },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function pathActive(pathname: string, to: string, end?: boolean) {
  if (end || to === "/") return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function AppSidebar() {
  const location = useLocation();

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
                  Local workbench
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {links.map((link) => {
                const end = "end" in link ? link.end : false;
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
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
