import type { SecurityTest } from "../types.js";
import {
  Severity,
  TestCaseSource,
  TestCategory,
} from "@sw/core";

/** Stubs — full auth suites land after MVP validation path. */
export const missingAuthTest: SecurityTest = {
  id: "authentication.missing-auth",
  name: "Missing authentication",
  category: TestCategory.AUTHENTICATION,
  severity: Severity.HIGH,
  description: "Calls protected endpoints without auth headers.",
  requirements: ["auth"],

  generateCases() {
    return [
      {
        id: "missing-auth",
        name: "No Authorization header",
        source: TestCaseSource.DETERMINISTIC,
        category: TestCategory.AUTHENTICATION,
        mutations: { stripAuth: true },
        tags: ["authentication"],
      },
    ];
  },

  analyse() {
    return null;
  },
};

export const authenticationTests: SecurityTest[] = [missingAuthTest];
