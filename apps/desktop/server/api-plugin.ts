import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { AuthType, FindingStatus } from "@sw/core";
import { parseOpenApi } from "@sw/api-parser";
import {
  EncryptedFileSecretStore,
  environmentSecretRef,
} from "@sw/auth";
import {
  createSqliteDb,
  EndpointRepository,
  EnvironmentRepository,
  FindingRepository,
  ProjectRepository,
  TestRunRepository,
  type SqliteHandle,
} from "@sw/database";
import { runProjectScan } from "./scan.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "..", "..", "data");
const defaultDbPath = join(dataDir, "sentinel.db");

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

function sendJson(res: ServerResponse, status: number, body?: unknown) {
  res.statusCode = status;
  if (status === 204 || body === undefined) {
    res.end();
    return;
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function notFound(res: ServerResponse) {
  sendJson(res, 404, { error: "Not found" });
}

function parseAuthType(value: unknown) {
  if (typeof value !== "string") return AuthType.NONE;
  return (Object.values(AuthType) as string[]).includes(value)
    ? (value as (typeof AuthType)[keyof typeof AuthType])
    : AuthType.NONE;
}

function parseFindingStatus(value: unknown) {
  if (typeof value !== "string") return null;
  return (Object.values(FindingStatus) as string[]).includes(value)
    ? (value as (typeof FindingStatus)[keyof typeof FindingStatus])
    : null;
}

export function sentinelApiPlugin(dbPath = defaultDbPath): Plugin {
  let handle: SqliteHandle | undefined;

  return {
    name: "sentinel-api",
    configureServer(server) {
      handle = createSqliteDb(dbPath);
      const secrets = new EncryptedFileSecretStore(dataDir);
      const projects = new ProjectRepository(handle.db);
      const environments = new EnvironmentRepository(handle.db);
      const endpoints = new EndpointRepository(handle.db);
      const findings = new FindingRepository(handle.db);
      const runs = new TestRunRepository(handle.db);

      server.httpServer?.once("close", () => {
        handle?.close();
        handle = undefined;
      });

      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/")) {
          next();
          return;
        }

        try {
          const method = req.method ?? "GET";
          const path = url.split("?")[0] ?? "";

          if (path === "/api/health" && method === "GET") {
            sendJson(res, 200, { ok: true });
            return;
          }

          if (path === "/api/projects" && method === "GET") {
            const list = await projects.list();
            const enriched = await Promise.all(
              list.map(async (project) => ({
                ...project,
                environments: await Promise.all(
                  project.environments.map(async (environment) => ({
                    ...environment,
                    secretConfigured: environment.secretRef
                      ? await secrets.has(environment.secretRef)
                      : false,
                  })),
                ),
              })),
            );
            sendJson(res, 200, enriched);
            return;
          }

          if (path === "/api/projects" && method === "POST") {
            const body = await readJson<{ name?: string; description?: string }>(
              req,
            );
            if (!body.name?.trim()) {
              sendJson(res, 400, { error: "name is required" });
              return;
            }
            sendJson(
              res,
              201,
              await projects.create({
                name: body.name,
                description: body.description,
              }),
            );
            return;
          }

          const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
          if (projectMatch) {
            const id = decodeURIComponent(projectMatch[1]!);

            if (method === "GET") {
              const project = await projects.getById(id);
              if (!project) return notFound(res);
              sendJson(res, 200, project);
              return;
            }

            if (method === "PATCH") {
              const body = await readJson<{
                name?: string;
                description?: string | null;
              }>(req);
              const updated = await projects.update(id, body);
              if (!updated) return notFound(res);
              sendJson(res, 200, updated);
              return;
            }

            if (method === "DELETE") {
              const existing = await projects.getById(id);
              if (!existing) return notFound(res);
              for (const environment of existing.environments) {
                if (environment.secretRef) {
                  await secrets.delete(environment.secretRef);
                }
              }
              if (!(await projects.delete(id))) return notFound(res);
              sendJson(res, 204);
              return;
            }
          }

          const projectEnvsMatch = path.match(
            /^\/api\/projects\/([^/]+)\/environments$/,
          );
          if (projectEnvsMatch) {
            const projectId = decodeURIComponent(projectEnvsMatch[1]!);

            if (method === "GET") {
              if (!(await projects.getById(projectId))) return notFound(res);
              sendJson(res, 200, await environments.listByProject(projectId));
              return;
            }

            if (method === "POST") {
              const body = await readJson<{
                name?: string;
                baseUrl?: string;
                authType?: string;
                secretRef?: string;
                headers?: Record<string, string>;
                productionSafetyMode?: boolean;
              }>(req);

              if (!body.name?.trim() || !body.baseUrl?.trim()) {
                sendJson(res, 400, { error: "name and baseUrl are required" });
                return;
              }

              try {
                sendJson(
                  res,
                  201,
                  await environments.create({
                    projectId,
                    name: body.name,
                    baseUrl: body.baseUrl,
                    authType: parseAuthType(body.authType),
                    secretRef: body.secretRef,
                    headers: body.headers,
                    productionSafetyMode: body.productionSafetyMode,
                  }),
                );
              } catch (error) {
                sendJson(res, 404, {
                  error: error instanceof Error ? error.message : "Not found",
                });
              }
              return;
            }
          }

          const envMatch = path.match(/^\/api\/environments\/([^/]+)$/);
          if (envMatch) {
            const id = decodeURIComponent(envMatch[1]!);

            if (method === "PATCH") {
              const body = await readJson<{
                name?: string;
                baseUrl?: string;
                authType?: string;
                secretRef?: string | null;
                headers?: Record<string, string>;
                productionSafetyMode?: boolean;
              }>(req);
              const updated = await environments.update(id, {
                ...body,
                authType: body.authType
                  ? parseAuthType(body.authType)
                  : undefined,
              });
              if (!updated) return notFound(res);
              sendJson(res, 200, updated);
              return;
            }

            if (method === "DELETE") {
              const existing = await environments.getById(id);
              if (!existing) return notFound(res);
              if (existing.secretRef) {
                await secrets.delete(existing.secretRef);
              }
              if (!(await environments.delete(id))) return notFound(res);
              sendJson(res, 204);
              return;
            }
          }

          const secretMatch = path.match(
            /^\/api\/environments\/([^/]+)\/secret$/,
          );
          if (secretMatch) {
            const id = decodeURIComponent(secretMatch[1]!);
            const environment = await environments.getById(id);
            if (!environment) return notFound(res);
            const ref =
              environment.secretRef ?? environmentSecretRef(environment.id);

            if (!environment.secretRef) {
              await environments.update(id, { secretRef: ref });
            }

            if (method === "GET") {
              sendJson(res, 200, {
                configured: await secrets.has(ref),
                secretRef: ref,
              });
              return;
            }

            if (method === "PUT") {
              const body = await readJson<{ secret?: string }>(req);
              if (!body.secret?.trim()) {
                sendJson(res, 400, { error: "secret is required" });
                return;
              }
              await secrets.set(ref, body.secret.trim());
              sendJson(res, 200, { configured: true });
              return;
            }

            if (method === "DELETE") {
              await secrets.delete(ref);
              sendJson(res, 204);
              return;
            }
          }

          const endpointsMatch = path.match(
            /^\/api\/projects\/([^/]+)\/endpoints$/,
          );
          if (endpointsMatch) {
            const projectId = decodeURIComponent(endpointsMatch[1]!);
            if (!(await projects.getById(projectId))) return notFound(res);

            if (method === "GET") {
              sendJson(res, 200, await endpoints.listByProject(projectId));
              return;
            }
          }

          const importMatch = path.match(
            /^\/api\/projects\/([^/]+)\/openapi\/import$/,
          );
          if (importMatch && method === "POST") {
            const projectId = decodeURIComponent(importMatch[1]!);
            if (!(await projects.getById(projectId))) return notFound(res);

            const body = await readJson<{ document?: unknown }>(req);
            if (!body.document) {
              sendJson(res, 400, { error: "document is required" });
              return;
            }

            try {
              const parsed = parseOpenApi(body.document, projectId);
              const saved = await endpoints.replaceOpenApiEndpoints(
                projectId,
                parsed,
              );
              sendJson(res, 201, {
                imported: saved.filter((e) => e.source === "openapi").length,
                endpoints: saved,
              });
            } catch (error) {
              sendJson(res, 400, {
                error:
                  error instanceof Error
                    ? error.message
                    : "Invalid OpenAPI document",
              });
            }
            return;
          }

          const findingsMatch = path.match(
            /^\/api\/projects\/([^/]+)\/findings$/,
          );
          if (findingsMatch && method === "GET") {
            const projectId = decodeURIComponent(findingsMatch[1]!);
            if (!(await projects.getById(projectId))) return notFound(res);
            sendJson(res, 200, await findings.listByProject(projectId));
            return;
          }

          const findingStatusMatch = path.match(
            /^\/api\/findings\/([^/]+)\/status$/,
          );
          if (findingStatusMatch && method === "PATCH") {
            const id = decodeURIComponent(findingStatusMatch[1]!);
            const body = await readJson<{ status?: string }>(req);
            const status = parseFindingStatus(body.status);
            if (!status) {
              sendJson(res, 400, { error: "invalid status" });
              return;
            }
            const updated = await findings.updateStatus(id, status);
            if (!updated) return notFound(res);
            sendJson(res, 200, updated);
            return;
          }

          const runsMatch = path.match(/^\/api\/projects\/([^/]+)\/runs$/);
          if (runsMatch && method === "GET") {
            const projectId = decodeURIComponent(runsMatch[1]!);
            if (!(await projects.getById(projectId))) return notFound(res);
            sendJson(res, 200, await runs.listByProject(projectId));
            return;
          }

          if (path === "/api/scans" && method === "POST") {
            const body = await readJson<{
              projectId?: string;
              environmentId?: string;
              endpointIds?: string[];
              bearerToken?: string;
            }>(req);

            if (!body.projectId || !body.environmentId) {
              sendJson(res, 400, {
                error: "projectId and environmentId are required",
              });
              return;
            }

            try {
              const result = await runProjectScan(
                {
                  projectId: body.projectId,
                  environmentId: body.environmentId,
                  endpointIds: body.endpointIds,
                  bearerToken: body.bearerToken,
                },
                { projects, environments, endpoints, findings, runs },
                secrets,
              );
              sendJson(res, 201, result);
            } catch (error) {
              sendJson(res, 400, {
                error: error instanceof Error ? error.message : "Scan failed",
              });
            }
            return;
          }

          notFound(res);
        } catch (error) {
          sendJson(res, 500, {
            error: error instanceof Error ? error.message : "Internal error",
          });
        }
      });
    },
  };
}
