import { useEffect, useMemo, useState } from "react";
import type { Endpoint, TestCategory } from "@sw/core";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import {
  StatusBadge,
  type StatusLevel,
} from "@/components/dashboardblocks/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  buildEndpointTree,
  type EndpointTreeNode,
} from "../environments/endpoint-tree";

function expandedTopLevel(tree: EndpointTreeNode[]): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  for (const node of tree) {
    if (node.kind === "group") state[node.id] = true;
  }
  return state;
}
import {
  ALL_SCAN_SUITE_IDS,
  categoriesForRequest,
  checkboxStateForIds,
  collectEndpointIdsFromNode,
  collectEndpointIdsFromTree,
  SCAN_SUITE_OPTIONS,
  type ScanScopePayload,
} from "./scan-scope";

const METHOD_STATUS: Record<Endpoint["method"], StatusLevel> = {
  GET: "operational",
  POST: "degraded",
  PUT: "partial",
  PATCH: "maintenance",
  DELETE: "major",
  HEAD: "unknown",
  OPTIONS: "unknown",
};

function filterEndpoints(endpoints: Endpoint[], query: string): Endpoint[] {
  const q = query.trim().toLowerCase();
  if (!q) return endpoints;
  return endpoints.filter((endpoint) => {
    if (endpoint.path.toLowerCase().includes(q)) return true;
    if (endpoint.method.toLowerCase().includes(q)) return true;
    if ((endpoint.summary ?? "").toLowerCase().includes(q)) return true;
    if ((endpoint.operationId ?? "").toLowerCase().includes(q)) return true;
    return endpoint.tags.some((tag) => tag.toLowerCase().includes(q));
  });
}

function ScopeTreeRow({
  node,
  depth,
  expanded,
  selectedIds,
  busy,
  onToggleExpand,
  onToggleIds,
}: {
  node: EndpointTreeNode;
  depth: number;
  expanded: Record<string, boolean>;
  selectedIds: ReadonlySet<string>;
  busy?: boolean;
  onToggleExpand: (id: string) => void;
  onToggleIds: (ids: string[], next: boolean) => void;
}) {
  const ids = collectEndpointIdsFromNode(node);
  const checked = checkboxStateForIds(ids, selectedIds);
  const isExpanded = expanded[node.id] === true;
  const hasChildren = Boolean(node.subRows?.length);

  return (
    <li>
      <div
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1.5",
          depth > 0 && "bg-muted/10",
        )}
        style={{ paddingLeft: `${0.5 + depth * 1.1}rem` }}
      >
        {node.kind === "group" && hasChildren ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground size-6 shrink-0"
            disabled={busy}
            onClick={() => onToggleExpand(node.id)}
            aria-label={isExpanded ? "Recolher grupo" : "Expandir grupo"}
          >
            {isExpanded ? (
              <ChevronDownIcon className="size-4" />
            ) : (
              <ChevronRightIcon className="size-4" />
            )}
          </Button>
        ) : (
          <span className="size-6 shrink-0" />
        )}

        <Checkbox
          id={`scope-node-${node.id}`}
          checked={checked === true}
          indeterminate={checked === "indeterminate"}
          disabled={busy || ids.length === 0}
          onCheckedChange={(value) => onToggleIds(ids, value === true)}
        />

        {node.kind === "group" ? (
          <label
            htmlFor={`scope-node-${node.id}`}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
          >
            <span className="truncate font-medium">{node.label}</span>
            <Badge variant="secondary" className="tabular-nums">
              {node.endpointCount}
            </Badge>
            {node.tagPath ? (
              <span className="text-muted-foreground truncate font-mono text-[11px]">
                {node.tagPath}
              </span>
            ) : null}
          </label>
        ) : (
          <label
            htmlFor={`scope-node-${node.id}`}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
          >
            {node.method ? (
              <StatusBadge
                hideIcon
                status={METHOD_STATUS[node.method]}
                label={node.method}
              />
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-xs">
                {node.path}
              </span>
              <span className="text-muted-foreground block truncate text-xs font-normal">
                {node.summary || "—"}
              </span>
            </span>
          </label>
        )}
      </div>

      {node.kind === "group" && isExpanded && hasChildren ? (
        <ul>
          {node.subRows!.map((child) => (
            <ScopeTreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedIds={selectedIds}
              busy={busy}
              onToggleExpand={onToggleExpand}
              onToggleIds={onToggleIds}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ScanScopeDialog({
  open,
  onOpenChange,
  endpoints = [],
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpoints?: Endpoint[];
  busy?: boolean;
  onConfirm: (scope: ScanScopePayload) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectedSuites, setSelectedSuites] =
    useState<TestCategory[]>(ALL_SCAN_SUITE_IDS);
  const [matrix, setMatrix] = useState(false);
  const [groupFilter, setGroupFilter] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fullTree = useMemo(() => buildEndpointTree(endpoints), [endpoints]);

  const filteredEndpoints = useMemo(
    () => filterEndpoints(endpoints, query),
    [endpoints, query],
  );

  const filteredTree = useMemo(() => {
    const tree = buildEndpointTree(filteredEndpoints);
    if (groupFilter.length === 0) return tree;
    const allow = new Set(groupFilter);
    return tree.filter((node) => allow.has(node.id));
  }, [filteredEndpoints, groupFilter]);

  /** Endpoints permitidos pelo chip de grupo (Tudo = todos). */
  const scopedIds = useMemo(() => {
    if (groupFilter.length === 0) {
      return new Set(endpoints.map((e) => e.id));
    }
    const allow = new Set(groupFilter);
    return new Set(
      fullTree
        .filter((node) => allow.has(node.id))
        .flatMap(collectEndpointIdsFromNode),
    );
  }, [endpoints, fullTree, groupFilter]);

  const visibleIds = useMemo(
    () => collectEndpointIdsFromTree(filteredTree),
    [filteredTree],
  );

  const selectedCount = useMemo(() => {
    let n = 0;
    for (const id of selectedIds) {
      if (scopedIds.has(id)) n += 1;
    }
    return n;
  }, [selectedIds, scopedIds]);

  const visibleSelection = checkboxStateForIds(visibleIds, selectedIds);
  const endpointWork = selectedSuites.length > 0 || matrix;
  const canConfirm = !busy && selectedCount > 0 && endpointWork;

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set(endpoints.map((e) => e.id)));
    setGroupFilter([]);
    setQuery("");
    setExpanded(expandedTopLevel(buildEndpointTree(endpoints)));
  }, [open, endpoints]);

  /** Chip de grupo define o escopo do scan — remove seleção fora do grupo. */
  useEffect(() => {
    if (!open || groupFilter.length === 0) return;
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (scopedIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [open, groupFilter, scopedIds]);

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      for (const node of filteredTree) {
        if (node.kind === "group" && next[node.id] === undefined) {
          next[node.id] = true;
        }
      }
      return next;
    });
  }, [filteredTree]);

  function toggleGroupFilter(groupId: string) {
    const adding = !groupFilter.includes(groupId);
    if (adding) {
      const node = fullTree.find((n) => n.id === groupId);
      const ids = node ? collectEndpointIdsFromNode(node) : [];
      setSelectedIds((prev) => new Set([...prev, ...ids]));
    }
    setGroupFilter((prev) =>
      adding ? [...prev, groupId] : prev.filter((id) => id !== groupId),
    );
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleIds(ids: string[], next: boolean) {
    setSelectedIds((prev) => {
      const set = new Set(prev);
      for (const id of ids) {
        if (!scopedIds.has(id)) continue;
        if (next) set.add(id);
        else set.delete(id);
      }
      return set;
    });
  }

  function selectAllVisible() {
    toggleIds(visibleIds, true);
  }

  function clearVisible() {
    toggleIds(visibleIds, false);
  }

  function expandAll() {
    const next: Record<string, boolean> = {};
    const walk = (nodes: EndpointTreeNode[]) => {
      for (const node of nodes) {
        if (node.kind === "group" && node.subRows?.length) {
          next[node.id] = true;
          walk(node.subRows);
        }
      }
    };
    walk(filteredTree);
    setExpanded(next);
  }

  function collapseAll() {
    setExpanded({});
  }

  function toggleSuite(id: TestCategory) {
    setSelectedSuites((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  function handleConfirm() {
    if (!canConfirm) return;
    const endpointIds = [...selectedIds].filter((id) => scopedIds.has(id));
    onConfirm({
      endpointIds,
      categories: categoriesForRequest(selectedSuites),
      ...(matrix
        ? { matrix: true, matrixOnly: selectedSuites.length === 0 }
        : {}),
    });
    onOpenChange(false);
  }

  const allExpanded =
    filteredTree.length > 0 &&
    filteredTree.every(
      (node) => node.kind !== "group" || expanded[node.id] === true,
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex h-[85vh] max-h-[85vh] w-[min(920px,92vw)] max-w-[920px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[920px]"
      >
        <DialogHeader className="shrink-0 gap-1 border-b px-6 py-4">
          <DialogTitle>Rodar scan</DialogTitle>
          <DialogDescription>
            Escolha o grupo (escopo), marque os endpoints e as suites a
            executar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="flex min-h-0 flex-col overflow-hidden border-b md:border-r md:border-b-0">
            <div className="shrink-0 space-y-3 border-b px-6 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Endpoints</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {selectedCount} de {endpoints.length} selecionados
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setGroupFilter([]);
                    setSelectedIds(new Set(endpoints.map((e) => e.id)));
                  }}
                  className="outline-none"
                >
                  <Badge
                    variant={groupFilter.length === 0 ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer",
                      busy && "pointer-events-none opacity-50",
                    )}
                  >
                    Tudo ({endpoints.length})
                  </Badge>
                </button>
                {fullTree.map((group) => {
                  const active = groupFilter.includes(group.id);
                  return (
                    <button
                      key={group.id}
                      type="button"
                      disabled={busy}
                      onClick={() => toggleGroupFilter(group.id)}
                      className="outline-none"
                    >
                      <Badge
                        variant={active ? "default" : "outline"}
                        className={cn(
                          "cursor-pointer",
                          busy && "pointer-events-none opacity-50",
                        )}
                      >
                        {group.label} ({group.endpointCount})
                      </Badge>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Filtrar path, tag, método…"
                  value={query}
                  disabled={busy}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-8 min-w-[12rem] flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || visibleIds.length === 0}
                  onClick={() =>
                    visibleSelection === true
                      ? clearVisible()
                      : selectAllVisible()
                  }
                >
                  {visibleSelection === true
                    ? "Desmarcar visíveis"
                    : "Marcar visíveis"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || filteredTree.length === 0}
                  onClick={() => (allExpanded ? collapseAll() : expandAll())}
                >
                  {allExpanded ? "Recolher tudo" : "Expandir tudo"}
                </Button>
              </div>
            </div>

            <ScrollArea className="h-0 min-h-0 flex-1 px-3">
              {filteredTree.length > 0 ? (
                <ul className="space-y-0.5 py-2">
                  {filteredTree.map((node) => (
                    <ScopeTreeRow
                      key={node.id}
                      node={node}
                      depth={0}
                      expanded={expanded}
                      selectedIds={selectedIds}
                      busy={busy}
                      onToggleExpand={toggleExpand}
                      onToggleIds={toggleIds}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground px-3 py-8 text-center text-sm">
                  Nenhum endpoint corresponde ao filtro.
                </p>
              )}
            </ScrollArea>
          </div>

          <ScrollArea className="min-h-0 md:h-full">
            <div className="space-y-3 px-6 py-4">
              <p className="text-sm font-medium">Suites</p>
              <ul className="grid gap-2">
                {SCAN_SUITE_OPTIONS.map((suite) => {
                  const checked = selectedSuites.includes(suite.id);
                  return (
                    <li key={suite.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`scope-suite-${suite.id}`}
                        checked={checked}
                        disabled={busy}
                        onCheckedChange={() => toggleSuite(suite.id)}
                      />
                      <label
                        htmlFor={`scope-suite-${suite.id}`}
                        className="text-sm"
                      >
                        {suite.label}
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center gap-2 border-t pt-3">
                <Checkbox
                  id="scope-matrix"
                  checked={matrix}
                  disabled={busy}
                  onCheckedChange={(value) => setMatrix(value === true)}
                />
                <label htmlFor="scope-matrix" className="text-sm">
                  Matriz de acesso
                </label>
              </div>
              {matrix && selectedSuites.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Só a matriz roda, nos endpoints com regra.
                </p>
              ) : null}
              {!endpointWork ? (
                <p className="text-xs text-destructive">
                  Selecione uma suite ou a matriz.
                </p>
              ) : null}
              {endpointWork && selectedCount === 0 ? (
                <p className="text-xs text-destructive">
                  Selecione ao menos um endpoint.
                </p>
              ) : null}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0 px-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={!canConfirm} onClick={handleConfirm}>
            Iniciar scan ({selectedCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
