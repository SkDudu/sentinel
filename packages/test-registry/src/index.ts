export * from "./types.js";
export * from "./registry.js";
export * from "./tests/validation.js";
export * from "./tests/authentication.js";

import { InMemoryTestRegistry } from "./registry.js";
import { authenticationTests } from "./tests/authentication.js";
import { validationTests } from "./tests/validation.js";

export function createDefaultRegistry() {
  const registry = new InMemoryTestRegistry();
  for (const test of [...validationTests, ...authenticationTests]) {
    registry.register(test);
  }
  return registry;
}
