const mock = [
  {
    title: "Required field accepted when missing: email",
    severity: "MEDIUM",
    confidence: 70,
    status: "OPEN",
  },
  {
    title: "Type confusion accepted: age wrong type (string)",
    severity: "MEDIUM",
    confidence: 65,
    status: "OPEN",
  },
];

export function FindingsPage() {
  return (
    <section className="max-w-4xl">
      <header className="mb-8">
        <h2 className="text-3xl font-semibold tracking-tight">Findings</h2>
        <p className="mt-2 text-[var(--muted)]">
          Severity + confidence separados. Status: OPEN → CONFIRMED /
          FALSE_POSITIVE / RESOLVED / IGNORED.
        </p>
      </header>

      <div className="space-y-3">
        {mock.map((finding) => (
          <article
            key={finding.title}
            className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-5 py-4"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded bg-[var(--warn)]/20 px-2 py-0.5 text-xs font-semibold text-[var(--warn)]">
                {finding.severity}
              </span>
              <span className="text-xs text-[var(--muted)]">
                confidence {finding.confidence}%
              </span>
              <span className="text-xs uppercase tracking-wider text-[var(--muted)]">
                {finding.status}
              </span>
            </div>
            <h3 className="mt-2 text-base font-medium">{finding.title}</h3>
          </article>
        ))}
      </div>
    </section>
  );
}
