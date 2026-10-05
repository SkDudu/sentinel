# Sentinel — Hardening pós-MVP

Roadmap Fases 0–5 está **implementado em código**. Este doc é a fonte da verdade do que falta para o workbench ficar **sólido no uso diário**: verificar fluxo a fluxo, fechar buracos finos de UI/API e só então voltar a features novas.

Leia junto: [product.md](./product.md), [roadmap.md](./roadmap.md), [architecture.md](./architecture.md), [ai-rules.md](./ai-rules.md).

---

## Para o humano (como verificar)

Rodar o desktop (`pnpm --filter @sw/desktop dev` ou script do monorepo) contra API local/staging. Marcar cada fluxo só quando passar de ponta a ponta.

### Ordem obrigatória

| # | Fluxo | O que fazer | Resultado esperado | Gap conhecido |
| --- | --- | --- | --- | --- |
| 1 | **Projects** | Criar projeto → ambiente (baseUrl, auth, safety) → gravar secret no vault → selecionar projeto ativo | Projeto + env persistem após reload; `secretConfigured` true | Editar ambiente/headers/auth **depois** de criar é fraco ou ausente na UI |
| 2 | **Endpoints** | Importar OpenAPI (`examples/sample-openapi.json` ou contrato real) | Lista de endpoints com method/path; reimport substitui source OpenAPI | Sem CRUD manual, delete, YAML, detalhe de schema |
| 3 | **Scans (determinístico)** | Escolher env + endpoints → vars JSON se precisar → Run | Run no histórico; findings novos no projeto | Scan **síncrono**; sem progress/cancel; store `scan.ts` pouco usado |
| 4 | **Findings** | Abrir lista → mudar status (OPEN → …) → refresh | Status persiste no SQLite | Evidência HTTP (request/response) no DB mas **não na UI**; sem filtro/export |
| 5 | **AI Lab** | Settings AI (ou seed offline) → gerar casos → aprovar subset → run `aiOnly` | Só casos aprovados disparam; findings aparecem | Persona edit limitada; casos aprovados não persistem entre sessões |
| 6 | **CLI** | Mesmo DB `data/sentinel.db`: `sentinel scan --project … --format sarif` | Exit codes + relatório batem com findings da UI | ZAP/plugins custom mais ricos na CLI que no desktop |

### Checklist rápido por bug

Ao achar problema, anotar:

1. Fluxo (# da tabela)  
2. Passos exatos  
3. Esperado vs obtido  
4. API (`/api/...`) ou só UI?  
5. Repro com sample OpenAPI? sim/não  

---

## Para agentes de código (o que falta)

**Não abrir Fase nova de produto** sem pedido explícito. Prioridade = hardening abaixo, na ordem.

### P0 — workbench usável

| Item | Onde | Notas |
| --- | --- | --- |
| Editar ambiente (nome, baseUrl, authType, safety, headers) | `ProjectsPage`, `api.updateEnvironment`, `PATCH /api/environments/:id` | Repo + rota já existem; UI e client incompletos (`headers`) |
| Findings com evidência + filtros básicos | `FindingsPage`, `FindingRepository` | Mostrar request/response já persistidos; filtro por severity/status |
| Endpoints: delete (+ detalhe mínimo) | `api-plugin`, `EndpointRepository`, `EndpointsPage` | `delete` no repo sem rota HTTP |
| Export findings na desktop | UI + `@sw/findings` | CLI já tem JSON/SARIF |

### P1 — execução e histórico

| Item | Onde | Notas |
| --- | --- | --- |
| Scan async + cancel | `POST /api/scans`, orchestrator, UI | Enum `ScanStatus.CANCELLED` existe; ninguém usa |
| Persistir `test_results` | `packages/scan-runner`, schema | Tabela no schema; `runProjectScan` não grava |
| Integrar ou remover `useScanStore` | `apps/desktop/src/stores/scan.ts` | Store órfão hoje |
| Persona edit completa | `PUT /api/projects/:id/personas/:personaId` | Server ok; client/UI fracos |

### P2 — modelo de dados “morto”

Schema em `packages/database` tem entidades sem repo/API/UI. Só implementar se o fluxo humano pedir:

- `test_suites` — suites como entidade de produto  
- `variables` — vars de projeto (hoje só no body do scan)  
- Uso pleno de `test_results` além do P1  

### P3 — adiar

- Plugins categoria **injection** (categoria no core, zero teste no registry)  
- ZAP no desktop (adapter existe; CLI usa; desktop não)  
- Keychain SO obrigatório (vault arquivo ok; Tauri keychain = fallback path)  
- SaaS, WAF, scanner web completo — fora de escopo ([product.md](./product.md))

### Regras de mudança neste modo

1. Diff mínimo; um fluxo por PR/commit quando possível.  
2. Engine continua em `packages/`; UI só orquestra.  
3. Novos testes de segurança = plugin em `@sw/test-registry`.  
4. Não marcar item do roadmap antigo como “refazer” — isto é **polimento**, não rewrite.  
5. Ao fechar um gap P0/P1, atualizar a tabela deste arquivo (status ✅) e, se mudar arquitetura de verdade, [architecture.md](./architecture.md).

---

## Mapa rápido código ↔ fluxo

| Fluxo | UI | API (Vite plugin) | Packages |
| --- | --- | --- | --- |
| Projects | `apps/desktop/src/pages/projects/ProjectsPage.tsx` | `/api/projects`, `/api/environments`, `.../secret` | `@sw/database`, `@sw/auth` |
| Endpoints | `.../endpoints/EndpointsPage.tsx` | `/api/projects/:id/endpoints`, `.../openapi/import` | `@sw/api-parser`, `@sw/database` |
| Scans | `.../scans/ScansPage.tsx` | `POST /api/scans`, `GET .../runs` | `@sw/scan-runner`, `@sw/security-engine`, `@sw/test-registry` |
| Findings | `.../findings/FindingsPage.tsx` | `GET .../findings`, `PATCH /api/findings/:id/status` | `@sw/database`, `@sw/findings` (CLI/export) |
| AI Lab | Scans + Settings | `/api/ai/*`, `/api/projects/:id/personas` | `@sw/ai-data-generator`, `@sw/ai` |
| CLI | — | — | `apps/cli`, `@sw/scan-runner`, `@sw/findings` |

Client HTTP da UI: `apps/desktop/src/services/api.ts`.  
API local: `apps/desktop/server/api-plugin.ts`.

---

## Critério de “hardening pronto”

- Fluxos 1–5 da tabela humana passam sem workaround.  
- P0 fechado.  
- Scan cancelável ou, no mínimo, feedback claro de “rodando / terminou / falhou”.  
- Findings mostram evidência suficiente para agir sem abrir o DB.  
- Export desktop ou caminho documentado “use a CLI” aceito explicitamente no produto.

Até lá: prioridade = este doc, não features novas fora da lista.
