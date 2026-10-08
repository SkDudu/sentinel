import type { TestCase, TestPersona } from "@sw/core";
import type { EnvironmentDto } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export function AiLabPanel({
  environment,
  selectedCount,
  busy,
  scanPhase,
  cases,
  approved,
  approvedCount,
  rejected,
  genMode,
  personas,
  personaName,
  personaFieldsJson,
  editingPersonaId,
  onGenerate,
  onClear,
  onRunApproved,
  onToggleApproved,
  onPersonaName,
  onPersonaFields,
  onSavePersona,
  onEditPersona,
  onCancelEdit,
  onDeletePersona,
}: {
  environment: EnvironmentDto | undefined;
  selectedCount: number;
  busy: boolean;
  scanPhase: "idle" | "running" | "cancelling";
  cases: TestCase[];
  approved: Record<string, boolean>;
  approvedCount: number;
  rejected: Array<{ id: string; name: string; reason: string }>;
  genMode: string | null;
  personas: TestPersona[];
  personaName: string;
  personaFieldsJson: string;
  editingPersonaId: string | null;
  onGenerate: () => void;
  onClear: () => void;
  onRunApproved: () => void;
  onToggleApproved: (caseId: string) => void;
  onPersonaName: (value: string) => void;
  onPersonaFields: (value: string) => void;
  onSavePersona: () => void;
  onEditPersona: (persona: TestPersona) => void;
  onCancelEdit: () => void;
  onDeletePersona: (id: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">
          {environment ? environment.name : "Nenhum ambiente"}
          {" · "}
          <span className="font-mono text-xs">{selectedCount} endpoints</span>
        </p>
        <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
          Gera casos (Ollama ou seed de personas), review gate obrigatório,
          safety filter no servidor. Aprovações persistem em{" "}
          <code className="text-primary">data/ai-cases/</code>.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy || selectedCount === 0}
          onClick={onGenerate}
        >
          Gerar casos AI
        </Button>
        {cases.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClear}
          >
            Limpar casos salvos
          </Button>
        ) : null}
        <Button
          type="button"
          disabled={
            busy || scanPhase !== "idle" || !environment || approvedCount === 0
          }
          onClick={onRunApproved}
        >
          Run aprovados ({approvedCount})
        </Button>
      </div>

      {genMode ? (
        <p className="text-xs text-muted-foreground">
          Modo: {genMode}
          {rejected.length > 0
            ? ` · ${rejected.length} rejeitados pelo safety filter`
            : ""}
        </p>
      ) : null}

      {cases.length > 0 ? (
        <ScrollArea className="h-80">
          <ul className="space-y-2 pr-3">
            {cases.map((testCase) => (
              <li key={testCase.id} className="border-b border-border py-2">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 size-3.5 accent-primary"
                    checked={Boolean(approved[testCase.id])}
                    onChange={() => onToggleApproved(testCase.id)}
                  />
                  <span className="min-w-0">
                    <span className="font-medium">{testCase.name}</span>
                    {testCase.description ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {testCase.description}
                      </span>
                    ) : null}
                    <code className="mt-1 block whitespace-pre-wrap font-mono text-[10px] text-muted-foreground">
                      {JSON.stringify(testCase.mutations, null, 2)}
                    </code>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </ScrollArea>
      ) : null}

      {rejected.length > 0 ? (
        <div>
          <p className="mb-1 text-xs font-medium tracking-tight text-muted-foreground">
            Rejeitados (safety)
          </p>
          <ul className="space-y-1 text-xs text-destructive">
            {rejected.map((item) => (
              <li key={item.id}>
                {item.name}: {item.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="border-t border-border pt-4">
        <p className="mb-3 text-sm font-medium">Personas</p>
        <ul className="mb-4 divide-y divide-border">
          {personas.map((persona) => (
            <li
              key={persona.id}
              className="flex items-center justify-between gap-2 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate">{persona.name}</span>
                <span className="text-xs text-muted-foreground">
                  {persona.tags.join(", ")}
                </span>
              </span>
              <span className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={busy}
                  onClick={() => onEditPersona(persona)}
                >
                  Editar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={busy}
                  className="text-destructive"
                  onClick={() => onDeletePersona(persona.id)}
                >
                  Apagar
                </Button>
              </span>
            </li>
          ))}
        </ul>
        <div className="grid gap-3">
          <label className="block text-sm">
            Nome
            <Input
              value={personaName}
              onChange={(event) => onPersonaName(event.target.value)}
              className="mt-1.5"
            />
          </label>
          <label className="block text-sm">
            Fields (JSON)
            <textarea
              value={personaFieldsJson}
              onChange={(event) => onPersonaFields(event.target.value)}
              rows={4}
              className="mt-1.5 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy || !personaName.trim()}
            onClick={onSavePersona}
          >
            {editingPersonaId ? "Salvar persona" : "Adicionar persona"}
          </Button>
          {editingPersonaId ? (
            <Button type="button" variant="ghost" onClick={onCancelEdit}>
              Cancelar edição
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
