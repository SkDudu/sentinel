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
| OpenAPI | parser próprio (`@sw/api-parser`) + YAML | Controle do modelo interno |
| Login gravado | **Playwright** (`playwright-core`, Chrome instalado) | Grava o login; o scan repete a receita via fetch |
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
| Tauri | `pnpm tauri:build` gera `.app`/`.dmg` (precisa Rust); API roda em sidecar Node |
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

## Tauri (build nativo)

```bash
pnpm build
pnpm tauri:build   # .app + .dmg em apps/desktop/src-tauri/target/release/bundle
```

A UI existente em Vite continua; Tauri só empacota e expõe APIs nativas (FS, keychain, SQL).

- **Dev (`tauri dev`)**: `/api` vem do plugin do Vite, como no browser.
- **App empacotado**: a mesma API (`server/api-plugin.ts`) roda via `server/standalone.ts` num **sidecar Node** (binário `node` do host copiado por `scripts/build-sidecar.mjs`). Escuta só em `127.0.0.1`, porta aleatória, com bearer token gerado por execução; o Rust repassa porta/token à UI (`api_info`).
- Dados do app empacotado em `app_data_dir` (macOS: `~/Library/Application Support/dev.sentinel.desktop/`), via `SENTINEL_DATA_DIR`.
- `.dmg` em ambiente sem GUI: `CI=true pnpm tauri:build` (pula o AppleScript do Finder).
- Ícones: fonte em `src-tauri/icons/app-icon.svg` → `pnpm --filter @sw/desktop tauri icon src-tauri/icons/app-icon.svg`.
