import { and, eq } from "drizzle-orm";
import { AuthType, type PersonaBinding } from "@sw/core";
import type { SentinelDb } from "../client.js";
import { personaBindings } from "../schema.js";

function mapBinding(row: typeof personaBindings.$inferSelect): PersonaBinding {
  let fixtures: Record<string, string> = {};
  try {
    fixtures = JSON.parse(row.fixturesJson) as Record<string, string>;
  } catch {
    fixtures = {};
  }
  return {
    environmentId: row.environmentId,
    personaId: row.personaId,
    authType: (Object.values(AuthType) as string[]).includes(row.authType)
      ? (row.authType as PersonaBinding["authType"])
      : AuthType.NONE,
    secretRef: row.secretRef ?? undefined,
    fixtures,
  };
}

export class PersonaBindingRepository {
  constructor(private readonly db: SentinelDb) {}

  async listByEnvironment(environmentId: string): Promise<PersonaBinding[]> {
    const rows = await this.db
      .select()
      .from(personaBindings)
      .where(eq(personaBindings.environmentId, environmentId));
    return rows.map(mapBinding);
  }

  async get(
    environmentId: string,
    personaId: string,
  ): Promise<PersonaBinding | null> {
    const row = await this.db
      .select()
      .from(personaBindings)
      .where(
        and(
          eq(personaBindings.environmentId, environmentId),
          eq(personaBindings.personaId, personaId),
        ),
      )
      .get();
    return row ? mapBinding(row) : null;
  }

  async upsert(binding: PersonaBinding): Promise<PersonaBinding> {
    await this.delete(binding.environmentId, binding.personaId);
    await this.db.insert(personaBindings).values({
      environmentId: binding.environmentId,
      personaId: binding.personaId,
      authType: binding.authType,
      secretRef: binding.secretRef ?? null,
      fixturesJson: JSON.stringify(binding.fixtures ?? {}),
    });
    return (await this.get(binding.environmentId, binding.personaId))!;
  }

  async delete(environmentId: string, personaId: string): Promise<boolean> {
    const existing = await this.get(environmentId, personaId);
    if (!existing) return false;
    await this.db
      .delete(personaBindings)
      .where(
        and(
          eq(personaBindings.environmentId, environmentId),
          eq(personaBindings.personaId, personaId),
        ),
      );
    return true;
  }
}
