import { useEffect, useRef, useState } from "react";
import { Lightbulb, Sparkles, Trash2 } from "lucide-react";
import {
  ANONYMOUS_PERSONA,
  FlowStepSchema,
  Severity,
  type FlowStep,
} from "@sw/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PHASES, type FlowPhase } from "./flow-graph";
import type { ActorOption } from "./FlowCanvas";

const METHODS = FlowStepSchema.shape.request.shape.method.options;
const DEFAULT_SEVERITY = "default";

type Item = { value: string; label: string };

function Pick({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: Item[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-[11px] text-muted-foreground">
      {label}
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          if (next != null) onChange(next);
        }}
      >
        <SelectTrigger size="sm" className="mt-1 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </label>
  );
}

function formatStatus(status: FlowStep["expect"]["status"]): string {
  return Array.isArray(status) ? status.join(", ") : status;
}

function parseStatus(text: string): FlowStep["expect"]["status"] | null {
  const value = text.trim();
  if (value === "2xx" || value === "4xx") return value;
  const codes = value.split(/[\s,|]+/).filter(Boolean).map(Number);
  return codes.length > 0 && codes.every((n) => Number.isInteger(n) && n >= 100 && n < 600)
    ? codes
    : null;
}

/** Textarea JSON que só propaga quando o valor é válido. */
function JsonField({
  label,
  value,
  onValid,
  placeholder,
  syncKey = 0,
  onGenerate,
  generating,
}: {
  label: string;
  value: unknown;
  onValid: (value: unknown) => void;
  placeholder?: string;
  /** Incrementa quando a IA (ou outro pai) substitui o valor. */
  syncKey?: number;
  onGenerate?: () => void;
  generating?: boolean;
}) {
  const [text, setText] = useState(value === undefined ? "" : JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    if (syncKey === 0) return;
    const next = valueRef.current;
    setText(next === undefined ? "" : JSON.stringify(next, null, 2));
    setError(null);
  }, [syncKey]);
  return (
    <label className="block text-[11px] text-muted-foreground">
      <span className="flex items-center justify-between gap-2">
        {label}
        {onGenerate ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={generating}
            onClick={onGenerate}
          >
            <Sparkles data-icon="inline-start" />
            {generating ? "Gerando…" : "Gerar com IA"}
          </Button>
        ) : null}
      </span>
      <textarea
        value={text}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (!next.trim()) {
            setError(null);
            onValid(undefined);
            return;
          }
          try {
            onValid(JSON.parse(next));
            setError(null);
          } catch {
            setError("JSON inválido");
          }
        }}
        className="mt-1 block min-h-20 w-full rounded-md border bg-transparent p-2 font-mono text-[11px] text-foreground"
      />
      {error ? <span className="text-destructive">{error}</span> : null}
    </label>
  );
}

export function StepPanel({
  step,
  phase,
  actors,
  suggestion,
  onSuggest,
  bodyHint,
  bodySyncKey,
  onGenerateBody,
  generatingBody,
  onChange,
  onRemove,
}: {
  step: FlowStep;
  phase: FlowPhase;
  actors: ActorOption[];
  suggestion: string | null;
  onSuggest: () => void;
  bodyHint?: string | null;
  bodySyncKey?: number;
  onGenerateBody?: () => void;
  generatingBody?: boolean;
  onChange: (step: FlowStep, phase?: FlowPhase) => void;
  onRemove: () => void;
}) {
  const [statusText, setStatusText] = useState(formatStatus(step.expect.status));
  const [extractError, setExtractError] = useState<string | null>(null);
  const actorItems: Item[] = [
    { value: ANONYMOUS_PERSONA, label: "anônimo" },
    ...actors.map((actor) => ({ value: actor.id, label: actor.name })),
  ];
  if (!actorItems.some((item) => item.value === step.actor)) {
    actorItems.push({ value: step.actor, label: `${step.actor} (fora do ambiente)` });
  }
  const severityItems: Item[] = [
    { value: DEFAULT_SEVERITY, label: "Padrão (MEDIUM)" },
    ...Object.values(Severity).map((s) => ({ value: s, label: s })),
  ];
  const statusInvalid = parseStatus(statusText) === null;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-3">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate font-mono text-xs">{step.id}</p>
          <Button type="button" size="icon-xs" variant="ghost" onClick={onRemove} aria-label="Remover passo">
            <Trash2 />
          </Button>
        </div>

        {suggestion ? (
          <Button type="button" size="xs" variant="outline" className="h-auto w-full justify-start py-1 text-left whitespace-normal" onClick={onSuggest}>
            <Lightbulb data-icon="inline-start" />
            {suggestion}
          </Button>
        ) : null}

        <label className="block text-[11px] text-muted-foreground">
          Rótulo
          <Input
            className="mt-1 h-7"
            value={step.label}
            onChange={(event) => onChange({ ...step, label: event.target.value || step.id })}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <Pick
            label="Fase"
            items={PHASES.map((p) => ({ value: p, label: p }))}
            value={phase}
            onChange={(value) => onChange(step, value as FlowPhase)}
          />
          <Pick
            label="Ator"
            items={actorItems}
            value={step.actor}
            onChange={(actor) => onChange({ ...step, actor })}
          />
        </div>

        <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
          <Pick
            label="Método"
            items={METHODS.map((m) => ({ value: m, label: m }))}
            value={step.request.method}
            onChange={(method) =>
              onChange({ ...step, request: { ...step.request, method: method as FlowStep["request"]["method"] } })
            }
          />
          <label className="block text-[11px] text-muted-foreground">
            Path
            <Input
              className="mt-1 h-7 font-mono text-[11px]"
              value={step.request.path}
              onChange={(event) =>
                onChange({ ...step, request: { ...step.request, path: event.target.value || "/" } })
              }
            />
          </label>
        </div>

        <JsonField
          label="Body (JSON, aceita {{var}})"
          value={step.request.body}
          syncKey={bodySyncKey}
          onGenerate={onGenerateBody}
          generating={generatingBody}
          placeholder='{"name": "{{prefix}}-item"}'
          onValid={(body) => onChange({ ...step, request: { ...step.request, body } })}
        />
        {bodyHint && step.request.body === undefined ? <p className="text-[11px] text-amber-500">{bodyHint}</p> : null}

        <JsonField
          label="Extract"
          value={step.extract}
          placeholder='[{"kind": "jsonPath", "path": "id", "as": "orderId"}]'
          onValid={(value) => {
            const parsed = FlowStepSchema.shape.extract.safeParse(value ?? []);
            setExtractError(parsed.success ? null : "Formato: [{kind, path|name, as}]");
            if (parsed.success) onChange({ ...step, extract: parsed.data });
          }}
        />
        {extractError ? <p className="text-[11px] text-destructive">{extractError}</p> : null}

        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[11px] text-muted-foreground">
            Status esperado
            <Input
              className="mt-1 h-7 font-mono text-[11px]"
              value={statusText}
              aria-invalid={statusInvalid}
              placeholder="2xx, 4xx ou 200, 201"
              onChange={(event) => {
                setStatusText(event.target.value);
                const status = parseStatus(event.target.value);
                if (status) onChange({ ...step, expect: { ...step.expect, status } });
              }}
            />
          </label>
          <Pick
            label="Severidade se falhar"
            items={severityItems}
            value={step.severityOnFail ?? DEFAULT_SEVERITY}
            onChange={(value) =>
              onChange({
                ...step,
                severityOnFail: value === DEFAULT_SEVERITY ? undefined : (value as Severity),
              })
            }
          />
        </div>
      </div>
    </ScrollArea>
  );
}
