# Sentinel — Tecnologias

## Stack escolhida

| Camada | Tecnologia | Por quê |
| --- | --- | --- |
| Desktop shell | **Tauri** (após Vite UI) | App local leve vs Electron |
| UI | **React + TypeScript** | Produtividade e tipagem |
| Styling | **Tailwind + shadcn/ui** | UI rápida e consistente |
| Monorepo | **pnpm workspaces** | Packages compartilhados |
| Core language | **TypeScript** | Um idioma engine + UI + CLI |
| Validação | **Zod** | Schemas runtime + tipos |
| HTTP | **fetch** (Node 20+ / undici) | Simples; HttpExecutor abstraído |
| DB | **SQLite** | Local, zero ops |
| ORM | **Drizzle** | Leve, SQL-friendly |
| OpenAPI | parser próprio (`@sw/api-parser`) | Controle do modelo interno |
| Security engine | próprio | Independente de ZAP |
| AI local | **Ollama / LM Studio** | Sem cloud obrigatória |
| AI cloud | OpenAI-compatible (opcional) | Fallback |
| External scanner | OWASP ZAP (opcional) | Adapter, não núcleo |
| Packaging | Tauri | Distribuir `.app` / instalador |

## Versões / ambiente

- Node **≥ 22.5** (usa `node:sqlite`)
- Package manager: **pnpm**
- TypeScript **5.x**
- React **19** no desktop scaffold

## O que está no repo hoje

| Peça | Estado |
| --- | --- |
| Packages core/engine/parser/ai-data | Scaffold funcional (build OK) |
| Desktop Vite/React/Tailwind | UI + AI Test Lab + scans |
| CLI | `sentinel scan` (OpenAPI ou `--project`) + JSON/SARIF |
| Tauri | Scaffold em `apps/desktop/src-tauri` (build nativo precisa Rust) |
| shadcn/ui | Planejado; UI atual é Tailwind direto |
| SQLite runtime | Drizzle ORM no runtime via `sqlite-proxy` + `node:sqlite` (sem native addon); arquivo em `data/sentinel.db` |
| Secrets | Vault AES-256-GCM + `KeychainSecretStore` (Tauri/keyring) |
| ZAP | `ZapExecutor` opcional (`--executor zap`) |
| Plugins | `--plugins <dir>` carrega `SecurityTest` custom |

## Decisões conscientes

1. **Não PostgreSQL** no início — app local pessoal.
2. **Não Electron** — Tauri quando for empacotar.
3. **Não acoplar ZAP** — `RequestExecutor` permite adapter depois.
4. **IA opcional** — MVP roda 100% determinístico.
5. **Prefixo npm `@sw/*`** — técnico; produto chama-se Sentinel.

## Comandos úteis

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm dev:desktop
pnpm --filter @sw/cli dev scan --openapi examples/sample-openapi.json --base-url http://localhost:3000
```

## Dependências a evitar (por padrão)

- Frameworks backend pesados só para UI local
- ORMs/cloud DB “porque sim”
- SDKs de AI que forcem um único vendor
- Copiar Chromium (Electron) sem necessidade real
- Bibliotecas de exploit ofensivo embutidas como feature default

## Evolução Tauri

Quando `rustc` estiver disponível:

```bash
cd apps/desktop
pnpm dlx @tauri-apps/cli@latest init
```

A UI existente em Vite continua; Tauri só empacota e expõe APIs nativas (FS, keychain, SQL).
