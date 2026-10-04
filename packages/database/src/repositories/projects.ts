import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Environment, Project } from "@sw/core";
import type { SentinelDb } from "../client.js";
import { mapEnvironment, mapProject } from "../mappers.js";
import { environments, projects } from "../schema.js";

export interface ProjectWithEnvironments extends Project {
  environments: Environment[];
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
}

export class ProjectRepository {
  constructor(private readonly db: SentinelDb) {}

  async list(): Promise<ProjectWithEnvironments[]> {
    const projectRows = await this.db.select().from(projects);
    const envRows = await this.db.select().from(environments);

    return projectRows
      .map((row) => {
        const project = mapProject(row);
        return {
          ...project,
          environments: envRows
            .filter((env) => env.projectId === project.id)
            .map(mapEnvironment),
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getById(id: string): Promise<ProjectWithEnvironments | null> {
    const row = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .get();
    if (!row) return null;

    const envRows = await this.db
      .select()
      .from(environments)
      .where(eq(environments.projectId, id));

    return {
      ...mapProject(row),
      environments: envRows.map(mapEnvironment),
    };
  }

  async create(input: CreateProjectInput): Promise<ProjectWithEnvironments> {
    const now = new Date().toISOString();
    const id = randomUUID();

    await this.db.insert(projects).values({
      id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      createdAt: now,
      updatedAt: now,
    });

    return (await this.getById(id))!;
  }

  async update(
    id: string,
    input: UpdateProjectInput,
  ): Promise<ProjectWithEnvironments | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    await this.db
      .update(projects)
      .set({
        name: input.name?.trim() ?? existing.name,
        description:
          input.description === undefined
            ? (existing.description ?? null)
            : input.description?.trim() || null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(projects.id, id));

    return this.getById(id);
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;
    await this.db.delete(projects).where(eq(projects.id, id));
    return true;
  }
}
