import type {
  Endpoint,
  Finding,
  HttpRequest,
  HttpResponse,
  RateLimitConfig,
  Severity,
  TestCase,
  TestCategory,
} from "@sw/core";
import type { AnalyzedEndpoint } from "@sw/api-parser";

/** Persona já autenticada no ambiente do scan. */
export interface PersonaContext {
  id: string;
  name: string;
  role?: string;
  headers: Record<string, string>;
  /** Ids de recursos que pertencem a esta persona. */
  fixtures: Record<string, string>;
}

export interface TestContext {
  endpoint: Endpoint;
  analyzed: AnalyzedEndpoint;
  variables: Record<string, string>;
  baseUrl: string;
  authHeaders: Record<string, string>;
  productionSafetyMode?: boolean;
  rateLimit?: RateLimitConfig;
  personas?: Record<string, PersonaContext>;
}

/** Minimal executor surface — avoids hard dep on @sw/http-client. */
export interface TestExecutor {
  execute(request: HttpRequest): Promise<HttpResponse>;
}

export interface SecurityTest {
  id: string;
  name: string;
  category: TestCategory;
  severity: Severity;
  description: string;
  requirements?: string[];
  generateCases(ctx: TestContext): TestCase[] | Promise<TestCase[]>;
  execute?(
    ctx: TestContext,
    testCase: TestCase,
  ): HttpRequest | Promise<HttpRequest>;
  /** Multi-request suites (rate-limit). When set, orchestrator skips execute+analyse. */
  run?(
    ctx: TestContext,
    testCase: TestCase,
    executor: TestExecutor,
  ): Promise<Finding | Finding[] | null>;
  analyse(
    ctx: TestContext,
    testCase: TestCase,
    request: HttpRequest,
    response: HttpResponse,
  ): Finding | Finding[] | null | Promise<Finding | Finding[] | null>;
}

export interface TestRegistry {
  register(test: SecurityTest): void;
  list(...categories: TestCategory[]): SecurityTest[];
  get(id: string): SecurityTest | undefined;
}
