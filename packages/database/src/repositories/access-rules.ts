import { and, eq } from "drizzle-orm";
import type { AccessRule, Endpoint } from "@sw/core";
import type { SentinelDb } from "../client.js";
import { accessRules } from "../schema.js";

const contractKey = (method: string, path: string) => `${method.toUpperCase()} ${path}`;

export class AccessRuleRepository {
  constructor(private readonly db: SentinelDb) {}

  async listByEnvironment(environmentId: string): Promise<AccessRule[]> {
    const rows = await this.db
      .select()
      .from(accessRules)
      .where(eq(accessRules.environmentId, environmentId));
    return rows.map((row) => ({
      endpointId: row.endpointId,
      personaId: row.personaId,
      expect: row.expect as AccessRule["expect"],
      ...(row.pathFixturesJson
        ? { pathFixtures: JSON.parse(row.pathFixturesJson) as Record<string, string> }
        : {}),
    }));
  }

  /** Substitui a matriz; regra de endpoint fora do ambiente é ignorada. */
  async replace(
    environmentId: string,
    rules: AccessRule[],
    endpoints: Endpoint[],
  ): Promise<AccessRule[]> {
    const byId = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint]));
    await this.db
      .delete(accessRules)
      .where(eq(accessRules.environmentId, environmentId));
    const seen = new Set<string>();
    for (const rule of rules) {
      const endpoint = byId.get(rule.endpointId);
      const key = `${rule.endpointId}\n${rule.personaId}`;
      if (!endpoint || seen.has(key)) continue;
      seen.add(key);
      await this.db.insert(accessRules).values({
        environmentId,
        endpointId: endpoint.id,
        method: endpoint.method,
        path: endpoint.path,
        personaId: rule.personaId,
        expect: rule.expect,
        pathFixturesJson:
          rule.pathFixtures && Object.keys(rule.pathFixtures).length > 0
            ? JSON.stringify(rule.pathFixtures)
            : null,
      });
    }
    return this.listByEnvironment(environmentId);
  }

  /** Reimport: reaponta regras por method + path; descarta as órfãs. */
  async remap(environmentId: string, endpoints: Endpoint[]): Promise<number> {
    const byKey = new Map(
      endpoints.map((endpoint) => [contractKey(endpoint.method, endpoint.path), endpoint.id]),
    );
    const rows = await this.db
      .select()
      .from(accessRules)
      .where(eq(accessRules.environmentId, environmentId));
    let dropped = 0;
    for (const row of rows) {
      const where = and(
        eq(accessRules.environmentId, environmentId),
        eq(accessRules.endpointId, row.endpointId),
        eq(accessRules.personaId, row.personaId),
      );
      const endpointId = byKey.get(contractKey(row.method, row.path));
      if (!endpointId) {
        await this.db.delete(accessRules).where(where);
        dropped += 1;
      } else if (endpointId !== row.endpointId) {
        await this.db.update(accessRules).set({ endpointId }).where(where);
      }
    }
    return dropped;
  }

  async deleteByPersona(environmentId: string, personaId: string): Promise<void> {
    await this.db
      .delete(accessRules)
      .where(
        and(
          eq(accessRules.environmentId, environmentId),
          eq(accessRules.personaId, personaId),
        ),
      );
  }
}
