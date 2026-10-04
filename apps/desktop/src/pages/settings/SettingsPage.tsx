export function SettingsPage() {
  return (
    <section className="max-w-3xl">
      <header className="mb-8">
        <h2 className="text-3xl font-semibold tracking-tight">Settings</h2>
        <p className="mt-2 text-[var(--muted)]">
          IA opcional, Production Safety Mode e secrets no keychain — nunca em
          texto puro no SQLite.
        </p>
      </header>

      <div className="space-y-4">
        <fieldset className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
          <legend className="px-1 text-sm text-[var(--muted)]">AI Provider</legend>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            {["Ollama", "LM Studio", "OpenAI", "OpenAI-compatible"].map((p) => (
              <label key={p} className="flex items-center gap-2">
                <input type="radio" name="ai" defaultChecked={p === "Ollama"} />
                {p}
              </label>
            ))}
          </div>
          <label className="mt-4 block text-sm text-[var(--muted)]">
            Base URL
            <input
              className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
              defaultValue="http://127.0.0.1:11434/v1"
            />
          </label>
        </fieldset>

        <label className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-5 py-4 text-sm">
          <input type="checkbox" defaultChecked />
          Production Safety Mode (limita rate-limit e bursts)
        </label>
      </div>
    </section>
  );
}
