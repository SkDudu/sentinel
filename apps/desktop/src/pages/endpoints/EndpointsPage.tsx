export function EndpointsPage() {
  return (
    <section className="max-w-4xl">
      <header className="mb-8">
        <h2 className="text-3xl font-semibold tracking-tight">Endpoints</h2>
        <p className="mt-2 text-[var(--muted)]">
          Importar OpenAPI, cadastrar manualmente ou trazer requests — a API
          Intelligence transforma isso em schema interno.
        </p>
      </header>

      <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel)] px-6 py-10 text-center">
        <p className="text-sm text-[var(--muted)]">
          Próximo passo: drop de <code className="text-[var(--accent)]">openapi.json</code>{" "}
          → lista de operações com parâmetros e semântica (email, cpf, role…).
        </p>
      </div>
    </section>
  );
}
