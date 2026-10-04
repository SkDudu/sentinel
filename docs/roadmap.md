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
- [ ] Import de `openapi.json` na UI
- [ ] Ligar orchestrator ao desktop
- [ ] Histórico básico de scans
- [ ] Findings com status (OPEN, etc.)
- [ ] Auth Bearer/API Key com secret no keychain (ou store seguro)

**Critério de pronto:** rodar um scan local contra uma API de staging/dev e ver findings na UI.

## Fase 2 — AI Test Lab

- [ ] Geração IA de casos semânticos (Ollama primeiro)
- [ ] Personas de teste editáveis
- [ ] Review gate obrigatório para casos AI
- [ ] Safety filter reforçado
- [ ] Interpretação pós-scan de findings (opcional)

**Critério de pronto:** gerar N casos AI, revisar, executar só os aprovados.

## Fase 3 — Segurança além de validação

- [ ] Authentication suite (missing/invalid/expired token)
- [ ] Authorization (IDOR / privilege — com fixtures controladas)
- [ ] Rate limit module + Production Safety Mode
- [ ] HTTP (CORS, methods, headers)
- [ ] Test context / variáveis `{{token}}`, `{{userId}}` entre steps

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
