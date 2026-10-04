import type {
  Endpoint,
  Finding,
  HttpRequest,
  HttpResponse,
  Severity,
  TestCase,
  TestCategory,
} from "@sw/core";
import type { AnalyzedEndpoint } from "@sw/api-parser";

export interface TestContext {
  endpoint: Endpoint;
  analyzed: AnalyzedEndpoint;
  variables: Record<string, string>;
  baseUrl: string;
  authHeaders: Record<string, string>;
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
  analyse(
    ctx: TestContext,
    testCase: TestCase,
    request: HttpRequest,
    response: HttpResponse,
  ): Finding | Finding[] | null | Promise<Finding | Finding[] | null>;
}

export interface TestRegistry {
  register(test: SecurityTest): void;
  list(category?: TestCategory): SecurityTest[];
  get(id: string): SecurityTest | undefined;
}
