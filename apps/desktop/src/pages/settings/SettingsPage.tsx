import { useEffect, useState } from "react";
import { AiProviderKind } from "@sw/core";
import { api, type AiSettingsDto } from "@/services/api";

const KIND_LABELS: Record<string, string> = {
  [AiProviderKind.OLLAMA]: "Ollama",
  [AiProviderKind.LM_STUDIO]: "LM Studio",
  [AiProviderKind.OPENAI]: "OpenAI",
  [AiProviderKind.OPENAI_COMPATIBLE]: "OpenAI-compatible",
};

export function SettingsPage() {
  const [settings, setSettings] = useState<AiSettingsDto | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void api
      .getAiSettings()
      .then(setSettings)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Falha ao carregar AI"),
      );
  }, []);

  async function onSave() {
    if (!settings) return;
    setBusy(true);
    setError(null);
    setSaved(false);
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
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-3xl">
      <header className="mb-8">
        <h2 className="text-3xl font-semibold tracking-tight">Settings</h2>
        <p className="mt-2 text-[var(--muted)]">
          Secrets no vault local. AI opcional (Ollama primeiro) — nunca executa
          casos sem review.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      {saved && (
        <p className="mb-4 text-sm text-[var(--accent)]">AI settings salvas.</p>
      )}

      <div className="space-y-4">
        <fieldset className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
          <legend className="px-1 text-sm text-[var(--muted)]">
            Secret vault / keychain
          </legend>
          <p className="text-sm text-[var(--muted)]">
            Default: vault AES-256-GCM em{" "}
            <code className="text-[var(--accent)]">data/secrets.vault</code>.
            No shell Tauri, comandos Rust{" "}
            <code className="text-[var(--accent)]">secret_*</code> usam o
            keychain do SO (`KeychainSecretStore`).
          </p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Build nativo: <code>pnpm --filter @sw/desktop tauri:dev</code>{" "}
            (precisa Rust). Dev web continua em Vite :1420.
          </p>
        </fieldset>

        <fieldset className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
          <legend className="px-1 text-sm text-[var(--muted)]">AI Provider</legend>

          {!settings ? (
            <p className="text-sm text-[var(--muted)]">Carregando…</p>
          ) : (
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) =>
                    setSettings({ ...settings, enabled: e.target.checked })
                  }
                />
                AI habilitada
              </label>

              <div className="grid gap-3 text-sm sm:grid-cols-2">
                {Object.values(AiProviderKind).map((kind) => (
                  <label key={kind} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="ai"
                      checked={settings.kind === kind}
                      onChange={() => setSettings({ ...settings, kind })}
                    />
                    {KIND_LABELS[kind] ?? kind}
                  </label>
                ))}
              </div>

              <label className="block text-sm text-[var(--muted)]">
                Base URL
                <input
                  className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
                  value={settings.baseUrl}
                  onChange={(e) =>
                    setSettings({ ...settings, baseUrl: e.target.value })
                  }
                />
              </label>

              <label className="block text-sm text-[var(--muted)]">
                Model
                <input
                  className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
                  value={settings.model}
                  onChange={(e) =>
                    setSettings({ ...settings, model: e.target.value })
                  }
                />
              </label>

              <label className="block text-sm text-[var(--muted)]">
                API key{" "}
                {settings.hasApiKey ? "(já configurada — deixe vazio para manter)" : "(opcional)"}
                <input
                  type="password"
                  className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-xs text-[var(--text)]"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-…"
                />
              </label>

              <label className="block text-sm text-[var(--muted)]">
                Max AI cases / geração
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
                  value={settings.maxAiCases}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxAiCases: Number(e.target.value) || 20,
                    })
                  }
                />
              </label>

              <button
                type="button"
                disabled={busy}
                onClick={() => void onSave()}
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#062016] disabled:opacity-50"
              >
                {busy ? "Salvando…" : "Salvar AI settings"}
              </button>
            </div>
          )}
        </fieldset>

        <label className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-5 py-4 text-sm">
          <input type="checkbox" defaultChecked disabled />
          Production Safety Mode (por ambiente em Projects; rate-limit na Fase 3)
        </label>
      </div>
    </section>
  );
}
