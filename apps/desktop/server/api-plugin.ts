import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { AuthType } from "@sw/core";
import {
  createSqliteDb,
  EnvironmentRepository,
  ProjectRepository,
  type SqliteHandle,
} from "@sw/database";

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultDbPath = join(__dirname, "..", "..", "..", "data", "sentinel.db");

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
  const payload = JSON.stringify(body);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(payload);
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

export function sentinelApiPlugin(dbPath = defaultDbPath): Plugin {
  let handle: SqliteHandle | undefined;

  return {
    name: "sentinel-api",
    configureServer(server) {
      handle = createSqliteDb(dbPath);
      const projects = new ProjectRepository(handle.db);
      const environments = new EnvironmentRepository(handle.db);

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
            sendJson(res, 200, await projects.list());
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
              if (!project) {
                notFound(res);
                return;
              }
              sendJson(res, 200, project);
              return;
            }

            if (method === "PATCH") {
              const body = await readJson<{
                name?: string;
                description?: string | null;
              }>(req);
              const updated = await projects.update(id, body);
              if (!updated) {
                notFound(res);
                return;
              }
              sendJson(res, 200, updated);
              return;
            }

            if (method === "DELETE") {
              const ok = await projects.delete(id);
              if (!ok) {
                notFound(res);
                return;
              }
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
              if (!(await projects.getById(projectId))) {
                notFound(res);
                return;
              }
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
                const created = await environments.create({
                  projectId,
                  name: body.name,
                  baseUrl: body.baseUrl,
                  authType: parseAuthType(body.authType),
                  secretRef: body.secretRef,
                  headers: body.headers,
                  productionSafetyMode: body.productionSafetyMode,
                });
                sendJson(res, 201, created);
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
              if (!updated) {
                notFound(res);
                return;
              }
              sendJson(res, 200, updated);
              return;
            }

            if (method === "DELETE") {
              const ok = await environments.delete(id);
              if (!ok) {
                notFound(res);
                return;
              }
              sendJson(res, 204);
              return;
            }
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
