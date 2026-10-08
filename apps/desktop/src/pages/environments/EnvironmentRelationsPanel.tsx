import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { FileJson, Network } from "lucide-react";
import type { Endpoint, Resource, ResourceRelation } from "@sw/core";
import { api, type EnvironmentDto, type RelationStatus } from "@/services/api";
import { PageEmptyState } from "@/components/layout/page-empty-state";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";

const KIND_LABEL: Record<ResourceRelation["kind"], string> = {
  parent: "pai",
  reference: "referência",
  owner: "dono",
  produces: "produz",
};

const KIND_ITEMS = (Object.keys(KIND_LABEL) as ResourceRelation["kind"][]).map(
  (value) => ({ value, label: KIND_LABEL[value] }),
);

const STATUS_VARIANT: Record<RelationStatus, "secondary" | "outline" | "destructive"> = {
  confirmed: "secondary",
  suggested: "outline",
  rejected: "destructive",
};

const STATUS_LABEL: Record<RelationStatus, string> = {
  confirmed: "confirmada",
  suggested: "sugerida",
  rejected: "rejeitada",
};

function showError(err: unknown, fallback: string) {
  toast.add({
    title: "Algo deu errado",
    description: err instanceof Error ? err.message : fallback,
    type: "error",
  });
}

export function EnvironmentRelationsPanel({
  environment,
  reloadToken,
  onPendingCount,
  onAddDocs,
}: {
  environment: EnvironmentDto;
  reloadToken: number;
  onPendingCount: (count: number) => void;
  onAddDocs: () => void;
}) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [relations, setRelations] = useState<ResourceRelation[]>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlySuggested, setOnlySuggested] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const apply = useCallback(
    (next: ResourceRelation[]) => {
      setRelations(next);
      onPendingCount(next.filter((relation) => relation.status === "suggested").length);
    },
    [onPendingCount],
  );

  const reload = useCallback(() => {
    setLoading(true);
    void Promise.all([
      api.listRelations(environment.id),
      api.listEnvironmentEndpoints(environment.id),
    ])
      .then(([graph, list]) => {
        setResources(graph.resources);
        apply(graph.relations);
        setEndpoints(list);
        setSelected(new Set());
      })
      .catch((err: unknown) => showError(err, "Falha ao carregar relacionamentos"))
      .finally(() => setLoading(false));
  }, [environment.id, apply]);

  useEffect(() => {
    reload();
  }, [reload, reloadToken]);

  const endpointLabel = useMemo(() => {
    const map = new Map(endpoints.map((e) => [e.id, `${e.method} ${e.path}`]));
    return (id: string) => map.get(id) ?? id;
  }, [endpoints]);

  const visible = onlySuggested
    ? relations.filter((relation) => relation.status === "suggested")
    : relations;
  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));

  async function review(ids: string[], status: RelationStatus) {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const result = await api.reviewRelations(environment.id, ids, status);
      apply(result.relations);
      setSelected(new Set());
    } catch (err) {
      showError(err, "Falha ao revisar relações");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(relation: ResourceRelation) {
    setBusy(true);
    try {
      await api.deleteRelation(environment.id, relation.id);
      reload();
    } catch (err) {
      showError(err, "Falha ao remover relação");
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  if (!loading && resources.length === 0 && relations.length === 0) {
    return (
      <PageEmptyState
        icon={FileJson}
        title="Sem grafo de recursos"
        description="Importe a documentação OpenAPI deste ambiente; o Sentinel infere recursos e relações sem IA."
        action={
          <Button type="button" onClick={onAddDocs}>
            Adicionar documentação
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="max-w-[70ch] text-sm text-muted-foreground">
        {resources.length} recursos inferidos do contrato. Confirme as relações
        que fazem sentido: Matriz e Fluxos usam o grafo para pré-preencher
        regras e esqueletos.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={onlySuggested} onCheckedChange={setOnlySuggested} />
          Só sugeridas
        </label>
        <span className="text-xs text-muted-foreground">
          {selected.size} selecionada{selected.size === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || selected.size === 0}
            onClick={() => void review([...selected], "confirmed")}
          >
            Confirmar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || selected.size === 0}
            onClick={() => void review([...selected], "rejected")}
          >
            Rejeitar
          </Button>
          <Button type="button" size="sm" onClick={() => setManualOpen(true)}>
            Nova relação
          </Button>
        </div>
      </div>

      {visible.length === 0 && !loading ? (
        <PageEmptyState
          icon={Network}
          title={onlySuggested ? "Nada pendente" : "Nenhuma relação"}
          description={
            onlySuggested
              ? "Todas as sugestões foram revisadas."
              : "O contrato não expôs relações; adicione manualmente."
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) =>
                    setSelected(checked ? new Set(visible.map((r) => r.id)) : new Set())
                  }
                  aria-label="Selecionar todas"
                />
              </TableHead>
              <TableHead>De → Para</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Via</TableHead>
              <TableHead>Confiança</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((relation) => (
              <Fragment key={relation.id}>
                <TableRow
                  className="cursor-pointer"
                  onClick={() =>
                    setExpanded((current) => (current === relation.id ? null : relation.id))
                  }
                >
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(relation.id)}
                      onCheckedChange={(checked) => toggle(relation.id, checked)}
                      aria-label={`Selecionar ${relation.from} → ${relation.to}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {relation.from} → {relation.to}
                  </TableCell>
                  <TableCell>{KIND_LABEL[relation.kind]}</TableCell>
                  <TableCell className="font-mono text-xs">{relation.via}</TableCell>
                  <TableCell>{relation.confidence}</TableCell>
                  <TableCell>{relation.origin}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[relation.status]}>
                      {STATUS_LABEL[relation.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                    <span className="inline-flex gap-1">
                      {relation.status !== "confirmed" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          disabled={busy}
                          onClick={() => void review([relation.id], "confirmed")}
                        >
                          Confirmar
                        </Button>
                      ) : null}
                      {relation.status !== "rejected" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          disabled={busy}
                          onClick={() => void review([relation.id], "rejected")}
                        >
                          Rejeitar
                        </Button>
                      ) : null}
                      {relation.origin === "manual" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="text-destructive"
                          disabled={busy}
                          onClick={() => void onDelete(relation)}
                        >
                          Remover
                        </Button>
                      ) : null}
                    </span>
                  </TableCell>
                </TableRow>
                {expanded === relation.id ? (
                  <TableRow>
                    <TableCell />
                    <TableCell colSpan={7} className="space-y-1 text-xs">
                      {relation.source ? (
                        <p>
                          fonte: <span className="font-mono">{relation.source}</span>
                        </p>
                      ) : null}
                      {relation.evidence.length === 0 ? (
                        <p className="text-muted-foreground">Sem endpoint de evidência.</p>
                      ) : (
                        <ul className="space-y-0.5 font-mono">
                          {relation.evidence.map((id) => (
                            <li key={id}>{endpointLabel(id)}</li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      )}

      <ManualRelationDialog
        open={manualOpen}
        environmentId={environment.id}
        resources={resources}
        onOpenChange={setManualOpen}
        onSaved={reload}
      />
    </div>
  );
}

function ManualRelationDialog({
  open,
  environmentId,
  resources,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  environmentId: string;
  resources: Resource[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<ResourceRelation["kind"]>("reference");
  const [via, setVia] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFrom("");
    setTo("");
    setKind("reference");
    setVia("");
  }, [open]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.createRelation(environmentId, { from, to, kind, via });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      showError(err, "Falha ao criar relação");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova relação</DialogTitle>
          <DialogDescription>
            Relação manual entra confirmada e sobrevive a reimport do OpenAPI.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void onSubmit(event)} className="space-y-3">
          <datalist id="sentinel-resources">
            {resources.map((resource) => (
              <option key={resource.name} value={resource.name} />
            ))}
          </datalist>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              De
              <Input
                list="sentinel-resources"
                value={from}
                required
                onChange={(event) => setFrom(event.target.value)}
                className="mt-1.5"
              />
            </label>
            <label className="block text-sm">
              Para
              <Input
                list="sentinel-resources"
                value={to}
                required
                onChange={(event) => setTo(event.target.value)}
                className="mt-1.5"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Tipo
              <Select
                items={KIND_ITEMS}
                value={kind}
                onValueChange={(value) => {
                  if (value != null) setKind(value);
                }}
              >
                <SelectTrigger className="mt-1.5 w-full">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent portalled={false}>
                  <SelectGroup>
                    {KIND_ITEMS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            <label className="block text-sm">
              Via
              <Input
                value={via}
                required
                placeholder="body.customerId, path.order_id…"
                onChange={(event) => setVia(event.target.value)}
                className="mt-1.5 font-mono text-xs"
              />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
