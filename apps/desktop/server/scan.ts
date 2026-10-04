import { AuthType, ScanStatus, type Endpoint, type Environment } from "@sw/core";
import {
  resolveAuthHeaders,
  MemorySecretStore,
  OverlaySecretStore,
  type SecretStore,
  environmentSecretRef,
} from "@sw/auth";
import type {
  EndpointRepository,
  EnvironmentRepository,
  FindingRepository,
  ProjectRepository,
  TestRunRepository,
} from "@sw/database";
import { HttpExecutor } from "@sw/http-client";
import { TestOrchestrator } from "@sw/security-engine";

export interface ScanRequest {
  projectId: string;
  environmentId: string;
  endpointIds?: string[];
  /** Optional one-off override — never written to the vault. */
  bearerToken?: string;
}

export async function runProjectScan(
  input: ScanRequest,
  repos: {
    projects: ProjectRepository;
    environments: EnvironmentRepository;
    endpoints: EndpointRepository;
    findings: FindingRepository;
    runs: TestRunRepository;
  },
  secretStore: SecretStore,
) {
  const project = await repos.projects.getById(input.projectId);
  if (!project) throw new Error("Project not found");

  const environment = await repos.environments.getById(input.environmentId);
  if (!environment || environment.projectId !== input.projectId) {
    throw new Error("Environment not found for project");
  }

  let targetEndpoints = await repos.endpoints.listByProject(input.projectId);
  if (input.endpointIds?.length) {
    const allow = new Set(input.endpointIds);
    targetEndpoints = targetEndpoints.filter((e) => allow.has(e.id));
  }
  if (targetEndpoints.length === 0) {
    throw new Error("No endpoints to scan — import OpenAPI first");
  }

  const authEnv = ensureSecretRef(environment, input.bearerToken);
  const overlay = new MemorySecretStore();
  if (input.bearerToken && authEnv.secretRef) {
    await overlay.set(authEnv.secretRef, input.bearerToken);
  }
  const store = new OverlaySecretStore(secretStore, overlay);
  const authHeaders = await resolveAuthHeaders(authEnv, store);

  const run = await repos.runs.create({
    projectId: input.projectId,
    environmentId: input.environmentId,
  });

  const orchestrator = new TestOrchestrator();
  const executor = new HttpExecutor({
    timeoutMs: environment.productionSafetyMode ? 10_000 : 15_000,
  });

  let totalCases = 0;
  let completedCases = 0;
  const allFindings = [];

  try {
    for (const endpoint of targetEndpoints as Endpoint[]) {
      const result = await orchestrator.run({
        endpoint,
        baseUrl: environment.baseUrl,
        authHeaders,
        executor,
        options: {
          normal: true,
          validationErrors: true,
          edgeCases: true,
          typeConfusion: true,
          boundaryValues: false,
          businessLogic: false,
          aiGenerated: false,
        },
      });

      totalCases += result.cases.length;
      completedCases += result.executed;
      allFindings.push(...result.findings);
    }

    await repos.findings.createMany(allFindings, run.id);
    const completed = await repos.runs.complete(run.id, {
      status: ScanStatus.COMPLETED,
      totalCases,
      completedCases,
      findingsCount: allFindings.length,
    });

    return {
      run: completed ?? run,
      findings: allFindings,
      endpointsScanned: targetEndpoints.length,
      totalCases,
    };
  } catch (error) {
    await repos.runs.complete(run.id, {
      status: ScanStatus.FAILED,
      totalCases,
      completedCases,
      findingsCount: allFindings.length,
    });
    throw error;
  }
}

function ensureSecretRef(
  environment: Environment,
  bearerToken?: string,
): Environment {
  if (environment.secretRef) {
    if (bearerToken && environment.authType === AuthType.NONE) {
      return { ...environment, authType: AuthType.BEARER };
    }
    return environment;
  }

  return {
    ...environment,
    secretRef: environmentSecretRef(environment.id),
    authType:
      bearerToken && environment.authType === AuthType.NONE
        ? AuthType.BEARER
        : environment.authType,
  };
}
