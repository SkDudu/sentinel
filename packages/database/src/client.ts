import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema.js";
import { applyMigrations } from "./migrate.js";

export type SentinelDb = SqliteRemoteDatabase<typeof schema>;

export interface SqliteHandle {
  db: SentinelDb;
  sqlite: DatabaseSync;
  close: () => void;
}

/**
 * Drizzle sqlite-proxy expects:
 * - run  → { rows: [] }
 * - all  → { rows: Array<value[]> }
 * - get  → { rows: value[] | null }  (flat row values, NOT nested)
 * - values → same as all
 */
function execute(
  sqlite: DatabaseSync,
  sql: string,
  params: unknown[],
  method: "run" | "all" | "values" | "get",
): { rows: unknown } {
  const statement = sqlite.prepare(sql);

  if (method === "run") {
    statement.run(...(params as never[]));
    return { rows: [] };
  }

  if (method === "get") {
    const row = statement.get(...(params as never[])) as
      | Record<string, unknown>
      | undefined;
    if (!row) return { rows: null };
    return { rows: Object.values(row) };
  }

  const rows = statement.all(...(params as never[])) as Record<
    string,
    unknown
  >[];
  return { rows: rows.map((row) => Object.values(row)) };
}

export function createSqliteDb(filePath: string): SqliteHandle {
  mkdirSync(dirname(filePath), { recursive: true });

  const sqlite = new DatabaseSync(filePath);
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec("PRAGMA journal_mode = WAL;");
  applyMigrations(sqlite);

  const db = drizzle(async (sql, params, method) => {
    return execute(sqlite, sql, params, method) as { rows: unknown[] };
  }, { schema });

  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}
