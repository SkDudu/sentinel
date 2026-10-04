import { useEffect, useState, type FormEvent } from "react";
import { AuthType } from "@sw/core";
import { useProjectStore } from "@/stores/project";

export function ProjectsPage() {
  const {
    projects,
    activeProjectId,
    loading,
    error,
    loadProjects,
    setActiveProject,
    createProject,
    updateProject,
    deleteProject,
    createEnvironment,
    deleteEnvironment,
  } = useProjectStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [envProjectId, setEnvProjectId] = useState<string | null>(null);
  const [envName, setEnvName] = useState("Development");
  const [envBaseUrl, setEnvBaseUrl] = useState("http://localhost:3000");
  const [envAuthType, setEnvAuthType] = useState<string>(AuthType.NONE);
  const [envSafety, setEnvSafety] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  async function onCreateProject(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      await createProject({
        name,
        description: description || undefined,
      });
      setName("");
      setDescription("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao criar");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateEnvironment(event: FormEvent) {
    event.preventDefault();
    if (!envProjectId) return;
    setFormError(null);
    setBusy(true);
    try {
      await createEnvironment(envProjectId, {
        name: envName,
        baseUrl: envBaseUrl,
        authType: envAuthType,
        productionSafetyMode: envSafety,
      });
      setEnvProjectId(null);
      setEnvName("Development");
      setEnvBaseUrl("http://localhost:3000");
      setEnvAuthType(AuthType.NONE);
      setEnvSafety(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao criar ambiente");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    setBusy(true);
    setFormError(null);
    try {
      await updateProject(editingId, {
        name: editName,
        description: editDescription || null,
      });
      setEditingId(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao atualizar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-4xl">
      <header className="mb-8">
        <h2 className="text-3xl font-semibold tracking-tight">Projects</h2>
        <p className="mt-2 text-[var(--muted)]">
          Persistidos em SQLite local. Ambientes trocam o target sem reescrever
          testes.
        </p>
      </header>

      {(error || formError) && (
        <p className="mb-4 rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {formError ?? error}
        </p>
      )}

      <form
        onSubmit={onCreateProject}
        className="mb-8 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5"
      >
        <h3 className="text-sm font-medium text-[var(--muted)]">Novo projeto</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Nome
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2"
              placeholder="Sharezin"
            />
          </label>
          <label className="block text-sm">
            Descrição
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2"
              placeholder="API principal"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#062016] disabled:opacity-50"
        >
          Criar projeto
        </button>
      </form>

      {loading && projects.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Carregando projetos…</p>
      ) : projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel)] px-6 py-10 text-center text-sm text-[var(--muted)]">
          Nenhum projeto ainda. Crie o primeiro acima.
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => {
            const active = project.id === activeProjectId;
            const editing = editingId === project.id;

            return (
              <article
                key={project.id}
                className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-5 py-4"
              >
                {editing ? (
                  <form onSubmit={onSaveEdit} className="space-y-3">
                    <input
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2"
                    />
                    <input
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2"
                      placeholder="Descrição"
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={busy}
                        className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-[#062016]"
                      >
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setActiveProject(project.id)}
                        className="text-left"
                      >
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-medium">{project.name}</h3>
                          {active && (
                            <span className="text-xs uppercase tracking-wider text-[var(--accent)]">
                              ativo
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          {project.description ?? "Sem descrição"}
                        </p>
                      </button>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(project.id);
                            setEditName(project.name);
                            setEditDescription(project.description ?? "");
                          }}
                          className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEnvProjectId(project.id)}
                          className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs"
                        >
                          + Ambiente
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Excluir projeto "${project.name}" e seus ambientes?`,
                              )
                            ) {
                              void deleteProject(project.id);
                            }
                          }}
                          className="rounded-md border border-[var(--danger)]/40 px-2.5 py-1 text-xs text-[var(--danger)]"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>

                    <ul className="mt-4 space-y-2">
                      {project.environments.length === 0 ? (
                        <li className="text-xs text-[var(--muted)]">
                          Sem ambientes. Adicione Development/Staging.
                        </li>
                      ) : (
                        project.environments.map((env) => (
                          <li
                            key={env.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--line)] px-3 py-2 font-mono text-xs text-[var(--muted)]"
                          >
                            <span>
                              {env.name}: {env.baseUrl}
                              {env.productionSafetyMode ? " · safety" : ""}
                              {" · "}
                              {env.authType}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Remover ambiente "${env.name}"?`,
                                  )
                                ) {
                                  void deleteEnvironment(env.id);
                                }
                              }}
                              className="text-[var(--danger)]"
                            >
                              remover
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  </>
                )}

                {envProjectId === project.id && (
                  <form
                    onSubmit={onCreateEnvironment}
                    className="mt-4 space-y-3 border-t border-[var(--line)] pt-4"
                  >
                    <h4 className="text-sm text-[var(--muted)]">Novo ambiente</h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm">
                        Nome
                        <input
                          required
                          value={envName}
                          onChange={(e) => setEnvName(e.target.value)}
                          className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2"
                        />
                      </label>
                      <label className="block text-sm">
                        Base URL
                        <input
                          required
                          type="url"
                          value={envBaseUrl}
                          onChange={(e) => setEnvBaseUrl(e.target.value)}
                          className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-xs"
                        />
                      </label>
                      <label className="block text-sm">
                        Auth
                        <select
                          value={envAuthType}
                          onChange={(e) => setEnvAuthType(e.target.value)}
                          className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2"
                        >
                          {Object.values(AuthType).map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 pt-6 text-sm">
                        <input
                          type="checkbox"
                          checked={envSafety}
                          onChange={(e) => setEnvSafety(e.target.checked)}
                        />
                        Production Safety Mode
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={busy}
                        className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-[#062016]"
                      >
                        Salvar ambiente
                      </button>
                      <button
                        type="button"
                        onClick={() => setEnvProjectId(null)}
                        className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
