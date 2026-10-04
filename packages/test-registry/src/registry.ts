import type { TestCategory } from "@sw/core";
import type { SecurityTest, TestRegistry } from "./types.js";

export class InMemoryTestRegistry implements TestRegistry {
  #tests = new Map<string, SecurityTest>();

  register(test: SecurityTest) {
    if (this.#tests.has(test.id)) {
      throw new Error(`Test already registered: ${test.id}`);
    }
    this.#tests.set(test.id, test);
  }

  list(category?: TestCategory) {
    const all = [...this.#tests.values()];
    return category ? all.filter((t) => t.category === category) : all;
  }

  get(id: string) {
    return this.#tests.get(id);
  }
}
