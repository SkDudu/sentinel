export * from "./types.js";
export * from "./registry.js";
export * from "./utils.js";
export * from "./plugins.js";
export * from "./tests/validation.js";
export * from "./tests/authentication.js";
export * from "./tests/authorization.js";
export * from "./tests/access-matrix.js";
export * from "./tests/rate-limit.js";
export * from "./tests/http.js";

import { InMemoryTestRegistry } from "./registry.js";
import { accessMatrixTest } from "./tests/access-matrix.js";
import { authenticationTests } from "./tests/authentication.js";
import { authorizationTests } from "./tests/authorization.js";
import { httpTests } from "./tests/http.js";
import { rateLimitTests } from "./tests/rate-limit.js";
import { validationTests } from "./tests/validation.js";

export function createDefaultRegistry() {
  const registry = new InMemoryTestRegistry();
  for (const test of [
    ...validationTests,
    ...authenticationTests,
    ...authorizationTests,
    accessMatrixTest,
    ...rateLimitTests,
    ...httpTests,
  ]) {
    registry.register(test);
  }
  return registry;
}
