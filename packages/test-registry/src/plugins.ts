import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { SecurityTest } from "./types.js";
import type { TestRegistry } from "./types.js";

function asTests(mod: Record<string, unknown>): SecurityTest[] {
  const candidate =
    mod.default ?? mod.tests ?? mod.plugins ?? mod.securityTests;
  if (!candidate) return [];
  const list = Array.isArray(candidate) ? candidate : [candidate];
  return list.filter(
    (item): item is SecurityTest =>
      Boolean(
        item &&
          typeof item === "object" &&
          typeof (item as SecurityTest).id === "string" &&
          typeof (item as SecurityTest).generateCases === "function" &&
          typeof (item as SecurityTest).analyse === "function",
      ),
  );
}

/** Load SecurityTest plugins from a JS/MJS module path. */
export async function loadPluginModule(
  modulePath: string,
): Promise<SecurityTest[]> {
  const href = pathToFileURL(resolve(modulePath)).href;
  const mod = (await import(href)) as Record<string, unknown>;
  return asTests(mod);
}

/** Load all `.js` / `.mjs` / `.cjs` plugins from a directory. */
export async function loadPluginsFromDirectory(
  dir: string,
): Promise<SecurityTest[]> {
  const absolute = resolve(dir);
  const entries = await readdir(absolute, { withFileTypes: true });
  const tests: SecurityTest[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/\.(m?js|cjs)$/.test(entry.name)) continue;
    const loaded = await loadPluginModule(join(absolute, entry.name));
    tests.push(...loaded);
  }

  return tests;
}

export async function registerPluginsFromDirectory(
  registry: TestRegistry,
  dir: string,
): Promise<number> {
  const tests = await loadPluginsFromDirectory(dir);
  for (const test of tests) {
    registry.register(test);
  }
  return tests.length;
}
