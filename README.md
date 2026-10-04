# Sentinel

**Workbench local de testes de segurança para APIs.**

Importe o OpenAPI, gere casos de teste (determinísticos + IA opcional), execute contra o seu ambiente e receba findings com severidade, confiança, evidência e recomendação.

Não é um scanner na nuvem. É uma ferramenta **pessoal**, com engine própria — desktop hoje, CLI/CI amanhã.

---

## Por que existe

Testar segurança de API costuma ser manual, inconsistente ou preso a ferramentas externas sem fluxo de produto. O Sentinel une o ciclo completo:

```
Projeto → Endpoints (OpenAPI) → Casos de teste → Execução → Findings
```

| Em vez de… | Sentinel faz… |
| --- | --- |
| Fuzz genérico | Entende o schema e a semântica dos campos (`email`, `cpf`, `role`…) |
| Só UI em cima do ZAP | Engine própria; adapters externos são opcionais |
| IA disparando requests sozinha | IA gera casos → você revisa → engine executa |
| Achados sem contexto | Finding padronizado (severity + confidence + evidence) |

---

## Princípios

1. **Local por padrão** — cloud AI é opcional  
2. **Engine ≠ UI** — o mesmo cérebro serve desktop, CLI e CI  
3. **Determinístico primeiro** — null, missing, tipo errado não gastam token  
4. **IA como amplificador** — gera dados / interpreta findings; não roda o scanner  
5. **Review antes do burst** — casos de IA passam por seleção humana  
6. **Secrets no keychain** — nunca plaintext no SQLite  
7. **Plugins de teste** — novo teste = registry, sem reescrever o executor  

---

## Status atual

| Fase | Estado |
| --- | --- |
| Fundação (monorepo, engine, docs) | Feito |
| MVP usável (SQLite + UI wired + scan real) | Em andamento |
| AI Test Lab completo | Próximo |
| Authz, rate limit, Tauri, CI | Depois |

Detalhes em [`docs/roadmap.md`](./docs/roadmap.md).

---

## Stack

| Camada | Tecnologia |
| --- | --- |
| Desktop | React + TypeScript + Tailwind (Vite) → Tauri |
| Monorepo | pnpm workspaces |
| Validação | Zod |
| Banco | SQLite + Drizzle |
| HTTP | `fetch` via `RequestExecutor` |
| AI (opcional) | Ollama / LM Studio / OpenAI-compatible |
| External scanner | OWASP ZAP (futuro, adapter) |

Requisitos: **Node ≥ 20** e **pnpm**.

---

## Quick start

```bash
pnpm install
pnpm build
pnpm dev:desktop
```

A UI sobe em `http://localhost:1420`.

### CLI (scan via OpenAPI)

```bash
pnpm --filter @sw/cli dev scan \
  --openapi examples/sample-openapi.json \
  --base-url http://localhost:3000
```

Opções úteis: `--path /users` para filtrar um endpoint.

---

## Estrutura

```
sentinel/
├── apps/
│   ├── desktop/     # Workbench (Projects, Endpoints, AI Test Lab, Findings)
│   └── cli/         # Scan headless
├── packages/
│   ├── core/              # Tipos e schemas Zod
│   ├── database/          # Schema Drizzle / SQLite
│   ├── api-parser/        # OpenAPI → modelo interno + semântica
│   ├── auth/              # Auth headers + secret store
│   ├── http-client/       # RequestExecutor (HTTP; ZAP depois)
│   ├── test-registry/     # Plugins de teste
│   ├── security-engine/   # Orchestrator
│   ├── findings/          # Summary + CI gate
│   ├── ai/                # Client LLM + interpretação
│   └── ai-data-generator/ # Casos determinísticos, personas e IA
└── docs/                  # Produto, roadmap, arquitetura, stack, regras de IA
```

Pacotes internos usam o prefixo `@sw/*`. Na UI e na documentação o produto é **Sentinel**.

---

## Documentação

| Doc | Conteúdo |
| --- | --- |
| [Produto](./docs/product.md) | Visão, princípios, MVP |
| [Roadmap](./docs/roadmap.md) | Fases e prioridades |
| [Arquitetura](./docs/architecture.md) | Componentes, fluxos, contratos |
| [Tecnologias](./docs/technologies.md) | Stack e decisões |
| [Regras para IA](./docs/ai-rules.md) | Guardrails para agentes e IA de produto |

---

## Desenvolvimento

```bash
pnpm build          # compila packages
pnpm typecheck      # TypeScript em todo o monorepo
pnpm dev:desktop    # UI
pnpm dev:cli        # CLI em modo tsx
```

Novos testes de segurança entram em `@sw/test-registry` como plugins — não no executor HTTP.

---

## Licença / uso

Projeto em desenvolvimento ativo. Use apenas contra APIs que você tem autorização para testar (local / staging / próprias).
