import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

const links = [
  { to: "/", label: "Projects" },
  { to: "/endpoints", label: "Endpoints" },
  { to: "/scans", label: "Scans / AI Lab" },
  { to: "/findings", label: "Findings" },
  { to: "/settings", label: "Settings" },
];

export function Shell() {
  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr]">
      <aside className="border-r border-[var(--line)] bg-[var(--bg-elevated)]/90 px-4 py-6">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            Local
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            Security Workbench
          </h1>
        </div>
        <nav className="flex flex-col gap-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-[var(--accent-dim)] text-white"
                    : "text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--text)]",
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
