import type { Endpoint } from "@sw/core";

export type EndpointTreeKind = "group" | "endpoint";

export type EndpointTreeNode = {
  id: string;
  kind: EndpointTreeKind;
  /** Segmento curto (ex.: auth) ou path do endpoint. */
  label: string;
  /** Caminho completo da tag (só grupos). */
  tagPath?: string;
  endpointCount: number;
  method?: Endpoint["method"];
  path?: string;
  summary?: string;
  parameters?: number;
  tags?: string[];
  endpoint?: Endpoint;
  subRows?: EndpointTreeNode[];
};

type MutableGroup = {
  id: string;
  label: string;
  tagPath: string;
  children: Map<string, MutableGroup>;
  endpoints: Endpoint[];
};

const LABEL_ALIASES: Record<string, string> = {
  admin: "Admin",
  cliente: "Cliente",
  saude: "Saúde",
  auth: "Auth",
  catalogo: "Catálogo",
  dashboard: "Dashboard",
  encartes: "Encartes",
  storage: "Storage",
  scraper: "Scraper",
  supermercados: "Supermercados",
  ofertas: "Ofertas",
  extracao: "Extração",
  configuracoes: "Configurações",
  alertas: "Alertas",
  busca: "Busca",
  conta: "Conta",
  filiais: "Filiais",
  redes: "Redes",
  produtos: "Produtos",
  marcas: "Marcas",
  precos: "Preços",
  fluxos: "Fluxos",
  jobs: "Jobs",
  workers: "Workers",
  validacao: "Validação",
  normalizacao: "Normalização",
  preferencias: "Preferências",
  inbox: "Inbox",
  localizacao: "Localização",
};

function displayLabel(segment: string): string {
  if (segment === "(sem-tag)") return "Sem tag";
  return (
    LABEL_ALIASES[segment] ??
    segment.charAt(0).toUpperCase() + segment.slice(1)
  );
}

function ensureGroup(
  root: Map<string, MutableGroup>,
  parts: string[],
): MutableGroup {
  let map = root;
  let node: MutableGroup | undefined;
  let acc = "";
  for (const segment of parts) {
    acc = acc ? `${acc}.${segment}` : segment;
    let next = map.get(segment);
    if (!next) {
      next = {
        id: `group:${acc}`,
        label: displayLabel(segment),
        tagPath: acc,
        children: new Map(),
        endpoints: [],
      };
      map.set(segment, next);
    }
    node = next;
    map = next.children;
  }
  return node!;
}

function toTreeNode(group: MutableGroup): EndpointTreeNode {
  const childGroups = [...group.children.values()]
    .map(toTreeNode)
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  const leaves: EndpointTreeNode[] = group.endpoints
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
    .map((endpoint) => ({
      id: endpoint.id,
      kind: "endpoint" as const,
      label: endpoint.path,
      endpointCount: 1,
      method: endpoint.method,
      path: endpoint.path,
      summary: endpoint.summary ?? "",
      parameters: endpoint.parameters.length,
      tags: endpoint.tags,
      endpoint,
    }));

  const subRows = [...childGroups, ...leaves];
  const endpointCount = subRows.reduce(
    (sum, row) => sum + row.endpointCount,
    0,
  );

  return {
    id: group.id,
    kind: "group",
    label: group.label,
    tagPath: group.tagPath,
    endpointCount,
    subRows,
  };
}

/** Agrupa endpoints pela hierarquia da primeira tag OpenAPI (`admin.auth` → Admin → Auth). */
export function buildEndpointTree(endpoints: Endpoint[]): EndpointTreeNode[] {
  const root = new Map<string, MutableGroup>();

  for (const endpoint of endpoints) {
    const raw = endpoint.tags?.[0]?.trim() || "(sem-tag)";
    const parts = raw.split(".").filter(Boolean);
    const group = ensureGroup(root, parts.length > 0 ? parts : ["(sem-tag)"]);
    group.endpoints.push(endpoint);
  }

  return [...root.values()]
    .map(toTreeNode)
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

/** IDs dos grupos de primeiro nível, para expandir por padrão. */
export function topLevelExpandedState(
  tree: EndpointTreeNode[],
): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  tree.forEach((node, index) => {
    if (node.kind === "group") state[String(index)] = true;
  });
  return state;
}
