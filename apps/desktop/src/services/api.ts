import type { Endpoint, Environment, Finding, ScanRun } from "@sw/core";

export interface ProjectDto {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  environments: Environment[];
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
      productionSafetyMode?: boolean;
    },
  ) =>
    request<Environment>(`/api/environments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  deleteEnvironment: (id: string) =>
    request<void>(`/api/environments/${id}`, { method: "DELETE" }),

  listEndpoints: (projectId: string) =>
    request<Endpoint[]>(`/api/projects/${projectId}/endpoints`),

  importOpenApi: (projectId: string, document: unknown) =>
    request<{ imported: number; endpoints: Endpoint[] }>(
      `/api/projects/${projectId}/openapi/import`,
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

  runScan: (input: {
    projectId: string;
    environmentId: string;
    endpointIds?: string[];
    bearerToken?: string;
  }) =>
    request<{
      run: ScanRun;
      findings: Finding[];
      endpointsScanned: number;
      totalCases: number;
    }>("/api/scans", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
