import { useProjectStore } from "@/stores/project";

export function ProjectsPage() {
  const { projects, activeProjectId, setActiveProject } = useProjectStore();

  return (
    <section className="max-w-4xl">
      <header className="mb-8">
        <h2 className="text-3xl font-semibold tracking-tight">Projects</h2>
        <p className="mt-2 text-[var(--muted)]">
          Ambientes, autenticação e OpenAPI por projeto — troque o target sem
          reescrever testes.
        </p>
      </header>

      <div className="space-y-3">
        {projects.map((project) => {
          const active = project.id === activeProjectId;
          return (
            <button
              key={project.id}
              type="button"
              onClick={() => setActiveProject(project.id)}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-5 py-4 text-left transition hover:border-[var(--accent-dim)]"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-medium">{project.name}</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {project.description ?? "Sem descrição"}
                  </p>
                </div>
                {active && (
                  <span className="text-xs uppercase tracking-wider text-[var(--accent)]">
                    ativo
                  </span>
                )}
              </div>
              <ul className="mt-4 flex flex-wrap gap-2 font-mono text-xs text-[var(--muted)]">
                {project.environments.map((env) => (
                  <li
                    key={env.id}
                    className="rounded border border-[var(--line)] px-2 py-1"
                  >
                    {env.name}: {env.baseUrl}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
    </section>
  );
}
