export const Severity = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  INFO: "INFO",
} as const;
export type Severity = (typeof Severity)[keyof typeof Severity];

export const FindingStatus = {
  OPEN: "OPEN",
  CONFIRMED: "CONFIRMED",
  FALSE_POSITIVE: "FALSE_POSITIVE",
  RESOLVED: "RESOLVED",
  IGNORED: "IGNORED",
} as const;
export type FindingStatus = (typeof FindingStatus)[keyof typeof FindingStatus];

export const AuthType = {
  NONE: "NONE",
  BEARER: "BEARER",
  BASIC: "BASIC",
  API_KEY: "API_KEY",
  COOKIE: "COOKIE",
  OAUTH2: "OAUTH2",
  LOGIN_RECIPE: "LOGIN_RECIPE",
} as const;
export type AuthType = (typeof AuthType)[keyof typeof AuthType];

export const TestCategory = {
  AUTHENTICATION: "authentication",
  AUTHORIZATION: "authorization",
  INJECTION: "injection",
  VALIDATION: "validation",
  RATE_LIMIT: "rate-limit",
  HTTP: "http",
  BUSINESS_LOGIC: "business-logic",
  AI_GENERATED: "ai-generated",
} as const;
export type TestCategory = (typeof TestCategory)[keyof typeof TestCategory];

export const TestCaseSource = {
  DETERMINISTIC: "deterministic",
  AI: "ai",
  BUSINESS_LOGIC: "business-logic",
  MANUAL: "manual",
} as const;
export type TestCaseSource = (typeof TestCaseSource)[keyof typeof TestCaseSource];

export const ScanStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;
export type ScanStatus = (typeof ScanStatus)[keyof typeof ScanStatus];

export const AiProviderKind = {
  OLLAMA: "ollama",
  LM_STUDIO: "lm-studio",
  OPENAI: "openai",
  OPENAI_COMPATIBLE: "openai-compatible",
} as const;
export type AiProviderKind = (typeof AiProviderKind)[keyof typeof AiProviderKind];
