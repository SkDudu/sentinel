import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { HttpRequest, HttpResponse } from "@sw/core";
import type { SentinelDb } from "../client.js";
import { testResults, testRuns } from "../schema.js";

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

export interface RunLatencyPoint {
  runId: string;
  startedAt?: string;
  finishedAt?: string;
  sampleCount: number;
  p50: number;
  p95: number;
  p99: number;
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

function asIso(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value.includes("T")) return value;
  return new Date(`${value.replace(" ", "T")}Z`).toISOString();
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))] ?? 0;
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

  /**
   * Latency percentiles per scan run for an environment (oldest → newest).
   * Reads durationMs from stored response JSON only.
   */
  async listLatencyByEnvironment(
    environmentId: string,
    limit = 12,
  ): Promise<RunLatencyPoint[]> {
    const runRows = await this.db
      .select()
      .from(testRuns)
      .where(eq(testRuns.environmentId, environmentId));

    const ordered = runRows
      .map((row) => ({
        id: row.id,
        startedAt: asIso(row.startedAt),
        finishedAt: asIso(row.finishedAt),
      }))
      .sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""))
      .slice(-Math.max(1, limit));

    const points: RunLatencyPoint[] = [];
    for (const run of ordered) {
      const resultRows = await this.db
        .select({ responseJson: testResults.responseJson })
        .from(testResults)
        .where(eq(testResults.runId, run.id));

      const durations: number[] = [];
      for (const row of resultRows) {
        if (!row.responseJson) continue;
        try {
          const response = JSON.parse(row.responseJson) as {
            durationMs?: number;
          };
          if (
            typeof response.durationMs === "number" &&
            Number.isFinite(response.durationMs) &&
            response.durationMs >= 0
          ) {
            durations.push(response.durationMs);
          }
        } catch {
          // skip malformed row
        }
      }
      if (durations.length === 0) continue;
      durations.sort((a, b) => a - b);
      points.push({
        runId: run.id,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        sampleCount: durations.length,
        p50: Math.round(percentile(durations, 50)),
        p95: Math.round(percentile(durations, 95)),
        p99: Math.round(percentile(durations, 99)),
      });
    }
    return points;
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
