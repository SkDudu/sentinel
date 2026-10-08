import { useMemo } from "react";
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Resource, ResourceRelation } from "@sw/core";

const COLUMN = 220;
const ROW = 90;

/** Recursos como nós, relações não rejeitadas como arestas; só leitura. */
export function RelationsGraph({
  resources,
  relations,
}: {
  resources: Resource[];
  relations: ResourceRelation[];
}) {
  const { nodes, edges } = useMemo(() => {
    const shown = relations.filter((relation) => relation.status !== "rejected");
    const names = [
      ...new Set([
        ...resources.map((resource) => resource.name),
        ...shown.flatMap((relation) => [relation.from, relation.to]),
      ]),
    ].sort();
    const perRow = Math.max(1, Math.ceil(Math.sqrt(names.length)));
    const nodes: Node[] = names.map((name, index) => ({
      id: name,
      position: { x: (index % perRow) * COLUMN, y: Math.floor(index / perRow) * ROW },
      data: { label: name },
      connectable: false,
    }));
    const edges: Edge[] = shown.map((relation) => ({
      id: relation.id,
      source: relation.from,
      target: relation.to,
      label: relation.kind,
      animated: relation.status === "suggested",
      style: relation.status === "suggested" ? { strokeDasharray: "4 4" } : undefined,
      markerEnd: { type: MarkerType.ArrowClosed },
    }));
    return { nodes, edges };
  }, [resources, relations]);

  return (
    <div className="h-[32rem] overflow-hidden rounded-lg border">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodesConnectable={false}
        nodesDraggable={false}
        edgesFocusable={false}
        colorMode="dark"
        fitView
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
