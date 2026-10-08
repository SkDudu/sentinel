import { useEffect, useMemo, useState } from "react";
import type { Endpoint } from "@sw/core";
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createExpandedRowModel,
  createFilteredRowModel,
  filterFns,
  flexRender,
  globalFilteringFeature,
  rowExpandingFeature,
  tableFeatures,
  useTable,
  type ExpandedState,
} from "@tanstack/react-table";
import { ChevronDownIcon, ChevronRightIcon, Trash2Icon } from "lucide-react";
import {
  StatusBadge,
  type StatusLevel,
} from "@/components/dashboardblocks/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  buildEndpointTree,
  topLevelExpandedState,
  type EndpointTreeNode,
} from "./endpoint-tree";

const METHOD_STATUS: Record<Endpoint["method"], StatusLevel> = {
  GET: "operational",
  POST: "degraded",
  PUT: "partial",
  PATCH: "maintenance",
  DELETE: "major",
  HEAD: "unknown",
  OPTIONS: "unknown",
};

const treeFeatures = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  expandedRowModel: createExpandedRowModel(),
  filterFns,
  filteredRowModel: createFilteredRowModel(),
  globalFilteringFeature,
  rowExpandingFeature,
});

const columnHelper = createColumnHelper<typeof treeFeatures, EndpointTreeNode>();

export function EndpointsTreeTable({
  endpoints,
  title = "OpenAPI",
  description,
  loading = false,
  busyId = null,
  selectedId = null,
  onSelect,
  onDelete,
}: {
  endpoints: Endpoint[];
  title?: string;
  description?: string;
  loading?: boolean;
  busyId?: string | null;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [globalFilter, setGlobalFilter] = useState("");

  const filteredEndpoints = useMemo(() => {
    const q = globalFilter.trim().toLowerCase();
    if (!q) return endpoints;
    return endpoints.filter((endpoint) => {
      if (endpoint.path.toLowerCase().includes(q)) return true;
      if (endpoint.method.toLowerCase().includes(q)) return true;
      if ((endpoint.summary ?? "").toLowerCase().includes(q)) return true;
      if ((endpoint.description ?? "").toLowerCase().includes(q)) return true;
      if ((endpoint.operationId ?? "").toLowerCase().includes(q)) return true;
      return endpoint.tags.some((tag) => tag.toLowerCase().includes(q));
    });
  }, [endpoints, globalFilter]);

  const tree = useMemo(
    () => buildEndpointTree(filteredEndpoints),
    [filteredEndpoints],
  );

  useEffect(() => {
    setExpanded(topLevelExpandedState(tree));
  }, [tree]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "endpoint",
        header: "Endpoint",
        cell: ({ row }) => {
          const node = row.original;
          const canExpand = row.getCanExpand();
          const depth = row.depth;

          if (node.kind === "group") {
            return (
              <div
                className="flex min-w-0 items-center gap-2"
                style={{ paddingLeft: `${depth * 1.25}rem` }}
              >
                {canExpand ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground size-6 shrink-0"
                    onClick={row.getToggleExpandedHandler()}
                    aria-label={
                      row.getIsExpanded() ? "Recolher grupo" : "Expandir grupo"
                    }
                  >
                    {row.getIsExpanded() ? (
                      <ChevronDownIcon className="size-4" />
                    ) : (
                      <ChevronRightIcon className="size-4" />
                    )}
                  </Button>
                ) : (
                  <span className="size-6 shrink-0" />
                )}
                <span className="truncate font-medium">{node.label}</span>
                <Badge variant="secondary" className="tabular-nums">
                  {node.endpointCount}
                </Badge>
                {node.tagPath ? (
                  <span className="text-muted-foreground truncate font-mono text-[11px]">
                    {node.tagPath}
                  </span>
                ) : null}
              </div>
            );
          }

          return (
            <div
              className="flex min-w-0 items-center gap-2"
              style={{ paddingLeft: `${depth * 1.25}rem` }}
            >
              <span className="size-6 shrink-0" />
              <button
                type="button"
                className="block min-w-0 max-w-full text-left"
                onClick={() => onSelect?.(node.id)}
              >
                <span className="block truncate font-mono text-xs">
                  {node.path}
                </span>
                <span className="text-muted-foreground block truncate text-xs font-normal">
                  {node.summary || "—"}
                </span>
              </button>
            </div>
          );
        },
      }),
      columnHelper.display({
        id: "method",
        header: "Método",
        cell: ({ row }) => {
          const node = row.original;
          if (node.kind !== "endpoint" || !node.method) return null;
          return (
            <StatusBadge
              hideIcon
              status={METHOD_STATUS[node.method]}
              label={node.method}
            />
          );
        },
      }),
      columnHelper.display({
        id: "parameters",
        header: "Params",
        cell: ({ row }) => {
          const node = row.original;
          if (node.kind !== "endpoint") return null;
          return (
            <span className="tabular-nums text-muted-foreground">
              {node.parameters ?? 0}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: "tags",
        header: "Tags",
        cell: ({ row }) => {
          const node = row.original;
          if (node.kind !== "endpoint") return null;
          const tags = node.tags ?? [];
          if (tags.length === 0) {
            return <span className="text-muted-foreground">—</span>;
          }
          return (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge key={tag} variant="outline" className="font-mono text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: () => <span className="sr-only">Ações</span>,
        cell: ({ row }) => {
          const node = row.original;
          if (node.kind !== "endpoint" || !onDelete) return null;
          const busy = busyId === node.id;
          return (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive"
              disabled={busy}
              onClick={() => onDelete(node.id)}
              aria-label={`Excluir ${node.method} ${node.path}`}
            >
              {busy ? <Spinner className="size-3.5" /> : <Trash2Icon className="size-3.5" />}
            </Button>
          );
        },
      }),
    ],
    [busyId, onDelete, onSelect],
  );

  const table = useTable({
    columns,
    data: tree,
    features: treeFeatures,
    state: { expanded },
    onExpandedChange: setExpanded,
    getSubRows: (row) => row.subRows,
    getRowCanExpand: (row) => Boolean(row.original.subRows?.length),
    getRowId: (row) => row.id,
  });

  const rows = table.getRowModel().rows;

  return (
    <Card className="@container/data-table gap-0 pb-0">
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description ??
            (loading
              ? "Carregando…"
              : globalFilter.trim()
                ? `${filteredEndpoints.length} de ${endpoints.length} endpoints`
                : `${endpoints.length} endpoints · agrupados por tags OpenAPI`)}
        </CardDescription>
        <CardAction className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Filtrar path, tag, método…"
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="h-8 w-48 sm:w-56"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => table.toggleAllRowsExpanded()}
          >
            {table.getIsAllRowsExpanded() ? "Recolher tudo" : "Expandir tudo"}
          </Button>
        </CardAction>
      </CardHeader>

      <div className="overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <Spinner className="mx-auto size-5" />
                </TableCell>
              </TableRow>
            ) : rows.length > 0 ? (
              rows.map((row) => {
                const node = row.original;
                const selected =
                  node.kind === "endpoint" && selectedId === node.id;
                return (
                  <TableRow
                    key={row.id}
                    data-state={selected ? "selected" : undefined}
                    className={cn(
                      row.depth > 0 && "bg-muted/20",
                      selected && "bg-muted/40",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-muted-foreground h-24 text-center"
                >
                  Nenhum endpoint neste ambiente.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
