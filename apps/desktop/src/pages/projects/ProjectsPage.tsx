import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  FolderKanban,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Server,
  Trash2,
} from "lucide-react";
import { useProjectStore } from "@/stores/project";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { PageEmptyState } from "@/components/layout/page-empty-state";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectDetailDialog } from "@/pages/projects/ProjectDetailDialog";
import { ProjectEditDialog } from "@/pages/projects/ProjectEditDialog";

function showSuccess(message: string) {
  toast.add({ title: message, type: "success" });
}

function showError(message: string) {
  toast.add({
    title: "Algo deu errado",
    description: message,
    type: "error",
  });
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const {
    projects,
    loading,
    error,
    loadProjects,
    createProject,
    updateProject,
    deleteProject,
  } = useProjectStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const detailProject =
    projects.find((p) => p.id === detailProjectId) ?? null;

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) => {
      const haystack = `${project.name} ${project.description ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [projects, search]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  async function onCreateProject(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await createProject({
        name,
        description: description || undefined,
      });
      setName("");
      setDescription("");
      setCreateOpen(false);
      showSuccess("Projeto criado.");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Erro ao criar");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmDelete() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await deleteProject(confirmDelete.id);
      setConfirmDelete(null);
      showSuccess("Projeto excluído.");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Erro ao excluir");
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell
      title="Projetos"
      actions={
        <>
          <div className="relative min-w-0 flex-1 sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar projetos…"
              className="pl-8"
              aria-label="Buscar projetos"
            />
          </div>
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
          >
            <Plus />
            Adicionar projeto
          </Button>
        </>
      }
    >
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle />
          <AlertTitle>Algo deu errado</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setName("");
            setDescription("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo projeto</DialogTitle>
            <DialogDescription>
              Crie um projeto local para importar OpenAPI e rodar scans.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreateProject} className="space-y-4">
            <label className="block text-sm">
              Nome
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
                placeholder="Sharezin"
                autoFocus
              />
            </label>
            <label className="block text-sm">
              Descrição
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1"
                placeholder="API principal"
              />
            </label>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? <Spinner data-icon="inline-start" /> : null}
                Criar projeto
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ProjectDetailDialog
        project={detailProject}
        open={detailProjectId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailProjectId(null);
        }}
        onDelete={() => {
          if (!detailProject) return;
          setConfirmDelete({
            id: detailProject.id,
            name: detailProject.name,
          });
          setDetailProjectId(null);
        }}
        onActionSuccess={showSuccess}
        onActionError={showError}
      />

      <ProjectEditDialog
        project={
          editingId
            ? (projects.find((p) => p.id === editingId) ?? null)
            : null
        }
        open={editingId !== null}
        busy={busy}
        onOpenChange={(open) => {
          if (!open) setEditingId(null);
        }}
        onSubmit={async (values) => {
          if (!editingId) return;
          setBusy(true);
          try {
            await updateProject(editingId, values);
            setEditingId(null);
            showSuccess("Projeto atualizado.");
          } catch (err) {
            showError(
              err instanceof Error ? err.message : "Erro ao atualizar",
            );
            throw err;
          } finally {
            setBusy(false);
          }
        }}
      />

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir projeto?</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir o projeto &quot;{confirmDelete?.name}&quot; e todos os
              ambientes? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Alert className="mt-1" variant="destructive">
            <AlertCircle />
            <AlertTitle>Ação destrutiva</AlertTitle>
            <AlertDescription>
              Confirme só se tiver certeza. Dados locais serão apagados.
            </AlertDescription>
          </Alert>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => {
                void onConfirmDelete();
              }}
            >
              {busy ? <Spinner data-icon="inline-start" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {loading && projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">Carregando projetos…</p>
      ) : projects.length === 0 ? (
        <PageEmptyState
          icon={FolderKanban}
          title="Nenhum projeto ainda"
          description="Crie o primeiro projeto para importar OpenAPI, configurar ambientes e rodar scans."
          action={
            <Button
              type="button"
              onClick={() => setCreateOpen(true)}
            >
              <Plus />
              Adicionar projeto
            </Button>
          }
        />
      ) : filteredProjects.length === 0 ? (
        <PageEmptyState
          icon={Search}
          title="Nenhum resultado"
          description={`Nenhum projeto bate com “${search.trim()}”.`}
          action={
            <Button type="button" variant="outline" onClick={() => setSearch("")}>
              Limpar busca
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredProjects.map((project) => (
            <Card key={project.id} className="relative">
              <button
                type="button"
                aria-label={`Abrir ${project.name}`}
                onClick={() => setDetailProjectId(project.id)}
                className="absolute inset-0 z-0 cursor-pointer rounded-xl"
              />
              <CardHeader className="pointer-events-none relative z-10">
                <div className="min-w-0 text-left">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <span className="truncate">{project.name}</span>
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {project.description ?? "Sem descrição"}
                  </CardDescription>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {project.environments.length === 0
                      ? "Sem ambientes"
                      : `${project.environments.length} ambiente${project.environments.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                <CardAction className="pointer-events-auto">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Ações de ${project.name}`}
                        />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-44">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          onClick={() => setEditingId(project.id)}
                        >
                          <Pencil />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            void navigate(
                              `/projects/${project.id}/environments`,
                            );
                          }}
                        >
                          <Server />
                          Ambientes
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() =>
                          setConfirmDelete({
                            id: project.id,
                            name: project.name,
                          })
                        }
                      >
                        <Trash2 />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardAction>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
