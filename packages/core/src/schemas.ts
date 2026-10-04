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

export const EndpointSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
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
  parameters: z.array(ParameterSchema).default([]),
  requestBodySchema: z.unknown().optional(),
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
});
export type HttpRequest = z.infer<typeof HttpRequestSchema>;

export const HttpResponseSchema = z.object({
  status: z.number().int(),
  headers: z.record(z.string()).default({}),
  body: z.unknown().optional(),
  durationMs: z.number(),
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
});
export type TestPersona = z.infer<typeof TestPersonaSchema>;
