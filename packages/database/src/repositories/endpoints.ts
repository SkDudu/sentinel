import { eq } from "drizzle-orm";
import type { Endpoint } from "@sw/core";
import type { SentinelDb } from "../client.js";
import { endpoints } from "../schema.js";

function mapEndpoint(row: typeof endpoints.$inferSelect): Endpoint {
  return {
    id: row.id,
    projectId: row.projectId,
    environmentId: row.environmentId ?? undefined,
    method: row.method as Endpoint["method"],
    path: row.path,
    operationId: row.operationId ?? undefined,
    summary: row.summary ?? undefined,
    parameters: JSON.parse(row.parametersJson) as Endpoint["parameters"],
    requestBodySchema: row.requestBodySchemaJson
      ? (JSON.parse(row.requestBodySchemaJson) as unknown)
      : undefined,
    tags: JSON.parse(row.tagsJson) as string[],
    source: row.source as Endpoint["source"],
  };
}

export class EndpointRepository {
  constructor(private readonly db: SentinelDb) {}

  async listByProject(projectId: string): Promise<Endpoint[]> {
    const rows = await this.db
      .select()
      .from(endpoints)
      .where(eq(endpoints.projectId, projectId));
    return rows.map(mapEndpoint);
  }

  async listByEnvironment(environmentId: string): Promise<Endpoint[]> {
    const rows = await this.db
      .select()
      .from(endpoints)
      .where(eq(endpoints.environmentId, environmentId));
    return rows.map(mapEndpoint);
  }

  async getById(id: string): Promise<Endpoint | null> {
    const row = await this.db
      .select()
      .from(endpoints)
      .where(eq(endpoints.id, id))
      .get();
    return row ? mapEndpoint(row) : null;
  }

  async replaceOpenApiEndpoints(
    projectId: string,
    environmentId: string,
    items: Endpoint[],
  ): Promise<Endpoint[]> {
    const existing = await this.listByEnvironment(environmentId);
    for (const item of existing.filter((e) => e.source === "openapi")) {
      await this.db.delete(endpoints).where(eq(endpoints.id, item.id));
    }

    for (const item of items) {
      await this.db.insert(endpoints).values({
        id: item.id,
        projectId,
        environmentId,
        method: item.method,
        path: item.path,
        operationId: item.operationId ?? null,
        summary: item.summary ?? null,
        parametersJson: JSON.stringify(item.parameters ?? []),
        requestBodySchemaJson: item.requestBodySchema
          ? JSON.stringify(item.requestBodySchema)
          : null,
        tagsJson: JSON.stringify(item.tags ?? []),
        source: item.source ?? "openapi",
      });
    }

    return this.listByEnvironment(environmentId);
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;
    await this.db.delete(endpoints).where(eq(endpoints.id, id));
    return true;
  }
}
