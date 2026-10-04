import { useEffect, useState } from "react";
import { FindingStatus, type Finding } from "@sw/core";
import { api } from "@/services/api";
import { useProjectStore } from "@/stores/project";

export function FindingsPage() {
  const { projects, activeProjectId, loadProjects } = useProjectStore();
  const project = projects.find((p) => p.id === activeProjectId);

  const [findings, setFindings] = useState<Finding[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [interpretation, setInterpretation] = useState<string | null>(null);

  async function refresh(projectId: string) {
    setLoading(true);
    setError(null);
    try {
      setFindings(await api.listFindings(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!activeProjectId) {
      setFindings([]);
      return;
    }
    void refresh(activeProjectId);
  }, [activeProjectId]);

  async function onStatus(id: string, status: Finding["status"]) {
    try {
      const updated = await api.updateFindingStatus(id, status);
      setFindings((prev) => prev.map((f) => (f.id === id ? updated : f)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar");
    }
  }

  async function onInterpret() {
    if (!project) return;
    setBusy(true);
    setError(null);
    setInterpretation(null);
    try {
      const result = await api.interpretFindings({ projectId: project.id });
      setInterpretation(result.interpretation);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Interpretação AI falhou",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!project) {
    return (
      <section className="max-w-4xl">
        <h2 className="text-3xl font-semibold tracking-tight">Findings</h2>
        <p className="mt-4 text-sm text-[var(--muted)]">
          Selecione um projeto ativo em Projects.
        </p>
      </section>
    );
  }

  return (
    <section className="max-w-4xl">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Findings</h2>
          <p className="mt-2 text-[var(--muted)]">
            Severity + confidence. Status: OPEN → CONFIRMED / FALSE_POSITIVE /
            RESOLVED / IGNORED.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || findings.length === 0}
            onClick={() => void onInterpret()}
            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {busy ? "Interpretando…" : "Interpretar com AI"}
          </button>
          <button
            type="button"
            onClick={() => void refresh(project.id)}
            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
          >
            Atualizar
          </button>
        </div>
      </header>

      {error && (
        <p className="mb-4 rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {interpretation && (
        <div className="mb-6 whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[var(--panel)] px-5 py-4 text-sm">
          {interpretation}
        </div>
      )}

      {loading && findings.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Carregando…</p>
      ) : findings.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Nenhum finding ainda. Rode um scan em Scans.
        </p>
      ) : (
        <div className="space-y-3">
          {findings.map((finding) => (
            <article
              key={finding.id}
              className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-5 py-4"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded bg-[var(--warn)]/20 px-2 py-0.5 text-xs font-semibold text-[var(--warn)]">
                  {finding.severity}
                </span>
                <span className="text-xs text-[var(--muted)]">
                  confidence {finding.confidence}%
                </span>
                <span className="text-xs uppercase tracking-wider text-[var(--muted)]">
                  {finding.status}
                </span>
              </div>
              <h3 className="mt-2 text-base font-medium">{finding.title}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {finding.evidence}
              </p>
              {finding.recommendation && (
                <p className="mt-2 text-sm">{finding.recommendation}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  Object.values(FindingStatus) as Finding["status"][]
                ).map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={finding.status === status}
                    onClick={() => void onStatus(finding.id, status)}
                    className="rounded border border-[var(--line)] px-2 py-1 text-xs disabled:opacity-40"
                  >
                    {status}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
