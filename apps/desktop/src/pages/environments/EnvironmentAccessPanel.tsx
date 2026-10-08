import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import {
  api,
  type EnvironmentDto,
  type EnvironmentPersonaDto,
  type LoginTestResult,
} from "@/services/api";
import { PageEmptyState } from "@/components/layout/page-empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { AccessMatrixSection } from "./AccessMatrixSection";
import { PersonaBindingDialog } from "./PersonaBindingDialog";

function showError(err: unknown, fallback: string) {
  toast.add({
    title: "Algo deu errado",
    description: err instanceof Error ? err.message : fallback,
    type: "error",
  });
}

function PersonasSection({ environment }: { environment: EnvironmentDto }) {
  const [items, setItems] = useState<EnvironmentPersonaDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EnvironmentPersonaDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [report, setReport] = useState<
    (LoginTestResult & { name: string; headers?: string[] }) | null
  >(null);

  const reload = useCallback(() => {
    setLoading(true);
    void api
      .listEnvironmentPersonas(environment.id)
      .then(setItems)
      .catch((err: unknown) => showError(err, "Falha ao carregar personas"))
      .finally(() => setLoading(false));
  }, [environment.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function onTest(item: EnvironmentPersonaDto) {
    setBusyId(item.persona.id);
    try {
      const result = await api.testPersonaLogin(environment.id, item.persona.id);
      setReport({ ...result, name: item.persona.name });
    } catch (err) {
      showError(err, "Falha ao testar login");
    } finally {
      setBusyId(null);
    }
  }

  async function onUnbind(item: EnvironmentPersonaDto) {
    if (!window.confirm(`Remover vínculo e secret de ${item.persona.name} neste ambiente?`)) {
      return;
    }
    setBusyId(item.persona.id);
    try {
      await api.deletePersonaBinding(environment.id, item.persona.id);
      reload();
    } catch (err) {
      showError(err, "Falha ao remover vínculo");
    } finally {
      setBusyId(null);
    }
  }

  if (!loading && items.length === 0) {
    return (
      <PageEmptyState
        icon={Users}
        title="Nenhuma persona no projeto"
        description="Crie personas no AI Test Lab e volte aqui para dar login e fixtures a elas."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="max-w-[70ch] text-sm text-muted-foreground">
        Persona com vínculo entra no scan com a própria credencial e fixtures
        (ids que ela possui). IDOR passa a pedir o objeto de uma persona com a
        credencial de outra.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Persona</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Auth</TableHead>
            <TableHead>Fixtures</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const fixtures = Object.entries(item.binding?.fixtures ?? {});
            return (
              <TableRow key={item.persona.id}>
                <TableCell className="font-medium">{item.persona.name}</TableCell>
                <TableCell>{item.persona.role ?? "—"}</TableCell>
                <TableCell>
                  {item.binding ? (
                    <span className="flex items-center gap-1.5">
                      <Badge variant="outline">{item.binding.authType}</Badge>
                      {item.binding.authType !== "NONE" ? (
                        <Badge variant={item.secretConfigured ? "secondary" : "destructive"}>
                          {item.secretConfigured ? "Secret" : "sem secret"}
                        </Badge>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">sem vínculo</span>
                  )}
                </TableCell>
                <TableCell className="max-w-64 truncate font-mono text-xs">
                  {fixtures.length === 0
                    ? "—"
                    : fixtures.map(([key, value]) => `${key}=${value}`).join(", ")}
                </TableCell>
                <TableCell className="text-right">
                  <span className="inline-flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setEditing(item)}
                    >
                      Configurar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={!item.binding || busyId === item.persona.id}
                      onClick={() => void onTest(item)}
                    >
                      Testar login
                    </Button>
                    {item.binding ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="text-destructive"
                        disabled={busyId === item.persona.id}
                        onClick={() => void onUnbind(item)}
                      >
                        Remover
                      </Button>
                    ) : null}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <PersonaBindingDialog
        environment={environment}
        item={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={reload}
      />

      <Dialog open={report !== null} onOpenChange={(open) => !open && setReport(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {report?.name}: {report?.ok ? "login ok" : "login falhou"}
            </DialogTitle>
            <DialogDescription>
              {report?.error ??
                (report?.headers
                  ? `Headers montados: ${report.headers.join(", ") || "nenhum"}.`
                  : "Passos da receita, sem valores de secret.")}
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-72 space-y-2 overflow-auto text-sm">
            {report?.steps.map((step, index) => (
              <li key={`${step.label}-${index}`} className="rounded-md border px-3 py-2">
                <p className="font-medium">
                  {step.status} {step.method} {step.label}
                </p>
                <p className="font-mono text-xs text-muted-foreground">{step.url}</p>
                {step.cookies.length > 0 ? (
                  <p className="text-xs">cookies: {step.cookies.join(", ")}</p>
                ) : null}
                {step.extracted.length > 0 ? (
                  <p className="text-xs">extraído: {step.extracted.join(", ")}</p>
                ) : null}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" onClick={() => setReport(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function EnvironmentAccessPanel({
  environment,
}: {
  environment: EnvironmentDto;
}) {
  const [view, setView] = useState<"personas" | "matrix">("personas");
  return (
    <div className="space-y-4">
      <div className="inline-flex gap-1 rounded-lg border p-1">
        <Button
          type="button"
          size="sm"
          variant={view === "personas" ? "secondary" : "ghost"}
          onClick={() => setView("personas")}
        >
          Personas
        </Button>
        <Button
          type="button"
          size="sm"
          variant={view === "matrix" ? "secondary" : "ghost"}
          onClick={() => setView("matrix")}
        >
          Matriz
        </Button>
      </div>
      {view === "personas" ? (
        <PersonasSection environment={environment} />
      ) : (
        <AccessMatrixSection environment={environment} />
      )}
    </div>
  );
}
