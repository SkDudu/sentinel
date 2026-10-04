import type { DatabaseSync } from "node:sqlite";

/** Idempotent bootstrap schema for MVP (no drizzle-kit required yet). */
export function applyMigrations(sqlite: DatabaseSync) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS environments (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      auth_type TEXT NOT NULL DEFAULT 'NONE',
      secret_ref TEXT,
      headers_json TEXT NOT NULL DEFAULT '{}',
      production_safety_mode INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS endpoints (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      operation_id TEXT,
      summary TEXT,
      parameters_json TEXT NOT NULL DEFAULT '[]',
      request_body_schema_json TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL DEFAULT 'manual'
    );

    CREATE TABLE IF NOT EXISTS variables (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual'
    );

    CREATE TABLE IF NOT EXISTS test_suites (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      options_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS test_runs (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      environment_id TEXT NOT NULL REFERENCES environments(id),
      status TEXT NOT NULL DEFAULT 'PENDING',
      started_at TEXT,
      finished_at TEXT,
      total_cases INTEGER NOT NULL DEFAULT 0,
      completed_cases INTEGER NOT NULL DEFAULT 0,
      findings_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS test_results (
      id TEXT PRIMARY KEY NOT NULL,
      run_id TEXT NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      endpoint_id TEXT REFERENCES endpoints(id),
      test_id TEXT NOT NULL,
      test_case_id TEXT NOT NULL,
      passed INTEGER,
      request_json TEXT,
      response_json TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS findings (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      endpoint_id TEXT REFERENCES endpoints(id),
      run_id TEXT REFERENCES test_runs(id),
      test_id TEXT NOT NULL,
      test_case_id TEXT,
      title TEXT NOT NULL,
      severity TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'OPEN',
      evidence TEXT NOT NULL,
      request_json TEXT,
      response_json TEXT,
      recommendation TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_environments_project ON environments(project_id);
    CREATE INDEX IF NOT EXISTS idx_endpoints_project ON endpoints(project_id);
    CREATE INDEX IF NOT EXISTS idx_findings_project ON findings(project_id);
  `);
}
