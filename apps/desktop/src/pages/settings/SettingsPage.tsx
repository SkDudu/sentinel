import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Shield } from "lucide-react";
import { AiProviderKind } from "@sw/core";
import { api, type AiSettingsDto } from "@/services/api";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { PageShell } from "@/components/layout/page-shell";

const KIND_LABELS: Record<string, string> = {
  [AiProviderKind.OLLAMA]: "Ollama",
  [AiProviderKind.LM_STUDIO]: "LM Studio",
  [AiProviderKind.OPENAI]: "OpenAI",
  [AiProviderKind.OPENAI_COMPATIBLE]: "OpenAI-compatible",
};

const KIND_HINTS: Record<string, string> = {
  [AiProviderKind.OLLAMA]: "Modelo local. A chave de API costuma ser desnecessária.",
  [AiProviderKind.LM_STUDIO]:
    "Servidor local no formato da API da OpenAI.",
  [AiProviderKind.OPENAI]: "API da OpenAI. A chave fica no cofre, fora do SQLite.",
  [AiProviderKind.OPENAI_COMPATIBLE]:
    "Qualquer endpoint no formato da API da OpenAI.",
};

const SAVED_MASK = "••••••••";

const BLANK_AI: AiSettingsDto = {
  enabled: false,
  kind: AiProviderKind.OPENAI_COMPATIBLE,
  baseUrl: "",
  model: "",
  maxAiCases: 20,
  hasApiKey: false,
  saved: false,
};

const PROVIDER_ITEMS = Object.values(AiProviderKind).map((kind) => ({
  label: KIND_LABELS[kind] ?? kind,
  value: kind,
}));

const VAULT_FACTS = [
  {
    label: "Arquivo",
    value: "data/secrets.vault",
    detail: "AES-256-GCM. Padrão fora do app nativo.",
  },
  {
    label: "Keychain",
    value: "KeychainSecretStore",
    detail: "No shell Tauri, os comandos secret_* usam o keychain do sistema.",
  },
  {
    label: "Banco",
    value: "data/sentinel.db",
    detail: "SQLite do workbench. Secrets não entram aqui em texto puro.",
  },
  {
    label: "CLI",
    value: "--project",
    detail:
      "Na raiz do repo, usa o mesmo arquivo. --db aceita um caminho absoluto.",
  },
] as const;

export function SettingsPage() {
  const [settings, setSettings] = useState<AiSettingsDto | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .getAiSettings()
      .then((next) => {
        setSettings(next);
        setApiKey(next.hasApiKey ? SAVED_MASK : "");
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Falha ao carregar IA"),
      );
  }, []);

  async function onTest() {
    if (!settings) return;
    const needsKey = settings.kind !== "ollama";
    if (needsKey && !apiKey.trim() && !settings.hasApiKey) {
      toast.add({
        title: "Falta a chave",
        description: "Informe a chave de API para testar esse provedor.",
        type: "error",
      });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.testAi({
        kind: settings.kind,
        baseUrl: settings.baseUrl,
        ...(apiKey.trim() && apiKey !== SAVED_MASK ? { apiKey: apiKey.trim() } : {}),
      });
      setModels(result.models);
      setSettings({
        ...settings,
        model: result.models.includes(settings.model) ? settings.model : "",
      });
      toast.add({ title: result.message, type: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não consegui testar a IA.";
      setError(message);
      toast.add({ title: "Teste da IA falhou", description: message, type: "error" });
    } finally {
      setBusy(false);
    }
  }

  function resetForm(next: AiSettingsDto = BLANK_AI) {
    setSettings(next);
    setApiKey(next.hasApiKey ? SAVED_MASK : "");
    setModels([]);
  }

  async function onDeleteKey() {
    setBusy(true);
    setError(null);
    try {
      const next = await api.deleteAiSettings();
      resetForm(next);
      toast.add({ title: "Chave apagada. O formulário foi limpo.", type: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não consegui apagar a chave.";
      setError(message);
      toast.add({ title: "Não consegui apagar a chave", description: message, type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (!settings) return;
    if (!settings.model.trim()) {
      toast.add({
        title: "Escolha um modelo",
        description: "Teste a conexão, veja a lista e escolha o modelo antes de salvar.",
        type: "error",
      });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await api.saveAiSettings({
        enabled: true,
        kind: settings.kind,
        baseUrl: settings.baseUrl,
        model: settings.model,
        maxAiCases: settings.maxAiCases,
        ...(apiKey.trim() && apiKey !== SAVED_MASK ? { apiKey: apiKey.trim() } : {}),
      });
      resetForm(next);
      if (next.model) setModels([next.model]);
      toast.add({ title: "Configurações de IA salvas.", type: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não consegui salvar.";
      setError(message);
      toast.add({ title: "Não consegui salvar", description: message, type: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell
      title="Configurações"
      className="mx-auto w-full max-w-3xl overflow-hidden"
    >
      <ScrollArea
        className="w-full"
        style={{ height: "calc(100dvh - 11.25rem)" }}
      >
        <div className="flex w-full flex-col gap-10 pr-4 pb-2">
        {error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Não foi possível concluir</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <section className="flex flex-col gap-4">
          <SectionIntro
            title="Cofre de secrets"
            description="Tokens e chaves ficam fora do banco. O arquivo padrão é criptografado. No app nativo, o keychain do sistema assume esse papel."
          />
          <dl className="overflow-hidden rounded-xl bg-card text-sm ring-1 ring-foreground/10">
            {VAULT_FACTS.map((fact) => (
              <div
                key={fact.label}
                className="grid gap-1 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:items-baseline sm:gap-4"
              >
                <dt className="text-muted-foreground">{fact.label}</dt>
                <dd className="min-w-0">
                  <code className="font-mono text-[13px] text-foreground">
                    {fact.value}
                  </code>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {fact.detail}
                  </p>
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs leading-relaxed text-muted-foreground">
            App nativo precisa de Rust. O dev web continua no Vite, porta 1420.
          </p>
          <code className="inline-flex w-fit rounded-md bg-card px-2 py-1 font-mono text-xs text-foreground ring-1 ring-foreground/10">
            pnpm --filter @sw/desktop tauri:dev
          </code>
        </section>

        <section className="flex flex-col gap-4">
          <SectionIntro
            title="Provedor de IA"
            description="Usado pelo AI Lab para gerar casos. O scan determinístico funciona sem isso."
          />
          <Card>
            {!settings ? (
              <AiFormSkeleton failed={Boolean(error)} />
            ) : (
              <>
                <CardHeader className="border-b">
                  <CardTitle>Provedor de IA</CardTitle>
                  <CardDescription>
                    {settings.saved
                      ? "Configuração salva. A chave não volta para a tela."
                      : "Nada salvo ainda."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Field id="ai-kind" label="Provedor" hint={KIND_HINTS[settings.kind]}>
                    <Select
                      items={PROVIDER_ITEMS}
                      value={settings.kind}
                      onValueChange={(value) => {
                        if (value != null) {
                          setModels([]);
                          setSettings({ ...settings, kind: value, model: "" });
                        }
                      }}
                    >
                      <SelectTrigger id="ai-kind" className="w-full">
                        <SelectValue placeholder="Provedor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {PROVIDER_ITEMS.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field id="ai-base-url" label="Base URL">
                    <Input
                      id="ai-base-url"
                      value={settings.baseUrl}
                      placeholder="https://api.exemplo.com/v1"
                      onChange={(e) => {
                        setModels([]);
                        setSettings({ ...settings, baseUrl: e.target.value, model: "" });
                      }}
                      className="font-mono text-xs"
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </Field>

                  <Field
                    id="ai-api-key"
                    label="Token"
                    hint={
                      apiKey === SAVED_MASK
                        ? "Chave salva. Clique no campo para trocar."
                        : settings.hasApiKey
                          ? "Digite a chave nova para substituir a salva."
                          : "Obrigatória, exceto no Ollama. Gravada cifrada."
                    }
                  >
                    <div className="flex gap-2">
                      <Input
                        id="ai-api-key"
                        type="password"
                        value={apiKey}
                        placeholder="Cole a chave"
                        onFocus={() => {
                          if (apiKey === SAVED_MASK) setApiKey("");
                        }}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="font-mono text-xs tracking-widest"
                        autoComplete="new-password"
                        spellCheck={false}
                      />
                      {settings.hasApiKey ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void onDeleteKey()}
                        >
                          Apagar chave
                        </Button>
                      ) : null}
                    </div>
                  </Field>

                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void onTest()}
                  >
                    {busy ? <Spinner data-icon="inline-start" /> : null}
                    Buscar modelos
                  </Button>

                  <Field
                    id="ai-model"
                    label="Modelo"
                    hint={
                      models.length > 0
                        ? "Lista vinda do provedor."
                        : "Busque os modelos antes de escolher."
                    }
                  >
                    <Select
                      items={(settings.model && !models.includes(settings.model)
                        ? [settings.model, ...models]
                        : models
                      ).map((id) => ({ value: id, label: id }))}
                      value={settings.model || null}
                      onValueChange={(value) => {
                        if (value != null) setSettings({ ...settings, model: value });
                      }}
                    >
                      <SelectTrigger id="ai-model" className="w-full">
                        <SelectValue placeholder="Nenhum modelo ainda" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {(settings.model && !models.includes(settings.model)
                            ? [settings.model, ...models]
                            : models
                          ).map((id) => (
                            <SelectItem key={id} value={id}>
                              {id}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </CardContent>
                <CardFooter className="justify-end">
                  <Button
                    type="button"
                    disabled={busy || !settings.model.trim()}
                    onClick={() => void onSave()}
                  >
                    {busy ? <Spinner data-icon="inline-start" /> : null}
                    Salvar
                  </Button>
                </CardFooter>
              </>
            )}
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <SectionIntro
            title="Production Safety Mode"
            description="Não é uma preferência global. Liga por ambiente, dentro do projeto, e limita testes agressivos como rate limit."
          />
          <Link
            to="/projects"
            className="inline-flex w-fit items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            <Shield className="size-4" />
            Ir para Projetos
          </Link>
        </section>
        </div>
      </ScrollArea>
    </PageShell>
  );
}

function SectionIntro({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-prose">
      <h3 className="text-base font-medium tracking-tight">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="block text-sm">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function AiFormSkeleton({ failed }: { failed: boolean }) {
  if (failed) {
    return (
      <CardContent>
        <p className="text-sm text-muted-foreground">
          O provedor não carregou. O cofre e o safety mode continuam disponíveis.
        </p>
      </CardContent>
    );
  }

  return (
    <CardContent className="flex flex-col gap-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-8 w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
      <Skeleton className="h-8 w-full" />
    </CardContent>
  );
}
