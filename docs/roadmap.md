# Sentinel — Roadmap

Ordem intencional: valor cedo, risco baixo, sem depender de IA ou ZAP no caminho crítico.

## Fase 0 — Fundação ✅

- [x] Monorepo pnpm (`apps/` + `packages/`)
- [x] Tipos e schemas (`@sw/core`)
- [x] Schema SQLite/Drizzle
- [x] OpenAPI parser + schema analyzer
- [x] Test registry + testes de validação
- [x] Security engine (orchestrator)
- [x] AI data generator (determinístico + personas + hook IA)
- [x] CLI scaffold + desktop scaffold
- [x] Docs de produto / arquitetura / regras

## Fase 1 — MVP usável (agora)

Objetivo: **projeto → OpenAPI → casos → run → findings** sem IA obrigatória.

- [x] Persistência SQLite real (desktop via API local / `node:sqlite`)
- [x] CRUD de projetos e ambientes
- [x] Import de `openapi.json` na UI
- [x] Ligar orchestrator ao desktop
- [x] Histórico básico de scans
- [x] Findings com status (OPEN, etc.)
- [x] Auth Bearer/API Key com store seguro (vault AES-256-GCM em `data/`)
  - Override efêmero por scan ainda disponível
  - Keychain nativo do SO → Fase 4 (Tauri)

**Critério de pronto:** rodar um scan local contra uma API de staging/dev e ver findings na UI.

## Fase 2 — AI Test Lab ✅

- [x] Geração IA de casos semânticos (Ollama primeiro; seed de personas offline)
- [x] Personas de teste editáveis (por projeto)
- [x] Review gate obrigatório para casos AI
- [x] Safety filter reforçado (`@sw/ai-data-generator`)
- [x] Interpretação pós-scan de findings (opcional, Settings → AI)

**Critério de pronto:** gerar N casos AI, revisar, executar só os aprovados.

## Fase 3 — Segurança além de validação ✅

- [x] Authentication suite (missing/invalid/expired token)
- [x] Authorization (IDOR / privilege — com fixtures controladas)
- [x] Rate limit module + Production Safety Mode
- [x] HTTP (CORS, methods, headers)
- [x] Test context / variáveis `{{token}}`, `{{userId}}` entre steps

## Fase 4 — Desktop nativo + adapters

- [ ] Empacotar com Tauri
- [ ] Keychain nativo do SO
- [ ] Adapter OWASP ZAP (opcional)
- [ ] Custom scanners pluggable

## Fase 5 — CLI / CI

- [ ] `sentinel scan --project …` (binário estável)
- [ ] Exit codes para gate (critical/high)
- [ ] Exemplo GitHub Actions
- [ ] Relatório JSON/SARIF (se fizer sentido)

## Não-objetivos (por enquanto)

- SaaS multi-tenant na nuvem
- Substituir um WAF
- Scanner de superfície web completa (foco em **API**)
- IA executando requests sem review
- Armazenar secrets em plaintext no banco

## Prioridade de decisão

Quando houver dúvida de escopo:

1. Serve o MVP da Fase 1?  
2. Mantém engine desacoplada da UI?  
3. Evita dependência obrigatória de cloud/ZAP/IA?  

Se a resposta for não em qualquer um, adiar.
