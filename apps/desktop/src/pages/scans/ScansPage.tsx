import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FolderKanban } from "lucide-react";
import type { Endpoint, ScanRun, TestCase, TestPersona } from "@sw/core";
import { api } from "@/services/api";
import { useProjectStore } from "@/stores/project";
import { Button } from "@/components/ui/button";
import { PageEmptyState } from "@/components/layout/page-empty-state";
import { PageShell } from "@/components/layout/page-shell";

export function ScansPage() {
  const { projects, activeProjectId, loadProjects } = useProjectStore();
  const project = projects.find((p) => p.id === activeProjectId);

  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [runs, setRuns] = useState<ScanRun[]>([]);
  const [environmentId, setEnvironmentId] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bearerToken, setBearerToken] = useState("");
  const [variablesJson, setVariablesJson] = useState(
    '{\n  "userId": "1",\n  "otherUserId": "999999"\n}',
  );
  const [busy, setBusy] = useState(false);
  const [scanPhase, setScanPhase] = useState<
    "idle" | "running" | "cancelling"
  >("idle");
  const [scanAbort, setScanAbort] = useState<AbortController | null>(null);
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
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);

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
    void api
      .getAiCases(project.id)
      .then((stored) => {
        setAiCases(stored.cases);
        const next: Record<string, boolean> = {};
        for (const c of stored.cases) {
          next[c.id] = stored.approvedIds.includes(c.id);
        }
        setApproved(next);
        setRejectedAi(stored.rejected ?? []);
        setGenMode(stored.genMode ?? null);
      })
      .catch(() => {
        setAiCases([]);
        setApproved({});
        setRejectedAi([]);
        setGenMode(null);
      });
  }, [project]);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([id]) => id),
    [selected],
  );

  const approvedCases = useMemo(
    () => aiCases.filter((c) => approved[c.id]),
    [aiCases, approved],
  );

  function parseVariables() {
    const raw = JSON.parse(variablesJson) as Record<string, unknown>;
    return Object.entries(raw).map(([key, value]) => ({
      key,
      value: typeof value === "string" ? value : JSON.stringify(value),
      source: "manual" as const,
    }));
  }

  async function persistAiCases(
    cases: TestCase[],
    approvedMap: Record<string, boolean>,
    extras?: {
      genMode?: string | null;
      rejected?: Array<{ id: string; name: string; reason: string }>;
    },
  ) {
    if (!project) return;
    await api.saveAiCases(project.id, {
      cases,
      approvedIds: Object.entries(approvedMap)
        .filter(([, v]) => v)
        .map(([id]) => id),
      genMode: extras?.genMode ?? genMode,
      rejected: extras?.rejected ?? rejectedAi,
    });
  }

  async function runScanJob(
    input: Parameters<typeof api.runScan>[0],
    successLabel: (result: Awaited<ReturnType<typeof api.runScan>>) => string,
  ) {
    if (!project) return;
    const abort = new AbortController();
    setScanAbort(abort);
    setBusy(true);
    setScanPhase("running");
    setError(null);
    setLastResult(null);
    try {
      const result = await api.runScan(input, { signal: abort.signal });
      if (result.cancelled || result.run.status === "CANCELLED") {
        setLastResult(
          `Scan cancelado: ${result.run.completedCases}/${result.totalCases} casos, ${result.findings.length} findings.`,
        );
      } else {
        setLastResult(successLabel(result));
      }
      setRuns(await api.listRuns(project.id));
    } catch (err) {
      if (abort.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
        setLastResult("Scan cancelado pelo usuário.");
        setRuns(await api.listRuns(project.id));
      } else {
        setError(err instanceof Error ? err.message : "Scan falhou");
        setRuns(await api.listRuns(project.id));
      }
    } finally {
      setBusy(false);
      setScanPhase("idle");
      setScanAbort(null);
    }
  }

  async function onRun() {
    if (!project || !environmentId) return;
    await runScanJob(
      {
        projectId: project.id,
        environmentId,
        endpointIds: selectedIds,
        bearerToken: bearerToken || undefined,
        variables: parseVariables(),
      },
      (result) =>
        `Scan concluído: ${result.endpointsScanned} endpoints, ${result.totalCases} casos, ${result.findings.length} findings.`,
    );
  }

  function onCancelScan() {
    if (!scanAbort) return;
    setScanPhase("cancelling");
    scanAbort.abort();
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
      const next: Record<string, boolean> = {};
      for (const c of result.cases) next[c.id] = false;
      setAiCases(result.cases);
      setRejectedAi(result.rejected);
      setGenMode(result.mode);
      setApproved(next);
      await persistAiCases(result.cases, next, {
        genMode: result.mode,
        rejected: result.rejected,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Geração AI falhou");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleApproved(caseId: string) {
    const next = { ...approved, [caseId]: !approved[caseId] };
    setApproved(next);
    try {
      await persistAiCases(aiCases, next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao persistir aprovação",
      );
    }
  }

  async function onClearAiCases() {
    if (!project) return;
    if (
      !window.confirm(
        "Limpar casos AI salvos deste projeto? Aprovações também serão apagadas.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.clearAiCases(project.id);
      setAiCases([]);
      setApproved({});
      setRejectedAi([]);
      setGenMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao limpar casos");
    } finally {
      setBusy(false);
    }
  }

  async function onRunApprovedAi() {
    if (!project || !environmentId || approvedCases.length === 0) return;
    const stamped = approvedCases.map((c) => ({
      ...c,
      tags: [...c.tags.filter((t) => t !== "needs-review"), "approved"],
    }));
    const stampedIds = new Set(stamped.map((c) => c.id));
    const nextCases = aiCases.map((c) =>
      stampedIds.has(c.id)
        ? (stamped.find((s) => s.id === c.id) ?? c)
        : c,
    );
    setAiCases(nextCases);
    try {
      await persistAiCases(nextCases, approved);
    } catch {
      // scan ainda pode rodar; persistência best-effort
    }
    await runScanJob(
      {
        projectId: project.id,
        environmentId,
        endpointIds: selectedIds,
        bearerToken: bearerToken || undefined,
        approvedAiCases: stamped,
        aiOnly: true,
        variables: parseVariables(),
      },
      (result) =>
        `AI Lab: ${result.totalCases} casos aprovados, ${result.findings.length} findings.`,
    );
  }

  async function onSavePersona() {
    if (!project || !personaName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const fields = JSON.parse(personaFieldsJson) as Record<string, unknown>;
      if (editingPersonaId) {
        const existing = personas.find((p) => p.id === editingPersonaId);
        await api.updatePersona(project.id, editingPersonaId, {
          name: personaName.trim(),
          fields,
          tags: existing?.tags ?? ["custom"],
          description: existing?.description,
        });
      } else {
        await api.upsertPersona(project.id, {
          name: personaName.trim(),
          fields,
          tags: ["custom"],
        });
      }
      setPersonas(await api.listPersonas(project.id));
      setPersonaName("");
      setPersonaFieldsJson(
        '{\n  "email": "edge@example.com",\n  "role": "user"\n}',
      );
      setEditingPersonaId(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao salvar persona",
      );
    } finally {
      setBusy(false);
    }
  }

  function onEditPersona(persona: TestPersona) {
    setEditingPersonaId(persona.id);
    setPersonaName(persona.name);
    setPersonaFieldsJson(JSON.stringify(persona.fields, null, 2));
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
      <PageShell title="Scans">
        <PageEmptyState
          icon={FolderKanban}
          title="Nenhum projeto ativo"
          description="Selecione um projeto em Projects para rodar scans e AI Lab."
          action={
            <Button render={<Link to="/" />}>Ir para Projects</Button>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell title="Scans">

      {error && (
        <p className="mb-4 rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      {scanPhase !== "idle" && (
        <p className="mb-4 text-sm text-[var(--warn)]">
          {scanPhase === "cancelling"
            ? "Cancelando scan…"
            : "Scan em execução…"}
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
        {project.environments.find((e) => e.id === environmentId)
          ?.productionSafetyMode && (
          <p className="text-xs text-[var(--warn)]">
            Production Safety Mode: rate-limit capped (≤5 req, concurrency 1).
          </p>
        )}

        <label className="block text-sm">
          Variáveis do scan (JSON → {"{{userId}}"}, {"{{otherUserId}}"},{" "}
          {"{{token}}"}…)
          <textarea
            value={variablesJson}
            onChange={(e) => setVariablesJson(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-xs"
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

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !environmentId || selectedIds.length === 0}
            onClick={() => void onRun()}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#062016] disabled:opacity-50"
          >
            {scanPhase === "running" ? "Executando…" : "Run scan"}
          </button>
          {scanPhase !== "idle" && (
            <button
              type="button"
              disabled={scanPhase === "cancelling"}
              onClick={onCancelScan}
              className="rounded-md border border-[var(--danger)]/40 px-4 py-2 text-sm text-[var(--danger)] disabled:opacity-50"
            >
              {scanPhase === "cancelling" ? "Cancelando…" : "Cancelar"}
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 space-y-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
        <div>
          <h3 className="text-lg font-medium">AI Test Lab</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Gera casos (Ollama ou seed de personas), review gate obrigatório,
            safety filter no servidor. Aprovações persistem em{" "}
            <code className="text-[var(--accent)]">data/ai-cases/</code>.
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
          {aiCases.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onClearAiCases()}
              className="rounded-md border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-50"
            >
              Limpar casos salvos
            </button>
          )}
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
          {scanPhase !== "idle" && (
            <button
              type="button"
              disabled={scanPhase === "cancelling"}
              onClick={onCancelScan}
              className="rounded-md border border-[var(--danger)]/40 px-4 py-2 text-sm text-[var(--danger)] disabled:opacity-50"
            >
              {scanPhase === "cancelling" ? "Cancelando…" : "Cancelar"}
            </button>
          )}
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
                    onChange={() => void onToggleApproved(testCase.id)}
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
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onEditPersona(persona)}
                    className="text-xs text-[var(--accent)]"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDeletePersona(persona.id)}
                    className="text-xs text-[var(--danger)]"
                  >
                    Apagar
                  </button>
                </div>
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
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !personaName.trim()}
              onClick={() => void onSavePersona()}
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {editingPersonaId ? "Salvar persona" : "Adicionar persona"}
            </button>
            {editingPersonaId && (
              <button
                type="button"
                onClick={() => {
                  setEditingPersonaId(null);
                  setPersonaName("");
                  setPersonaFieldsJson(
                    '{\n  "email": "edge@example.com",\n  "role": "user"\n}',
                  );
                }}
                className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
              >
                Cancelar edição
              </button>
            )}
          </div>
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
    </PageShell>
  );
}
