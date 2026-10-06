import { useEffect, useState, type ChangeEvent } from "react";
import {
  FileJson,
  KeyRound,
  Pencil,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { AuthType, type Endpoint } from "@sw/core";
import { api, type EnvironmentDto } from "@/services/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

function showError(message: string) {
  toast.add({
    title: "Algo deu errado",
    description: message,
    type: "error",
  });
}

export function EnvironmentDetailDialog({
  environment,
  open,
  onOpenChange,
  onEdit,
  onSecret,
  onDelete,
}: {
  environment: EnvironmentDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onSecret: () => void;
  onDelete: () => void;
}) {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !environment) {
      setEndpoints([]);
      setSelectedId(null);
      setImported(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void api
      .listEnvironmentEndpoints(environment.id)
      .then((items) => {
        if (cancelled) return;
        setEndpoints(items);
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
  }, [open, environment]);

  const selected = endpoints.find((endpoint) => endpoint.id === selectedId);
  const headerCount = Object.keys(environment?.headers ?? {}).length;

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !environment) return;

    setImported(null);
    setImporting(true);
    try {
      const text = await file.text();
      const document = JSON.parse(text) as unknown;
      const result = await api.importEnvironmentOpenApi(environment.id, document);
      setEndpoints(result.endpoints);
      setImported(result.imported);
      setSelectedId(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Import falhou");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  }

  async function onDeleteEndpoint(endpoint: Endpoint) {
    if (!window.confirm(`Excluir ${endpoint.method} ${endpoint.path}?`)) return;
    setBusyId(endpoint.id);
    try {
      await api.deleteEndpoint(endpoint.id);
      setEndpoints((prev) => prev.filter((item) => item.id !== endpoint.id));
      if (selectedId === endpoint.id) setSelectedId(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Falha ao excluir");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(85vh,760px)] flex-col gap-4 overflow-hidden sm:max-w-lg">
        {environment ? (
          <>
            <DialogHeader>
              <DialogTitle className="pr-8 text-xl">
                {environment.name}
              </DialogTitle>
              <DialogDescription className="truncate font-mono text-xs">
                {environment.baseUrl}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                Auth {environment.authType}
                {environment.secretConfigured
                  ? " · secret ✓"
                  : environment.authType !== AuthType.NONE
                    ? " · sem secret"
                    : ""}
                {headerCount > 0 ? ` · ${headerCount} header(s)` : ""}
              </p>
              {environment.productionSafetyMode ? (
                <p className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                  <ShieldAlert className="size-3" />
                  Production Safety Mode
                </p>
              ) : null}
            </div>

            <Separator />

            <div className="min-h-0 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">OpenAPI</h3>
                <span className="text-xs text-muted-foreground">
                  {loading ? "…" : `${endpoints.length} endpoint(s)`}
                </span>
              </div>

              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground">
                {importing ? <Spinner /> : <FileJson className="size-4" />}
                {importing
                  ? "Processando…"
                  : "Solte ou clique para escolher openapi.json"}
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  disabled={importing}
                  onChange={(event) => {
                    void onFile(event);
                  }}
                />
              </label>

              {imported !== null ? (
                <p className="text-xs text-muted-foreground">
                  Importados {imported} endpoints neste ambiente. Reimportar
                  substitui o contrato OpenAPI só deste ambiente.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  O contrato fica vinculado a este ambiente. Sample em{" "}
                  <code>examples/sample-openapi.json</code>.
                </p>
              )}

              {endpoints.length > 0 ? (
                <ScrollArea className="h-40 rounded-md border border-border">
                  <ul className="space-y-1 p-2">
                    {endpoints.map((endpoint) => {
                      const active = endpoint.id === selectedId;
                      return (
                        <li key={endpoint.id}>
                          <div
                            className={`flex items-start gap-2 rounded-md px-2 py-1.5 ${
                              active ? "bg-muted" : ""
                            }`}
                          >
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              onClick={() =>
                                setSelectedId(active ? null : endpoint.id)
                              }
                            >
                              <span className="font-mono text-xs">
                                {endpoint.method} {endpoint.path}
                              </span>
                              {endpoint.summary ? (
                                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                  {endpoint.summary}
                                </span>
                              ) : null}
                            </button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Excluir ${endpoint.method} ${endpoint.path}`}
                              disabled={busyId === endpoint.id}
                              onClick={() => {
                                void onDeleteEndpoint(endpoint);
                              }}
                            >
                              {busyId === endpoint.id ? (
                                <Spinner />
                              ) : (
                                <Trash2 />
                              )}
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </ScrollArea>
              ) : null}

              {selected ? (
                <div className="space-y-2 rounded-lg border border-border px-3 py-2 text-xs">
                  <p className="font-mono">
                    {selected.method} {selected.path}
                  </p>
                  {selected.operationId ? (
                    <p className="text-muted-foreground">
                      operationId: {selected.operationId}
                    </p>
                  ) : null}
                  <p className="text-muted-foreground">
                    {selected.parameters.length} parâmetros
                    {selected.requestBodySchema ? " · request body" : ""}
                  </p>
                  {selected.parameters.length > 0 ? (
                    <ul className="space-y-0.5 font-mono text-[11px]">
                      {selected.parameters.map((param) => (
                        <li key={`${param.in}:${param.name}`}>
                          {param.in} · {param.name}
                          {param.required ? " *" : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onEdit}
                >
                  <Pencil />
                  Editar
                </Button>
                {environment.authType !== AuthType.NONE ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onSecret}
                  >
                    <KeyRound />
                    Secret
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 />
                  Remover
                </Button>
              </div>
            </DialogFooter>
          </>
        ) : (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
