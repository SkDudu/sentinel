import { eq } from "drizzle-orm";
import {
  FindingStatus,
  type Finding,
  type HttpRequest,
  type HttpResponse,
} from "@sw/core";
import type { SentinelDb } from "../client.js";
import { findings } from "../schema.js";

function mapFinding(row: typeof findings.$inferSelect): Finding {
  return {
    id: row.id,
    projectId: row.projectId,
    endpointId: row.endpointId ?? undefined,
    testId: row.testId,
    testCaseId: row.testCaseId ?? undefined,
    title: row.title,
    severity: row.severity as Finding["severity"],
    confidence: row.confidence,
    status: row.status as Finding["status"],
    evidence: row.evidence,
    request: row.requestJson
      ? (JSON.parse(row.requestJson) as HttpRequest)
      : undefined,
    response: row.responseJson
      ? (JSON.parse(row.responseJson) as HttpResponse)
      : undefined,
    recommendation: row.recommendation ?? undefined,
    createdAt: row.createdAt.includes("T")
      ? row.createdAt
      : new Date(`${row.createdAt.replace(" ", "T")}Z`).toISOString(),
  };
}

export class FindingRepository {
  constructor(private readonly db: SentinelDb) {}

  async listByProject(projectId: string): Promise<Finding[]> {
    const rows = await this.db
      .select()
      .from(findings)
      .where(eq(findings.projectId, projectId));
    return rows
      .map(mapFinding)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listByRun(runId: string): Promise<Finding[]> {
    const rows = await this.db
      .select()
      .from(findings)
      .where(eq(findings.runId, runId));
    return rows
      .map(mapFinding)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createMany(items: Finding[], runId?: string): Promise<Finding[]> {
    const created: Finding[] = [];
    for (const item of items) {
      await this.db.insert(findings).values({
        id: item.id,
        projectId: item.projectId,
        endpointId: item.endpointId ?? null,
        runId: runId ?? null,
        testId: item.testId,
        testCaseId: item.testCaseId ?? null,
        title: item.title,
        severity: item.severity,
        confidence: item.confidence,
        status: item.status ?? FindingStatus.OPEN,
        evidence: item.evidence,
        requestJson: item.request ? JSON.stringify(item.request) : null,
        responseJson: item.response ? JSON.stringify(item.response) : null,
        recommendation: item.recommendation ?? null,
        createdAt: item.createdAt,
      });
      created.push(item);
    }
    return created;
  }

  async updateStatus(
    id: string,
    status: Finding["status"],
  ): Promise<Finding | null> {
    const existing = await this.db
      .select()
      .from(findings)
      .where(eq(findings.id, id))
      .get();
    if (!existing) return null;

    await this.db
      .update(findings)
      .set({ status })
      .where(eq(findings.id, id));

    const updated = await this.db
      .select()
      .from(findings)
      .where(eq(findings.id, id))
      .get();
    return updated ? mapFinding(updated) : null;
  }
}
