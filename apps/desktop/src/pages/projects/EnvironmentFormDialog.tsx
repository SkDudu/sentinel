import { useEffect, useState, type FormEvent } from "react";
import { AuthType, LoginRecipeSchema, type LoginRecipe } from "@sw/core";
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

const SECRET_HINT: Partial<Record<string, string>> = {
  [AuthType.BEARER]: "Bearer token",
  [AuthType.API_KEY]: "API key",
  [AuthType.COOKIE]: "Cookie header value",
  [AuthType.OAUTH2]: "Access token OAuth2",
};

/** Display-only mask. Never submitted as a real credential. */
const SAVED_MASK = "••••••••";

const RECIPE_PLACEHOLDER = `{
  "version": 1,
  "spec": { "url": "/openapi.yaml" },
  "steps": [
    {
      "label": "Abrir login",
      "role": "spec-access",
      "request": { "method": "GET", "url": "/docs/login" },
      "extract": [{ "kind": "hiddenInput", "name": "_token", "as": "csrf" }]
    },
    {
      "label": "Enviar senha",
      "role": "spec-access",
      "request": {
        "method": "POST",
        "url": "/docs/login",
        "bodyType": "form",
        "fields": {
          "_token": { "kind": "var", "name": "csrf" },
          "password": { "kind": "secret", "key": "password" }
        }
      },
      "failIfLocationIncludes": "/login"
    }
  ]
}`;

export function parseLoginRecipeJson(raw: string): LoginRecipe {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Receita de login não é JSON válido");
  }
  const result = LoginRecipeSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "receita"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Receita de login inválida. ${detail}`);
  }
  return result.data;
}

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
  loginRecipe?: LoginRecipe | null;
  secret?: string;
};

type Mode =
  | { kind: "create" }
  | { kind: "edit"; environment: EnvironmentDto };

function liveValue(value: string, locked: boolean) {
  if (locked || value === SAVED_MASK) return "";
  return value;
}

function buildSecret(
  authType: string,
  secret: string,
  username: string,
  password: string,
  locked: boolean,
): string | undefined {
  if (authType === AuthType.NONE) return undefined;

  if (authType === AuthType.BASIC) {
    const user = liveValue(username, locked).trim();
    const pass = liveValue(password, locked);
    if (!user && !pass) return undefined;
    if (!user || !pass) {
      throw new Error("Basic auth precisa de usuário e senha");
    }
    return `${user}:${pass}`;
  }

  if (authType === AuthType.LOGIN_RECIPE) {
    const pass = liveValue(password, locked);
    return pass || undefined;
  }

  const trimmed = liveValue(secret, locked).trim();
  return trimmed || undefined;
}

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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [recipeJson, setRecipeJson] = useState("");
  const [secretLocked, setSecretLocked] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !mode) return;
    setFormError(null);
    if (mode.kind === "edit") {
      const env = mode.environment;
      const locked = Boolean(env.secretConfigured);
      setName(env.name);
      setBaseUrl(env.baseUrl);
      setAuthType(env.authType);
      setSafety(env.productionSafetyMode);
      setHeaders(headersToJson(env.headers));
      setRecipeJson(
        env.loginRecipe ? JSON.stringify(env.loginRecipe, null, 2) : "",
      );
      setSecretLocked(locked);
      setSecret(locked ? SAVED_MASK : "");
      setUsername(locked ? SAVED_MASK : "");
      setPassword(locked ? SAVED_MASK : "");
    } else {
      setName("Development");
      setBaseUrl("http://localhost:3000");
      setAuthType(AuthType.NONE);
      setSafety(false);
      setHeaders("");
      setRecipeJson("");
      setSecretLocked(false);
      setSecret("");
      setUsername("");
      setPassword("");
    }
  }, [open, mode]);

  function unlockSecret() {
    if (!secretLocked) return;
    setSecretLocked(false);
    setSecret("");
    setUsername("");
    setPassword("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    try {
      const parsedHeaders = parseHeadersJson(headers);
      const nextSecret = buildSecret(
        authType,
        secret,
        username,
        password,
        secretLocked,
      );
      const isRecipe = authType === AuthType.LOGIN_RECIPE;
      if (!isEdit && authType === AuthType.BASIC && !nextSecret) {
        throw new Error("Basic auth precisa de usuário e senha");
      }
      if (!isEdit && isRecipe && !nextSecret) {
        throw new Error("Login com senha precisa da senha");
      }
      const loginRecipe = isRecipe
        ? parseLoginRecipeJson(recipeJson)
        : null;
      await onSubmit({
        name,
        baseUrl,
        authType,
        headers: parsedHeaders,
        productionSafetyMode: safety,
        loginRecipe,
        secret: nextSecret,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  const needsSecret = authType !== AuthType.NONE;
  const isBasic = authType === AuthType.BASIC;
  const isRecipe = authType === AuthType.LOGIN_RECIPE;
  const secretConfigured =
    isEdit && mode.kind === "edit"
      ? Boolean(mode.environment.secretConfigured)
      : false;

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
                  if (value == null) return;
                  setAuthType(value);
                  setSecretLocked(false);
                  setSecret("");
                  setUsername("");
                  setPassword("");
                  setRecipeJson("");
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

            {needsSecret && isBasic ? (
              <>
                <label className="block text-sm">
                  Usuário
                  <Input
                    required={!isEdit || !secretConfigured}
                    autoComplete="username"
                    value={username}
                    onFocus={unlockSecret}
                    onChange={(e) => {
                      unlockSecret();
                      setUsername(e.target.value);
                    }}
                    className="mt-1 font-mono text-xs tracking-widest"
                    placeholder="usuario"
                  />
                </label>
                <label className="block text-sm">
                  Senha
                  <Input
                    required={!isEdit || !secretConfigured}
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onFocus={unlockSecret}
                    onChange={(e) => {
                      unlockSecret();
                      setPassword(e.target.value);
                    }}
                    className="mt-1 font-mono text-xs tracking-widest"
                    placeholder="senha"
                  />
                </label>
                {secretConfigured ? (
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    {secretLocked
                      ? "Credencial salva no vault. Clique num campo para trocar."
                      : "Digite usuário e senha novos para substituir o vault."}
                  </p>
                ) : null}
              </>
            ) : null}

            {needsSecret && !isBasic && !isRecipe ? (
              <label className="block text-sm sm:col-span-2">
                Secret (vault criptografado)
                <Input
                  type="password"
                  required={!isEdit || !secretConfigured}
                  autoComplete="new-password"
                  value={secret}
                  onFocus={unlockSecret}
                  onChange={(e) => {
                    unlockSecret();
                    setSecret(e.target.value);
                  }}
                  className="mt-1 font-mono text-xs tracking-widest"
                  placeholder={SECRET_HINT[authType] ?? "Secret"}
                />
                {secretConfigured ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {secretLocked
                      ? "Secret salvo no vault. Clique no campo para trocar."
                      : "Digite um valor novo para substituir o vault."}
                  </p>
                ) : null}
              </label>
            ) : null}

            {isRecipe ? (
              <>
                <label className="block text-sm sm:col-span-2">
                  Senha
                  <Input
                    required={!isEdit || !secretConfigured}
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onFocus={unlockSecret}
                    onChange={(e) => {
                      unlockSecret();
                      setPassword(e.target.value);
                    }}
                    className="mt-1 font-mono text-xs tracking-widest"
                    placeholder="senha do login"
                  />
                  {secretConfigured ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {secretLocked
                        ? "Senha salva no vault. Clique no campo para trocar."
                        : "Digite a senha nova para substituir o vault."}
                    </p>
                  ) : null}
                </label>
                <label className="block text-sm sm:col-span-2">
                  Receita de login (JSON)
                  <textarea
                    required
                    value={recipeJson}
                    onChange={(e) => setRecipeJson(e.target.value)}
                    rows={8}
                    placeholder={RECIPE_PLACEHOLDER}
                    className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs"
                  />
                </label>
              </>
            ) : null}

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
