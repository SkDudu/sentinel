import { useEffect, useState, type ChangeEvent } from "react";
import type { Endpoint } from "@sw/core";
import { api } from "@/services/api";
import { useProjectStore } from "@/stores/project";

export function EndpointsPage() {
  const { projects, activeProjectId, loadProjects } = useProjectStore();
  const project = projects.find((p) => p.id === activeProjectId);

  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!activeProjectId) {
      setEndpoints([]);
      return;
    }
    setLoading(true);
    setError(null);
    void api
      .listEndpoints(activeProjectId)
      .then(setEndpoints)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Falha ao carregar"),
      )
      .finally(() => setLoading(false));
  }, [activeProjectId]);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !activeProjectId) return;

    setError(null);
    setImported(null);
    setLoading(true);
    try {
      const text = await file.text();
      const document = JSON.parse(text) as unknown;
      const result = await api.importOpenApi(activeProjectId, document);
      setEndpoints(result.endpoints);
      setImported(result.imported);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import falhou");
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  if (!project) {
    return (
      <section className="max-w-4xl">
        <h2 className="text-3xl font-semibold tracking-tight">Endpoints</h2>
        <p className="mt-4 text-sm text-[var(--muted)]">
          Selecione ou crie um projeto ativo em Projects.
        </p>
      </section>
    );
  }

  return (
    <section className="max-w-4xl">
      <header className="mb-8">
        <h2 className="text-3xl font-semibold tracking-tight">Endpoints</h2>
        <p className="mt-2 text-[var(--muted)]">
          Importe <code className="text-[var(--accent)]">openapi.json</code>{" "}
          para o projeto <strong>{project.name}</strong>.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {imported !== null && (
        <p className="mb-4 text-sm text-[var(--accent)]">
          Importados {imported} endpoints do OpenAPI.
        </p>
      )}

      <label className="mb-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel)] px-6 py-10 text-center">
        <span className="text-sm text-[var(--muted)]">
          {loading ? "Processando…" : "Solte ou clique para escolher openapi.json"}
        </span>
        <input
          type="file"
          accept="application/json,.json"
          className="hidden"
          disabled={loading}
          onChange={onFile}
        />
      </label>

      {endpoints.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Nenhum endpoint ainda. Use o sample em{" "}
          <code>examples/sample-openapi.json</code>.
        </p>
      ) : (
        <ul className="space-y-2">
          {endpoints.map((endpoint) => (
            <li
              key={endpoint.id}
              className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-3 font-mono text-sm">
                <span className="rounded bg-[var(--accent-dim)] px-2 py-0.5 text-xs text-white">
                  {endpoint.method}
                </span>
                <span>{endpoint.path}</span>
                <span className="text-xs uppercase text-[var(--muted)]">
                  {endpoint.source}
                </span>
              </div>
              {endpoint.summary && (
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {endpoint.summary}
                </p>
              )}
              <p className="mt-1 text-xs text-[var(--muted)]">
                {endpoint.parameters.length} parâmetros
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
