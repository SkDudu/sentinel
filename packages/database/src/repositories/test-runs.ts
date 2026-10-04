import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { ScanStatus, type ScanRun } from "@sw/core";
import type { SentinelDb } from "../client.js";
import { testRuns } from "../schema.js";

function asIso(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value.includes("T")) return value;
  return new Date(`${value.replace(" ", "T")}Z`).toISOString();
}

function mapRun(row: typeof testRuns.$inferSelect): ScanRun {
  return {
    id: row.id,
    projectId: row.projectId,
    environmentId: row.environmentId,
    status: row.status as ScanRun["status"],
    startedAt: asIso(row.startedAt),
    finishedAt: asIso(row.finishedAt),
    totalCases: row.totalCases,
    completedCases: row.completedCases,
    findingsCount: row.findingsCount,
  };
}

export class TestRunRepository {
  constructor(private readonly db: SentinelDb) {}

  async listByProject(projectId: string): Promise<ScanRun[]> {
    const rows = await this.db
      .select()
      .from(testRuns)
      .where(eq(testRuns.projectId, projectId));
    return rows
      .map(mapRun)
      .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
  }

  async create(input: {
    projectId: string;
    environmentId: string;
  }): Promise<ScanRun> {
    const id = randomUUID();
    const startedAt = new Date().toISOString();
    await this.db.insert(testRuns).values({
      id,
      projectId: input.projectId,
      environmentId: input.environmentId,
      status: ScanStatus.RUNNING,
      startedAt,
      totalCases: 0,
      completedCases: 0,
      findingsCount: 0,
    });
    return {
      id,
      projectId: input.projectId,
      environmentId: input.environmentId,
      status: ScanStatus.RUNNING,
      startedAt,
      totalCases: 0,
      completedCases: 0,
      findingsCount: 0,
    };
  }

  async complete(
    id: string,
    input: {
      status: ScanRun["status"];
      totalCases: number;
      completedCases: number;
      findingsCount: number;
    },
  ): Promise<ScanRun | null> {
    await this.db
      .update(testRuns)
      .set({
        status: input.status,
        finishedAt: new Date().toISOString(),
        totalCases: input.totalCases,
        completedCases: input.completedCases,
        findingsCount: input.findingsCount,
      })
      .where(eq(testRuns.id, id));

    const row = await this.db
      .select()
      .from(testRuns)
      .where(eq(testRuns.id, id))
      .get();
    return row ? mapRun(row) : null;
  }
}
