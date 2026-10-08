import {
  ANONYMOUS_PERSONA,
  type AccessRule,
  type Endpoint,
  type Resource,
} from "@sw/core";
import { locateResource, resourceFixtureKey, resourceKey } from "./relations.js";

export interface AccessPersonaHint {
  id: string;
  role?: string;
  /** Só as chaves: valores de fixture não saem do binding. */
  fixtureKeys: string[];
}

const ADMIN_ROLE = /admin|super/i;
const PARAM = /^\{(\w+)\}$|^:(\w+)$/;

function camel(key: string): string {
  return key.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
}

/** Param do path → chave de fixture que a persona tem (ou undefined). */
function fixtureFor(
  param: string,
  owner: Resource | undefined,
  keys: ReadonlySet<string>,
): string | undefined {
  const base = owner ? resourceKey(owner.name) : undefined;
  const candidates = [
    param,
    owner ? resourceFixtureKey(owner) : undefined,
    base ? `${base}_id` : undefined,
    base ? `${camel(base)}Id` : undefined,
  ];
  return candidates.find((key): key is string => Boolean(key && keys.has(key)));
}

/**
 * Pré-preenche a matriz pelo grafo, só nos endpoints de recurso:
 * anônimo → deny; role admin → allow; persona com fixture de todos os
 * params do path → own-only. Sem certeza → célula fica vazia para revisão.
 */
export function suggestAccessFromGraph(input: {
  endpoints: Endpoint[];
  resources: Resource[];
  personas: AccessPersonaHint[];
}): AccessRule[] {
  const byName = new Map(input.resources.map((resource) => [resource.name, resource]));
  const names = new Set(byName.keys());
  const rules: AccessRule[] = [];

  for (const endpoint of input.endpoints) {
    if (!locateResource(endpoint.path, names)) continue;
    rules.push({ endpointId: endpoint.id, personaId: ANONYMOUS_PERSONA, expect: "deny" });

    const segments = endpoint.path.split("/").filter(Boolean);
    const params = segments.flatMap((segment, index) => {
      const match = segment.match(PARAM);
      const name = match ? (match[1] ?? match[2])! : undefined;
      return name ? [{ name, owner: byName.get(segments[index - 1] ?? "") }] : [];
    });

    for (const persona of input.personas) {
      if (persona.role && ADMIN_ROLE.test(persona.role)) {
        rules.push({ endpointId: endpoint.id, personaId: persona.id, expect: "allow" });
        continue;
      }
      if (params.length === 0) continue;
      const keys = new Set(persona.fixtureKeys);
      const pathFixtures: Record<string, string> = {};
      for (const param of params) {
        const key = fixtureFor(param.name, param.owner, keys);
        if (!key) break;
        pathFixtures[param.name] = key;
      }
      if (Object.keys(pathFixtures).length === params.length) {
        rules.push({
          endpointId: endpoint.id,
          personaId: persona.id,
          expect: "own-only",
          pathFixtures,
        });
      }
    }
  }
  return rules;
}
