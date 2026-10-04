import { AuthType, type Environment, type Project } from "@sw/core";
import type { environments, projects } from "./schema.js";

type ProjectRow = typeof projects.$inferSelect;
type EnvironmentRow = typeof environments.$inferSelect;

function asIso(value: string): string {
  if (value.includes("T")) return value;
  return new Date(`${value.replace(" ", "T")}Z`).toISOString();
}

export function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    createdAt: asIso(row.createdAt),
    updatedAt: asIso(row.updatedAt),
  };
}

export function mapEnvironment(row: EnvironmentRow): Environment {
  let headers: Record<string, string> = {};
  try {
    headers = JSON.parse(row.headersJson) as Record<string, string>;
  } catch {
    headers = {};
  }

  const authType =
    (Object.values(AuthType) as string[]).includes(row.authType)
      ? (row.authType as Environment["authType"])
      : AuthType.NONE;

  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    baseUrl: row.baseUrl,
    authType,
    secretRef: row.secretRef ?? undefined,
    headers,
    productionSafetyMode: Boolean(row.productionSafetyMode),
  };
}
