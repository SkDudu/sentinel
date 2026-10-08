import { and, eq } from "drizzle-orm";
import { FlowSchema, type Flow } from "@sw/core";
import type { SentinelDb } from "../client.js";
import { flows } from "../schema.js";

export interface StoredFlow {
  projectId: string;
  flow: Flow;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: typeof flows.$inferSelect): StoredFlow {
  return {
    projectId: row.projectId,
    flow: FlowSchema.parse({ ...JSON.parse(row.definitionJson), id: row.id }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class FlowRepository {
  constructor(private readonly db: SentinelDb) {}

  async listByProject(projectId: string): Promise<StoredFlow[]> {
    const rows = await this.db.select().from(flows).where(eq(flows.projectId, projectId));
    return rows.map(mapRow).sort((a, b) => a.flow.name.localeCompare(b.flow.name));
  }

  async get(projectId: string, id: string): Promise<StoredFlow | null> {
    const row = await this.db
      .select()
      .from(flows)
      .where(and(eq(flows.projectId, projectId), eq(flows.id, id)))
      .get();
    return row ? mapRow(row) : null;
  }

  async save(projectId: string, flow: Flow): Promise<StoredFlow> {
    const now = new Date().toISOString();
    const existing = await this.get(projectId, flow.id);
    const definitionJson = JSON.stringify(FlowSchema.parse(flow));
    if (existing) {
      await this.db
        .update(flows)
        .set({ name: flow.name, definitionJson, updatedAt: now })
        .where(and(eq(flows.projectId, projectId), eq(flows.id, flow.id)));
    } else {
      await this.db.insert(flows).values({
        id: flow.id,
        projectId,
        name: flow.name,
        definitionJson,
        createdAt: now,
        updatedAt: now,
      });
    }
    return (await this.get(projectId, flow.id))!;
  }

  async delete(projectId: string, id: string): Promise<boolean> {
    const existing = await this.get(projectId, id);
    if (!existing) return false;
    await this.db.delete(flows).where(and(eq(flows.projectId, projectId), eq(flows.id, id)));
    return true;
  }
}
