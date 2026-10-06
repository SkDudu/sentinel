# Sentinel

**Workbench local de testes de segurança para APIs.**

Importe o OpenAPI, gere casos de teste (determinísticos + IA opcional), execute contra o seu ambiente e receba findings com severidade, confiança, evidência e recomendação.

Não é um scanner na nuvem. É uma ferramenta **pessoal**, com engine própria — desktop hoje, CLI/CI amanhã.

---

## Por que existe

Testar segurança de API costuma ser manual, inconsistente ou preso a ferramentas externas sem fluxo de produto. O Sentinel une o ciclo completo:

```
Projeto → Ambiente (OpenAPI) → Casos de teste → Execução → Findings
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
| 0 Fundação | ✅ |
| 1 MVP usável | ✅ |
| 2 AI Test Lab | ✅ |
| 3 Authz / rate-limit / HTTP | ✅ |
| 4 Tauri + keychain + ZAP + plugins | ✅ (build Tauri precisa Rust) |
| 5 CLI / CI / SARIF | ✅ |

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
| External scanner | OWASP ZAP (`ZapExecutor`, opcional) |

Requisitos: **Node ≥ 22.5** (SQLite nativo) e **pnpm**. Tauri opcional: **Rust** + `pnpm tauri:dev`.

---

## Quick start

```bash
pnpm install
pnpm build
pnpm dev:desktop
```

A UI sobe em `http://localhost:1420`.

### CLI

```bash
pnpm --filter @sw/cli build

# OpenAPI ad-hoc
pnpm --filter @sw/cli exec node ./dist/index.js scan \
  --openapi examples/sample-openapi.json \
  --base-url http://localhost:3000 \
  --format sarif --output report.sarif

# Projeto persistido (SQLite do desktop)
pnpm --filter @sw/cli exec node ./dist/index.js scan \
  --project <uuid> --environment <uuid> --db ./data/sentinel.db
```

Exit codes: `0` gate ok · `1` erro · `2` gate falhou (critical/high).  
Plugins: `--plugins examples/plugins` · ZAP: `--executor zap --zap-url http://127.0.0.1:8080`.

---

## Estrutura

```
sentinel/
├── apps/
│   ├── desktop/     # Workbench (Projects, Ambientes, AI Test Lab, Findings)
│   └── cli/         # Scan headless
├── packages/
│   ├── core/              # Tipos e schemas Zod
│   ├── database/          # Schema Drizzle / SQLite
│   ├── api-parser/        # OpenAPI → modelo interno + semântica
│   ├── auth/              # Auth headers + secret store
│   ├── http-client/       # RequestExecutor + ZapExecutor
│   ├── test-registry/     # Plugins de teste + loader externo
│   ├── security-engine/   # Orchestrator + custom scanners
│   ├── scan-runner/       # runProjectScan compartilhado (UI/CLI)
│   ├── findings/          # Summary, gate, JSON/SARIF
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

## MVP (fluxo atual)

1. Crie um projeto e ambiente em **Projects**  
2. Abra um ambiente e importe `openapi.json` no dialog (ex.: `examples/sample-openapi.json`)  
3. Rode o scan em **Scans** (Bearer opcional só da execução)  
4. Revise e atualize status em **Findings**

AI Lab em **Scans**; secrets no vault (keychain no shell Tauri). Ver [roadmap](./docs/roadmap.md).

---

## Licença / uso

Projeto em desenvolvimento ativo. Use apenas contra APIs que você tem autorização para testar (local / staging / próprias).
