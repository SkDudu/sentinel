import type { StepState } from "@/components/dashboardblocks/checklist";
import type { ScanLogEvent } from "@/services/api";

export type ScanStepId =
  | "prepare"
  | "cases"
  | "safety"
  | "execute"
  | "findings";

export type ScanOutcome =
  | "idle"
  | "running"
  | "cancelling"
  | "done"
  | "cancelled"
  | "failed";

export type ScanActivityKind = "info" | "finding" | "done";

export interface ScanActivityItem {
  id: string;
  text: string;
  at: number;
  kind: ScanActivityKind;
}

export interface ScanStep {
  id: ScanStepId;
  title: string;
  description: string;
  state: StepState;
  detail?: string;
}

export type EndpointRunState = "queued" | "running" | "done" | "skipped";

export interface ScanEndpointItem {
  key: string;
  method: string;
  path: string;
  state: EndpointRunState;
  casesExecuted: number;
  casesTotal: number;
  findings: number;
}

export interface ScanEndpointSeed {
  method: string;
  path: string;
}

export interface ScanProgress {
  steps: ScanStep[];
  endpoints: ScanEndpointItem[];
  endpointsTotal: number;
  endpointsDone: number;
  endpointIndex: number;
  casesCompleted: number;
  casesTotal: number;
  findingsCount: number;
  liveLabel: string | null;
  activity: ScanActivityItem[];
  throughput: number[];
  /** 0–1 overall. */
  progress: number;
  outcome: ScanOutcome;
}

function endpointKey(method: string, path: string) {
  return `${method} ${path}`;
}

function seedEndpoints(seeds: ScanEndpointSeed[]): ScanEndpointItem[] {
  return seeds.map((item) => ({
    key: endpointKey(item.method, item.path),
    method: item.method,
    path: item.path,
    state: "queued" as const,
    casesExecuted: 0,
    casesTotal: 0,
    findings: 0,
  }));
}

function upsertEndpoint(
  list: ScanEndpointItem[],
  method: string,
  path: string,
  patch: Partial<ScanEndpointItem>,
): ScanEndpointItem[] {
  const key = endpointKey(method, path);
  const index = list.findIndex((item) => item.key === key);
  if (index < 0) {
    return [
      ...list,
      {
        key,
        method,
        path,
        state: "queued",
        casesExecuted: 0,
        casesTotal: 0,
        findings: 0,
        ...patch,
      },
    ];
  }
  return list.map((item, i) =>
    i === index ? { ...item, ...patch } : item,
  );
}

const STEP_META: Record<
  ScanStepId,
  { title: string; description: string }
> = {
  prepare: {
    title: "Preparar endpoints",
    description: "Contrato do ambiente e seleção",
  },
  cases: {
    title: "Gerar casos",
    description: "Suites determinísticas do registry",
  },
  safety: {
    title: "Safety filter",
    description: "Production Safety Mode e caps",
  },
  execute: {
    title: "Executar requests",
    description: "HTTP via orchestrator",
  },
  findings: {
    title: "Persistir findings",
    description: "Evidência e histórico do run",
  },
};

const STEP_ORDER: ScanStepId[] = [
  "prepare",
  "cases",
  "safety",
  "execute",
  "findings",
];

let activitySeq = 0;

function activity(
  text: string,
  kind: ScanActivityKind = "info",
): ScanActivityItem {
  activitySeq += 1;
  return { id: `a-${activitySeq}`, text, at: Date.now(), kind };
}

function buildSteps(
  states: Record<ScanStepId, StepState>,
  details: Partial<Record<ScanStepId, string>> = {},
): ScanStep[] {
  return STEP_ORDER.map((id) => ({
    id,
    ...STEP_META[id],
    state: states[id],
    detail: details[id],
  }));
}

function overallProgress(p: {
  endpointsDone: number;
  endpointsTotal: number;
  casesCompleted: number;
  casesTotal: number;
  outcome: ScanOutcome;
}): number {
  if (p.outcome === "done") return 1;
  if (p.endpointsTotal <= 0) return 0;
  const done = p.endpointsDone;
  const currentFraction =
    p.casesTotal > 0 ? Math.min(1, p.casesCompleted / p.casesTotal) : 0;
  const units = done + currentFraction;
  return Math.min(0.97, units / p.endpointsTotal);
}

export function createIdleScanProgress(
  endpointCount: number,
  seeds: ScanEndpointSeed[] = [],
): ScanProgress {
  const ready = endpointCount > 0;
  return {
    steps: buildSteps({
      prepare: ready ? "done" : "todo",
      cases: "todo",
      safety: "todo",
      execute: "todo",
      findings: "todo",
    }),
    endpoints: seedEndpoints(seeds),
    endpointsTotal: endpointCount,
    endpointsDone: 0,
    endpointIndex: 0,
    casesCompleted: 0,
    casesTotal: 0,
    findingsCount: 0,
    liveLabel: null,
    activity: [],
    throughput: [],
    progress: 0,
    outcome: "idle",
  };
}

export function beginScanProgress(
  endpointCount: number,
  safetyOn: boolean,
  seeds: ScanEndpointSeed[] = [],
): ScanProgress {
  return {
    steps: buildSteps(
      {
        prepare: "current",
        cases: "todo",
        safety: "todo",
        execute: "todo",
        findings: "todo",
      },
      {
        prepare: endpointCount > 0 ? `${endpointCount} endpoints` : undefined,
        safety: safetyOn ? "Safety ligado" : "Safety off",
      },
    ),
    endpoints: seedEndpoints(seeds),
    endpointsTotal: endpointCount,
    endpointsDone: 0,
    endpointIndex: 0,
    casesCompleted: 0,
    casesTotal: 0,
    findingsCount: 0,
    liveLabel: "Conectando…",
    activity: [activity("Iniciando scan…")],
    throughput: [],
    progress: 0.02,
    outcome: "running",
  };
}

export function reduceScanProgress(
  prev: ScanProgress,
  event: ScanLogEvent,
): ScanProgress {
  if (event.type === "start") {
    const next: ScanProgress = {
      ...prev,
      endpointsTotal: event.endpoints,
      endpointsDone: 0,
      endpointIndex: 0,
      casesCompleted: 0,
      casesTotal: 0,
      findingsCount: 0,
      liveLabel: `Preparando ${event.endpoints} endpoints`,
      activity: [
        ...prev.activity,
        activity(`Scan · ${event.endpoints} endpoints`),
      ].slice(-80),
      throughput: [],
      endpoints: prev.endpoints.map((item) => ({
        ...item,
        state: "queued",
        casesExecuted: 0,
        casesTotal: 0,
        findings: 0,
      })),
      steps: buildSteps(
        {
          prepare: "done",
          cases: "done",
          safety: "done",
          execute: "current",
          findings: "todo",
        },
        {
          prepare: `${event.endpoints} endpoints`,
          cases: "Casos do registry prontos",
          safety: prev.steps.find((s) => s.id === "safety")?.detail,
          execute: "Aguardando primeiro endpoint…",
        },
      ),
      outcome: "running",
    };
    return { ...next, progress: overallProgress(next) };
  }

  if (event.type === "endpoint") {
    const next: ScanProgress = {
      ...prev,
      endpointsTotal: event.total,
      endpointIndex: event.index,
      casesCompleted: 0,
      casesTotal: 0,
      liveLabel: `${event.method} ${event.path}`,
      activity: [
        ...prev.activity,
        activity(
          `→ ${event.method} ${event.path} (${event.index}/${event.total})`,
        ),
      ].slice(-80),
      endpoints: upsertEndpoint(
        prev.endpoints.map((item) =>
          item.state === "running" ? { ...item, state: "done" } : item,
        ),
        event.method,
        event.path,
        { state: "running", casesExecuted: 0, casesTotal: 0, findings: 0 },
      ),
      steps: buildSteps(
        {
          prepare: "done",
          cases: "done",
          safety: "done",
          execute: "current",
          findings: "todo",
        },
        {
          prepare: `${event.total} endpoints`,
          execute: `${event.index}/${event.total} · ${event.method} ${event.path}`,
          safety: prev.steps.find((s) => s.id === "safety")?.detail,
        },
      ),
      outcome: "running",
    };
    return { ...next, progress: overallProgress(next) };
  }

  if (event.type === "case") {
    const next: ScanProgress = {
      ...prev,
      casesCompleted: event.completed,
      casesTotal: event.total,
      findingsCount:
        prev.findingsCount + (event.findings > 0 ? event.findings : 0),
      liveLabel: `${event.method} ${event.path} · ${event.completed}/${event.total} · ${event.name}`,
      activity:
        event.findings > 0
          ? [
              ...prev.activity,
              activity(
                `${event.completed}/${event.total} ${event.name} · ${event.findings} finding${event.findings === 1 ? "" : "s"}`,
                "finding",
              ),
            ].slice(-80)
          : prev.activity,
      endpoints: upsertEndpoint(prev.endpoints, event.method, event.path, {
        state: "running",
        casesExecuted: event.completed,
        casesTotal: event.total,
        findings:
          (prev.endpoints.find(
            (item) => item.key === endpointKey(event.method, event.path),
          )?.findings ?? 0) + (event.findings > 0 ? event.findings : 0),
      }),
      steps: buildSteps(
        {
          prepare: "done",
          cases: "done",
          safety: "done",
          execute: "current",
          findings: "todo",
        },
        {
          prepare: `${prev.endpointsTotal} endpoints`,
          execute: `${event.method} ${event.path} · caso ${event.completed}/${event.total}`,
          safety: prev.steps.find((s) => s.id === "safety")?.detail,
        },
      ),
      outcome: "running",
    };
    return { ...next, progress: overallProgress(next) };
  }

  if (event.type === "persona") {
    return {
      ...prev,
      activity: [
        ...prev.activity,
        activity(
          event.ok
            ? `Persona ${event.name} autenticada`
            : `Persona ${event.name} fora do scan: ${event.error ?? "falha no login"}`,
          event.ok ? "info" : "finding",
        ),
      ].slice(-80),
    };
  }

  // endpoint-done
  const endpointsDone = prev.endpointsDone + 1;
  const next: ScanProgress = {
    ...prev,
    endpointsDone,
    casesCompleted: 0,
    casesTotal: 0,
    findingsCount: prev.findingsCount,
    liveLabel: `fim ${event.method} ${event.path}`,
    activity: [
      ...prev.activity,
      activity(
        `fim ${event.method} ${event.path} · ${event.executed} casos · ${event.findings} findings`,
        event.findings > 0 ? "finding" : "done",
      ),
    ].slice(-80),
    throughput: [...prev.throughput, event.findings].slice(-24),
    endpoints: upsertEndpoint(prev.endpoints, event.method, event.path, {
      state: "done",
      casesExecuted: event.executed,
      findings: event.findings,
    }),
    steps: buildSteps(
      {
        prepare: "done",
        cases: "done",
        safety: "done",
        execute: endpointsDone >= prev.endpointsTotal ? "done" : "current",
        findings: endpointsDone >= prev.endpointsTotal ? "current" : "todo",
      },
      {
        prepare: `${prev.endpointsTotal} endpoints`,
        execute:
          endpointsDone >= prev.endpointsTotal
            ? `${endpointsDone}/${prev.endpointsTotal} concluídos`
            : `${endpointsDone}/${prev.endpointsTotal} · próximo…`,
        findings:
          endpointsDone >= prev.endpointsTotal
            ? "Gravando findings…"
            : undefined,
        safety: prev.steps.find((s) => s.id === "safety")?.detail,
      },
    ),
    outcome: "running",
  };
  return { ...next, progress: overallProgress(next) };
}

export function finishScanProgress(
  prev: ScanProgress,
  outcome: Extract<ScanOutcome, "done" | "cancelled" | "failed">,
  summary: string,
): ScanProgress {
  const allDone = outcome === "done";
  const skipped = outcome === "cancelled" || outcome === "failed";
  return {
    ...prev,
    liveLabel: null,
    progress: allDone ? 1 : prev.progress,
    outcome,
    activity: [
      ...prev.activity,
      activity(summary, allDone ? "done" : "info"),
    ].slice(-80),
    endpoints: prev.endpoints.map((item) =>
      item.state === "queued" || item.state === "running"
        ? {
            ...item,
            state: allDone ? "done" : "skipped",
          }
        : item,
    ),
    steps: buildSteps(
      {
        prepare: "done",
        cases:
          prev.steps.find((s) => s.id === "cases")?.state === "todo"
            ? skipped
              ? "skipped"
              : "done"
            : "done",
        safety: "done",
        execute: allDone
          ? "done"
          : prev.steps.find((s) => s.id === "execute")?.state === "current"
            ? "skipped"
            : (prev.steps.find((s) => s.id === "execute")?.state ?? "skipped"),
        findings: allDone ? "done" : "skipped",
      },
      {
        prepare: `${prev.endpointsTotal} endpoints`,
        execute: `${prev.endpointsDone}/${prev.endpointsTotal || "—"}`,
        findings: summary,
        safety: prev.steps.find((s) => s.id === "safety")?.detail,
      },
    ),
  };
}

export function setScanCancelling(prev: ScanProgress): ScanProgress {
  return {
    ...prev,
    outcome: "cancelling",
    liveLabel: "Cancelando…",
  };
}
