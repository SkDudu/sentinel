import { useEffect, useMemo, useState } from "react";
import type { Endpoint, ScanRun } from "@sw/core";
import { api } from "@/services/api";
import { useProjectStore } from "@/stores/project";

export function ScansPage() {
  const { projects, activeProjectId, loadProjects } = useProjectStore();
  const project = projects.find((p) => p.id === activeProjectId);

  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [runs, setRuns] = useState<ScanRun[]>([]);
  const [environmentId, setEnvironmentId] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bearerToken, setBearerToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!project) return;
    setEnvironmentId(project.environments[0]?.id ?? "");
    void api.listEndpoints(project.id).then((items) => {
      setEndpoints(items);
      const next: Record<string, boolean> = {};
      for (const item of items) next[item.id] = true;
      setSelected(next);
    });
    void api.listRuns(project.id).then(setRuns);
  }, [project]);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([id]) => id),
    [selected],
  );

  async function onRun() {
    if (!project || !environmentId) return;
    setBusy(true);
    setError(null);
    setLastResult(null);
    try {
      const result = await api.runScan({
        projectId: project.id,
        environmentId,
        endpointIds: selectedIds,
        bearerToken: bearerToken || undefined,
      });
      setLastResult(
        `Scan concluído: ${result.endpointsScanned} endpoints, ${result.totalCases} casos, ${result.findings.length} findings.`,
      );
      setRuns(await api.listRuns(project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan falhou");
    } finally {
      setBusy(false);
    }
  }

  if (!project) {
    return (
      <section className="max-w-4xl">
        <h2 className="text-3xl font-semibold tracking-tight">Scans</h2>
        <p className="mt-4 text-sm text-[var(--muted)]">
          Selecione um projeto ativo em Projects.
        </p>
      </section>
    );
  }

  return (
    <section className="max-w-4xl">
      <header className="mb-8">
        <h2 className="text-3xl font-semibold tracking-tight">Scans</h2>
        <p className="mt-2 text-[var(--muted)]">
          Executa casos determinísticos via Security Engine no ambiente
          escolhido.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      {lastResult && (
        <p className="mb-4 text-sm text-[var(--accent)]">{lastResult}</p>
      )}

      <div className="mb-6 space-y-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
        <label className="block text-sm">
          Ambiente
          <select
            value={environmentId}
            onChange={(e) => setEnvironmentId(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2"
          >
            {project.environments.map((env) => (
              <option key={env.id} value={env.id}>
                {env.name} — {env.baseUrl}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          Bearer token (opcional, só desta execução — não grava no SQLite)
          <input
            type="password"
            value={bearerToken}
            onChange={(e) => setBearerToken(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-xs"
            placeholder="eyJhbGciOi..."
          />
        </label>

        <div>
          <p className="mb-2 text-sm text-[var(--muted)]">
            Endpoints ({selectedIds.length}/{endpoints.length})
          </p>
          {endpoints.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              Importe um OpenAPI em Endpoints primeiro.
            </p>
          ) : (
            <ul className="max-h-56 space-y-1 overflow-auto">
              {endpoints.map((endpoint) => (
                <li key={endpoint.id}>
                  <label className="flex items-center gap-2 rounded border border-[var(--line)] px-3 py-2 font-mono text-xs">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[endpoint.id])}
                      onChange={() =>
                        setSelected((prev) => ({
                          ...prev,
                          [endpoint.id]: !prev[endpoint.id],
                        }))
                      }
                    />
                    <span>
                      {endpoint.method} {endpoint.path}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          disabled={busy || !environmentId || selectedIds.length === 0}
          onClick={() => void onRun()}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#062016] disabled:opacity-50"
        >
          {busy ? "Executando…" : "Run scan"}
        </button>
      </div>

      <div>
        <h3 className="mb-3 text-sm uppercase tracking-wider text-[var(--muted)]">
          Histórico
        </h3>
        {runs.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nenhum scan ainda.</p>
        ) : (
          <ul className="space-y-2">
            {runs.map((run) => (
              <li
                key={run.id}
                className="rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap gap-3">
                  <span className="font-medium">{run.status}</span>
                  <span className="text-[var(--muted)]">
                    {run.completedCases}/{run.totalCases} casos
                  </span>
                  <span className="text-[var(--muted)]">
                    {run.findingsCount} findings
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-[var(--muted)]">
                  {run.startedAt ?? "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
