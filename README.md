# Sentinel

Workbench local de testes de segurança para APIs. Engine independente da UI — desktop hoje, CLI/CI amanhã.

Documentação completa em [`docs/`](./docs/README.md):

- [Produto](./docs/product.md)
- [Roadmap](./docs/roadmap.md)
- [Arquitetura](./docs/architecture.md)
- [Tecnologias](./docs/technologies.md)
- [Regras para IA](./docs/ai-rules.md)

## Stack (resumo)

| Camada | Tecnologia |
| --- | --- |
| Desktop UI | React + TypeScript + Tailwind (Vite) → Tauri depois |
| Core | TypeScript monorepo (pnpm) |
| HTTP | `fetch` via `RequestExecutor` |
| DB | SQLite + Drizzle |
| AI | Opcional — Ollama / LM Studio / OpenAI-compatible |
| AI Test Data | `@sw/ai-data-generator` |

## Monorepo

```
apps/
  desktop/          # UI (AI Test Lab, projects, findings)
  cli/              # scan headless
packages/
  core/ database/ api-parser/ auth/ http-client/
  test-registry/ security-engine/ findings/
  ai/ ai-data-generator/
docs/               # produto, roadmap, arquitetura, stack, regras IA
```

## Setup

```bash
pnpm install
pnpm build
pnpm dev:desktop
```

CLI:

```bash
pnpm --filter @sw/cli dev scan --openapi examples/sample-openapi.json --base-url http://localhost:3000
```

## MVP

Projeto → importar OpenAPI → casos de validação → executar → findings.  
IA e ZAP entram depois; ver [roadmap](./docs/roadmap.md).
