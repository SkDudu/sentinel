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
import { Switch } from "@/components/ui/switch";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .getAiSettings()
      .then(setSettings)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Falha ao carregar IA"),
      );
  }, []);

  async function onSave() {
    if (!settings) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.saveAiSettings({
        enabled: settings.enabled,
        kind: settings.kind,
        baseUrl: settings.baseUrl,
        model: settings.model,
        maxAiCases: settings.maxAiCases,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      setSettings(next);
      setApiKey("");
      toast.add({ title: "Configurações de IA salvas.", type: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
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
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <CardTitle>IA habilitada</CardTitle>
                      <CardDescription>
                        Desligada, o AI Lab não chama o provedor.
                      </CardDescription>
                    </div>
                    <Switch
                      checked={settings.enabled}
                      aria-label="IA habilitada"
                      onCheckedChange={(enabled) =>
                        setSettings({ ...settings, enabled })
                      }
                    />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Field id="ai-kind" label="Provedor" hint={KIND_HINTS[settings.kind]}>
                    <Select
                      items={PROVIDER_ITEMS}
                      value={settings.kind}
                      onValueChange={(value) => {
                        if (value != null) setSettings({ ...settings, kind: value });
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

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="ai-base-url" label="Base URL">
                      <Input
                        id="ai-base-url"
                        value={settings.baseUrl}
                        onChange={(e) =>
                          setSettings({ ...settings, baseUrl: e.target.value })
                        }
                        className="font-mono text-xs"
                        spellCheck={false}
                        autoComplete="off"
                      />
                    </Field>
                    <Field id="ai-model" label="Modelo">
                      <Input
                        id="ai-model"
                        value={settings.model}
                        onChange={(e) =>
                          setSettings({ ...settings, model: e.target.value })
                        }
                        spellCheck={false}
                        autoComplete="off"
                      />
                    </Field>
                  </div>

                  <Field
                    id="ai-api-key"
                    label="Chave de API"
                    hint={
                      settings.hasApiKey
                        ? "Já está no cofre. Deixe em branco para manter."
                        : "Opcional. Gravada no cofre, não no banco."
                    }
                  >
                    <Input
                      id="ai-api-key"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="font-mono text-xs"
                      autoComplete="new-password"
                      spellCheck={false}
                    />
                  </Field>

                  <Field
                    id="ai-max-cases"
                    label="Máximo de casos por geração"
                    hint="De 1 a 100."
                  >
                    <Input
                      id="ai-max-cases"
                      type="number"
                      min={1}
                      max={100}
                      value={settings.maxAiCases}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          maxAiCases: Number(e.target.value) || 20,
                        })
                      }
                      className="max-w-32"
                    />
                  </Field>
                </CardContent>
                <CardFooter className="justify-end">
                  <Button
                    type="button"
                    disabled={busy}
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
