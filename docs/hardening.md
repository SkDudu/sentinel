# Sentinel — Hardening pós-MVP

Roadmap Fases 0–5 está **implementado em código**. Este doc é a fonte da verdade do que falta para o workbench ficar **sólido no uso diário**: verificar fluxo a fluxo, fechar buracos finos de UI/API e só então voltar a features novas.

Leia junto: [product.md](./product.md), [roadmap.md](./roadmap.md), [architecture.md](./architecture.md), [ai-rules.md](./ai-rules.md).

---

## Para o humano (como verificar)

Rodar o desktop (`pnpm --filter @sw/desktop dev` ou script do monorepo) contra API local/staging. Marcar cada fluxo só quando passar de ponta a ponta.

### Ordem obrigatória

| # | Fluxo | O que fazer | Resultado esperado | Gap conhecido |
| --- | --- | --- | --- | --- |
| 1 | **Projects** | Criar projeto → ambiente (baseUrl, auth, safety) → gravar secret no vault → selecionar projeto ativo | Projeto + env persistem após reload; `secretConfigured` true | ✅ Editar ambiente (nome, baseUrl, auth, safety, headers) na UI |
| 2 | **Endpoints** | Importar OpenAPI no dialog do ambiente (`examples/sample-openapi.json` ou contrato real) | Lista method/path no ambiente; reimport substitui o OpenAPI só daquele ambiente | ✅ Delete + detalhe mínimo no dialog; sem página Endpoints / CRUD manual/YAML |
| 3 | **Scans (determinístico)** | Escolher env + endpoints → vars JSON se precisar → Run | Run no histórico; findings novos no projeto | ✅ Cancel + status rodando/cancelado/falhou; `test_results` gravados; store órfão removido |
| 4 | **Findings** | Abrir lista → mudar status (OPEN → …) → refresh | Status persiste no SQLite | ✅ Evidência HTTP + filtros severity/status + export JSON/SARIF na UI |
| 5 | **AI Lab** | Settings AI (ou seed offline) → gerar casos → aprovar subset → run `aiOnly` | Só casos aprovados disparam; findings aparecem | ✅ Persona edit + casos/aprovações em `data/ai-cases/` |
| 6 | **CLI** | Mesmo DB `data/sentinel.db`: `sentinel scan --project … --format sarif` | Exit codes + relatório batem com findings da UI | ✅ Path absoluto logado; `--openapi` é efêmero; ZAP/plugins ainda só na CLI |

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
| ✅ Editar ambiente (nome, baseUrl, authType, safety, headers) | `ProjectsPage`, `api.updateEnvironment`, `PATCH /api/environments/:id` | UI de edição + `headers` no client/store/create |
| ✅ Findings com evidência + filtros básicos | `FindingsPage`, `FindingRepository` | Request/response na UI; filtro severity/status (client-side) |
| ✅ Endpoints: delete (+ detalhe mínimo) | `api-plugin`, `EndpointRepository`, `EnvironmentDetailDialog` | `DELETE /api/endpoints/:id` + detalhe no dialog do ambiente |
| ✅ Export findings na desktop | UI + `@sw/findings` | Export JSON/SARIF na FindingsPage (lista filtrada) |

### P1 — execução e histórico

| Item | Onde | Notas |
| --- | --- | --- |
| ✅ Scan cancel + feedback | `POST /api/scans`, orchestrator, UI | AbortSignal + `CANCELLED`; UI rodando/cancelando (ainda sync HTTP) |
| ✅ Persistir `test_results` | `packages/scan-runner`, schema | `TestResultRepository` + gravação em `runProjectScan` |
| ✅ Remover `useScanStore` | `apps/desktop/src/stores/scan.ts` | Store órfão removido (estado fica na ScansPage) |
| ✅ Persona edit completa | `PUT /api/projects/:id/personas/:personaId` | `api.updatePersona` + Editar na ScansPage |

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
| Endpoints | `.../environments/EnvironmentDetailDialog.tsx` | `/api/environments/:id/endpoints`, `.../openapi/import` | `@sw/api-parser`, `@sw/database` |
| Scans | detalhe do ambiente (`.../scan`, `.../lab`) via `ScanWorkspace` | `POST /api/scans`, `GET .../runs` | `@sw/scan-runner`, `@sw/security-engine`, `@sw/test-registry` |
| Findings | `.../findings/FindingsPage.tsx` | `GET .../findings`, `PATCH /api/findings/:id/status` | `@sw/database`, `@sw/findings` (CLI/export) |
| AI Lab | Scans + Settings | `/api/ai/*`, `/api/projects/:id/personas` | `@sw/ai-data-generator`, `@sw/ai` |
| Personas / Matriz | ambiente → Acesso (`EnvironmentAccessPanel`, `AccessMatrixSection`) | `/api/environments/:id/personas/*`, `.../access-rules` | `@sw/auth`, `@sw/test-registry` (`authorization.matrix`), `@sw/database` |
| Relacionamentos | ambiente → Relacionamentos (`EnvironmentRelationsPanel`) | `/api/environments/:id/relations` | `@sw/api-parser` (`inferRelations`), `@sw/database` |
| Fluxos | projeto → Fluxos (`pages/flows/*`) | `/api/projects/:id/flows`, `.../flows/skeletons`, `POST /api/scans` (`flowIds`) | `@sw/flows`, `@sw/scan-runner` |
| CLI | — | — | `apps/cli`, `@sw/scan-runner`, `@sw/findings` |

Client HTTP da UI: `apps/desktop/src/services/api.ts`.  
API local: `apps/desktop/server/api-plugin.ts`.

---

## Critério de “hardening pronto”

- Fluxos 1–5 da tabela humana passam sem workaround.  
- ✅ P0 fechado.  
- ✅ Scan cancelável + feedback rodando/terminou/falhou/cancelado.  
- ✅ Findings com evidência HTTP + filtros + export desktop.  
- ✅ CLI `--project` documentado no mesmo `data/sentinel.db` (log absoluto).  

Verificação humana dos fluxos 1–6 ainda é o gate final. P2/P3 só sob pedido.

Até lá: prioridade = este doc, não features novas fora da lista.
