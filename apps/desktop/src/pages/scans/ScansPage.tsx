import { useScanStore } from "@/stores/scan";

const demoCases = [
  { id: "det-email-valid", name: "email: valid", source: "deterministic" as const },
  { id: "det-email-space", name: "email: space-inside", source: "deterministic" as const },
  { id: "det-password-leading", name: "password: leading-space", source: "deterministic" as const },
  { id: "persona-edge-user", name: "Persona: Usuário edge-case", source: "business-logic" as const },
  { id: "ai-1", name: "AI: role admin + email inválido", source: "ai" as const },
];

export function ScansPage() {
  const { cases, setCases, toggleCase, running, setRunning } = useScanStore();

  function generate() {
    setCases(demoCases.map((c) => ({ ...c, selected: c.source !== "ai" })));
  }

  return (
    <section className="max-w-4xl">
      <header className="mb-8">
        <h2 className="text-3xl font-semibold tracking-tight">AI Test Lab</h2>
        <p className="mt-2 text-[var(--muted)]">
          Determinístico primeiro. IA gera casos semânticos — você revisa antes
          de executar.
        </p>
      </header>

      <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
        <p className="font-mono text-sm text-[var(--accent)]">POST /users</p>
        <div className="mt-4 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-2">
          {[
            "Normal",
            "Validation errors",
            "Edge cases",
            "Type confusion",
            "Boundary values",
            "Business logic",
            "AI generated",
          ].map((label) => (
            <label key={label} className="flex items-center gap-2">
              <input type="checkbox" defaultChecked={label !== "AI generated"} />
              {label}
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={generate}
          className="mt-5 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#062016]"
        >
          Generate Test Cases
        </button>
      </div>

      {cases.length > 0 && (
        <div className="mt-6 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-[var(--muted)]">
              Generated: {cases.length} — revise casos de IA antes do run
            </p>
            <button
              type="button"
              disabled={running}
              onClick={() => {
                setRunning(true);
                window.setTimeout(() => setRunning(false), 800);
              }}
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:border-[var(--accent)] disabled:opacity-50"
            >
              {running ? "Running…" : "Run selected"}
            </button>
          </div>
          <ul className="space-y-2">
            {cases.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-3 rounded-md border border-[var(--line)] px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={c.selected}
                    onChange={() => toggleCase(c.id)}
                  />
                  <span className="flex-1">{c.name}</span>
                  <span className="font-mono text-xs uppercase text-[var(--muted)]">
                    {c.source}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
