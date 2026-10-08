import { useEffect, useState } from "react";
import type { Endpoint } from "@sw/core";
import { api, type EnvironmentDto } from "@/services/api";
import {
  Property,
  PropertyList,
} from "@/components/dashboardblocks/record-detail";
import {
  StatusBadge,
  type StatusLevel,
} from "@/components/dashboardblocks/status";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { EndpointsTreeTable } from "./EndpointsTreeTable";

const METHOD_STATUS: Record<Endpoint["method"], StatusLevel> = {
  GET: "operational",
  POST: "degraded",
  PUT: "partial",
  PATCH: "maintenance",
  DELETE: "major",
  HEAD: "unknown",
  OPTIONS: "unknown",
};

function showError(message: string) {
  toast.add({
    title: "Algo deu errado",
    description: message,
    type: "error",
  });
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="bg-muted/40 max-h-56 overflow-auto rounded-md p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function EnvironmentEndpointsPanel({
  environment,
  onCount,
  reloadToken = 0,
}: {
  environment: EnvironmentDto;
  onCount?: (count: number) => void;
  reloadToken?: number;
}) {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!environment) {
      setEndpoints([]);
      setSelectedId(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void api
      .listEnvironmentEndpoints(environment.id)
      .then((items) => {
        if (cancelled) return;
        setEndpoints(items);
        onCount?.(items.length);
        setSelectedId((current) =>
          current && items.some((item) => item.id === current) ? current : null,
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          showError(err instanceof Error ? err.message : "Falha ao carregar");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [environment, onCount, reloadToken]);

  const selected = endpoints.find((endpoint) => endpoint.id === selectedId);

  async function onDeleteEndpoint(endpoint: Endpoint) {
    if (!window.confirm(`Excluir ${endpoint.method} ${endpoint.path}?`)) return;
    setBusyId(endpoint.id);
    try {
      await api.deleteEndpoint(endpoint.id);
      setEndpoints((prev) => {
        const next = prev.filter((item) => item.id !== endpoint.id);
        onCount?.(next.length);
        return next;
      });
      if (selectedId === endpoint.id) setSelectedId(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Falha ao excluir");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-0 space-y-3">
      <EndpointsTreeTable
        endpoints={endpoints}
        loading={loading}
        busyId={busyId}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onDelete={(id) => {
          const endpoint = endpoints.find((item) => item.id === id);
          if (endpoint) void onDeleteEndpoint(endpoint);
        }}
      />

      <Drawer
        open={selectedId != null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        swipeDirection="right"
      >
        <DrawerContent className="data-[swipe-axis=x]:w-full data-[swipe-axis=x]:max-w-md data-[swipe-axis=x]:sm:max-w-md">
          {selected ? (
            <>
              <DrawerHeader>
                <div className="flex items-center gap-2">
                  <StatusBadge
                    hideIcon
                    status={METHOD_STATUS[selected.method]}
                    label={selected.method}
                  />
                  <DrawerTitle className="font-mono text-sm">
                    {selected.path}
                  </DrawerTitle>
                </div>
                <DrawerDescription>
                  {selected.summary?.trim() ||
                    selected.description?.trim() ||
                    "Sem resumo neste endpoint."}
                </DrawerDescription>
              </DrawerHeader>

              <div className="flex-1 overflow-y-auto p-4">
                <PropertyList>
                  <Property label="Método">{selected.method}</Property>
                  <Property label="Path">
                    <span className="font-mono text-xs">{selected.path}</span>
                  </Property>
                  <Property label="operationId">
                    {selected.operationId ?? "—"}
                  </Property>
                  <Property label="Descrição">
                    {selected.description?.trim() || "—"}
                  </Property>
                  <Property label="Fonte">{selected.source}</Property>
                  <Property label="Tags">
                    {selected.tags.length > 0 ? selected.tags.join(", ") : "—"}
                  </Property>
                  <Property label="Parâmetros">
                    {selected.parameters.length === 0 ? (
                      "Nenhum"
                    ) : (
                      <ul className="space-y-2">
                        {selected.parameters.map((param) => (
                          <li
                            key={`${param.in}:${param.name}`}
                            className="rounded-md border border-border/70 px-2 py-1.5"
                          >
                            <p className="font-mono text-xs">
                              {param.in} · {param.name}
                              {param.required ? " *" : ""}
                              {param.type ? ` · ${param.type}` : ""}
                              {param.format ? ` (${param.format})` : ""}
                            </p>
                            {param.description ? (
                              <p className="text-muted-foreground mt-0.5 text-xs">
                                {param.description}
                              </p>
                            ) : null}
                            {param.schema ? (
                              <div className="mt-1.5">
                                <JsonBlock value={param.schema} />
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Property>
                  <Property label="Request body">
                    {selected.requestBodySchema ? (
                      <JsonBlock value={selected.requestBodySchema} />
                    ) : (
                      "não"
                    )}
                  </Property>
                  <Property label="Responses">
                    {(selected.responses?.length ?? 0) === 0 ? (
                      "Nenhuma (reimporte o OpenAPI para capturar)"
                    ) : (
                      <ul className="space-y-2">
                        {selected.responses.map((response) => (
                          <li
                            key={response.status}
                            className="rounded-md border border-border/70 px-2 py-1.5"
                          >
                            <p className="font-mono text-xs">
                              {response.status}
                              {response.contentType
                                ? ` · ${response.contentType}`
                                : ""}
                            </p>
                            {response.description ? (
                              <p className="text-muted-foreground mt-0.5 text-xs">
                                {response.description}
                              </p>
                            ) : null}
                            {response.schema ? (
                              <div className="mt-1.5">
                                <JsonBlock value={response.schema} />
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Property>
                </PropertyList>
              </div>

              <DrawerFooter>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busyId === selected.id}
                  onClick={() => void onDeleteEndpoint(selected)}
                >
                  {busyId === selected.id ? (
                    <Spinner data-icon="inline-start" />
                  ) : null}
                  Excluir endpoint
                </Button>
                <DrawerClose render={<Button variant="outline" />}>
                  Fechar
                </DrawerClose>
              </DrawerFooter>
            </>
          ) : null}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
