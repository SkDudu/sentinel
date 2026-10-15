import { useEffect, useState, type FormEvent } from "react";
import { CircleDot, Globe } from "lucide-react";
import { AuthType, LoginRecipeSchema, type LoginRecipe } from "@sw/core";
import type { EnvironmentDto } from "@/services/api";
import { api } from "@/services/api";
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
import { toast } from "@/components/ui/toast";

function recorderOpenUrl(baseUrl: string, docsUrl: string): string {
  const base = baseUrl.trim();
  const docs = docsUrl.trim();
  if (!docs) return base;
  if (/^https?:\/\//i.test(docs)) return docs;
  if (!base) return docs;
  try {
    const path = docs.startsWith("/") ? docs : `/${docs}`;
    return new URL(path, base).toString();
  } catch {
    return docs;
  }
}

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
  docsUrl?: string | null;
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
  const [docsUrl, setDocsUrl] = useState("/docs");
  const [authType, setAuthType] = useState<string>(AuthType.NONE);
  const [safety, setSafety] = useState(false);
  const [headers, setHeaders] = useState("");
  const [secret, setSecret] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [recipeJson, setRecipeJson] = useState("");
  const [recorderId, setRecorderId] = useState<string | null>(null);
  const [captured, setCaptured] = useState<
    Array<{ method: string; url: string; status: number }>
  >([]);
  const [recording, setRecording] = useState(false);
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
      setDocsUrl(env.docsUrl ?? "");
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
      setDocsUrl("/docs");
      setAuthType(AuthType.NONE);
      setSafety(false);
      setHeaders("");
      setRecipeJson("");
      setCaptured([]);
      setSecretLocked(false);
      setSecret("");
      setUsername("");
      setPassword("");
    }
  }, [open, mode]);

  useEffect(() => {
    if (!recorderId) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void api
        .recorderStatus(recorderId)
        .then((snap) => {
          if (cancelled) return;
          setCaptured(snap.steps);
          if (!snap.open) {
            cancelled = true;
            clearInterval(timer);
            void finishRecording();
          }
        })
        .catch(() => undefined);
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [recorderId]);

  useEffect(() => {
    if (open || !recorderId) return;
    const id = recorderId;
    setRecorderId(null);
    setCaptured([]);
    void api.stopRecorder(id).catch(() => undefined);
  }, [open, recorderId]);

  function unlockSecret() {
    if (!secretLocked) return;
    setSecretLocked(false);
    setSecret("");
    setUsername("");
    setPassword("");
  }

  async function beginRecording() {
    setFormError(null);
    setRecording(true);
    try {
      const snap = await api.startRecorder(baseUrl.trim(), docsUrl.trim() || null);
      setRecorderId(snap.id);
      setCaptured(snap.steps);
    } catch (err) {
      toast.add({
        title: "Não abriu o navegador",
        description:
          err instanceof Error ? err.message : "Falha ao abrir o navegador",
        type: "error",
      });
    } finally {
      setRecording(false);
    }
  }

  async function finishRecording() {
    if (!recorderId) return;
    const id = recorderId;
    setRecorderId(null);
    setRecording(true);
    try {
      const derived = await api.stopRecorder(id);
      setRecipeJson(JSON.stringify(derived.recipe, null, 2));
      setCaptured([]);
      if (derived.secrets.password) {
        setSecretLocked(false);
        setPassword(derived.secrets.password);
      }
    } catch (err) {
      toast.add({
        title: "Gravação falhou",
        description:
          err instanceof Error ? err.message : "Falha ao concluir a gravação",
        type: "error",
      });
    } finally {
      setRecording(false);
    }
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
        docsUrl: docsUrl.trim() || null,
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
  const recipeMissing =
    isRecipe && (!recipeJson.trim() || Boolean(recorderId) || recording);

  const headersField = (
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
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          isRecipe
            ? "z-[60] flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-4xl"
            : "z-[60] sm:max-w-lg"
        }
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
        <form
          onSubmit={handleSubmit}
          className={
            isRecipe
              ? "flex min-h-0 flex-1 flex-col gap-4 overflow-hidden"
              : "space-y-4"
          }
        >
          {formError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          ) : null}
          <div
            className={
              isRecipe
                ? "grid min-h-0 flex-1 gap-4 overflow-hidden sm:grid-cols-2"
                : undefined
            }
          >
          <div
            className={
              isRecipe
                ? "grid min-h-0 content-start gap-3 overflow-y-auto sm:grid-cols-2"
                : "grid content-start gap-3 sm:grid-cols-2"
            }
          >
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
            <label className="block text-sm sm:col-span-2">
              Base URL
              <Input
                required
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="mt-1 font-mono text-xs"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Usada nas requisições de teste.
              </p>
            </label>
            <label className="block text-sm sm:col-span-2">
              Documentação
              <Input
                value={docsUrl}
                placeholder="/docs"
                onChange={(e) => setDocsUrl(e.target.value)}
                className="mt-1 font-mono text-xs"
                spellCheck={false}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Path ou URL da documentação. O usual é /docs.
              </p>
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
                  if (recorderId) {
                    const id = recorderId;
                    setRecorderId(null);
                    setCaptured([]);
                    void api.stopRecorder(id).catch(() => undefined);
                  }
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
                <div className="space-y-3 rounded-lg border-2 border-primary/50 bg-primary/5 p-3 sm:col-span-2">
                  <div className="flex items-start gap-2">
                    {recorderId ? (
                      <CircleDot className="mt-0.5 size-4 shrink-0 animate-pulse text-destructive" />
                    ) : (
                      <Globe className="mt-0.5 size-4 shrink-0 text-primary" />
                    )}
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {recorderId
                          ? "Gravando… faça o login no Chrome"
                          : recipeJson.trim()
                            ? "Receita pronta"
                            : "Grave o login no navegador"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Abre o Chrome em {recorderOpenUrl(baseUrl, docsUrl) || "a documentação"}.
                        Faça o login nessa janela. Concluir monta a receita e
                        preenche a senha para o vault.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recorderId ? (
                      <Button
                        type="button"
                        disabled={recording}
                        onClick={() => void finishRecording()}
                      >
                        {recording ? <Spinner data-icon="inline-start" /> : null}
                        Concluir gravação
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant={recipeJson.trim() ? "outline" : "default"}
                        disabled={recording || !baseUrl.trim()}
                        onClick={() => void beginRecording()}
                      >
                        {recording ? <Spinner data-icon="inline-start" /> : null}
                        {recipeJson.trim() ? "Gravar de novo" : "Abrir navegador"}
                      </Button>
                    )}
                  </div>
                  {captured.length > 0 ? (
                    <ul className="max-h-28 space-y-0.5 overflow-auto rounded-md border px-2 py-1 font-mono text-xs">
                      {captured.slice(-8).map((step, index) => (
                        <li key={`${step.url}-${index}`} className="truncate">
                          {step.status} {step.method} {step.url}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
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
              </>
            ) : (
              headersField
            )}
          </div>

          {isRecipe ? (
            <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
              <label className="flex min-h-0 flex-1 flex-col text-sm">
                Receita de login (JSON)
                <textarea
                  required
                  value={recipeJson}
                  onChange={(e) => setRecipeJson(e.target.value)}
                  placeholder={RECIPE_PLACEHOLDER}
                  className="mt-1 min-h-40 w-full flex-1 resize-none overflow-auto rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </label>
              {headersField}
            </div>
          ) : null}
          </div>
          <DialogFooter className={isRecipe ? "shrink-0" : undefined}>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                busy || !name.trim() || !baseUrl.trim() || recipeMissing
              }
            >
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {isEdit ? "Salvar" : "Criar ambiente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
