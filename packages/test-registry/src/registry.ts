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

  list(...categories: TestCategory[]) {
    const all = [...this.#tests.values()];
    if (categories.length === 0) return all;
    const allow = new Set(categories);
    return all.filter((t) => allow.has(t.category));
  }

  get(id: string) {
    return this.#tests.get(id);
  }
}
