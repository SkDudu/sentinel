import { z } from "zod";
import {
  AiProviderKind,
  AuthType,
  FindingStatus,
  ScanStatus,
  Severity,
  TestCaseSource,
  TestCategory,
} from "./enums.js";

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const LoginFieldValueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), value: z.string() }),
  /** Key inside the environment vault entry — never stored in SQLite. */
  z.object({ kind: z.literal("secret"), key: z.string().min(1) }),
  /** Value extracted by an earlier step. */
  z.object({ kind: z.literal("var"), name: z.string().min(1) }),
]);
export type LoginFieldValue = z.infer<typeof LoginFieldValueSchema>;

export const LoginExtractSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("hiddenInput"),
    name: z.string().min(1),
    as: z.string().min(1),
  }),
  z.object({
    kind: z.literal("cookie"),
    name: z.string().min(1),
    as: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal("jsonPath"),
    path: z.string().min(1),
    as: z.string().min(1),
    emit: z.literal("bearer").optional(),
  }),
  z.object({
    kind: z.literal("header"),
    name: z.string().min(1),
    as: z.string().min(1),
  }),
]);
export type LoginExtract = z.infer<typeof LoginExtractSchema>;

export const LoginStepRoleSchema = z.enum(["spec-access", "api-auth", "both"]);
export type LoginStepRole = z.infer<typeof LoginStepRoleSchema>;

export const LoginStepSchema = z.object({
  label: z.string().min(1),
  role: LoginStepRoleSchema.default("both"),
  request: z.object({
    method: z.enum(["GET", "POST"]),
    /** Absolute, or relative to the environment baseUrl. */
    url: z.string().min(1),
    bodyType: z.enum(["none", "form", "json"]).default("none"),
    fields: z.record(LoginFieldValueSchema).default({}),
    headers: z.record(LoginFieldValueSchema).default({}),
  }),
  extract: z.array(LoginExtractSchema).default([]),
  /** Accepted statuses. Default: anything below 400. */
  expectStatus: z.array(z.number().int()).optional(),
  /** Login forms often 302 back to themselves on bad credentials. */
  failIfLocationIncludes: z.string().min(1).optional(),
});
export type LoginStep = z.infer<typeof LoginStepSchema>;

export const LoginRecipeSchema = z.object({
  version: z.literal(1),
  steps: z.array(LoginStepSchema).min(1),
  /** OpenAPI document reachable after login. */
  spec: z.object({ url: z.string().min(1) }).optional(),
});
export type LoginRecipe = z.infer<typeof LoginRecipeSchema>;

export const EnvironmentSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1),
  baseUrl: z.string().url(),
  authType: z.nativeEnum(AuthType),
  /** Reference to OS keychain secret — never store raw tokens here */
  secretRef: z.string().optional(),
  headers: z.record(z.string()).default({}),
  productionSafetyMode: z.boolean().default(false),
  /** Used when authType is LOGIN_RECIPE. Holds no secrets. */
  loginRecipe: LoginRecipeSchema.optional(),
});
export type Environment = z.infer<typeof EnvironmentSchema>;

export const ParameterSchema = z.object({
  name: z.string(),
  in: z.enum(["path", "query", "header", "cookie", "body"]),
  required: z.boolean().default(false),
  type: z.string().optional(),
  format: z.string().optional(),
  schema: z.unknown().optional(),
  description: z.string().optional(),
});
export type Parameter = z.infer<typeof ParameterSchema>;

/** OpenAPI `links`: valor da response alimenta param de outra operação. */
export const EndpointLinkSchema = z.object({
  name: z.string(),
  operationId: z.string().optional(),
  /** param → expressão, ex.: { orderId: "$response.body#/id" }. */
  parameters: z.record(z.string()).default({}),
});
export type EndpointLink = z.infer<typeof EndpointLinkSchema>;

export const EndpointResponseSchema = z.object({
  status: z.string().min(1),
  description: z.string().optional(),
  contentType: z.string().optional(),
  schema: z.unknown().optional(),
  links: z.array(EndpointLinkSchema).optional(),
});
export type EndpointResponse = z.infer<typeof EndpointResponseSchema>;

export const EndpointSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  /** Contrato OpenAPI pertence a um ambiente. Ausente só em scans efêmeros da CLI. */
  environmentId: z.string().uuid().optional(),
  method: z.enum([
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
  ]),
  path: z.string().min(1),
  operationId: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  parameters: z.array(ParameterSchema).default([]),
  requestBodySchema: z.unknown().optional(),
  responses: z.array(EndpointResponseSchema).default([]),
  tags: z.array(z.string()).default([]),
  source: z.enum(["openapi", "manual", "import"]).default("manual"),
});
export type Endpoint = z.infer<typeof EndpointSchema>;

export const VariableSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  source: z.enum(["manual", "extract", "auth"]).default("manual"),
});
export type Variable = z.infer<typeof VariableSchema>;

export const TestCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  source: z.nativeEnum(TestCaseSource),
  category: z.nativeEnum(TestCategory),
  severityHint: z.nativeEnum(Severity).optional(),
  persona: z.string().optional(),
  mutations: z.record(z.unknown()).default({}),
  headers: z.record(z.string()).optional(),
  expectedStatus: z.array(z.number().int()).optional(),
  tags: z.array(z.string()).default([]),
});
export type TestCase = z.infer<typeof TestCaseSchema>;

export const HttpRequestSchema = z.object({
  method: z.string(),
  url: z.string(),
  headers: z.record(z.string()).default({}),
  body: z.unknown().optional(),
  /** Default `follow`. `manual` keeps 3xx + its Set-Cookie (login flows). */
  redirect: z.enum(["follow", "manual"]).optional(),
});
export type HttpRequest = z.infer<typeof HttpRequestSchema>;

export const HttpResponseSchema = z.object({
  status: z.number().int(),
  headers: z.record(z.string()).default({}),
  body: z.unknown().optional(),
  durationMs: z.number(),
  /** Every Set-Cookie line; `headers` collapses duplicates. */
  setCookies: z.array(z.string()).optional(),
});
export type HttpResponse = z.infer<typeof HttpResponseSchema>;

export const FindingSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  endpointId: z.string().uuid().optional(),
  testId: z.string(),
  testCaseId: z.string().optional(),
  title: z.string(),
  severity: z.nativeEnum(Severity),
  confidence: z.number().min(0).max(100),
  status: z.nativeEnum(FindingStatus).default(FindingStatus.OPEN),
  evidence: z.string(),
  request: HttpRequestSchema.optional(),
  response: HttpResponseSchema.optional(),
  recommendation: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type Finding = z.infer<typeof FindingSchema>;

export const ScanRunSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  environmentId: z.string().uuid(),
  status: z.nativeEnum(ScanStatus),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
  totalCases: z.number().int().default(0),
  completedCases: z.number().int().default(0),
  findingsCount: z.number().int().default(0),
  /** Suites selecionadas; [] = todas; ausente = run anterior ao registro. */
  categories: z.array(z.nativeEnum(TestCategory)).optional(),
});
export type ScanRun = z.infer<typeof ScanRunSchema>;

export const RateLimitConfigSchema = z.object({
  requests: z.number().int().positive().default(30),
  windowSeconds: z.number().int().positive().default(10),
  concurrency: z.number().int().positive().default(5),
  expectedStatus: z.number().int().default(429),
});
export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;

export const AiProviderConfigSchema = z.object({
  kind: z.nativeEnum(AiProviderKind),
  baseUrl: z.string().url(),
  model: z.string().min(1),
  apiKeyRef: z.string().optional(),
});
export type AiProviderConfig = z.infer<typeof AiProviderConfigSchema>;

export const TestDataOptionsSchema = z.object({
  normal: z.boolean().default(true),
  validationErrors: z.boolean().default(true),
  edgeCases: z.boolean().default(true),
  typeConfusion: z.boolean().default(true),
  boundaryValues: z.boolean().default(true),
  businessLogic: z.boolean().default(false),
  aiGenerated: z.boolean().default(false),
});
export type TestDataOptions = z.infer<typeof TestDataOptionsSchema>;

export const TestPersonaSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  fields: z.record(z.unknown()),
  tags: z.array(z.string()).default([]),
  /** "user" | "admin" | "support" | livre. */
  role: z.string().min(1).optional(),
});
export type TestPersona = z.infer<typeof TestPersonaSchema>;

/** Persona × ambiente. Credencial só no vault (`secretRef`). */
export const PersonaBindingSchema = z.object({
  environmentId: z.string().uuid(),
  personaId: z.string().min(1),
  authType: z.nativeEnum(AuthType),
  secretRef: z.string().optional(),
  /** Recursos DESSA persona, ex.: { userId: "42", orderId: "ord_9" }. */
  fixtures: z.record(z.string()).default({}),
});
export type PersonaBinding = z.infer<typeof PersonaBindingSchema>;

export const ResourceOperationSchema = z.enum([
  "create",
  "list",
  "read",
  "update",
  "delete",
]);
export type ResourceOperation = z.infer<typeof ResourceOperationSchema>;

export const ResourceSchema = z.object({
  /** Segmento do path, ex.: "orders", "company-units". */
  name: z.string().min(1),
  /** Param que identifica o item, ex.: "orderId", "company_unit". */
  idParam: z.string().optional(),
  /** operação → endpointId. */
  operations: z.record(ResourceOperationSchema, z.string()).default({}),
});
export type Resource = z.infer<typeof ResourceSchema>;

export const RelationKindSchema = z.enum(["parent", "reference", "owner", "produces"]);
export type RelationKind = z.infer<typeof RelationKindSchema>;

export const ResourceRelationSchema = z.object({
  /** Estável: hash de from|kind|to|via — sobrevive a reimport. */
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  kind: RelationKindSchema,
  /** Param ou campo: "userId", "body.customer_id". */
  via: z.string().min(1),
  /** `produces`: de onde sai o valor, ex.: "response.id". */
  source: z.string().optional(),
  evidence: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(100),
  origin: z.enum(["links", "path", "field", "observed", "ai", "manual"]),
  status: z.enum(["suggested", "confirmed", "rejected"]).default("suggested"),
});
export type ResourceRelation = z.infer<typeof ResourceRelationSchema>;
