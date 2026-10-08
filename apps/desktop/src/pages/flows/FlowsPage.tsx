import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FolderKanban, MoreHorizontal, Plus, Trash2, Workflow } from "lucide-react";
import type { Flow } from "@sw/core";
import { api, type FlowDto } from "@/services/api";
import { useProjectStore } from "@/stores/project";
import { PageEmptyState } from "@/components/layout/page-empty-state";
import { PageShell } from "@/components/layout/page-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { EnvironmentSelect } from "./EnvironmentSelect";

function showError(err: unknown, fallback: string) {
  toast.add({
    title: "Algo deu errado",
    description: err instanceof Error ? err.message : fallback,
    type: "error",
  });
}

function flowMeta(flow: Flow): string {
  const parts = [`${flow.steps.length} passo${flow.steps.length === 1 ? "" : "s"}`];
  if (flow.setup.length) parts.push(`setup ${flow.setup.length}`);
  if (flow.teardown.length) parts.push(`teardown ${flow.teardown.length}`);
  return parts.join(" · ");
}

export function FlowsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { projects, loadProjects, setActiveProject } = useProjectStore();
  const [flows, setFlows] = useState<FlowDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [deleting, setDeleting] = useState<FlowDto | null>(null);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (projectId) setActiveProject(projectId);
  }, [projectId, setActiveProject]);

  const project = projects.find((item) => item.id === projectId);

  const reload = useCallback(() => {
    if (!projectId) return;
    setLoading(true);
    void api
      .listFlows(projectId)
      .then(setFlows)
      .catch((err: unknown) => showError(err, "Falha ao carregar fluxos"))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function onDelete() {
    if (!projectId || !deleting) return;
    try {
      await api.deleteFlow(projectId, deleting.flow.id);
      setDeleting(null);
      reload();
    } catch (err) {
      showError(err, "Falha ao remover fluxo");
    }
  }

  if (!projectId || (!project && projects.length > 0)) {
    return (
      <PageShell title="Fluxos">
        <PageEmptyState
          icon={FolderKanban}
          title="Projeto não encontrado"
          description="Volte à lista e abra um projeto pelo card."
          action={<Button render={<Link to="/projects" />}>Ir para Projetos</Button>}
        />
      </PageShell>
    );
  }

  const open = (flow: Flow) => void navigate(`/projects/${projectId}/flows/${flow.id}`);
  const hasFlows = flows.length > 0;

  return (
    <PageShell
      title="Fluxos"
      actions={
        hasFlows ? (
          <>
            <Button type="button" variant="outline" onClick={() => setGenerateOpen(true)}>
              Gerar do grafo
            </Button>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus />
              Novo fluxo
            </Button>
          </>
        ) : undefined
      }
    >
      {!loading && !hasFlows ? (
        <PageEmptyState
          icon={Workflow}
          title="Nenhum fluxo ainda"
          description="Fluxo encadeia passos com personas diferentes (A cria, B tenta ler). Comece vazio ou gere esqueletos pelo grafo de relacionamentos de um ambiente."
          action={
            <div className="flex gap-2">
              <Button type="button" onClick={() => setCreateOpen(true)}>
                Novo fluxo
              </Button>
              <Button type="button" variant="outline" onClick={() => setGenerateOpen(true)}>
                Gerar do grafo
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {flows.map((item) => (
            <Card
              key={item.flow.id}
              className="cursor-pointer"
              onClick={() => open(item.flow)}
            >
              <CardHeader>
                <CardTitle>{item.flow.name}</CardTitle>
                <CardDescription>
                  {item.flow.description ? `${item.flow.description} · ` : ""}
                  {flowMeta(item.flow)}
                </CardDescription>
                <CardAction onClick={(event) => event.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Ações do fluxo" />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem onClick={() => open(item.flow)}>Abrir</DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleting(item)}>
                          <Trash2 />
                          Remover
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardAction>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <CreateFlowDialog
        open={createOpen}
        projectId={projectId}
        onOpenChange={setCreateOpen}
        onCreated={(flow) => open(flow)}
      />
      {project ? (
        <GenerateFlowsDialog
          open={generateOpen}
          projectId={projectId}
          environments={project.environments}
          onOpenChange={setGenerateOpen}
          onSaved={reload}
        />
      ) : null}

      <AlertDialog open={deleting !== null} onOpenChange={(next) => !next && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {deleting?.flow.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove a definição do fluxo. Findings de runs anteriores continuam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void onDelete()}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function CreateFlowDialog({
  open,
  projectId,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  projectId: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (flow: Flow) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await api.createFlow(projectId, {
        name: name.trim(),
        setup: [],
        steps: [],
        teardown: [],
      });
      onOpenChange(false);
      onCreated(created.flow);
    } catch (err) {
      showError(err, "Falha ao criar fluxo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo fluxo</DialogTitle>
          <DialogDescription>Os passos são montados no editor.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
          <label className="block text-sm">
            Nome
            <Input
              value={name}
              required
              placeholder="Pedido de outra persona"
              onChange={(event) => setName(event.target.value)}
              className="mt-1.5"
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? <Spinner data-icon="inline-start" /> : null}
              Criar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GenerateFlowsDialog({
  open,
  projectId,
  environments,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  environments: Array<{ id: string; name: string }>;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const [skeletons, setSkeletons] = useState<Flow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEnvironmentId(environments[0]?.id ?? null);
    setSkeletons(null);
    setSelected(new Set());
  }, [open, environments]);

  async function onLoad() {
    if (!environmentId) return;
    setBusy(true);
    try {
      const list = await api.flowSkeletons(environmentId);
      setSkeletons(list);
      setSelected(new Set(list.map((flow) => flow.id)));
    } catch (err) {
      showError(err, "Falha ao gerar esqueletos");
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (!skeletons) return;
    setBusy(true);
    try {
      for (const flow of skeletons.filter((item) => selected.has(item.id))) {
        const { id: _id, ...rest } = flow;
        await api.createFlow(projectId, rest);
      }
      toast.add({ title: `${selected.size} fluxos criados.`, type: "success" });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      showError(err, "Falha ao salvar fluxos");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerar do grafo</DialogTitle>
          <DialogDescription>
            Esqueletos CRUD e BOLA cruzado a partir dos recursos do ambiente e
            das personas com vínculo. Revise corpo e expectativas no editor.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-end gap-2">
          <EnvironmentSelect
            environments={environments}
            value={environmentId}
            onChange={setEnvironmentId}
            portalled={false}
          />
          <Button type="button" variant="outline" disabled={busy || !environmentId} onClick={() => void onLoad()}>
            Carregar
          </Button>
        </div>
        {skeletons ? (
          skeletons.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum recurso com criar + ler no grafo, ou nenhuma persona com vínculo neste ambiente.
            </p>
          ) : (
            <ScrollArea className="max-h-72">
              <ul className="space-y-2">
                {skeletons.map((flow) => (
                  <li key={flow.id} className="flex items-start gap-2 text-sm">
                    <Checkbox
                      id={`skeleton-${flow.id}`}
                      checked={selected.has(flow.id)}
                      onCheckedChange={(checked) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(flow.id);
                          else next.delete(flow.id);
                          return next;
                        })
                      }
                    />
                    <label htmlFor={`skeleton-${flow.id}`}>
                      <span className="font-medium">{flow.name}</span>
                      <span className="block text-xs text-muted-foreground">{flowMeta(flow)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={busy || selected.size === 0} onClick={() => void onSave()}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Salvar selecionados
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
