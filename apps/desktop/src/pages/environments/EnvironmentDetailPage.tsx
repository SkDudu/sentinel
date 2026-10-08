import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, FileJson, FolderKanban } from "lucide-react";
import { AuthType, type ScanRun } from "@sw/core";
import { api } from "@/services/api";
import { useProjectStore } from "@/stores/project";
import {
  ChartPanel6,
  type ChartPanel6Props,
} from "@/components/dashboardblocks/chart-panel/chart-panel-06";
import { KPI2 } from "@/components/dashboardblocks/kpi/kpi-02";
import type { UploadFn } from "@/components/dashboardblocks/files";
import { Files1 } from "@/components/dashboardblocks/files/files-01";
import { ActionsMenu, BackLink } from "@/components/dashboardblocks/page-header";
import { PageHeader2 } from "@/components/dashboardblocks/page-header/page-header-02";
import {
  Property,
  PropertyList,
  RecordLayout,
} from "@/components/dashboardblocks/record-detail";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { PageEmptyState } from "@/components/layout/page-empty-state";
import { PageShell } from "@/components/layout/page-shell";
import {
  EnvironmentFormDialog,
  type EnvironmentFormValues,
} from "@/pages/projects/EnvironmentFormDialog";
import { ScanWorkspace } from "@/pages/scans/ScansPage";
import { EnvironmentEndpointsPanel } from "./EnvironmentDetailDialog";

type Section = "info" | "endpoints" | "scan" | "lab";

function sectionOf(pathname: string, base: string): Section {
  if (pathname === `${base}/endpoints`) return "endpoints";
  if (pathname === `${base}/scan`) return "scan";
  if (pathname === `${base}/lab`) return "lab";
  return "info";
}

export function EnvironmentDetailPage() {
  const { projectId, environmentId } = useParams<{
    projectId: string;
    environmentId: string;
  }>();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    projects,
    loadProjects,
    setActiveProject,
    updateEnvironment,
    deleteEnvironment,
    setEnvironmentSecret,
    clearEnvironmentSecret,
  } = useProjectStore();

  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [secretOpen, setSecretOpen] = useState(false);
  const [secretValue, setSecretValue] = useState("");
  const [secretUsername, setSecretUsername] = useState("");
  const [secretPassword, setSecretPassword] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [clearDocsOpen, setClearDocsOpen] = useState(false);
  const [endpointCount, setEndpointCount] = useState<number | null>(null);
  const [endpointsRevision, setEndpointsRevision] = useState(0);
  const [docsOpen, setDocsOpen] = useState(false);
  const [runs, setRuns] = useState<ScanRun[]>([]);
  const [latencyChart, setLatencyChart] = useState<ChartPanel6Props | null>(
    null,
  );
  const [latencyLoading, setLatencyLoading] = useState(false);

  const onEndpointCount = useCallback((count: number) => {
    setEndpointCount(count);
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (projectId) setActiveProject(projectId);
  }, [projectId, setActiveProject]);

  const project = projects.find((item) => item.id === projectId);
  const environment = project?.environments.find((item) => item.id === environmentId);
  const base =
    projectId && environmentId
      ? `/projects/${projectId}/environments/${environmentId}`
      : "";
  const section = sectionOf(location.pathname, base);

  const uploadOpenApi = useCallback<UploadFn>(
    async (file, { onProgress }) => {
      if (!environment) throw new Error("Ambiente não encontrado.");
      onProgress(0.2);
      const text = await file.text();
      let document: unknown;
      try {
        document = JSON.parse(text) as unknown;
      } catch {
        throw new Error("O arquivo não é JSON válido.");
      }
      onProgress(0.55);
      const result = await api.importEnvironmentOpenApi(environment.id, document);
      onProgress(1);
      setEndpointCount(result.endpoints.length);
      setEndpointsRevision((current) => current + 1);
      setDocsOpen(false);
    },
    [environment],
  );

  useEffect(() => {
    if (!project || !environment) return;
    let cancelled = false;
    void api.listEnvironmentEndpoints(environment.id).then((items) => {
      if (!cancelled) setEndpointCount(items.length);
    });
    void api.listRuns(project.id).then((items) => {
      if (!cancelled) setRuns(items);
    });
    setLatencyLoading(true);
    void api
      .getEnvironmentLatency(environment.id)
      .then((payload) => {
        if (cancelled) return;
        if (payload.points.length === 0) {
          setLatencyChart(null);
          return;
        }
        setLatencyChart({
          data: payload.points.map((point) => ({
            label: point.startedAt
              ? new Date(point.startedAt).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })
              : point.runId.slice(0, 8),
            p50: point.p50,
            p95: point.p95,
            p99: point.p99,
          })),
          description: `Percentis de latência por scan run (${payload.points.length} runs)`,
          formatter: (value) => `${value} ms`,
          headline: "p95",
          headlineHint: `${payload.headlineMs} ms · último run`,
          labelHeading: "Run",
          percentiles: [
            { key: "p50", label: "p50" },
            { key: "p95", label: "p95" },
            { key: "p99", label: "p99" },
          ],
          title: "Latência da API",
          trend: payload.trend,
        });
      })
      .catch(() => {
        if (!cancelled) setLatencyChart(null);
      })
      .finally(() => {
        if (!cancelled) setLatencyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project, environment]);

  const envRuns = useMemo(
    () => runs.filter((run) => run.environmentId === environment?.id),
    [runs, environment?.id],
  );
  const headerEntries = Object.entries(environment?.headers ?? {});

  async function onUpdate(values: EnvironmentFormValues) {
    if (!environment) return;
    setBusy(true);
    try {
      await updateEnvironment(environment.id, {
        name: values.name,
        baseUrl: values.baseUrl,
        authType: values.authType,
        headers: values.headers,
        productionSafetyMode: values.productionSafetyMode,
      });
      if (values.secret?.trim()) {
        await setEnvironmentSecret(environment.id, values.secret.trim());
      }
      setEditing(false);
      toast.add({ title: "Ambiente atualizado.", type: "success" });
    } catch (err) {
      toast.add({
        title: "Algo deu errado",
        description:
          err instanceof Error ? err.message : "Erro ao atualizar ambiente",
        type: "error",
      });
      throw err;
    } finally {
      setBusy(false);
    }
  }

  function resetSecret() {
    setSecretOpen(false);
    setSecretValue("");
    setSecretUsername("");
    setSecretPassword("");
  }

  async function onSaveSecret(event: FormEvent) {
    event.preventDefault();
    if (!environment) return;
    setBusy(true);
    try {
      const nextSecret =
        environment.authType === AuthType.BASIC
          ? `${secretUsername.trim()}:${secretPassword}`
          : secretValue.trim();
      if (environment.authType === AuthType.BASIC) {
        if (!secretUsername.trim() || !secretPassword) {
          throw new Error("Basic auth precisa de usuário e senha");
        }
      } else if (!nextSecret) {
        throw new Error("Secret é obrigatório");
      }
      await setEnvironmentSecret(environment.id, nextSecret);
      resetSecret();
      toast.add({ title: "Secret salvo.", type: "success" });
    } catch (err) {
      toast.add({
        title: "Algo deu errado",
        description:
          err instanceof Error ? err.message : "Falha ao salvar secret",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmDelete() {
    if (!environment || !projectId) return;
    setBusy(true);
    try {
      await deleteEnvironment(environment.id);
      toast.add({ title: "Ambiente removido.", type: "success" });
      void navigate(`/projects/${projectId}/environments`);
    } catch (err) {
      toast.add({
        title: "Algo deu errado",
        description: err instanceof Error ? err.message : "Erro ao excluir",
        type: "error",
      });
      setDeleteOpen(false);
      setBusy(false);
    }
  }

  async function onConfirmClearDocs() {
    if (!environment) return;
    setBusy(true);
    try {
      const result = await api.clearEnvironmentOpenApi(environment.id);
      setEndpointCount(0);
      setEndpointsRevision((current) => current + 1);
      setClearDocsOpen(false);
      toast.add({
        title: "Documentação removida.",
        description:
          result.removed > 0
            ? `${result.removed} endpoint${result.removed === 1 ? "" : "s"} OpenAPI apagado${result.removed === 1 ? "" : "s"}.`
            : "Nenhum endpoint OpenAPI neste ambiente.",
        type: "success",
      });
    } catch (err) {
      setClearDocsOpen(false);
      toast.add({
        title: "Algo deu errado",
        description:
          err instanceof Error ? err.message : "Falha ao remover documentação",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!projectId || (!project && projects.length > 0)) {
    return (
      <PageShell title="Ambiente">
        <PageEmptyState
          icon={FolderKanban}
          title="Projeto não encontrado"
          description="Volte à lista e abra um projeto pelo card."
          action={
            <Button nativeButton={false} render={<Link to="/projects" />}>
              Ir para Projetos
            </Button>
          }
        />
      </PageShell>
    );
  }

  if (!project || !environment) {
    return (
      <PageShell title="Ambiente">
        <p className="text-sm text-muted-foreground">
          {project ? "Ambiente não encontrado." : "Carregando…"}
        </p>
      </PageShell>
    );
  }

  const tabs = [
    { href: base, title: "Informações" },
    {
      href: `${base}/endpoints`,
      title: "Endpoints",
      badge: endpointCount ?? undefined,
    },
    { href: `${base}/scan`, title: "Scan do ambiente" },
    { href: `${base}/lab`, title: "AI Test Lab" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <BackLink href={`/projects/${project.id}/environments`}>Ambientes</BackLink>
      <PageHeader2
        title={environment.name}
        description={environment.baseUrl}
        status={environment.productionSafetyMode ? "Safety" : environment.authType}
        pathname={location.pathname}
        tabs={tabs}
        tabsLabel="Seções do ambiente"
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDocsOpen(true)}
            >
              <FileJson data-icon="inline-start" />
              Adicionar documentação
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(true)}>
              Editar
            </Button>
            <ActionsMenu
              label="Ações do ambiente"
              items={[
                ...(environment.authType !== AuthType.NONE
                  ? [
                      {
                        label: "Secret",
                        onSelect: () => {
                          setSecretValue("");
                          setSecretUsername("");
                          setSecretPassword("");
                          setSecretOpen(true);
                        },
                      },
                    ]
                  : []),
                {
                  label: "Remover documentação",
                  onSelect: () => setClearDocsOpen(true),
                  variant: "destructive" as const,
                },
                {
                  label: "Remover ambiente",
                  onSelect: () => setDeleteOpen(true),
                  variant: "destructive" as const,
                },
              ]}
            />
          </>
        }
      />

      {section === "info" ? (
        <RecordLayout
          aside={
            <Card>
              <CardHeader>
                <CardTitle>Detalhes</CardTitle>
              </CardHeader>
              <CardContent>
                <PropertyList>
                  <Property label="URL">
                    <span className="font-mono text-xs">{environment.baseUrl}</span>
                  </Property>
                  <Property label="Auth">{environment.authType}</Property>
                  <Property label="Vault">
                    {environment.secretConfigured ? "configurado" : "ausente"}
                  </Property>
                  <Property label="Safety">
                    {environment.productionSafetyMode ? "ligado" : "desligado"}
                  </Property>
                  <Property label="Headers">
                    {headerEntries.length === 0 ? (
                      "Nenhum"
                    ) : (
                      <ul className="space-y-1 font-mono text-xs">
                        {headerEntries.map(([key, value]) => (
                          <li key={key} className="break-all">
                            {key}: {value}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Property>
                </PropertyList>
              </CardContent>
            </Card>
          }
        >
          <div className="grid grid-cols-2 gap-4 @xl/record:auto-cols-fr @xl/record:grid-flow-col @xl/record:grid-cols-none">
            <KPI2 title="Endpoints" value={endpointCount ?? 0} />
            <KPI2 title="Scans" value={envRuns.length} />
            <KPI2
              title="Vault"
              value={environment.secretConfigured ? 1 : 0}
              format={(value) => (value ? "ok" : "—")}
            />
            <KPI2
              title="Safety"
              value={environment.productionSafetyMode ? 1 : 0}
              format={(value) => (value ? "on" : "off")}
            />
          </div>
          {latencyChart ? (
            <ChartPanel6 {...latencyChart} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Latência da API</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {latencyLoading
                    ? "Carregando latência dos runs…"
                    : "Sem dados ainda. Rode um scan neste ambiente pra popular p50/p95/p99 a partir das responses."}
                </p>
              </CardContent>
            </Card>
          )}
        </RecordLayout>
      ) : null}

      {section === "endpoints" ? (
        <EnvironmentEndpointsPanel
          environment={environment}
          onCount={onEndpointCount}
          reloadToken={endpointsRevision}
        />
      ) : null}

      {/* Mantém montado: trocar aba não perde scan ao vivo nem runs. */}
      <div
        className={
          section === "scan" || section === "lab" ? "contents" : "hidden"
        }
        aria-hidden={section !== "scan" && section !== "lab"}
      >
        <ScanWorkspace
          project={project}
          environmentId={environment.id}
          view={section === "lab" ? "lab" : "scan"}
        />
      </div>

      <EnvironmentFormDialog
        open={editing}
        mode={editing ? { kind: "edit", environment } : null}
        busy={busy}
        onOpenChange={setEditing}
        onSubmit={onUpdate}
      />

      <Dialog open={docsOpen} onOpenChange={setDocsOpen}>
        <DialogContent className="bg-transparent p-0 shadow-none ring-0 sm:max-w-lg">
          <DialogHeader className="sr-only">
            <DialogTitle>Adicionar documentação</DialogTitle>
            <DialogDescription>
              Envie o openapi.json. Reimportar substitui o contrato deste ambiente.
            </DialogDescription>
          </DialogHeader>
          {docsOpen ? (
            <Files1
              title="Documentação"
              description="Envie o openapi.json. Reimportar substitui o contrato deste ambiente."
              accept=".json,application/json"
              acceptHint="JSON OpenAPI, até 5 MB"
              dropTitle="Solte o openapi.json ou escolha o arquivo"
              maxFiles={1}
              maxSize={5 * 1024 * 1024}
              upload={uploadOpenApi}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={secretOpen} onOpenChange={(open) => !open && resetSecret()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Secret — {environment.name}</DialogTitle>
            <DialogDescription>
              Gravado no vault criptografado (nunca no SQLite plaintext).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void onSaveSecret(event)} className="space-y-4">
            {environment.authType === AuthType.BASIC ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  Usuário
                  <Input
                    required
                    autoComplete="username"
                    value={secretUsername}
                    onChange={(event) => setSecretUsername(event.target.value)}
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
                    onChange={(event) => setSecretPassword(event.target.value)}
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
                  onChange={(event) => setSecretValue(event.target.value)}
                  className="mt-1 font-mono text-xs"
                  autoFocus
                />
              </label>
            )}
            <DialogFooter className="sm:justify-between">
              {environment.secretConfigured ? (
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={() => {
                    void clearEnvironmentSecret(environment.id).then(() => resetSecret());
                  }}
                >
                  Limpar secret
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={resetSecret}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? <Spinner data-icon="inline-start" /> : null}
                  Salvar
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={clearDocsOpen} onOpenChange={setClearDocsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover documentação?</AlertDialogTitle>
            <AlertDialogDescription>
              Apaga o contrato OpenAPI deste ambiente (endpoints importados).
              Endpoints manuais ficam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Alert className="mt-1" variant="destructive">
            <AlertCircle />
            <AlertTitle>Ação destrutiva</AlertTitle>
            <AlertDescription>
              Confirme só se tiver certeza. Será preciso reimportar o
              openapi.json.
            </AlertDescription>
          </Alert>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => {
                void onConfirmClearDocs();
              }}
            >
              {busy ? <Spinner data-icon="inline-start" /> : null}
              Remover documentação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover ambiente?</AlertDialogTitle>
            <AlertDialogDescription>
              Remover o ambiente &quot;{environment.name}&quot;? Secrets
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
              Remover ambiente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
