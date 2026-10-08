import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { AuthType, type Environment, type LoginRecipe } from "@sw/core";
import type { SentinelDb } from "../client.js";
import { mapEnvironment } from "../mappers.js";
import {
  endpoints,
  environments,
  findings,
  projects,
  testResults,
  testRuns,
} from "../schema.js";

export interface CreateEnvironmentInput {
  projectId: string;
  name: string;
  baseUrl: string;
  authType?: Environment["authType"];
  secretRef?: string;
  headers?: Record<string, string>;
  productionSafetyMode?: boolean;
  loginRecipe?: LoginRecipe;
}

export interface UpdateEnvironmentInput {
  name?: string;
  baseUrl?: string;
  authType?: Environment["authType"];
  secretRef?: string | null;
  headers?: Record<string, string>;
  productionSafetyMode?: boolean;
  loginRecipe?: LoginRecipe | null;
}

export class EnvironmentRepository {
  constructor(private readonly db: SentinelDb) {}

  async listByProject(projectId: string): Promise<Environment[]> {
    const rows = await this.db
      .select()
      .from(environments)
      .where(eq(environments.projectId, projectId));
    return rows.map(mapEnvironment);
  }

  async getById(id: string): Promise<Environment | null> {
    const row = await this.db
      .select()
      .from(environments)
      .where(eq(environments.id, id))
      .get();
    return row ? mapEnvironment(row) : null;
  }

  async create(input: CreateEnvironmentInput): Promise<Environment> {
    const project = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .get();
    if (!project) {
      throw new Error(`Project not found: ${input.projectId}`);
    }

    const id = randomUUID();
    await this.db.insert(environments).values({
      id,
      projectId: input.projectId,
      name: input.name.trim(),
      baseUrl: input.baseUrl.trim(),
      authType: input.authType ?? AuthType.NONE,
      secretRef: input.secretRef ?? `env:${id}:auth`,
      headersJson: JSON.stringify(input.headers ?? {}),
      productionSafetyMode: input.productionSafetyMode ?? false,
      loginRecipeJson: input.loginRecipe
        ? JSON.stringify(input.loginRecipe)
        : null,
    });

    await this.touchProject(input.projectId);
    return (await this.getById(id))!;
  }

  async update(
    id: string,
    input: UpdateEnvironmentInput,
  ): Promise<Environment | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    await this.db
      .update(environments)
      .set({
        name: input.name?.trim() ?? existing.name,
        baseUrl: input.baseUrl?.trim() ?? existing.baseUrl,
        authType: input.authType ?? existing.authType,
        secretRef:
          input.secretRef === undefined
            ? (existing.secretRef ?? null)
            : input.secretRef,
        headersJson: JSON.stringify(input.headers ?? existing.headers),
        productionSafetyMode:
          input.productionSafetyMode ?? existing.productionSafetyMode,
        loginRecipeJson:
          input.loginRecipe === undefined
            ? existing.loginRecipe
              ? JSON.stringify(existing.loginRecipe)
              : null
            : input.loginRecipe
              ? JSON.stringify(input.loginRecipe)
              : null,
      })
      .where(eq(environments.id, id));

    await this.touchProject(existing.projectId);
    return this.getById(id);
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;

    // Findings e scans do ambiente saem junto (test_runs não tem ON DELETE CASCADE).
    const runs = await this.db
      .select({ id: testRuns.id })
      .from(testRuns)
      .where(eq(testRuns.environmentId, id));
    for (const run of runs) {
      await this.db.delete(findings).where(eq(findings.runId, run.id));
    }
    await this.db.delete(testRuns).where(eq(testRuns.environmentId, id));

    const owned = await this.db
      .select({ id: endpoints.id })
      .from(endpoints)
      .where(eq(endpoints.environmentId, id));
    for (const row of owned) {
      await this.db.delete(findings).where(eq(findings.endpointId, row.id));
      await this.db
        .update(testResults)
        .set({ endpointId: null })
        .where(eq(testResults.endpointId, row.id));
    }
    await this.db.delete(endpoints).where(eq(endpoints.environmentId, id));

    await this.db.delete(environments).where(eq(environments.id, id));
    await this.touchProject(existing.projectId);
    return true;
  }

  private async touchProject(projectId: string) {
    await this.db
      .update(projects)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(projects.id, projectId));
  }
}
