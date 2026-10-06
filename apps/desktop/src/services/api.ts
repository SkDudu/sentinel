import type {
  Endpoint,
  Environment,
  Finding,
  RateLimitConfig,
  ScanRun,
  TestCase,
  TestPersona,
  Variable,
} from "@sw/core";

export type EnvironmentDto = Environment & {
  secretConfigured?: boolean;
};

export interface ProjectDto {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  environments: EnvironmentDto[];
}

export interface AiSettingsDto {
  enabled: boolean;
  kind: string;
  baseUrl: string;
  model: string;
  maxAiCases: number;
  hasApiKey: boolean;
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
    throw new Error(data.error ?? `Request failed (${response.status})`);
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

  importEnvironmentOpenApi: (environmentId: string, document: unknown) =>
    request<{ imported: number; endpoints: Endpoint[] }>(
      `/api/environments/${environmentId}/openapi/import`,
      {
        method: "POST",
        body: JSON.stringify({ document }),
      },
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

  runScan: (
    input: {
      projectId: string;
      environmentId: string;
      endpointIds?: string[];
      bearerToken?: string;
      approvedAiCases?: TestCase[];
      aiOnly?: boolean;
      variables?: Variable[];
      rateLimit?: Partial<RateLimitConfig>;
    },
    init?: { signal?: AbortSignal },
  ) =>
    request<{
      run: ScanRun;
      findings: Finding[];
      endpointsScanned: number;
      totalCases: number;
      variables?: Variable[];
      cancelled?: boolean;
    }>("/api/scans", {
      method: "POST",
      body: JSON.stringify(input),
      signal: init?.signal,
    }),

  getAiSettings: () => request<AiSettingsDto>("/api/ai/settings"),

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
};
