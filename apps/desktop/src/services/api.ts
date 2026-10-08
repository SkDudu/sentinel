import type {
  AccessRule,
  Endpoint,
  Environment,
  Finding,
  Flow,
  HttpRequest,
  HttpResponse,
  LoginRecipe,
  PersonaBinding,
  RateLimitConfig,
  Resource,
  ResourceRelation,
  ScanRun,
  TestCase,
  TestCategory,
  TestPersona,
  Variable,
} from "@sw/core";

export type EnvironmentPersonaDto = {
  persona: TestPersona;
  binding: PersonaBinding | null;
  secretConfigured: boolean;
};

export type EnvironmentDto = Environment & {
  secretConfigured?: boolean;
};

export type LoginStepReport = {
  label: string;
  method: string;
  url: string;
  status: number;
  location?: string;
  cookies: string[];
  extracted: string[];
};

export type LoginTestResult = {
  ok: boolean;
  error?: string;
  steps: LoginStepReport[];
  spec?: { url: string; bytes: number };
};

export type RecorderSnapshot = {
  id: string;
  open: boolean;
  steps: Array<{ method: string; url: string; status: number }>;
};

export interface ProjectDto {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  environments: EnvironmentDto[];
}

export type ScanLogEvent =
  | { type: "start"; endpoints: number; runId?: string }
  | {
      type: "endpoint";
      index: number;
      total: number;
      method: string;
      path: string;
    }
  | {
      type: "case";
      method: string;
      path: string;
      name: string;
      completed: number;
      total: number;
      findings: number;
    }
  | {
      type: "endpoint-done";
      method: string;
      path: string;
      executed: number;
      findings: number;
    }
  | {
      type: "persona";
      personaId: string;
      name: string;
      ok: boolean;
      error?: string;
    }
  | {
      type: "flow-step";
      flowId: string;
      stepId: string;
      phase: FlowPhase;
      label: string;
      status: FlowStepStatus;
      message?: string;
    }
  | {
      type: "flow";
      flowId: string;
      name: string;
      status: FlowRunStatus;
      message?: string;
    };

export type FlowPhase = "setup" | "steps" | "teardown";
export type FlowStepStatus = "passed" | "failed" | "error" | "skipped";
export type FlowRunStatus = "passed" | "failed" | "error" | "blocked";

export type FlowRunResultDto = {
  flowId: string;
  name: string;
  status: FlowRunStatus;
  message?: string;
  steps: Array<{
    stepId: string;
    phase: FlowPhase;
    label: string;
    status: FlowStepStatus;
    message?: string;
    request?: HttpRequest;
    response?: HttpResponse;
  }>;
};

export type FlowDto = {
  projectId: string;
  flow: Flow;
  createdAt: string;
  updatedAt: string;
};

export type ScanResult = {
  run: ScanRun;
  findings: Finding[];
  endpointsScanned: number;
  totalCases: number;
  variables?: Variable[];
  flows?: FlowRunResultDto[];
  cancelled?: boolean;
};

export interface AiSettingsDto {
  enabled: boolean;
  kind: string;
  baseUrl: string;
  model: string;
  maxAiCases: number;
  hasApiKey: boolean;
  saved: boolean;
}

async function runScanStream(
  input: {
    projectId: string;
    environmentId: string;
    endpointIds?: string[];
    bearerToken?: string;
    approvedAiCases?: TestCase[];
    aiOnly?: boolean;
    matrix?: boolean;
    matrixOnly?: boolean;
    flowIds?: string[];
    flowsOnly?: boolean;
    categories?: TestCategory[];
    variables?: Variable[];
    rateLimit?: Partial<RateLimitConfig>;
  },
  init?: { signal?: AbortSignal; onEvent?: (event: ScanLogEvent) => void },
): Promise<ScanResult> {
  const response = await fetch("/api/scans", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify(input),
    signal: init?.signal,
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-ndjson")) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    } & ScanResult;
    if (!response.ok) {
      throw new Error(data.error ?? `Request failed (${response.status})`);
    }
    return data;
  }

  if (!response.body) {
    throw new Error("Scan sem stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ScanResult | null = null;

  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as
      | ScanLogEvent
      | { type: "result"; result: ScanResult }
      | { type: "error"; error: string };
    if (event.type === "result") {
      result = event.result;
      return;
    }
    if (event.type === "error") {
      throw new Error(event.error);
    }
    init?.onEvent?.(event);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) consume(line);
  }
  if (buffer.trim()) consume(buffer);

  if (!result) {
    throw new Error("Scan terminou sem resultado");
  }
  return result;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;

  if (!response.ok) {
    throw new Error(data.error ?? "Não foi possível concluir. Tente de novo.");
  }

  return data as T;
}

export const api = {
  listProjects: () => request<ProjectDto[]>("/api/projects"),

  createProject: (input: { name: string; description?: string }) =>
    request<ProjectDto>("/api/projects", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateProject: (
    id: string,
    input: { name?: string; description?: string | null },
  ) =>
    request<ProjectDto>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  deleteProject: (id: string) =>
    request<void>(`/api/projects/${id}`, { method: "DELETE" }),

  createEnvironment: (
    projectId: string,
    input: {
      name: string;
      baseUrl: string;
      authType?: string;
      headers?: Record<string, string>;
      productionSafetyMode?: boolean;
      loginRecipe?: LoginRecipe | null;
    },
  ) =>
    request<Environment>(`/api/projects/${projectId}/environments`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateEnvironment: (
    id: string,
    input: {
      name?: string;
      baseUrl?: string;
      authType?: string;
      headers?: Record<string, string>;
      productionSafetyMode?: boolean;
      loginRecipe?: LoginRecipe | null;
    },
  ) =>
    request<Environment>(`/api/environments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  deleteEnvironment: (id: string) =>
    request<void>(`/api/environments/${id}`, { method: "DELETE" }),

  getEnvironmentSecretStatus: (id: string) =>
    request<{ configured: boolean; secretRef: string }>(
      `/api/environments/${id}/secret`,
    ),

  setEnvironmentSecret: (id: string, secret: string) =>
    request<{ configured: boolean }>(`/api/environments/${id}/secret`, {
      method: "PUT",
      body: JSON.stringify({ secret }),
    }),

  clearEnvironmentSecret: (id: string) =>
    request<void>(`/api/environments/${id}/secret`, { method: "DELETE" }),

  listEndpoints: (projectId: string) =>
    request<Endpoint[]>(`/api/projects/${projectId}/endpoints`),

  listEnvironmentEndpoints: (environmentId: string) =>
    request<Endpoint[]>(`/api/environments/${environmentId}/endpoints`),

  deleteEndpoint: (id: string) =>
    request<void>(`/api/endpoints/${id}`, { method: "DELETE" }),

  testEnvironmentLogin: (environmentId: string) =>
    request<LoginTestResult>(
      `/api/environments/${environmentId}/login/test`,
      { method: "POST" },
    ),

  fetchEnvironmentOpenApi: (environmentId: string) =>
    request<{ imported: number; endpoints: Endpoint[] }>(
      `/api/environments/${environmentId}/openapi/fetch`,
      { method: "POST" },
    ),

  startRecorder: (baseUrl: string) =>
    request<RecorderSnapshot>("/api/recorder/start", {
      method: "POST",
      body: JSON.stringify({ baseUrl }),
    }),

  recorderStatus: (id: string) =>
    request<RecorderSnapshot>(`/api/recorder/${id}`),

  stopRecorder: (id: string) =>
    request<{
      recipe: LoginRecipe;
      secrets: Record<string, string>;
      specCandidates: string[];
    }>(`/api/recorder/${id}/stop`, { method: "POST" }),

  importEnvironmentOpenApi: (environmentId: string, text: string) =>
    request<{ imported: number; endpoints: Endpoint[] }>(
      `/api/environments/${environmentId}/openapi/import`,
      {
        method: "POST",
        body: JSON.stringify({ text }),
      },
    ),

  clearEnvironmentOpenApi: (environmentId: string) =>
    request<{ removed: number }>(
      `/api/environments/${environmentId}/openapi`,
      { method: "DELETE" },
    ),

  listFindings: (projectId: string) =>
    request<Finding[]>(`/api/projects/${projectId}/findings`),

  updateFindingStatus: (id: string, status: Finding["status"]) =>
    request<Finding>(`/api/findings/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  listRuns: (projectId: string) =>
    request<ScanRun[]>(`/api/projects/${projectId}/runs`),

  getEnvironmentLatency: (environmentId: string) =>
    request<{
      points: Array<{
        runId: string;
        startedAt?: string;
        finishedAt?: string;
        sampleCount: number;
        p50: number;
        p95: number;
        p99: number;
      }>;
      headlineMs: number;
      trend: number;
    }>(`/api/environments/${environmentId}/latency`),

  getRunDetail: (runId: string) =>
    request<{
      run: ScanRun;
      findings: Finding[];
      results: {
        passed: number;
        failed: number;
        total: number;
        byTest: Array<{ testId: string; passed: number; failed: number }>;
        items: Array<{
          id: string;
          endpointId?: string;
          testId: string;
          testCaseId: string;
          passed: boolean;
          request?: HttpRequest;
          response?: HttpResponse;
          notes?: string;
          createdAt: string;
        }>;
      };
    }>(`/api/runs/${runId}`),

  runScan: (
    input: {
      projectId: string;
      environmentId: string;
      endpointIds?: string[];
      bearerToken?: string;
      approvedAiCases?: TestCase[];
      aiOnly?: boolean;
      matrix?: boolean;
      matrixOnly?: boolean;
      flowIds?: string[];
      flowsOnly?: boolean;
      categories?: TestCategory[];
      variables?: Variable[];
      rateLimit?: Partial<RateLimitConfig>;
    },
    init?: {
      signal?: AbortSignal;
      onEvent?: (event: ScanLogEvent) => void;
    },
  ) =>
    runScanStream(input, init),

  getAiSettings: () => request<AiSettingsDto>("/api/ai/settings"),

  deleteAiSettings: () =>
    request<AiSettingsDto>("/api/ai/settings", { method: "DELETE" }),

  testAi: (input: {
    kind?: string;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
  }) =>
    request<{ ok: boolean; message: string; models: string[] }>("/api/ai/test", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  saveAiSettings: (input: {
    enabled?: boolean;
    kind?: string;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
    maxAiCases?: number;
  }) =>
    request<AiSettingsDto>("/api/ai/settings", {
      method: "PUT",
      body: JSON.stringify(input),
    }),

  generateAiCases: (input: {
    projectId: string;
    endpointIds?: string[];
    allowPersonaSeed?: boolean;
  }) =>
    request<{
      cases: TestCase[];
      rejected: Array<{ id: string; name: string; reason: string }>;
      mode: "ai" | "persona-seed";
    }>("/api/ai/generate-cases", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  interpretFindings: (input: { projectId: string; findingIds?: string[] }) =>
    request<{ interpretation: string; count: number }>("/api/ai/interpret", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  getAiCases: (projectId: string) =>
    request<{
      cases: TestCase[];
      approvedIds: string[];
      genMode?: string | null;
      rejected?: Array<{ id: string; name: string; reason: string }>;
      updatedAt: string;
    }>(`/api/projects/${projectId}/ai-cases`),

  saveAiCases: (
    projectId: string,
    input: {
      cases: TestCase[];
      approvedIds: string[];
      genMode?: string | null;
      rejected?: Array<{ id: string; name: string; reason: string }>;
    },
  ) =>
    request<{
      cases: TestCase[];
      approvedIds: string[];
      genMode?: string | null;
      rejected?: Array<{ id: string; name: string; reason: string }>;
      updatedAt: string;
    }>(`/api/projects/${projectId}/ai-cases`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),

  clearAiCases: (projectId: string) =>
    request<{
      cases: TestCase[];
      approvedIds: string[];
      updatedAt: string;
    }>(`/api/projects/${projectId}/ai-cases`, { method: "DELETE" }),

  listPersonas: (projectId: string) =>
    request<TestPersona[]>(`/api/projects/${projectId}/personas`),

  upsertPersona: (
    projectId: string,
    input: {
      id?: string;
      name: string;
      description?: string;
      fields: Record<string, unknown>;
      tags?: string[];
      role?: string;
    },
  ) =>
    request<TestPersona>(`/api/projects/${projectId}/personas`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updatePersona: (
    projectId: string,
    personaId: string,
    input: {
      name: string;
      description?: string;
      fields: Record<string, unknown>;
      tags?: string[];
      role?: string;
    },
  ) =>
    request<TestPersona>(
      `/api/projects/${projectId}/personas/${personaId}`,
      {
        method: "PUT",
        body: JSON.stringify(input),
      },
    ),

  deletePersona: (projectId: string, personaId: string) =>
    request<void>(`/api/projects/${projectId}/personas/${personaId}`, {
      method: "DELETE",
    }),

  listEnvironmentPersonas: (environmentId: string) =>
    request<EnvironmentPersonaDto[]>(
      `/api/environments/${environmentId}/personas`,
    ),

  savePersonaBinding: (
    environmentId: string,
    personaId: string,
    input: { authType: string; fixtures: Record<string, string> },
  ) =>
    request<PersonaBinding>(
      `/api/environments/${environmentId}/personas/${encodeURIComponent(personaId)}`,
      { method: "PUT", body: JSON.stringify(input) },
    ),

  deletePersonaBinding: (environmentId: string, personaId: string) =>
    request<void>(
      `/api/environments/${environmentId}/personas/${encodeURIComponent(personaId)}`,
      { method: "DELETE" },
    ),

  setPersonaSecret: (environmentId: string, personaId: string, secret: string) =>
    request<{ configured: boolean }>(
      `/api/environments/${environmentId}/personas/${encodeURIComponent(personaId)}/secret`,
      { method: "PUT", body: JSON.stringify({ secret }) },
    ),

  clearPersonaSecret: (environmentId: string, personaId: string) =>
    request<void>(
      `/api/environments/${environmentId}/personas/${encodeURIComponent(personaId)}/secret`,
      { method: "DELETE" },
    ),

  testPersonaLogin: (environmentId: string, personaId: string) =>
    request<LoginTestResult & { headers?: string[] }>(
      `/api/environments/${environmentId}/personas/${encodeURIComponent(personaId)}/login/test`,
      { method: "POST" },
    ),

  listRelations: (environmentId: string) =>
    request<{ resources: Resource[]; relations: ResourceRelation[] }>(
      `/api/environments/${environmentId}/relations`,
    ),

  listAccessRules: (environmentId: string) =>
    request<{ rules: AccessRule[] }>(`/api/environments/${environmentId}/access-rules`),

  saveAccessRules: (environmentId: string, rules: AccessRule[]) =>
    request<{ rules: AccessRule[] }>(`/api/environments/${environmentId}/access-rules`, {
      method: "PUT",
      body: JSON.stringify({ rules }),
    }),

  suggestAccessRulesFromGraph: (environmentId: string) =>
    request<{ rules: AccessRule[] }>(
      `/api/environments/${environmentId}/access-rules/suggest`,
      { method: "POST" },
    ),

  listFlows: (projectId: string) =>
    request<FlowDto[]>(`/api/projects/${projectId}/flows`),

  getFlow: (projectId: string, flowId: string) =>
    request<FlowDto>(`/api/projects/${projectId}/flows/${encodeURIComponent(flowId)}`),

  createFlow: (projectId: string, flow: Omit<Flow, "id"> & { id?: string }) =>
    request<FlowDto>(`/api/projects/${projectId}/flows`, {
      method: "POST",
      body: JSON.stringify(flow),
    }),

  updateFlow: (projectId: string, flow: Flow) =>
    request<FlowDto>(`/api/projects/${projectId}/flows/${encodeURIComponent(flow.id)}`, {
      method: "PUT",
      body: JSON.stringify(flow),
    }),

  deleteFlow: (projectId: string, flowId: string) =>
    request<void>(`/api/projects/${projectId}/flows/${encodeURIComponent(flowId)}`, {
      method: "DELETE",
    }),

  flowSkeletons: (environmentId: string) =>
    request<Flow[]>(`/api/environments/${environmentId}/flows/skeletons`, {
      method: "POST",
    }),

  suggestAccessWithAi: (environmentId: string) =>
    request<{ rules: AccessRule[]; rejected: AiRejected[] }>("/api/ai/suggest-access", {
      method: "POST",
      body: JSON.stringify({ environmentId }),
    }),

  streamBodyChat: async (
    input: {
      method: string;
      path: string;
      summary?: string;
      requestBodySchema?: unknown;
      messages: Array<{ role: "user" | "assistant"; content: string }>;
    },
    onEvent: (event: string, data: Record<string, unknown>) => void,
  ) => {
    const response = await fetch("/api/ai/body-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok || !response.body) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Não consegui falar com a IA. Tente de novo.");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const consume = (chunk: string) => {
      const event = chunk.match(/^event: (.+)$/m)?.[1];
      const dataLine = chunk.match(/^data: (.+)$/m)?.[1];
      if (!event || !dataLine) return;
      onEvent(event, JSON.parse(dataLine) as Record<string, unknown>);
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) consume(chunk);
    }
    if (buffer.trim()) consume(buffer);
  },

  generateStepBody: (input: {
    method: string;
    path: string;
    summary?: string;
    requestBodySchema?: unknown;
  }) =>
    request<{ body: unknown }>("/api/ai/generate-body", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  suggestFlowsWithAi: (environmentId: string) =>
    request<{ flows: Flow[]; rejected: AiRejected[] }>("/api/ai/suggest-flows", {
      method: "POST",
      body: JSON.stringify({ environmentId }),
    }),
};

export type AiRejected = { item: string; reason: string };
