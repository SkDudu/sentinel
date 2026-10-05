import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  FolderKanban,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { AuthType } from "@sw/core";
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
  CardContent,
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

type ConfirmDelete =
  | { kind: "project"; id: string; name: string }
  | { kind: "environment"; id: string; name: string };

function parseHeadersJson(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const parsed: unknown = JSON.parse(trimmed);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error("Headers deve ser um objeto JSON, ex: {\"X-App\":\"sentinel\"}");
  }
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") {
      throw new Error(`Header "${key}" precisa ser string`);
    }
    headers[key] = value;
  }
  return headers;
}

function headersToJson(headers: Record<string, string> | undefined): string {
  if (!headers || Object.keys(headers).length === 0) return "";
  return JSON.stringify(headers, null, 2);
}

export function ProjectsPage() {
  const {
    projects,
    activeProjectId,
    loading,
    error,
    loadProjects,
    setActiveProject,
    createProject,
    updateProject,
    deleteProject,
    createEnvironment,
    updateEnvironment,
    deleteEnvironment,
    setEnvironmentSecret,
    clearEnvironmentSecret,
  } = useProjectStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete | null>(
    null,
  );

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) => {
      const haystack = `${project.name} ${project.description ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [projects, search]);

  const [envProjectId, setEnvProjectId] = useState<string | null>(null);
  const [envName, setEnvName] = useState("Development");
  const [envBaseUrl, setEnvBaseUrl] = useState("http://localhost:3000");
  const [envAuthType, setEnvAuthType] = useState<string>(AuthType.NONE);
  const [envSafety, setEnvSafety] = useState(false);
  const [envHeaders, setEnvHeaders] = useState("");
  const [envSecret, setEnvSecret] = useState("");
  const [secretEnvId, setSecretEnvId] = useState<string | null>(null);
  const [secretValue, setSecretValue] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const [editingEnvId, setEditingEnvId] = useState<string | null>(null);
  const [editEnvName, setEditEnvName] = useState("");
  const [editEnvBaseUrl, setEditEnvBaseUrl] = useState("");
  const [editEnvAuthType, setEditEnvAuthType] = useState<string>(AuthType.NONE);
  const [editEnvSafety, setEditEnvSafety] = useState(false);
  const [editEnvHeaders, setEditEnvHeaders] = useState("");

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  async function onCreateProject(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      await createProject({
        name,
        description: description || undefined,
      });
      setName("");
      setDescription("");
      setCreateOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao criar");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateEnvironment(event: FormEvent) {
    event.preventDefault();
    if (!envProjectId) return;
    setFormError(null);
    setBusy(true);
    try {
      const headers = parseHeadersJson(envHeaders);
      await createEnvironment(envProjectId, {
        name: envName,
        baseUrl: envBaseUrl,
        authType: envAuthType,
        headers,
        productionSafetyMode: envSafety,
        secret: envSecret || undefined,
      });
      setEnvProjectId(null);
      setEnvName("Development");
      setEnvBaseUrl("http://localhost:3000");
      setEnvAuthType(AuthType.NONE);
      setEnvSafety(false);
      setEnvHeaders("");
      setEnvSecret("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao criar ambiente");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEnvironment(event: FormEvent) {
    event.preventDefault();
    if (!editingEnvId) return;
    setFormError(null);
    setBusy(true);
    try {
      const headers = parseHeadersJson(editEnvHeaders);
      await updateEnvironment(editingEnvId, {
        name: editEnvName,
        baseUrl: editEnvBaseUrl,
        authType: editEnvAuthType,
        headers,
        productionSafetyMode: editEnvSafety,
      });
      setEditingEnvId(null);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Erro ao atualizar ambiente",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    setBusy(true);
    setFormError(null);
    try {
      await updateProject(editingId, {
        name: editName,
        description: editDescription || null,
      });
      setEditingId(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao atualizar");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmDelete() {
    if (!confirmDelete) return;
    setBusy(true);
    setFormError(null);
    try {
      if (confirmDelete.kind === "project") {
        await deleteProject(confirmDelete.id);
      } else {
        await deleteEnvironment(confirmDelete.id);
      }
      setConfirmDelete(null);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Erro ao excluir",
      );
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell
      title="Projects"
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
            onClick={() => {
              setFormError(null);
              setCreateOpen(true);
            }}
          >
            <Plus />
            Adicionar projeto
          </Button>
        </>
      }
    >
      {(error || formError) && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle />
          <AlertTitle>Algo deu errado</AlertTitle>
          <AlertDescription>{formError ?? error}</AlertDescription>
        </Alert>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setName("");
            setDescription("");
            setFormError(null);
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

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDelete?.kind === "environment"
                ? "Remover ambiente?"
                : "Excluir projeto?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.kind === "environment"
                ? `Remover o ambiente "${confirmDelete.name}"? Secrets associados serão limpos.`
                : `Excluir o projeto "${confirmDelete?.name}" e todos os ambientes? Esta ação não pode ser desfeita.`}
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
              className="bg-destructive text-white hover:bg-destructive/90 focus-visible:border-destructive focus-visible:ring-destructive/40 dark:bg-destructive dark:hover:bg-destructive/90 dark:focus-visible:ring-destructive/40"
              onClick={() => {
                void onConfirmDelete();
              }}
            >
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {confirmDelete?.kind === "environment" ? "Remover" : "Excluir"}
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
              onClick={() => {
                setFormError(null);
                setCreateOpen(true);
              }}
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
          {filteredProjects.map((project) => {
            const active = project.id === activeProjectId;
            const editing = editingId === project.id;

            return (
              <Card
                key={project.id}
                className={active ? "ring-1 ring-primary/40" : undefined}
              >
                {editing ? (
                  <CardContent>
                    <form onSubmit={onSaveEdit} className="space-y-3">
                      <Input
                        required
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                      <Input
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="Descrição"
                      />
                      <div className="flex gap-2">
                        <Button type="submit" disabled={busy} size="sm">
                          {busy ? <Spinner data-icon="inline-start" /> : null}
                          Salvar
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingId(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                ) : (
                  <>
                    <CardHeader className="border-b">
                      <button
                        type="button"
                        onClick={() => setActiveProject(project.id)}
                        className="min-w-0 text-left"
                      >
                        <CardTitle className="flex flex-wrap items-center gap-2">
                          <span className="truncate">{project.name}</span>
                          {active && (
                            <span className="text-xs font-medium uppercase tracking-wider text-primary">
                              ativo
                            </span>
                          )}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {project.description ?? "Sem descrição"}
                        </CardDescription>
                      </button>
                      <CardAction>
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
                                onClick={() => {
                                  setEditingId(project.id);
                                  setEditName(project.name);
                                  setEditDescription(project.description ?? "");
                                }}
                              >
                                <Pencil />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditingEnvId(null);
                                  setEnvProjectId(project.id);
                                }}
                              >
                                <Plus />
                                Ambiente
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() =>
                                setConfirmDelete({
                                  kind: "project",
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

                    <CardContent className="space-y-3">
                    <ul className="space-y-2">
                      {project.environments.length === 0 ? (
                        <li className="text-xs text-[var(--muted)]">
                          Sem ambientes. Adicione Development/Staging.
                        </li>
                      ) : (
                        project.environments.map((env) => (
                          <li
                            key={env.id}
                            className="space-y-2 rounded border border-[var(--line)] px-3 py-2 font-mono text-xs text-[var(--muted)]"
                          >
                            {editingEnvId === env.id ? (
                              <form
                                onSubmit={onSaveEnvironment}
                                className="space-y-3 font-sans"
                              >
                                <h4 className="text-sm text-[var(--muted)]">
                                  Editar ambiente
                                </h4>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <label className="block text-sm">
                                    Nome
                                    <input
                                      required
                                      value={editEnvName}
                                      onChange={(e) =>
                                        setEditEnvName(e.target.value)
                                      }
                                      className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2"
                                    />
                                  </label>
                                  <label className="block text-sm">
                                    Base URL
                                    <input
                                      required
                                      type="url"
                                      value={editEnvBaseUrl}
                                      onChange={(e) =>
                                        setEditEnvBaseUrl(e.target.value)
                                      }
                                      className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-xs"
                                    />
                                  </label>
                                  <label className="block text-sm">
                                    Auth
                                    <select
                                      value={editEnvAuthType}
                                      onChange={(e) =>
                                        setEditEnvAuthType(e.target.value)
                                      }
                                      className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2"
                                    >
                                      {Object.values(AuthType).map((type) => (
                                        <option key={type} value={type}>
                                          {type}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="flex items-center gap-2 pt-6 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={editEnvSafety}
                                      onChange={(e) =>
                                        setEditEnvSafety(e.target.checked)
                                      }
                                    />
                                    Production Safety Mode
                                  </label>
                                  <label className="block text-sm sm:col-span-2">
                                    Headers (JSON)
                                    <textarea
                                      value={editEnvHeaders}
                                      onChange={(e) =>
                                        setEditEnvHeaders(e.target.value)
                                      }
                                      rows={3}
                                      placeholder='{"X-Tenant":"dev"}'
                                      className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-xs"
                                    />
                                  </label>
                                </div>
                                <div className="flex gap-2">
                                  <Button type="submit" disabled={busy} size="sm">
                                    {busy ? (
                                      <Spinner data-icon="inline-start" />
                                    ) : null}
                                    Salvar
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setEditingEnvId(null)}
                                  >
                                    Cancelar
                                  </Button>
                                </div>
                              </form>
                            ) : (
                              <>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span>
                                    {env.name}: {env.baseUrl}
                                    {env.productionSafetyMode
                                      ? " · safety"
                                      : ""}
                                    {" · "}
                                    {env.authType}
                                    {Object.keys(env.headers ?? {}).length > 0
                                      ? ` · ${Object.keys(env.headers).length} header(s)`
                                      : ""}
                                    {env.secretConfigured
                                      ? " · secret ✓"
                                      : env.authType !== "NONE"
                                        ? " · sem secret"
                                        : ""}
                                  </span>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEnvProjectId(null);
                                        setSecretEnvId(null);
                                        setEditingEnvId(env.id);
                                        setEditEnvName(env.name);
                                        setEditEnvBaseUrl(env.baseUrl);
                                        setEditEnvAuthType(env.authType);
                                        setEditEnvSafety(
                                          env.productionSafetyMode,
                                        );
                                        setEditEnvHeaders(
                                          headersToJson(env.headers),
                                        );
                                      }}
                                      className="text-[var(--accent)]"
                                    >
                                      editar
                                    </button>
                                    {env.authType !== "NONE" && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSecretEnvId(env.id);
                                          setSecretValue("");
                                        }}
                                        className="text-[var(--accent)]"
                                      >
                                        secret
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setConfirmDelete({
                                          kind: "environment",
                                          id: env.id,
                                          name: env.name,
                                        })
                                      }
                                      className="text-[var(--danger)]"
                                    >
                                      remover
                                    </button>
                                  </div>
                                </div>
                                {secretEnvId === env.id && (
                                  <form
                                    className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-2"
                                    onSubmit={(event) => {
                                      event.preventDefault();
                                      void (async () => {
                                        setBusy(true);
                                        try {
                                          await setEnvironmentSecret(
                                            env.id,
                                            secretValue,
                                          );
                                          setSecretEnvId(null);
                                          setSecretValue("");
                                        } catch (err) {
                                          setFormError(
                                            err instanceof Error
                                              ? err.message
                                              : "Falha ao salvar secret",
                                          );
                                        } finally {
                                          setBusy(false);
                                        }
                                      })();
                                    }}
                                  >
                                    <input
                                      type="password"
                                      required
                                      value={secretValue}
                                      onChange={(e) =>
                                        setSecretValue(e.target.value)
                                      }
                                      placeholder="Token / API key"
                                      className="min-w-[200px] flex-1 rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1"
                                    />
                                    <Button type="submit" disabled={busy} size="xs">
                                      {busy ? (
                                        <Spinner data-icon="inline-start" />
                                      ) : null}
                                      Salvar
                                    </Button>
                                    {env.secretConfigured && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          void clearEnvironmentSecret(
                                            env.id,
                                          ).then(() => setSecretEnvId(null));
                                        }}
                                        className="text-[var(--danger)]"
                                      >
                                        limpar
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => setSecretEnvId(null)}
                                    >
                                      cancelar
                                    </button>
                                  </form>
                                )}
                              </>
                            )}
                          </li>
                        ))
                      )}
                    </ul>

                {envProjectId === project.id && (
                  <form
                    onSubmit={onCreateEnvironment}
                    className="space-y-3 border-t border-border pt-4"
                  >
                    <h4 className="text-sm text-[var(--muted)]">Novo ambiente</h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm">
                        Nome
                        <input
                          required
                          value={envName}
                          onChange={(e) => setEnvName(e.target.value)}
                          className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2"
                        />
                      </label>
                      <label className="block text-sm">
                        Base URL
                        <input
                          required
                          type="url"
                          value={envBaseUrl}
                          onChange={(e) => setEnvBaseUrl(e.target.value)}
                          className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-xs"
                        />
                      </label>
                      <label className="block text-sm">
                        Auth
                        <select
                          value={envAuthType}
                          onChange={(e) => setEnvAuthType(e.target.value)}
                          className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2"
                        >
                          {Object.values(AuthType).map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 pt-6 text-sm">
                        <input
                          type="checkbox"
                          checked={envSafety}
                          onChange={(e) => setEnvSafety(e.target.checked)}
                        />
                        Production Safety Mode
                      </label>
                      <label className="block text-sm sm:col-span-2">
                        Headers (JSON, opcional)
                        <textarea
                          value={envHeaders}
                          onChange={(e) => setEnvHeaders(e.target.value)}
                          rows={3}
                          placeholder='{"X-Tenant":"dev"}'
                          className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-xs"
                        />
                      </label>
                      {envAuthType !== AuthType.NONE && (
                        <label className="block text-sm sm:col-span-2">
                          Secret (vault criptografado — nunca no SQLite)
                          <input
                            type="password"
                            value={envSecret}
                            onChange={(e) => setEnvSecret(e.target.value)}
                            className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-xs"
                            placeholder="Bearer token ou API key"
                          />
                        </label>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" disabled={busy} size="sm">
                        {busy ? <Spinner data-icon="inline-start" /> : null}
                        Salvar ambiente
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEnvProjectId(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                )}
                    </CardContent>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
