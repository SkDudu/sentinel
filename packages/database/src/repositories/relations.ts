import { and, eq } from "drizzle-orm";
import type { Resource, ResourceRelation } from "@sw/core";
import type { SentinelDb } from "../client.js";
import { resourceRelations, resources } from "../schema.js";

function mapRelation(
  row: typeof resourceRelations.$inferSelect,
): ResourceRelation {
  return {
    id: row.id,
    from: row.fromResource,
    to: row.toResource,
    kind: row.kind as ResourceRelation["kind"],
    via: row.via,
    ...(row.source ? { source: row.source } : {}),
    evidence: JSON.parse(row.evidenceJson) as string[],
    confidence: row.confidence,
    origin: row.origin as ResourceRelation["origin"],
    status: row.status as ResourceRelation["status"],
  };
}

export class RelationRepository {
  constructor(private readonly db: SentinelDb) {}

  async listResources(environmentId: string): Promise<Resource[]> {
    const rows = await this.db
      .select()
      .from(resources)
      .where(eq(resources.environmentId, environmentId));
    return rows
      .map((row) => ({
        name: row.name,
        ...(row.idParam ? { idParam: row.idParam } : {}),
        operations: JSON.parse(row.operationsJson) as Resource["operations"],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async listRelations(environmentId: string): Promise<ResourceRelation[]> {
    const rows = await this.db
      .select()
      .from(resourceRelations)
      .where(eq(resourceRelations.environmentId, environmentId));
    return rows
      .map(mapRelation)
      .sort((a, b) => b.confidence - a.confidence || a.from.localeCompare(b.from));
  }

  async replace(
    environmentId: string,
    nextResources: Resource[],
    nextRelations: ResourceRelation[],
  ): Promise<void> {
    await this.db.delete(resources).where(eq(resources.environmentId, environmentId));
    await this.db
      .delete(resourceRelations)
      .where(eq(resourceRelations.environmentId, environmentId));
    for (const resource of nextResources) {
      await this.db.insert(resources).values({
        environmentId,
        name: resource.name,
        idParam: resource.idParam ?? null,
        operationsJson: JSON.stringify(resource.operations ?? {}),
      });
    }
    for (const relation of nextRelations) {
      await this.upsertRelation(environmentId, relation);
    }
  }

  async getRelation(
    environmentId: string,
    id: string,
  ): Promise<ResourceRelation | null> {
    const row = await this.db
      .select()
      .from(resourceRelations)
      .where(
        and(
          eq(resourceRelations.environmentId, environmentId),
          eq(resourceRelations.id, id),
        ),
      )
      .get();
    return row ? mapRelation(row) : null;
  }

  async upsertRelation(
    environmentId: string,
    relation: ResourceRelation,
  ): Promise<ResourceRelation> {
    await this.deleteRelation(environmentId, relation.id);
    await this.db.insert(resourceRelations).values({
      environmentId,
      id: relation.id,
      fromResource: relation.from,
      toResource: relation.to,
      kind: relation.kind,
      via: relation.via,
      source: relation.source ?? null,
      evidenceJson: JSON.stringify(relation.evidence ?? []),
      confidence: relation.confidence,
      origin: relation.origin,
      status: relation.status ?? "suggested",
    });
    return relation;
  }

  async deleteRelation(environmentId: string, id: string): Promise<void> {
    await this.db
      .delete(resourceRelations)
      .where(
        and(
          eq(resourceRelations.environmentId, environmentId),
          eq(resourceRelations.id, id),
        ),
      );
  }
}
