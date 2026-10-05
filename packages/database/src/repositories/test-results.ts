import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { HttpRequest, HttpResponse } from "@sw/core";
import type { SentinelDb } from "../client.js";
import { testResults } from "../schema.js";

export interface TestResultInput {
  endpointId?: string;
  testId: string;
  testCaseId: string;
  passed: boolean;
  request?: HttpRequest;
  response?: HttpResponse;
  notes?: string;
}

export interface TestResultRow {
  id: string;
  runId: string;
  endpointId?: string;
  testId: string;
  testCaseId: string;
  passed: boolean;
  request?: HttpRequest;
  response?: HttpResponse;
  notes?: string;
  createdAt: string;
}

function mapRow(row: typeof testResults.$inferSelect): TestResultRow {
  return {
    id: row.id,
    runId: row.runId,
    endpointId: row.endpointId ?? undefined,
    testId: row.testId,
    testCaseId: row.testCaseId,
    passed: Boolean(row.passed),
    request: row.requestJson
      ? (JSON.parse(row.requestJson) as HttpRequest)
      : undefined,
    response: row.responseJson
      ? (JSON.parse(row.responseJson) as HttpResponse)
      : undefined,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.includes("T")
      ? row.createdAt
      : new Date(`${row.createdAt.replace(" ", "T")}Z`).toISOString(),
  };
}

export class TestResultRepository {
  constructor(private readonly db: SentinelDb) {}

  async listByRun(runId: string): Promise<TestResultRow[]> {
    const rows = await this.db
      .select()
      .from(testResults)
      .where(eq(testResults.runId, runId));
    return rows.map(mapRow);
  }

  async createMany(
    runId: string,
    items: TestResultInput[],
  ): Promise<TestResultRow[]> {
    const created: TestResultRow[] = [];
    for (const item of items) {
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      await this.db.insert(testResults).values({
        id,
        runId,
        endpointId: item.endpointId ?? null,
        testId: item.testId,
        testCaseId: item.testCaseId,
        passed: item.passed,
        requestJson: item.request ? JSON.stringify(item.request) : null,
        responseJson: item.response ? JSON.stringify(item.response) : null,
        notes: item.notes ?? null,
        createdAt,
      });
      created.push({
        id,
        runId,
        endpointId: item.endpointId,
        testId: item.testId,
        testCaseId: item.testCaseId,
        passed: item.passed,
        request: item.request,
        response: item.response,
        notes: item.notes,
        createdAt,
      });
    }
    return created;
  }
}
