import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  FolderKanban,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  Server,
  Trash2,
} from "lucide-react";
import { AuthType } from "@sw/core";
import type { EnvironmentDto } from "@/services/api";
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
import { PageEmptyState } from "@/components/layout/page-empty-state";
import { PageShell } from "@/components/layout/page-shell";
import {
  EnvironmentFormDialog,
  type EnvironmentFormValues,
} from "@/pages/projects/EnvironmentFormDialog";
import { EnvironmentDetailDialog } from "@/pages/environments/EnvironmentDetailDialog";

export function EnvironmentsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    projects,
    loadProjects,
    setActiveProject,
    createEnvironment,
    updateEnvironment,
    deleteEnvironment,
    setEnvironmentSecret,
    clearEnvironmentSecret,
  } = useProjectStore();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingEnv, setEditingEnv] = useState<EnvironmentDto | null>(null);
  const [secretEnv, setSecretEnv] = useState<EnvironmentDto | null>(null);
  const [secretValue, setSecretValue] = useState("");
  const [secretUsername, setSecretUsername] = useState("");
  const [secretPassword, setSecretPassword] = useState("");
  const [deleteEnv, setDeleteEnv] = useState<EnvironmentDto | null>(null);
  const [detailEnvId, setDetailEnvId] = useState<string | null>(null);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (projectId) setActiveProject(projectId);
  }, [projectId, setActiveProject]);

  useEffect(() => {
    if (searchParams.get("newEnv") !== "1") return;
    setCreateOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("newEnv");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const project = projects.find((p) => p.id === projectId);

  async function onCreate(values: EnvironmentFormValues) {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      await createEnvironment(project.id, values);
      setCreateOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar ambiente");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function onUpdate(values: EnvironmentFormValues) {
    if (!editingEnv) return;
    setBusy(true);
    setError(null);
    try {
      await updateEnvironment(editingEnv.id, {
        name: values.name,
        baseUrl: values.baseUrl,
        authType: values.authType,
        headers: values.headers,
        productionSafetyMode: values.productionSafetyMode,
      });
      if (values.secret?.trim()) {
        await setEnvironmentSecret(editingEnv.id, values.secret.trim());
      }
      setEditingEnv(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao atualizar ambiente",
      );
      throw err;
    } finally {
      setBusy(false);
    }
  }

  function resetSecretForm() {
    setSecretEnv(null);
    setSecretValue("");
    setSecretUsername("");
    setSecretPassword("");
  }

  async function onSaveSecret(event: FormEvent) {
    event.preventDefault();
    if (!secretEnv) return;
    setBusy(true);
    setError(null);
    try {
      const nextSecret =
        secretEnv.authType === AuthType.BASIC
          ? `${secretUsername.trim()}:${secretPassword}`
          : secretValue.trim();
      if (secretEnv.authType === AuthType.BASIC) {
        if (!secretUsername.trim() || !secretPassword) {
          throw new Error("Basic auth precisa de usuário e senha");
        }
      } else if (!nextSecret) {
        throw new Error("Secret é obrigatório");
      }
      await setEnvironmentSecret(secretEnv.id, nextSecret);
      resetSecretForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar secret");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmDelete() {
    if (!deleteEnv) return;
    setBusy(true);
    setError(null);
    try {
      await deleteEnvironment(deleteEnv.id);
      setDeleteEnv(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir");
      setDeleteEnv(null);
    } finally {
      setBusy(false);
    }
  }

  if (!projectId || (!project && projects.length > 0)) {
    return (
      <PageShell title="Ambientes">
        <PageEmptyState
          icon={FolderKanban}
          title="Projeto não encontrado"
          description="Volte à lista e abra um projeto pelo card."
          action={
            <Button render={<Link to="/projects" />}>Ir para Projetos</Button>
          }
        />
      </PageShell>
    );
  }

  if (!project) {
    return (
      <PageShell title="Ambientes">
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </PageShell>
    );
  }

  const hasEnvironments = project.environments.length > 0;
  const detailEnv =
    project.environments.find((env) => env.id === detailEnvId) ?? null;

  return (
    <PageShell
      title="Ambientes"
      actions={
        hasEnvironments ? (
          <Button
            type="button"
            onClick={() => {
              setError(null);
              setCreateOpen(true);
            }}
          >
            <Plus />
            Adicionar ambiente
          </Button>
        ) : undefined
      }
    >
      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle />
          <AlertTitle>Algo deu errado</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!hasEnvironments ? (
        <PageEmptyState
          icon={Server}
          title="Nenhum ambiente ainda"
          description="Adicione Development ou Staging com base URL antes de rodar scans."
          action={
            <Button
              type="button"
              onClick={() => {
                setError(null);
                setCreateOpen(true);
              }}
            >
              <Plus />
              Adicionar ambiente
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {project.environments.map((env) => (
            <Card key={env.id} className="relative">
              <button
                type="button"
                aria-label={`Abrir ${env.name}`}
                onClick={() => {
                  setError(null);
                  setDetailEnvId(env.id);
                }}
                className="absolute inset-0 z-0 cursor-pointer rounded-xl"
              />
              <CardHeader className="pointer-events-none relative z-10">
                <div className="min-w-0 text-left">
                  <Server className="mb-1 size-4 text-muted-foreground" />
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <span className="truncate">{env.name}</span>
                    {env.productionSafetyMode ? (
                      <span className="text-xs font-normal text-amber-700 dark:text-amber-400">
                        safety
                      </span>
                    ) : null}
                  </CardTitle>
                  <CardDescription className="mt-1 truncate font-mono text-xs">
                    {env.baseUrl}
                  </CardDescription>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Auth {env.authType}
                    {env.secretConfigured
                      ? " · secret ✓"
                      : env.authType !== AuthType.NONE
                        ? " · sem secret"
                        : ""}
                    {Object.keys(env.headers ?? {}).length > 0
                      ? ` · ${Object.keys(env.headers).length} header(s)`
                      : ""}
                  </p>
                </div>
                <CardAction className="pointer-events-auto">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Ações de ${env.name}`}
                        />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-40">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          onClick={() => {
                            setError(null);
                            setEditingEnv(env);
                          }}
                        >
                          <Pencil />
                          Editar
                        </DropdownMenuItem>
                        {env.authType !== AuthType.NONE ? (
                          <DropdownMenuItem
                            onClick={() => {
                              setError(null);
                              setSecretValue("");
                              setSecretEnv(env);
                            }}
                          >
                            <KeyRound />
                            Secret
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleteEnv(env)}
                      >
                        <Trash2 />
                        Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardAction>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <EnvironmentDetailDialog
        environment={detailEnv}
        open={detailEnvId !== null && detailEnv !== null}
        onOpenChange={(open) => {
          if (!open) setDetailEnvId(null);
        }}
        onEdit={() => {
          if (!detailEnv) return;
          setError(null);
          setEditingEnv(detailEnv);
        }}
        onSecret={() => {
          if (!detailEnv) return;
          setError(null);
          setSecretValue("");
          setSecretUsername("");
          setSecretPassword("");
          setSecretEnv(detailEnv);
        }}
        onDelete={() => {
          if (!detailEnv) return;
          setDeleteEnv(detailEnv);
        }}
      />

      <EnvironmentFormDialog
        open={createOpen}
        mode={createOpen ? { kind: "create" } : null}
        busy={busy}
        onOpenChange={setCreateOpen}
        onSubmit={onCreate}
      />

      <EnvironmentFormDialog
        open={editingEnv !== null}
        mode={editingEnv ? { kind: "edit", environment: editingEnv } : null}
        busy={busy}
        onOpenChange={(open) => {
          if (!open) setEditingEnv(null);
        }}
        onSubmit={onUpdate}
      />

      <Dialog
        open={secretEnv !== null}
        onOpenChange={(open) => {
          if (!open) resetSecretForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Secret — {secretEnv?.name}</DialogTitle>
            <DialogDescription>
              Gravado no vault criptografado (nunca no SQLite plaintext).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSaveSecret} className="space-y-4">
            {secretEnv?.authType === AuthType.BASIC ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  Usuário
                  <Input
                    required
                    autoComplete="username"
                    value={secretUsername}
                    onChange={(e) => setSecretUsername(e.target.value)}
                    className="mt-1 font-mono text-xs"
                    autoFocus
                  />
                </label>
                <label className="block text-sm">
                  Senha
                  <Input
                    required
                    type="password"
                    autoComplete="new-password"
                    value={secretPassword}
                    onChange={(e) => setSecretPassword(e.target.value)}
                    className="mt-1 font-mono text-xs"
                  />
                </label>
              </div>
            ) : (
              <label className="block text-sm">
                Token / API key
                <Input
                  type="password"
                  required
                  value={secretValue}
                  onChange={(e) => setSecretValue(e.target.value)}
                  className="mt-1 font-mono text-xs"
                  autoFocus
                />
              </label>
            )}
            <DialogFooter className="sm:justify-between">
              {secretEnv?.secretConfigured ? (
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={() => {
                    if (!secretEnv) return;
                    void clearEnvironmentSecret(secretEnv.id).then(() => {
                      resetSecretForm();
                    });
                  }}
                >
                  Limpar secret
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetSecretForm}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    (secretEnv?.authType === AuthType.BASIC
                      ? !secretUsername.trim() || !secretPassword
                      : !secretValue.trim())
                  }
                >
                  {busy ? <Spinner data-icon="inline-start" /> : null}
                  Salvar
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteEnv !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleteEnv(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover ambiente?</AlertDialogTitle>
            <AlertDialogDescription>
              Remover o ambiente &quot;{deleteEnv?.name}&quot;? Secrets
              associados serão limpos.
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
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
