export * from "./schema.js";

/** Client factory is app-specific (better-sqlite3 / tauri sql plugin). */
export type DatabaseDriver = "sqlite-node" | "sqlite-tauri";
