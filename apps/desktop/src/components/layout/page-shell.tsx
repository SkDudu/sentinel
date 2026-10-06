import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Layout padrão de página do Sentinel.
 * Header (título + ações) + corpo. Usar em listagens e workbench.
 */
export function PageShell({
  title,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex w-full min-h-0 flex-1 flex-col", className)}>
      <header className="mb-8 flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
        {actions ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {actions}
          </div>
        ) : null}
      </header>
      <div className="flex min-h-0 w-full flex-1 flex-col">{children}</div>
    </section>
  );
}
