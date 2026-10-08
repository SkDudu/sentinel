import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { TestPersona } from "@sw/core";
import { builtinPersonas } from "@sw/ai-data-generator";

function personasPath(dataDir: string, projectId: string) {
  return join(dataDir, "personas", `${projectId}.json`);
}

export function listPersonas(dataDir: string, projectId: string): TestPersona[] {
  const path = personasPath(dataDir, projectId);
  if (!existsSync(path)) {
    mkdirSync(join(dataDir, "personas"), { recursive: true });
    writeFileSync(path, JSON.stringify(builtinPersonas, null, 2), "utf8");
    return structuredClone(builtinPersonas);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as TestPersona[];
  } catch {
    return structuredClone(builtinPersonas);
  }
}

function writePersonas(
  dataDir: string,
  projectId: string,
  personas: TestPersona[],
) {
  mkdirSync(join(dataDir, "personas"), { recursive: true });
  writeFileSync(
    personasPath(dataDir, projectId),
    JSON.stringify(personas, null, 2),
    "utf8",
  );
}

export function upsertPersona(
  dataDir: string,
  projectId: string,
  input: Partial<TestPersona> & { name: string; fields: Record<string, unknown> },
): TestPersona {
  const personas = listPersonas(dataDir, projectId);
  const id = input.id ?? randomUUID();
  const idx = personas.findIndex((p) => p.id === id);
  // `role` ausente = mantém; "" = limpa.
  const role = (input.role ?? personas[idx]?.role)?.trim();
  const next: TestPersona = {
    id,
    name: input.name,
    description: input.description,
    fields: input.fields,
    tags: input.tags ?? [],
    ...(role ? { role } : {}),
  };
  if (idx >= 0) personas[idx] = next;
  else personas.push(next);
  writePersonas(dataDir, projectId, personas);
  return next;
}

export function deletePersona(
  dataDir: string,
  projectId: string,
  personaId: string,
): boolean {
  const personas = listPersonas(dataDir, projectId);
  const next = personas.filter((p) => p.id !== personaId);
  if (next.length === personas.length) return false;
  writePersonas(dataDir, projectId, next);
  return true;
}
