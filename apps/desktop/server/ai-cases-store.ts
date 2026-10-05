import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TestCase } from "@sw/core";

export interface AiCasesFile {
  cases: TestCase[];
  approvedIds: string[];
  genMode?: string | null;
  rejected?: Array<{ id: string; name: string; reason: string }>;
  updatedAt: string;
}

function aiCasesPath(dataDir: string, projectId: string) {
  return join(dataDir, "ai-cases", `${projectId}.json`);
}

const emptyFile = (): AiCasesFile => ({
  cases: [],
  approvedIds: [],
  genMode: null,
  rejected: [],
  updatedAt: new Date().toISOString(),
});

export function loadAiCases(
  dataDir: string,
  projectId: string,
): AiCasesFile {
  const path = aiCasesPath(dataDir, projectId);
  if (!existsSync(path)) return emptyFile();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<AiCasesFile>;
    return {
      cases: Array.isArray(parsed.cases) ? parsed.cases : [],
      approvedIds: Array.isArray(parsed.approvedIds) ? parsed.approvedIds : [],
      genMode: parsed.genMode ?? null,
      rejected: Array.isArray(parsed.rejected) ? parsed.rejected : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return emptyFile();
  }
}

export function saveAiCases(
  dataDir: string,
  projectId: string,
  input: {
    cases: TestCase[];
    approvedIds: string[];
    genMode?: string | null;
    rejected?: Array<{ id: string; name: string; reason: string }>;
  },
): AiCasesFile {
  const caseIds = new Set(input.cases.map((c) => c.id));
  const next: AiCasesFile = {
    cases: input.cases,
    approvedIds: input.approvedIds.filter((id) => caseIds.has(id)),
    genMode: input.genMode ?? null,
    rejected: input.rejected ?? [],
    updatedAt: new Date().toISOString(),
  };
  mkdirSync(join(dataDir, "ai-cases"), { recursive: true });
  writeFileSync(aiCasesPath(dataDir, projectId), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function clearAiCases(dataDir: string, projectId: string): AiCasesFile {
  return saveAiCases(dataDir, projectId, {
    cases: [],
    approvedIds: [],
    genMode: null,
    rejected: [],
  });
}
