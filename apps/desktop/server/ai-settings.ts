import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AiProviderKind, type AiProviderConfig } from "@sw/core";

export interface AiSettingsFile {
  enabled: boolean;
  kind: AiProviderConfig["kind"];
  baseUrl: string;
  model: string;
  apiKey?: string;
  maxAiCases: number;
}

const DEFAULTS: AiSettingsFile = {
  enabled: true,
  kind: AiProviderKind.OLLAMA,
  baseUrl: "http://127.0.0.1:11434/v1",
  model: "llama3.2",
  maxAiCases: 20,
};

export function loadAiSettings(dataDir: string): AiSettingsFile {
  mkdirSync(dataDir, { recursive: true });
  const path = join(dataDir, "ai-settings.json");
  if (!existsSync(path)) {
    writeFileSync(path, JSON.stringify(DEFAULTS, null, 2), "utf8");
    return { ...DEFAULTS };
  }
  try {
    return { ...DEFAULTS, ...(JSON.parse(readFileSync(path, "utf8")) as Partial<AiSettingsFile>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveAiSettings(
  dataDir: string,
  patch: Partial<AiSettingsFile>,
): AiSettingsFile {
  const next = { ...loadAiSettings(dataDir), ...patch };
  writeFileSync(
    join(dataDir, "ai-settings.json"),
    JSON.stringify(next, null, 2),
    "utf8",
  );
  return next;
}

export function toPublicAiSettings(settings: AiSettingsFile) {
  return {
    enabled: settings.enabled,
    kind: settings.kind,
    baseUrl: settings.baseUrl,
    model: settings.model,
    maxAiCases: settings.maxAiCases,
    hasApiKey: Boolean(settings.apiKey),
  };
}
