import type { DatabaseSync } from "node:sqlite";
import { AiProviderKind, type AiProviderConfig } from "@sw/core";

export interface AiSettingsFile {
  enabled: boolean;
  kind: AiProviderConfig["kind"];
  baseUrl: string;
  model: string;
  apiKey?: string;
  maxAiCases: number;
  /** Arquivo em disco. Defaults em memória não contam. */
  saved: boolean;
}

const DEFAULTS: AiSettingsFile = {
  enabled: false,
  kind: AiProviderKind.OPENAI_COMPATIBLE,
  baseUrl: "",
  model: "",
  maxAiCases: 20,
  saved: false,
};

export function ensureAiSettingsTable(sqlite: DatabaseSync) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ai_settings (
      id TEXT PRIMARY KEY NOT NULL DEFAULT 'default',
      enabled INTEGER NOT NULL DEFAULT 0,
      kind TEXT NOT NULL,
      base_url TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      api_key_enc TEXT,
      max_ai_cases INTEGER NOT NULL DEFAULT 20
    );
  `);
}

type AiRow = {
  enabled: number;
  kind: string;
  base_url: string;
  model: string;
  api_key_enc: string | null;
  max_ai_cases: number;
};

export function readAiSettingsRow(sqlite: DatabaseSync): {
  settings: AiSettingsFile;
  apiKeyEnc: string | null;
} {
  ensureAiSettingsTable(sqlite);
  const row = sqlite.prepare("SELECT * FROM ai_settings WHERE id = 'default'").get() as
    | AiRow
    | undefined;
  if (!row) return { settings: { ...DEFAULTS }, apiKeyEnc: null };
  return {
    settings: {
      enabled: Boolean(row.enabled),
      kind: row.kind as AiSettingsFile["kind"],
      baseUrl: row.base_url,
      model: row.model,
      maxAiCases: row.max_ai_cases,
      saved: true,
    },
    apiKeyEnc: row.api_key_enc,
  };
}

export function writeAiSettingsRow(
  sqlite: DatabaseSync,
  settings: AiSettingsFile,
  apiKeyEnc: string | null,
) {
  ensureAiSettingsTable(sqlite);
  sqlite
    .prepare(
      `INSERT INTO ai_settings (id, enabled, kind, base_url, model, api_key_enc, max_ai_cases)
       VALUES ('default', ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         enabled = excluded.enabled,
         kind = excluded.kind,
         base_url = excluded.base_url,
         model = excluded.model,
         api_key_enc = excluded.api_key_enc,
         max_ai_cases = excluded.max_ai_cases`,
    )
    .run(
      settings.enabled ? 1 : 0,
      settings.kind,
      settings.baseUrl,
      settings.model,
      apiKeyEnc,
      settings.maxAiCases,
    );
}

export function deleteAiSettingsRow(sqlite: DatabaseSync) {
  ensureAiSettingsTable(sqlite);
  sqlite.prepare("DELETE FROM ai_settings WHERE id = 'default'").run();
}

export function toPublicAiSettings(settings: AiSettingsFile, hasApiKey: boolean) {
  return {
    enabled: settings.enabled,
    kind: settings.kind,
    baseUrl: settings.baseUrl,
    model: settings.model,
    maxAiCases: settings.maxAiCases,
    hasApiKey,
    saved: settings.saved,
  };
}
