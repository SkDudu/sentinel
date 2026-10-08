import { TestCategory, type Endpoint } from "@sw/core";
import type { EndpointTreeNode } from "../environments/endpoint-tree";

export const SCAN_SUITE_OPTIONS: Array<{
  id: TestCategory;
  label: string;
}> = [
  { id: TestCategory.AUTHENTICATION, label: "Autenticação" },
  { id: TestCategory.AUTHORIZATION, label: "Autorização" },
  { id: TestCategory.VALIDATION, label: "Validação" },
  { id: TestCategory.HTTP, label: "HTTP" },
  { id: TestCategory.RATE_LIMIT, label: "Rate limit" },
];

export const ALL_SCAN_SUITE_IDS: TestCategory[] = SCAN_SUITE_OPTIONS.map(
  (s) => s.id,
);

const SUITE_LABELS: Record<TestCategory, string> = {
  [TestCategory.AUTHENTICATION]: "Autenticação",
  [TestCategory.AUTHORIZATION]: "Autorização",
  [TestCategory.INJECTION]: "Injeção",
  [TestCategory.VALIDATION]: "Validação",
  [TestCategory.RATE_LIMIT]: "Rate limit",
  [TestCategory.HTTP]: "HTTP",
  [TestCategory.BUSINESS_LOGIC]: "Lógica de negócio",
  [TestCategory.AI_GENERATED]: "Casos IA",
};

/** Rótulo das suites de um run; [] = scan completo, undefined = não registrado. */
export function scanSuitesLabel(categories: TestCategory[] | undefined): string {
  if (!categories) return "Não registrado";
  if (categories.length === 0) return "Todas as suites";
  return categories.map((id) => SUITE_LABELS[id] ?? id).join(", ");
}

export type ScanScopePayload = {
  endpointIds: string[];
  categories?: TestCategory[];
};

/** Todos os IDs de endpoint sob um nó (grupo ou folha). */
export function collectEndpointIdsFromNode(
  node: EndpointTreeNode,
): string[] {
  if (node.kind === "endpoint") return [node.id];
  return (node.subRows ?? []).flatMap(collectEndpointIdsFromNode);
}

export function collectEndpointIdsFromTree(
  tree: EndpointTreeNode[],
): string[] {
  return tree.flatMap(collectEndpointIdsFromNode);
}

/** checked | indeterminate | unchecked a partir do conjunto selecionado. */
export function checkboxStateForIds(
  ids: string[],
  selected: ReadonlySet<string>,
): boolean | "indeterminate" {
  if (ids.length === 0) return false;
  let n = 0;
  for (const id of ids) {
    if (selected.has(id)) n += 1;
  }
  if (n === 0) return false;
  if (n === ids.length) return true;
  return "indeterminate";
}

/** Omit categories when every suite is selected (full default scan). */
export function categoriesForRequest(
  selected: TestCategory[],
): TestCategory[] | undefined {
  if (selected.length === 0) return [];
  if (
    selected.length === ALL_SCAN_SUITE_IDS.length &&
    ALL_SCAN_SUITE_IDS.every((id) => selected.includes(id))
  ) {
    return undefined;
  }
  return selected;
}
