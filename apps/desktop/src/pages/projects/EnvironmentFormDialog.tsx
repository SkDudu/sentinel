import { useEffect, useState, type FormEvent } from "react";
import { AuthType } from "@sw/core";
import type { EnvironmentDto } from "@/services/api";
import { Button } from "@/components/ui/button";
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
import { Spinner } from "@/components/ui/spinner";

const AUTH_TYPE_ITEMS = Object.values(AuthType).map((type) => ({
  label: type,
  value: type,
}));

const SAFETY_ITEMS = [
  { label: "Não", value: "false" },
  { label: "Sim", value: "true" },
] as const;

export function parseHeadersJson(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const parsed: unknown = JSON.parse(trimmed);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      'Headers deve ser um objeto JSON, ex: {"X-App":"sentinel"}',
    );
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

export function headersToJson(
  headers: Record<string, string> | undefined,
): string {
  if (!headers || Object.keys(headers).length === 0) return "";
  return JSON.stringify(headers, null, 2);
}

export type EnvironmentFormValues = {
  name: string;
  baseUrl: string;
  authType: string;
  headers: Record<string, string>;
  productionSafetyMode: boolean;
  secret?: string;
};

type Mode =
  | { kind: "create" }
  | { kind: "edit"; environment: EnvironmentDto };

export function EnvironmentFormDialog({
  open,
  mode,
  busy,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: Mode | null;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: EnvironmentFormValues) => Promise<void>;
}) {
  const isEdit = mode?.kind === "edit";
  const [name, setName] = useState("Development");
  const [baseUrl, setBaseUrl] = useState("http://localhost:3000");
  const [authType, setAuthType] = useState<string>(AuthType.NONE);
  const [safety, setSafety] = useState(false);
  const [headers, setHeaders] = useState("");
  const [secret, setSecret] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !mode) return;
    setFormError(null);
    if (mode.kind === "edit") {
      const env = mode.environment;
      setName(env.name);
      setBaseUrl(env.baseUrl);
      setAuthType(env.authType);
      setSafety(env.productionSafetyMode);
      setHeaders(headersToJson(env.headers));
      setSecret("");
    } else {
      setName("Development");
      setBaseUrl("http://localhost:3000");
      setAuthType(AuthType.NONE);
      setSafety(false);
      setHeaders("");
      setSecret("");
    }
  }, [open, mode]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    try {
      const parsedHeaders = parseHeadersJson(headers);
      await onSubmit({
        name,
        baseUrl,
        authType,
        headers: parsedHeaders,
        productionSafetyMode: safety,
        secret: !isEdit && secret.trim() ? secret.trim() : undefined,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[60] sm:max-w-lg"
        overlayClassName="z-[60]"
      >
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar ambiente" : "Novo ambiente"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Atualize base URL, auth e Production Safety Mode."
              : "Development/Staging com base URL e auth. Secrets vão para o vault."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-1">
              Nome
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
                autoFocus
              />
            </label>
            <label className="block text-sm sm:col-span-1">
              Base URL
              <Input
                required
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="mt-1 font-mono text-xs"
              />
            </label>
            <div className="block text-sm">
              <span className="mb-1 block">Auth</span>
              <Select
                items={AUTH_TYPE_ITEMS}
                value={authType}
                onValueChange={(value) => {
                  if (value != null) setAuthType(value);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Auth" />
                </SelectTrigger>
                <SelectContent portalled={false}>
                  <SelectGroup>
                    {AUTH_TYPE_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="block text-sm">
              <span className="mb-1 block">Production Safety Mode</span>
              <Select
                items={[...SAFETY_ITEMS]}
                value={safety ? "true" : "false"}
                onValueChange={(value) => {
                  if (value != null) setSafety(value === "true");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Safety" />
                </SelectTrigger>
                <SelectContent portalled={false}>
                  <SelectGroup>
                    {SAFETY_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <label className="block text-sm sm:col-span-2">
              Headers (JSON{isEdit ? "" : ", opcional"})
              <textarea
                value={headers}
                onChange={(e) => setHeaders(e.target.value)}
                rows={3}
                placeholder='{"X-Tenant":"dev"}'
                className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs"
              />
            </label>
            {!isEdit && authType !== AuthType.NONE ? (
              <label className="block text-sm sm:col-span-2">
                Secret (vault criptografado)
                <Input
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  className="mt-1 font-mono text-xs"
                  placeholder="Bearer token ou API key"
                />
              </label>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || !name.trim() || !baseUrl.trim()}>
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {isEdit ? "Salvar" : "Criar ambiente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
