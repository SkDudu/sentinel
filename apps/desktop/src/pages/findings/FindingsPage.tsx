import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Bug, FolderKanban, Filter } from "lucide-react";
import {
  FindingStatus,
  Severity,
  type Finding,
  type HttpRequest,
  type HttpResponse,
} from "@sw/core";
import { toJsonReport, toSarifReport } from "@sw/findings";
import { api } from "@/services/api";
import { useProjectStore } from "@/stores/project";
import { Button } from "@/components/ui/button";
import { PageEmptyState } from "@/components/layout/page-empty-state";
import { PageShell } from "@/components/layout/page-shell";

function formatBody(body: unknown): string {
  if (body === undefined) return "(vazio)";
  if (typeof body === "string") return body || "(vazio)";
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function HttpEvidence({
  request,
  response,
}: {
  request?: HttpRequest;
  response?: HttpResponse;
}) {
  if (!request && !response) {
    return (
      <p className="mt-3 text-xs text-[var(--muted-foreground)]">
        Sem evidência HTTP persistida para este finding.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--line)] pt-3">
      {request && (
        <div>
          <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            Request
          </h4>
          <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-[var(--bg)] px-3 py-2 font-mono text-xs whitespace-pre-wrap">
            {`${request.method} ${request.url}\n`}
            {Object.entries(request.headers ?? {})
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n")}
            {request.body !== undefined
              ? `\n\n${formatBody(request.body)}`
              : ""}
          </pre>
        </div>
      )}
      {response && (
        <div>
          <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            Response ({response.status} · {response.durationMs}ms)
          </h4>
          <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-[var(--bg)] px-3 py-2 font-mono text-xs whitespace-pre-wrap">
            {Object.entries(response.headers ?? {})
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n")}
            {response.body !== undefined
              ? `\n\n${formatBody(response.body)}`
              : ""}
          </pre>
        </div>
      )}
    </div>
  );
}

export function FindingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { projects, loadProjects, setActiveProject } = useProjectStore();
  const project = projects.find((p) => p.id === projectId);

  const [findings, setFindings] = useState<Finding[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function refresh(id: string) {
    setLoading(true);
    setError(null);
    try {
      setFindings(await api.listFindings(id));
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
    if (projectId) setActiveProject(projectId);
  }, [projectId, setActiveProject]);

  useEffect(() => {
    if (!projectId) {
      setFindings([]);
      return;
    }
    void refresh(projectId);
  }, [projectId]);

  const filtered = useMemo(() => {
    return findings.filter((finding) => {
      if (severityFilter !== "ALL" && finding.severity !== severityFilter) {
        return false;
      }
      if (statusFilter !== "ALL" && finding.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [findings, severityFilter, statusFilter]);

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

  function onExport(format: "json" | "sarif") {
    if (!project || filtered.length === 0) return;
    const slug = project.name.replace(/[^\w.-]+/g, "_").toLowerCase() || "project";
    if (format === "sarif") {
      downloadJson(`${slug}-findings.sarif.json`, toSarifReport(filtered));
      return;
    }
    downloadJson(`${slug}-findings.json`, toJsonReport(filtered));
  }

  if (!project) {
    return (
      <PageShell title="Findings">
        <PageEmptyState
          icon={FolderKanban}
          title="Nenhum projeto ativo"
          description="Abra um projeto em Projetos para ver findings."
          action={
            <Button render={<Link to="/projects" />}>Ir para Projetos</Button>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Findings"
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={filtered.length === 0}
            onClick={() => onExport("json")}
          >
            Export JSON
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={filtered.length === 0}
            onClick={() => onExport("sarif")}
          >
            Export SARIF
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || findings.length === 0}
            onClick={() => void onInterpret()}
          >
            {busy ? "Interpretando…" : "Interpretar com AI"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refresh(project.id)}
          >
            Atualizar
          </Button>
        </>
      }
    >

      <div className="mb-6 flex flex-wrap gap-3">
        <label className="text-sm">
          Severity
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="ml-2 rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1"
          >
            <option value="ALL">Todas</option>
            {Object.values(Severity).map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="ml-2 rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1"
          >
            <option value="ALL">Todos</option>
            {Object.values(FindingStatus).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <span className="self-end text-xs text-[var(--muted-foreground)]">
          {filtered.length} de {findings.length}
        </span>
      </div>

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
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : findings.length === 0 ? (
        <PageEmptyState
          icon={Bug}
          title="Nenhum finding ainda"
          description="Rode um scan em Scans para gerar findings neste projeto."
          action={
            <Button render={<Link to={`/projects/${project.id}/scans`} />}>
              Ir para Scans
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <PageEmptyState
          icon={Filter}
          title="Nenhum finding com esses filtros"
          description="Ajuste severity/status ou limpe os filtros."
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSeverityFilter("ALL");
                setStatusFilter("ALL");
              }}
            >
              Limpar filtros
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((finding) => {
            const expanded = expandedId === finding.id;
            return (
              <article
                key={finding.id}
                className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-5 py-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded bg-[var(--warn)]/20 px-2 py-0.5 text-xs font-semibold text-[var(--warn)]">
                    {finding.severity}
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    confidence {finding.confidence}%
                  </span>
                  <span className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
                    {finding.status}
                  </span>
                </div>
                <h3 className="mt-2 text-base font-medium">{finding.title}</h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {finding.evidence}
                </p>
                {finding.recommendation && (
                  <p className="mt-2 text-sm">{finding.recommendation}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId(expanded ? null : finding.id)
                    }
                    className="rounded border border-[var(--line)] px-2 py-1 text-xs"
                  >
                    {expanded ? "Ocultar evidência" : "Ver evidência HTTP"}
                  </button>
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
                {expanded && (
                  <HttpEvidence
                    request={finding.request}
                    response={finding.response}
                  />
                )}
              </article>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
