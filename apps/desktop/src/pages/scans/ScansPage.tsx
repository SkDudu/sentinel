import { useEffect, useMemo, useState } from "react";
import type { Endpoint, ScanRun, TestCase, TestPersona } from "@sw/core";
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

  const [aiCases, setAiCases] = useState<TestCase[]>([]);
  const [rejectedAi, setRejectedAi] = useState<
    Array<{ id: string; name: string; reason: string }>
  >([]);
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [genMode, setGenMode] = useState<string | null>(null);
  const [personas, setPersonas] = useState<TestPersona[]>([]);
  const [personaName, setPersonaName] = useState("");
  const [personaFieldsJson, setPersonaFieldsJson] = useState(
    '{\n  "email": "edge@example.com",\n  "role": "user"\n}',
  );

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
    void api.listPersonas(project.id).then(setPersonas);
    setAiCases([]);
    setApproved({});
    setRejectedAi([]);
    setGenMode(null);
  }, [project]);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([id]) => id),
    [selected],
  );

  const approvedCases = useMemo(
    () => aiCases.filter((c) => approved[c.id]),
    [aiCases, approved],
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

  async function onGenerateAi() {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.generateAiCases({
        projectId: project.id,
        endpointIds: selectedIds,
        allowPersonaSeed: true,
      });
      setAiCases(result.cases);
      setRejectedAi(result.rejected);
      setGenMode(result.mode);
      const next: Record<string, boolean> = {};
      for (const c of result.cases) next[c.id] = false;
      setApproved(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Geração AI falhou");
    } finally {
      setBusy(false);
    }
  }

  async function onRunApprovedAi() {
    if (!project || !environmentId || approvedCases.length === 0) return;
    setBusy(true);
    setError(null);
    setLastResult(null);
    try {
      const stamped = approvedCases.map((c) => ({
        ...c,
        tags: [...c.tags.filter((t) => t !== "needs-review"), "approved"],
      }));
      const result = await api.runScan({
        projectId: project.id,
        environmentId,
        endpointIds: selectedIds,
        bearerToken: bearerToken || undefined,
        approvedAiCases: stamped,
        aiOnly: true,
      });
      setLastResult(
        `AI Lab: ${result.totalCases} casos aprovados, ${result.findings.length} findings.`,
      );
      setRuns(await api.listRuns(project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan AI falhou");
    } finally {
      setBusy(false);
    }
  }

  async function onAddPersona() {
    if (!project || !personaName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const fields = JSON.parse(personaFieldsJson) as Record<string, unknown>;
      await api.upsertPersona(project.id, {
        name: personaName.trim(),
        fields,
        tags: ["custom"],
      });
      setPersonas(await api.listPersonas(project.id));
      setPersonaName("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao salvar persona",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onDeletePersona(id: string) {
    if (!project) return;
    setBusy(true);
    try {
      await api.deletePersona(project.id, id);
      setPersonas(await api.listPersonas(project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao apagar persona");
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
          Casos determinísticos + AI Test Lab (gerar → revisar → só aprovados).
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
          Override de token (opcional — só desta execução; senão usa o vault do
          ambiente)
          <input
            type="password"
            value={bearerToken}
            onChange={(e) => setBearerToken(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-xs"
            placeholder="deixe vazio para usar secret salvo"
          />
        </label>
        {project.environments.find((e) => e.id === environmentId)
          ?.secretConfigured && (
          <p className="text-xs text-[var(--accent)]">
            Secret configurado no vault para este ambiente.
          </p>
        )}

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

      <div className="mb-6 space-y-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
        <div>
          <h3 className="text-lg font-medium">AI Test Lab</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Gera casos (Ollama ou seed de personas), review gate obrigatório,
            safety filter no servidor. Nenhum caso AI roda sem aprovação.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || selectedIds.length === 0}
            onClick={() => void onGenerateAi()}
            className="rounded-md border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-50"
          >
            Gerar casos AI
          </button>
          <button
            type="button"
            disabled={
              busy || !environmentId || approvedCases.length === 0
            }
            onClick={() => void onRunApprovedAi()}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#062016] disabled:opacity-50"
          >
            Run aprovados ({approvedCases.length})
          </button>
        </div>

        {genMode && (
          <p className="text-xs text-[var(--muted)]">
            Modo: {genMode}
            {rejectedAi.length > 0
              ? ` · ${rejectedAi.length} rejeitados pelo safety filter`
              : ""}
          </p>
        )}

        {aiCases.length > 0 && (
          <ul className="max-h-72 space-y-2 overflow-auto">
            {aiCases.map((testCase) => (
              <li
                key={testCase.id}
                className="rounded border border-[var(--line)] px-3 py-2"
              >
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={Boolean(approved[testCase.id])}
                    onChange={() =>
                      setApproved((prev) => ({
                        ...prev,
                        [testCase.id]: !prev[testCase.id],
                      }))
                    }
                  />
                  <span>
                    <span className="font-medium">{testCase.name}</span>
                    {testCase.description && (
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">
                        {testCase.description}
                      </span>
                    )}
                    <code className="mt-1 block whitespace-pre-wrap font-mono text-[10px] text-[var(--muted)]">
                      {JSON.stringify(testCase.mutations, null, 2)}
                    </code>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {rejectedAi.length > 0 && (
          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-[var(--muted)]">
              Rejeitados (safety)
            </p>
            <ul className="space-y-1 text-xs text-[var(--danger)]">
              {rejectedAi.map((item) => (
                <li key={item.id}>
                  {item.name}: {item.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="border-t border-[var(--line)] pt-4">
          <p className="mb-2 text-sm font-medium">Personas</p>
          <ul className="mb-3 space-y-1">
            {personas.map((persona) => (
              <li
                key={persona.id}
                className="flex items-center justify-between gap-2 rounded border border-[var(--line)] px-3 py-2 text-sm"
              >
                <span>
                  {persona.name}
                  <span className="ml-2 text-xs text-[var(--muted)]">
                    {persona.tags.join(", ")}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDeletePersona(persona.id)}
                  className="text-xs text-[var(--danger)]"
                >
                  Apagar
                </button>
              </li>
            ))}
          </ul>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              Nome
              <input
                value={personaName}
                onChange={(e) => setPersonaName(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              Fields (JSON)
              <textarea
                value={personaFieldsJson}
                onChange={(e) => setPersonaFieldsJson(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-xs"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy || !personaName.trim()}
            onClick={() => void onAddPersona()}
            className="mt-2 rounded-md border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Adicionar persona
          </button>
        </div>
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
