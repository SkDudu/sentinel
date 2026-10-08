import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid3x3 } from "lucide-react";
import { ANONYMOUS_PERSONA, type AccessExpect, type AccessRule, type Endpoint } from "@sw/core";
import { api, type EnvironmentDto, type EnvironmentPersonaDto } from "@/services/api";
import { PageEmptyState } from "@/components/layout/page-empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const CYCLE: Array<AccessExpect | undefined> = [undefined, "allow", "deny", "own-only"];
const CELL_CLASS: Record<AccessExpect, string> = {
  allow: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  deny: "border-destructive/40 bg-destructive/10 text-destructive",
  "own-only": "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

const cellKey = (endpointId: string, personaId: string) => `${endpointId}\n${personaId}`;

function showError(err: unknown, fallback: string) {
  toast.add({
    title: "Algo deu errado",
    description: err instanceof Error ? err.message : fallback,
    type: "error",
  });
}

export function AccessMatrixSection({ environment }: { environment: EnvironmentDto }) {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [personas, setPersonas] = useState<EnvironmentPersonaDto[]>([]);
  const [rules, setRules] = useState<Map<string, AccessRule>>(new Map());
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [onlyRuled, setOnlyRuled] = useState(false);
  const [page, setPage] = useState(0);

  const applyRules = useCallback((list: AccessRule[]) => {
    setRules(new Map(list.map((rule) => [cellKey(rule.endpointId, rule.personaId), rule])));
  }, []);

  useEffect(() => {
    setLoading(true);
    void Promise.all([
      api.listEnvironmentEndpoints(environment.id),
      api.listEnvironmentPersonas(environment.id),
      api.listAccessRules(environment.id),
    ])
      .then(([list, people, saved]) => {
        setEndpoints(list);
        setPersonas(people);
        applyRules(saved.rules);
        setDirty(false);
      })
      .catch((err: unknown) => showError(err, "Falha ao carregar matriz"))
      .finally(() => setLoading(false));
  }, [environment.id, applyRules]);

  const columns = useMemo(
    () => [
      { id: ANONYMOUS_PERSONA, name: "Anônimo", bound: true },
      ...personas.map((item) => ({
        id: item.persona.id,
        name: item.persona.name,
        bound: item.binding !== null,
      })),
    ],
    [personas],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return endpoints.filter((endpoint) => {
      if (onlyRuled && !columns.some((c) => rules.has(cellKey(endpoint.id, c.id)))) {
        return false;
      }
      if (!q) return true;
      return (
        endpoint.path.toLowerCase().includes(q) ||
        endpoint.method.toLowerCase() === q ||
        endpoint.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [endpoints, query, onlyRuled, columns, rules]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  function cycle(endpointId: string, personaId: string) {
    const key = cellKey(endpointId, personaId);
    const now = rules.get(key)?.expect;
    const next = CYCLE[(CYCLE.indexOf(now) + 1) % CYCLE.length];
    setRules((prev) => {
      const map = new Map(prev);
      if (next) map.set(key, { endpointId, personaId, expect: next });
      else map.delete(key);
      return map;
    });
    setDirty(true);
  }

  async function onPrefill(source: "graph" | "ai") {
    setBusy(true);
    try {
      const { rules: suggested, rejected = [] } =
        source === "ai"
          ? await api.suggestAccessWithAi(environment.id)
          : { ...(await api.suggestAccessRulesFromGraph(environment.id)), rejected: [] };
      const fresh = suggested.filter(
        (rule) => !rules.has(cellKey(rule.endpointId, rule.personaId)),
      );
      setRules((prev) => {
        const map = new Map(prev);
        for (const rule of fresh) map.set(cellKey(rule.endpointId, rule.personaId), rule);
        return map;
      });
      if (fresh.length > 0) setDirty(true);
      toast.add({
        title: source === "ai" ? "Sugestão da IA aplicada" : "Matriz pré-preenchida",
        description: `${fresh.length} células novas vindas ${source === "ai" ? "da IA" : "do grafo"}; as já marcadas não mudam.${rejected.length > 0 ? ` ${rejected.length} sugestões descartadas na validação.` : ""} Revise e salve.`,
        type: "success",
      });
    } catch (err) {
      showError(err, source === "ai" ? "Falha ao sugerir com IA" : "Falha ao sugerir pelo grafo");
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    setBusy(true);
    try {
      const saved = await api.saveAccessRules(environment.id, [...rules.values()]);
      applyRules(saved.rules);
      setDirty(false);
      toast.add({ title: `Matriz salva (${saved.rules.length} regras).`, type: "success" });
    } catch (err) {
      showError(err, "Falha ao salvar matriz");
    } finally {
      setBusy(false);
    }
  }

  if (!loading && endpoints.length === 0) {
    return (
      <PageEmptyState
        icon={Grid3x3}
        title="Sem endpoints"
        description="Importe a documentação OpenAPI do ambiente para montar a matriz."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="max-w-[70ch] text-sm text-muted-foreground">
        Clique na célula para alternar allow → deny → own-only. own-only pede o
        objeto da própria persona (deve passar) e o de cada outra (deve negar).
        {environment.productionSafetyMode
          ? " Safety ligado: só GET/HEAD/OPTIONS rodam."
          : ""}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={query}
          placeholder="Filtrar path, tag ou método…"
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
          className="h-8 w-64"
        />
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={onlyRuled}
            onCheckedChange={(checked) => {
              setOnlyRuled(checked);
              setPage(0);
            }}
          />
          Só com regra
        </label>
        <span className="text-xs text-muted-foreground">{rules.size} regras</span>
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void onPrefill("graph")}
          >
            Pré-preencher pelo grafo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void onPrefill("ai")}
          >
            Sugerir com IA
          </Button>
          <Button type="button" size="sm" disabled={busy || !dirty} onClick={() => void onSave()}>
            Salvar
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Endpoint</TableHead>
              {columns.map((column) => (
                <TableHead
                  key={column.id}
                  className={cn("text-center", !column.bound && "text-muted-foreground")}
                  title={column.bound ? undefined : "Sem vínculo no ambiente: regra não roda"}
                >
                  {column.name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((endpoint) => (
              <TableRow key={endpoint.id}>
                <TableCell className="max-w-96 truncate font-mono text-xs">
                  <span className="mr-2 font-semibold">{endpoint.method}</span>
                  {endpoint.path}
                </TableCell>
                {columns.map((column) => {
                  const rule = rules.get(cellKey(endpoint.id, column.id));
                  return (
                    <TableCell key={column.id} className="text-center">
                      <button
                        type="button"
                        disabled={busy}
                        title={
                          rule?.pathFixtures
                            ? Object.entries(rule.pathFixtures)
                                .map(([param, key]) => `${param} ← ${key}`)
                                .join(", ")
                            : undefined
                        }
                        onClick={() => cycle(endpoint.id, column.id)}
                        className={cn(
                          "min-w-16 rounded-md border px-2 py-0.5 text-xs",
                          rule ? CELL_CLASS[rule.expect] : "border-dashed text-muted-foreground",
                        )}
                      >
                        {rule?.expect ?? "—"}
                      </button>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Anterior
          </Button>
          {current + 1} / {pages}
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Próxima
          </Button>
        </div>
      ) : null}
    </div>
  );
}
