import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import {
  AiProviderKind,
  AuthType,
  FindingStatus,
  AccessRuleSchema,
  LoginRecipeSchema,
  RelationKindSchema,
  TestCategory,
  type Endpoint,
  type LoginRecipe,
  type ResourceRelation,
  type TestCase,
  type Variable,
} from "@sw/core";
import {
  inferRelations,
  mergeRelations,
  parseOpenApi,
  parseSpecText,
  relationId,
  suggestAccessFromGraph,
} from "@sw/api-parser";
import {
  assertPersonaRecipe,
  createSecretStore,
  environmentSecretRef,
  fetchSpecWithRecipe,
  loginWithRecipe,
  LoginRecipeError,
  personaEnvironment,
  personaSecretRef,
  resolvePersonaAuthHeaders,
} from "@sw/auth";
import {
  startLoginRecording,
  type RecorderHandle,
} from "@sw/login-recorder";
import {
  createSqliteDb,
  EndpointRepository,
  EnvironmentRepository,
  FindingRepository,
  AccessRuleRepository,
  PersonaBindingRepository,
  ProjectRepository,
  RelationRepository,
  TestResultRepository,
  TestRunRepository,
  type SqliteHandle,
} from "@sw/database";
import { HttpExecutor } from "@sw/http-client";
import { runProjectScan, type ScanProgressEvent } from "@sw/scan-runner";
import { createAiClientFromSettings } from "./ai-client.js";
import {
  generateAiCasesForEndpoints,
  interpretProjectFindings,
} from "./ai-lab.js";
import {
  loadAiSettings,
  saveAiSettings,
  toPublicAiSettings,
  type AiSettingsFile,
} from "./ai-settings.js";
import {
  clearAiCases,
  loadAiCases,
  saveAiCases,
} from "./ai-cases-store.js";
import {
  deletePersona,
  listPersonas,
  upsertPersona,
} from "./personas-store.js";

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

/** `undefined` = untouched, `null` = clear. */
function parseLoginRecipe(value: unknown): {
  value?: LoginRecipe | null;
  error?: string;
} {
  if (value === undefined) return {};
  if (value === null) return { value: null };
  const parsed = LoginRecipeSchema.safeParse(value);
  if (!parsed.success) {
    return {
      error: `loginRecipe inválida: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")}`,
    };
  }
  return { value: parsed.data };
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
      const { store: secrets, kind: secretBackend } = createSecretStore({
        dataDir,
        kind: process.env.SENTINEL_SECRET_BACKEND === "keychain"
          ? "keychain"
          : "file",
        preferKeychain: process.env.SENTINEL_SECRET_BACKEND === "keychain",
      });
      // Keychain needs Tauri invoke — without it, factory falls back to file vault.
      void secretBackend;
      const projects = new ProjectRepository(handle.db);
      const environments = new EnvironmentRepository(handle.db);
      const endpoints = new EndpointRepository(handle.db);
      const findings = new FindingRepository(handle.db);
      const runs = new TestRunRepository(handle.db);
      const testResults = new TestResultRepository(handle.db);
      const personaBindings = new PersonaBindingRepository(handle.db);
      const relationsRepo = new RelationRepository(handle.db);
      const accessRulesRepo = new AccessRuleRepository(handle.db);
      const recorders = new Map<string, RecorderHandle>();

      /** Contrato mudou: re-infere grafo (preserva revisão) e reaponta a matriz. */
      const refreshRelations = async (
        environmentId: string,
        contract: Endpoint[],
      ) => {
        await accessRulesRepo.remap(environmentId, contract);
        const inferred = inferRelations(contract);
        await relationsRepo.replace(
          environmentId,
          inferred.resources,
          mergeRelations(
            await relationsRepo.listRelations(environmentId),
            inferred.relations,
          ),
        );
      };

      const bindingSecretRef = (binding: {
        environmentId: string;
        personaId: string;
        secretRef?: string;
      }) =>
        binding.secretRef ??
        personaSecretRef(binding.environmentId, binding.personaId);

      const deleteBindingSecrets = async (environmentId: string) => {
        for (const binding of await personaBindings.listByEnvironment(
          environmentId,
        )) {
          await secrets.delete(bindingSecretRef(binding));
        }
      };

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

          if (path === "/api/recorder/start" && method === "POST") {
            const body = await readJson<{ baseUrl?: string }>(req);
            if (!body.baseUrl?.trim()) {
              sendJson(res, 400, { error: "baseUrl is required" });
              return;
            }
            try {
              const handle = await startLoginRecording({
                baseUrl: body.baseUrl.trim(),
              });
              recorders.set(handle.id, handle);
              sendJson(res, 201, handle.snapshot());
            } catch (error) {
              sendJson(res, 400, {
                error:
                  error instanceof Error
                    ? error.message
                    : "Falha ao abrir o navegador",
              });
            }
            return;
          }

          const recorderStopMatch = path.match(
            /^\/api\/recorder\/([^/]+)\/stop$/,
          );
          if (recorderStopMatch && method === "POST") {
            const id = decodeURIComponent(recorderStopMatch[1]!);
            const handle = recorders.get(id);
            if (!handle) return notFound(res);
            recorders.delete(id);
            try {
              sendJson(res, 200, await handle.stop());
            } catch (error) {
              sendJson(res, 400, {
                error:
                  error instanceof Error
                    ? error.message
                    : "Falha ao concluir a gravação",
              });
            }
            return;
          }

          const recorderMatch = path.match(/^\/api\/recorder\/([^/]+)$/);
          if (recorderMatch && method === "GET") {
            const handle = recorders.get(decodeURIComponent(recorderMatch[1]!));
            if (!handle) return notFound(res);
            sendJson(res, 200, handle.snapshot());
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
                await deleteBindingSecrets(environment.id);
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
                loginRecipe?: unknown;
              }>(req);

              if (!body.name?.trim() || !body.baseUrl?.trim()) {
                sendJson(res, 400, { error: "name and baseUrl are required" });
                return;
              }

              const recipe = parseLoginRecipe(body.loginRecipe);
              if (recipe.error) {
                sendJson(res, 400, { error: recipe.error });
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
                    loginRecipe: recipe.value ?? undefined,
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

          const envLatencyMatch = path.match(
            /^\/api\/environments\/([^/]+)\/latency$/,
          );
          if (envLatencyMatch && method === "GET") {
            const id = decodeURIComponent(envLatencyMatch[1]!);
            if (!(await environments.getById(id))) return notFound(res);
            const points = await testResults.listLatencyByEnvironment(id, 12);
            const latest = points[points.length - 1];
            const previous = points[points.length - 2];
            let trend = 0;
            if (latest && previous && previous.p95 > 0) {
              trend =
                Math.round(
                  ((latest.p95 - previous.p95) / previous.p95) * 1000,
                ) / 10;
            }
            sendJson(res, 200, {
              points,
              headlineMs: latest?.p95 ?? 0,
              trend,
            });
            return;
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
                loginRecipe?: unknown;
              }>(req);
              const recipe = parseLoginRecipe(body.loginRecipe);
              if (recipe.error) {
                sendJson(res, 400, { error: recipe.error });
                return;
              }
              const updated = await environments.update(id, {
                ...body,
                authType: body.authType
                  ? parseAuthType(body.authType)
                  : undefined,
                loginRecipe: recipe.value,
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
              await deleteBindingSecrets(id);
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

          const endpointMatch = path.match(/^\/api\/endpoints\/([^/]+)$/);
          if (endpointMatch && method === "DELETE") {
            const id = decodeURIComponent(endpointMatch[1]!);
            if (!(await endpoints.delete(id))) return notFound(res);
            sendJson(res, 204);
            return;
          }

          const envEndpointsMatch = path.match(
            /^\/api\/environments\/([^/]+)\/endpoints$/,
          );
          if (envEndpointsMatch && method === "GET") {
            const id = decodeURIComponent(envEndpointsMatch[1]!);
            if (!(await environments.getById(id))) return notFound(res);
            sendJson(res, 200, await endpoints.listByEnvironment(id));
            return;
          }

          const envImportMatch = path.match(
            /^\/api\/environments\/([^/]+)\/openapi\/import$/,
          );
          if (envImportMatch && method === "POST") {
            const id = decodeURIComponent(envImportMatch[1]!);
            const environment = await environments.getById(id);
            if (!environment) return notFound(res);

            const body = await readJson<{ document?: unknown; text?: string }>(
              req,
            );
            if (!body.document && !body.text) {
              sendJson(res, 400, { error: "document or text is required" });
              return;
            }

            try {
              const document =
                typeof body.text === "string"
                  ? parseSpecText(body.text)
                  : body.document;
              const parsed = parseOpenApi(
                document,
                environment.projectId,
                environment.id,
              );
              const saved = await endpoints.replaceOpenApiEndpoints(
                environment.projectId,
                environment.id,
                parsed,
              );
              await refreshRelations(environment.id, saved);
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

          const envLoginTestMatch = path.match(
            /^\/api\/environments\/([^/]+)\/login\/test$/,
          );
          if (envLoginTestMatch && method === "POST") {
            const id = decodeURIComponent(envLoginTestMatch[1]!);
            const environment = await environments.getById(id);
            if (!environment) return notFound(res);
            const executor = new HttpExecutor({ timeoutMs: 15_000 });
            try {
              if (environment.loginRecipe?.spec) {
                const fetched = await fetchSpecWithRecipe(
                  environment,
                  secrets,
                  executor,
                );
                sendJson(res, 200, {
                  ok: true,
                  steps: fetched.login.steps,
                  spec: { url: fetched.url, bytes: fetched.text.length },
                });
              } else {
                const login = await loginWithRecipe(
                  environment,
                  secrets,
                  executor,
                );
                sendJson(res, 200, { ok: true, steps: login.steps });
              }
            } catch (error) {
              sendJson(res, 200, {
                ok: false,
                error: error instanceof Error ? error.message : "Falha no login",
                steps: error instanceof LoginRecipeError ? error.steps : [],
              });
            }
            return;
          }

          const envFetchSpecMatch = path.match(
            /^\/api\/environments\/([^/]+)\/openapi\/fetch$/,
          );
          if (envFetchSpecMatch && method === "POST") {
            const id = decodeURIComponent(envFetchSpecMatch[1]!);
            const environment = await environments.getById(id);
            if (!environment) return notFound(res);
            try {
              const fetched = await fetchSpecWithRecipe(
                environment,
                secrets,
                new HttpExecutor({ timeoutMs: 30_000 }),
              );
              const parsed = parseOpenApi(
                parseSpecText(fetched.text),
                environment.projectId,
                environment.id,
              );
              const saved = await endpoints.replaceOpenApiEndpoints(
                environment.projectId,
                environment.id,
                parsed,
              );
              await refreshRelations(environment.id, saved);
              sendJson(res, 201, {
                imported: saved.filter((e) => e.source === "openapi").length,
                endpoints: saved,
              });
            } catch (error) {
              sendJson(res, 400, {
                error:
                  error instanceof Error
                    ? error.message
                    : "Falha ao buscar OpenAPI",
              });
            }
            return;
          }

          const envOpenApiMatch = path.match(
            /^\/api\/environments\/([^/]+)\/openapi$/,
          );
          if (envOpenApiMatch && method === "DELETE") {
            const id = decodeURIComponent(envOpenApiMatch[1]!);
            const environment = await environments.getById(id);
            if (!environment) return notFound(res);
            const before = await endpoints.listByEnvironment(id);
            const removed = before.filter(
              (item) => item.source === "openapi",
            ).length;
            const remaining = await endpoints.replaceOpenApiEndpoints(
              environment.projectId,
              environment.id,
              [],
            );
            await refreshRelations(environment.id, remaining);
            sendJson(res, 200, { removed });
            return;
          }

          const accessRulesMatch = path.match(
            /^\/api\/environments\/([^/]+)\/access-rules(\/suggest)?$/,
          );
          if (accessRulesMatch) {
            const environment = await environments.getById(
              decodeURIComponent(accessRulesMatch[1]!),
            );
            if (!environment) return notFound(res);
            const suggest = Boolean(accessRulesMatch[2]);

            if (!suggest && method === "GET") {
              sendJson(res, 200, {
                rules: await accessRulesRepo.listByEnvironment(environment.id),
              });
              return;
            }

            if (!suggest && method === "PUT") {
              const body = await readJson<{ rules?: unknown[] }>(req);
              const parsed = AccessRuleSchema.array().safeParse(body.rules ?? []);
              if (!parsed.success) {
                sendJson(res, 400, {
                  error: parsed.error.issues[0]?.message ?? "invalid rules",
                });
                return;
              }
              sendJson(res, 200, {
                rules: await accessRulesRepo.replace(
                  environment.id,
                  parsed.data,
                  await endpoints.listByEnvironment(environment.id),
                ),
              });
              return;
            }

            if (suggest && method === "POST") {
              const bindings = await personaBindings.listByEnvironment(
                environment.id,
              );
              const resources = await relationsRepo.listResources(environment.id);
              sendJson(res, 200, {
                rules: suggestAccessFromGraph({
                  endpoints: await endpoints.listByEnvironment(environment.id),
                  resources,
                  personas: listPersonas(dataDir, environment.projectId).flatMap(
                    (persona) => {
                      const binding = bindings.find((b) => b.personaId === persona.id);
                      return binding
                        ? [
                            {
                              id: persona.id,
                              role: persona.role,
                              fixtureKeys: Object.keys(binding.fixtures),
                            },
                          ]
                        : [];
                    },
                  ),
                }),
              });
              return;
            }
          }

          const envRelationsMatch = path.match(
            /^\/api\/environments\/([^/]+)\/relations(?:\/([^/]+))?$/,
          );
          if (envRelationsMatch) {
            const environment = await environments.getById(
              decodeURIComponent(envRelationsMatch[1]!),
            );
            if (!environment) return notFound(res);
            const relationKey = envRelationsMatch[2]
              ? decodeURIComponent(envRelationsMatch[2])
              : undefined;
            const statuses = ["suggested", "confirmed", "rejected"] as const;
            const parseStatus = (value: unknown) =>
              statuses.find((status) => status === value);

            if (!relationKey && method === "GET") {
              if ((await relationsRepo.listResources(environment.id)).length === 0) {
                await refreshRelations(
                  environment.id,
                  await endpoints.listByEnvironment(environment.id),
                );
              }
              sendJson(res, 200, {
                resources: await relationsRepo.listResources(environment.id),
                relations: await relationsRepo.listRelations(environment.id),
              });
              return;
            }

            if (!relationKey && method === "PATCH") {
              const body = await readJson<{ ids?: string[]; status?: string }>(req);
              const status = parseStatus(body.status);
              if (!status || !Array.isArray(body.ids)) {
                sendJson(res, 400, { error: "ids and valid status are required" });
                return;
              }
              for (const id of body.ids) {
                const relation = await relationsRepo.getRelation(environment.id, id);
                if (relation) {
                  await relationsRepo.upsertRelation(environment.id, {
                    ...relation,
                    status,
                  });
                }
              }
              sendJson(res, 200, {
                relations: await relationsRepo.listRelations(environment.id),
              });
              return;
            }

            if (!relationKey && method === "POST") {
              const body = await readJson<Partial<ResourceRelation>>(req);
              const kind = RelationKindSchema.safeParse(body.kind);
              if (!body.from?.trim() || !body.to?.trim() || !body.via?.trim() || !kind.success) {
                sendJson(res, 400, { error: "from, to, kind and via are required" });
                return;
              }
              const fields = {
                from: body.from.trim(),
                to: body.to.trim(),
                kind: kind.data,
                via: body.via.trim(),
              };
              sendJson(
                res,
                201,
                await relationsRepo.upsertRelation(environment.id, {
                  ...fields,
                  id: relationId(fields),
                  ...(body.source?.trim() ? { source: body.source.trim() } : {}),
                  evidence: [],
                  confidence: 100,
                  origin: "manual",
                  status: "confirmed",
                }),
              );
              return;
            }

            if (relationKey && method === "PUT") {
              const existing = await relationsRepo.getRelation(
                environment.id,
                relationKey,
              );
              if (!existing) return notFound(res);
              const body = await readJson<Partial<ResourceRelation>>(req);
              const kind = body.kind
                ? RelationKindSchema.safeParse(body.kind)
                : null;
              if (kind && !kind.success) {
                sendJson(res, 400, { error: "invalid kind" });
                return;
              }
              const fields = {
                from: body.from?.trim() || existing.from,
                to: body.to?.trim() || existing.to,
                kind: kind?.data ?? existing.kind,
                via: body.via?.trim() || existing.via,
              };
              const id = relationId(fields);
              const edited = id !== existing.id;
              if (edited) await relationsRepo.deleteRelation(environment.id, existing.id);
              sendJson(
                res,
                200,
                await relationsRepo.upsertRelation(environment.id, {
                  ...existing,
                  ...fields,
                  id,
                  source: body.source === undefined ? existing.source : body.source || undefined,
                  // Editada à mão sobrevive a reimport como manual.
                  origin: edited ? "manual" : existing.origin,
                  status: parseStatus(body.status) ?? (edited ? "confirmed" : existing.status),
                }),
              );
              return;
            }

            if (relationKey && method === "DELETE") {
              await relationsRepo.deleteRelation(environment.id, relationKey);
              sendJson(res, 204);
              return;
            }
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

          const runDetailMatch = path.match(/^\/api\/runs\/([^/]+)$/);
          if (runDetailMatch && method === "GET") {
            const runId = decodeURIComponent(runDetailMatch[1]!);
            const run = await runs.getById(runId);
            if (!run) return notFound(res);
            const [runFindings, resultRows] = await Promise.all([
              findings.listByRun(runId),
              testResults.listByRun(runId),
            ]);
            let passed = 0;
            let failed = 0;
            const byTest = new Map<
              string,
              { testId: string; passed: number; failed: number }
            >();
            for (const row of resultRows) {
              if (row.passed) passed += 1;
              else failed += 1;
              const bucket = byTest.get(row.testId) ?? {
                testId: row.testId,
                passed: 0,
                failed: 0,
              };
              if (row.passed) bucket.passed += 1;
              else bucket.failed += 1;
              byTest.set(row.testId, bucket);
            }
            sendJson(res, 200, {
              run,
              findings: runFindings,
              results: {
                passed,
                failed,
                total: resultRows.length,
                byTest: [...byTest.values()].sort(
                  (a, b) => b.failed - a.failed || a.testId.localeCompare(b.testId),
                ),
                items: resultRows.sort((a, b) =>
                  a.createdAt.localeCompare(b.createdAt),
                ),
              },
            });
            return;
          }

          if (path === "/api/scans" && method === "POST") {
            const body = await readJson<{
              projectId?: string;
              environmentId?: string;
              endpointIds?: string[];
              bearerToken?: string;
              approvedAiCases?: TestCase[];
              aiOnly?: boolean;
              matrix?: boolean;
              matrixOnly?: boolean;
              categories?: TestCategory[];
              variables?: Variable[];
              rateLimit?: {
                requests?: number;
                windowSeconds?: number;
                concurrency?: number;
                expectedStatus?: number;
              };
            }>(req);

            if (!body.projectId || !body.environmentId) {
              sendJson(res, 400, {
                error: "projectId and environmentId are required",
              });
              return;
            }

            const abort = new AbortController();
            const onClientGone = () => {
              if (!res.writableFinished) abort.abort();
            };
            res.on("close", onClientGone);

            const stream = (req.headers.accept ?? "").includes(
              "application/x-ndjson",
            );
            const categories = body.categories?.filter((c): c is TestCategory =>
              Object.values(TestCategory).includes(c),
            );
            const scanInput = {
              projectId: body.projectId,
              environmentId: body.environmentId,
              endpointIds: body.endpointIds,
              bearerToken: body.bearerToken,
              approvedAiCases: body.approvedAiCases,
              aiOnly: body.aiOnly,
              matrix: body.matrix,
              matrixOnly: body.matrixOnly,
              categories:
                categories && categories.length > 0 ? categories : undefined,
              variables: body.variables,
              rateLimit: body.rateLimit,
              personas: listPersonas(dataDir, body.projectId),
              signal: abort.signal,
            };
            const repos = {
              projects,
              environments,
              endpoints,
              findings,
              runs,
              testResults,
              personaBindings,
              accessRules: accessRulesRepo,
            };
            if (stream) {
              res.statusCode = 200;
              res.setHeader(
                "Content-Type",
                "application/x-ndjson; charset=utf-8",
              );
              res.setHeader("Cache-Control", "no-cache, no-transform");
              res.setHeader("X-Accel-Buffering", "no");
              res.flushHeaders();
              res.socket?.setNoDelay(true);
              const writeEvent = (event: ScanProgressEvent | {
                type: "result";
                result: unknown;
              } | { type: "error"; error: string }) => {
                if (!res.writableEnded) {
                  res.write(`${JSON.stringify(event)}\n`);
                }
              };
              try {
                const result = await runProjectScan(
                  { ...scanInput, onEvent: writeEvent },
                  repos,
                  secrets,
                );
                writeEvent({ type: "result", result });
              } catch (error) {
                writeEvent({
                  type: "error",
                  error:
                    abort.signal.aborted
                      ? "Scan cancelled"
                      : error instanceof Error
                        ? error.message
                        : "Scan failed",
                });
              } finally {
                res.off("close", onClientGone);
                if (!res.writableEnded) res.end();
              }
              return;
            }

            try {
              const result = await runProjectScan(
                scanInput,
                repos,
                secrets,
              );
              sendJson(res, 201, result);
            } catch (error) {
              if (abort.signal.aborted) {
                if (!res.writableEnded) {
                  sendJson(res, 499, { error: "Scan cancelled" });
                }
                return;
              }
              sendJson(res, 400, {
                error: error instanceof Error ? error.message : "Scan failed",
              });
            } finally {
              res.off("close", onClientGone);
            }
            return;
          }

          if (path === "/api/ai/settings" && method === "GET") {
            sendJson(res, 200, toPublicAiSettings(loadAiSettings(dataDir)));
            return;
          }

          if (path === "/api/ai/settings" && method === "PUT") {
            const body = await readJson<Partial<AiSettingsFile>>(req);
            const kindValues = Object.values(AiProviderKind) as string[];
            if (body.kind && !kindValues.includes(body.kind)) {
              sendJson(res, 400, { error: "invalid AI kind" });
              return;
            }
            const saved = saveAiSettings(dataDir, {
              enabled: body.enabled,
              kind: body.kind,
              baseUrl: body.baseUrl,
              model: body.model,
              apiKey: body.apiKey === "" ? undefined : body.apiKey,
              maxAiCases: body.maxAiCases,
            });
            sendJson(res, 200, toPublicAiSettings(saved));
            return;
          }

          if (path === "/api/ai/generate-cases" && method === "POST") {
            const body = await readJson<{
              projectId?: string;
              endpointIds?: string[];
              allowPersonaSeed?: boolean;
            }>(req);

            if (!body.projectId) {
              sendJson(res, 400, { error: "projectId is required" });
              return;
            }
            if (!(await projects.getById(body.projectId))) return notFound(res);

            let target = await endpoints.listByProject(body.projectId);
            if (body.endpointIds?.length) {
              const allow = new Set(body.endpointIds);
              target = target.filter((e) => allow.has(e.id));
            }
            if (target.length === 0) {
              sendJson(res, 400, { error: "No endpoints selected" });
              return;
            }

            const settings = loadAiSettings(dataDir);
            const client = createAiClientFromSettings(settings);
            const personas = listPersonas(dataDir, body.projectId);

            try {
              const result = await generateAiCasesForEndpoints({
                endpoints: target,
                personas,
                client,
                maxAiCases: settings.maxAiCases,
                allowPersonaSeed: body.allowPersonaSeed ?? !client,
              });
              sendJson(res, 200, result);
            } catch (error) {
              sendJson(res, 400, {
                error:
                  error instanceof Error
                    ? error.message
                    : "AI generation failed",
              });
            }
            return;
          }

          if (path === "/api/ai/interpret" && method === "POST") {
            const body = await readJson<{
              projectId?: string;
              findingIds?: string[];
            }>(req);

            if (!body.projectId) {
              sendJson(res, 400, { error: "projectId is required" });
              return;
            }
            if (!(await projects.getById(body.projectId))) return notFound(res);

            const settings = loadAiSettings(dataDir);
            const client = createAiClientFromSettings(settings);
            if (!client) {
              sendJson(res, 400, {
                error: "AI desabilitada — configure Settings → AI",
              });
              return;
            }

            let items = await findings.listByProject(body.projectId);
            if (body.findingIds?.length) {
              const allow = new Set(body.findingIds);
              items = items.filter((f) => allow.has(f.id));
            }

            try {
              const interpretation = await interpretProjectFindings(
                client,
                items,
              );
              sendJson(res, 200, { interpretation, count: items.length });
            } catch (error) {
              sendJson(res, 400, {
                error:
                  error instanceof Error
                    ? error.message
                    : "Interpretation failed",
              });
            }
            return;
          }

          const aiCasesMatch = path.match(
            /^\/api\/projects\/([^/]+)\/ai-cases$/,
          );
          if (aiCasesMatch) {
            const projectId = decodeURIComponent(aiCasesMatch[1]!);
            if (!(await projects.getById(projectId))) return notFound(res);

            if (method === "GET") {
              sendJson(res, 200, loadAiCases(dataDir, projectId));
              return;
            }

            if (method === "PUT") {
              const body = await readJson<{
                cases?: TestCase[];
                approvedIds?: string[];
                genMode?: string | null;
                rejected?: Array<{ id: string; name: string; reason: string }>;
              }>(req);
              if (!Array.isArray(body.cases) || !Array.isArray(body.approvedIds)) {
                sendJson(res, 400, {
                  error: "cases and approvedIds arrays are required",
                });
                return;
              }
              sendJson(
                res,
                200,
                saveAiCases(dataDir, projectId, {
                  cases: body.cases,
                  approvedIds: body.approvedIds,
                  genMode: body.genMode,
                  rejected: body.rejected,
                }),
              );
              return;
            }

            if (method === "DELETE") {
              sendJson(res, 200, clearAiCases(dataDir, projectId));
              return;
            }
          }

          const personasMatch = path.match(
            /^\/api\/projects\/([^/]+)\/personas$/,
          );
          if (personasMatch) {
            const projectId = decodeURIComponent(personasMatch[1]!);
            if (!(await projects.getById(projectId))) return notFound(res);

            if (method === "GET") {
              sendJson(res, 200, listPersonas(dataDir, projectId));
              return;
            }

            if (method === "POST") {
              const body = await readJson<{
                id?: string;
                name?: string;
                description?: string;
                fields?: Record<string, unknown>;
                tags?: string[];
                role?: string;
              }>(req);
              if (!body.name?.trim() || !body.fields) {
                sendJson(res, 400, { error: "name and fields are required" });
                return;
              }
              sendJson(
                res,
                201,
                upsertPersona(dataDir, projectId, {
                  id: body.id,
                  name: body.name,
                  description: body.description,
                  fields: body.fields,
                  tags: body.tags,
                  role: body.role,
                }),
              );
              return;
            }
          }

          const personaMatch = path.match(
            /^\/api\/projects\/([^/]+)\/personas\/([^/]+)$/,
          );
          if (personaMatch && method === "DELETE") {
            const projectId = decodeURIComponent(personaMatch[1]!);
            const personaId = decodeURIComponent(personaMatch[2]!);
            const project = await projects.getById(projectId);
            if (!project) return notFound(res);
            if (!deletePersona(dataDir, projectId, personaId)) {
              return notFound(res);
            }
            for (const environment of project.environments) {
              await accessRulesRepo.deleteByPersona(environment.id, personaId);
              const binding = await personaBindings.get(environment.id, personaId);
              if (!binding) continue;
              await secrets.delete(bindingSecretRef(binding));
              await personaBindings.delete(environment.id, personaId);
            }
            sendJson(res, 204);
            return;
          }

          if (personaMatch && method === "PUT") {
            const projectId = decodeURIComponent(personaMatch[1]!);
            const personaId = decodeURIComponent(personaMatch[2]!);
            if (!(await projects.getById(projectId))) return notFound(res);
            const body = await readJson<{
              name?: string;
              description?: string;
              fields?: Record<string, unknown>;
              tags?: string[];
              role?: string;
            }>(req);
            if (!body.name?.trim() || !body.fields) {
              sendJson(res, 400, { error: "name and fields are required" });
              return;
            }
            sendJson(
              res,
              200,
              upsertPersona(dataDir, projectId, {
                id: personaId,
                name: body.name,
                description: body.description,
                fields: body.fields,
                tags: body.tags,
                role: body.role,
              }),
            );
            return;
          }

          const envPersonasMatch = path.match(
            /^\/api\/environments\/([^/]+)\/personas$/,
          );
          if (envPersonasMatch && method === "GET") {
            const environment = await environments.getById(
              decodeURIComponent(envPersonasMatch[1]!),
            );
            if (!environment) return notFound(res);
            const bindings = await personaBindings.listByEnvironment(
              environment.id,
            );
            sendJson(
              res,
              200,
              await Promise.all(
                listPersonas(dataDir, environment.projectId).map(
                  async (persona) => {
                    const binding = bindings.find(
                      (item) => item.personaId === persona.id,
                    );
                    return {
                      persona,
                      binding: binding ?? null,
                      secretConfigured: binding
                        ? await secrets.has(bindingSecretRef(binding))
                        : false,
                    };
                  },
                ),
              ),
            );
            return;
          }

          const envPersonaMatch = path.match(
            /^\/api\/environments\/([^/]+)\/personas\/([^/]+)(\/secret|\/login\/test)?$/,
          );
          if (envPersonaMatch) {
            const environment = await environments.getById(
              decodeURIComponent(envPersonaMatch[1]!),
            );
            if (!environment) return notFound(res);
            const personaId = decodeURIComponent(envPersonaMatch[2]!);
            const persona = listPersonas(dataDir, environment.projectId).find(
              (item) => item.id === personaId,
            );
            if (!persona) return notFound(res);
            const suffix = envPersonaMatch[3];
            const binding = await personaBindings.get(environment.id, personaId);

            if (!suffix && method === "GET") {
              sendJson(res, 200, {
                binding,
                secretConfigured: binding
                  ? await secrets.has(bindingSecretRef(binding))
                  : false,
              });
              return;
            }

            if (!suffix && method === "PUT") {
              const body = await readJson<{
                authType?: string;
                fixtures?: Record<string, unknown>;
              }>(req);
              const fixtures: Record<string, string> = {};
              for (const [key, value] of Object.entries(body.fixtures ?? {})) {
                if (value === null || value === undefined || value === "") continue;
                fixtures[key] = String(value);
              }
              sendJson(
                res,
                200,
                await personaBindings.upsert({
                  environmentId: environment.id,
                  personaId,
                  authType: parseAuthType(body.authType),
                  secretRef: personaSecretRef(environment.id, personaId),
                  fixtures,
                }),
              );
              return;
            }

            if (!suffix && method === "DELETE") {
              if (!binding) return notFound(res);
              await secrets.delete(bindingSecretRef(binding));
              await personaBindings.delete(environment.id, personaId);
              sendJson(res, 204);
              return;
            }

            if (suffix === "/secret" && (method === "PUT" || method === "DELETE")) {
              if (!binding) {
                sendJson(res, 400, { error: "Configure o vínculo antes do secret" });
                return;
              }
              const ref = bindingSecretRef(binding);
              if (method === "DELETE") {
                await secrets.delete(ref);
                sendJson(res, 204);
                return;
              }
              const body = await readJson<{ secret?: string }>(req);
              if (!body.secret?.trim()) {
                sendJson(res, 400, { error: "secret is required" });
                return;
              }
              await secrets.set(ref, body.secret.trim());
              sendJson(res, 200, { configured: true });
              return;
            }

            if (suffix === "/login/test" && method === "POST") {
              if (!binding) {
                sendJson(res, 200, { ok: false, error: "Persona sem vínculo neste ambiente", steps: [] });
                return;
              }
              const executor = new HttpExecutor({ timeoutMs: 15_000 });
              try {
                if (binding.authType === AuthType.LOGIN_RECIPE) {
                  assertPersonaRecipe(environment.loginRecipe);
                  const login = await loginWithRecipe(
                    personaEnvironment(environment, binding),
                    secrets,
                    executor,
                  );
                  sendJson(res, 200, { ok: true, steps: login.steps });
                  return;
                }
                if (
                  binding.authType !== AuthType.NONE &&
                  !(await secrets.has(bindingSecretRef(binding)))
                ) {
                  sendJson(res, 200, { ok: false, error: "Secret não configurado", steps: [] });
                  return;
                }
                const headers = await resolvePersonaAuthHeaders(
                  environment,
                  binding,
                  secrets,
                  { executor },
                );
                sendJson(res, 200, {
                  ok: true,
                  steps: [],
                  headers: Object.keys(headers),
                });
              } catch (error) {
                sendJson(res, 200, {
                  ok: false,
                  error: error instanceof Error ? error.message : "Falha no login",
                  steps: error instanceof LoginRecipeError ? error.steps : [],
                });
              }
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
