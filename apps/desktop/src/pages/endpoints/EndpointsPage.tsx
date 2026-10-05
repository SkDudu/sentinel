import { useEffect, useState, type ChangeEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { FolderKanban, Route } from "lucide-react";
import type { Endpoint } from "@sw/core";
import { api } from "@/services/api";
import { useProjectStore } from "@/stores/project";
import { Button } from "@/components/ui/button";
import { PageEmptyState } from "@/components/layout/page-empty-state";
import { PageShell } from "@/components/layout/page-shell";

export function EndpointsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { projects, loadProjects, setActiveProject } = useProjectStore();
  const project = projects.find((p) => p.id === projectId);

  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (projectId) setActiveProject(projectId);
  }, [projectId, setActiveProject]);

  useEffect(() => {
    if (!projectId) {
      setEndpoints([]);
      setSelectedId(null);
      return;
    }
    setLoading(true);
    setError(null);
    void api
      .listEndpoints(projectId)
      .then((items) => {
        setEndpoints(items);
        setSelectedId((current) =>
          current && items.some((item) => item.id === current)
            ? current
            : null,
        );
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Falha ao carregar"),
      )
      .finally(() => setLoading(false));
  }, [projectId]);

  const selected = endpoints.find((endpoint) => endpoint.id === selectedId);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !projectId) return;

    setError(null);
    setImported(null);
    setLoading(true);
    try {
      const text = await file.text();
      const document = JSON.parse(text) as unknown;
      const result = await api.importOpenApi(projectId, document);
      setEndpoints(result.endpoints);
      setImported(result.imported);
      setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import falhou");
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  async function onDelete(endpoint: Endpoint) {
    if (
      !window.confirm(
        `Excluir ${endpoint.method} ${endpoint.path}?`,
      )
    ) {
      return;
    }
    setBusyId(endpoint.id);
    setError(null);
    try {
      await api.deleteEndpoint(endpoint.id);
      setEndpoints((prev) => prev.filter((item) => item.id !== endpoint.id));
      if (selectedId === endpoint.id) setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir");
    } finally {
      setBusyId(null);
    }
  }

  if (!project) {
    return (
      <PageShell title="Endpoints">
        <PageEmptyState
          icon={FolderKanban}
          title="Nenhum projeto ativo"
          description="Abra um projeto em Projetos para importar OpenAPI."
          action={
            <Button render={<Link to="/projects" />}>Ir para Projetos</Button>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell title="Endpoints">

      {error && (
        <p className="mb-4 rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {imported !== null && (
        <p className="mb-4 text-sm text-[var(--primary)]">
          Importados {imported} endpoints do OpenAPI.
        </p>
      )}

      <label className="mb-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel)] px-6 py-10 text-center">
        <span className="text-sm text-[var(--muted-foreground)]">
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
        <PageEmptyState
          icon={Route}
          title="Nenhum endpoint ainda"
          description={
            <>
              Importe um <code>openapi.json</code> acima. Sample em{" "}
              <code>examples/sample-openapi.json</code>.
            </>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <ul className="space-y-2">
            {endpoints.map((endpoint) => {
              const active = endpoint.id === selectedId;
              return (
                <li
                  key={endpoint.id}
                  className={`rounded-lg border bg-[var(--panel)] px-4 py-3 ${
                    active
                      ? "border-[var(--accent)]"
                      : "border-[var(--line)]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedId(active ? null : endpoint.id)
                      }
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-3 font-mono text-sm">
                        <span className="rounded bg-[var(--accent-dim)] px-2 py-0.5 text-xs text-white">
                          {endpoint.method}
                        </span>
                        <span>{endpoint.path}</span>
                        <span className="text-xs uppercase text-[var(--muted-foreground)]">
                          {endpoint.source}
                        </span>
                      </div>
                      {endpoint.summary && (
                        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                          {endpoint.summary}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        {endpoint.parameters.length} parâmetros
                        {endpoint.requestBodySchema
                          ? " · request body"
                          : ""}
                      </p>
                    </button>
                    <button
                      type="button"
                      disabled={busyId === endpoint.id}
                      onClick={() => void onDelete(endpoint)}
                      className="rounded-md border border-[var(--danger)]/40 px-2 py-1 text-xs text-[var(--danger)] disabled:opacity-50"
                    >
                      {busyId === endpoint.id ? "…" : "Excluir"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <aside className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
            {!selected ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                Selecione um endpoint para ver o detalhe mínimo (params /
                schema).
              </p>
            ) : (
              <div className="space-y-3 text-sm">
                <div>
                  <h3 className="font-mono text-base">
                    {selected.method} {selected.path}
                  </h3>
                  {selected.operationId && (
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      operationId: {selected.operationId}
                    </p>
                  )}
                  {selected.tags.length > 0 && (
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      tags: {selected.tags.join(", ")}
                    </p>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                    Parameters
                  </h4>
                  {selected.parameters.length === 0 ? (
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      Nenhum parâmetro.
                    </p>
                  ) : (
                    <ul className="mt-1 space-y-1 font-mono text-xs">
                      {selected.parameters.map((param) => (
                        <li key={`${param.in}:${param.name}`}>
                          {param.in} · {param.name}
                          {param.required ? " *" : ""}
                          {param.schema
                            ? ` · ${JSON.stringify(param.schema)}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                    Request body schema
                  </h4>
                  {selected.requestBodySchema === undefined ? (
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      Sem schema de body.
                    </p>
                  ) : (
                    <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-[var(--bg)] px-3 py-2 font-mono text-xs whitespace-pre-wrap">
                      {JSON.stringify(selected.requestBodySchema, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </PageShell>
  );
}
