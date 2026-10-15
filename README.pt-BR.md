# Sentinel

[![CI](https://github.com/SkDudu/sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/SkDudu/sentinel/actions/workflows/ci.yml)
[![Desktop release](https://github.com/SkDudu/sentinel/actions/workflows/desktop-release.yml/badge.svg)](https://github.com/SkDudu/sentinel/actions/workflows/desktop-release.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**Workbench local de testes de segurança para APIs.**

Importe o OpenAPI, gere casos de teste (determinísticos + IA opcional), execute contra o seu ambiente e receba findings com severidade, confiança, evidência e recomendação.

Não é um scanner na nuvem. O Sentinel roda na sua máquina, com engine própria — desktop hoje, CLI/CI também.

🇺🇸 [Read in English](./README.md)

> [!WARNING]
> Teste apenas APIs que são suas ou que você tem autorização explícita para testar (local, staging, serviços próprios). Testes agressivos ficam atrás do **Production Safety Mode**. O uso da ferramenta é de sua responsabilidade.

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

---

## Download

Apps desktop prontos ficam na página de [**Releases**](https://github.com/SkDudu/sentinel/releases).

| Plataforma | Arquivo |
| --- | --- |
| 🍎 macOS (Apple Silicon) | `Sentinel_<versão>_aarch64.dmg` |
| 🪟 Windows (x64) | `Sentinel_<versão>_x64-setup.exe` ou `.msi` |

> [!NOTE]
> Os builds ainda não são assinados. macOS: rode `xattr -cr /Applications/Sentinel.app` depois de instalar. Windows: SmartScreen → *Mais informações* → *Executar mesmo assim*. Detalhes em [`docs/release.md`](./docs/release.md).

---

## Como rodar

Requisitos: **Node ≥ 22.5** (SQLite nativo) e **pnpm 10**. Opcional: **Rust** para o shell Tauri.

```bash
git clone https://github.com/SkDudu/sentinel.git
cd sentinel
pnpm install
pnpm build
pnpm dev:desktop
```

A UI sobe em `http://localhost:1420`. Shell Tauri: `pnpm tauri:dev`. App nativo (`.app` / `.dmg`): `pnpm tauri:build`.

IA opcional: copie `.env.example` para `.env` (o padrão aponta para um Ollama local).

### Primeiro scan

1. Crie um projeto e ambiente em **Projects**
2. Abra o ambiente e importe um `openapi.json` (ex.: `examples/sample-openapi.json`)
3. Rode o scan em **Scans** (Bearer opcional só da execução)
4. Revise e atualize status em **Findings**

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
Exemplo de CI: [`.github/workflows/sentinel-scan.example.yml`](./.github/workflows/sentinel-scan.example.yml).

---

## Estrutura

```
sentinel/
├── apps/
│   ├── desktop/           # Workbench (Projects, Ambientes, Findings)
│   └── cli/               # Scan headless
├── packages/
│   ├── core/              # Tipos e schemas Zod
│   ├── database/          # Schema Drizzle / SQLite
│   ├── api-parser/        # OpenAPI → modelo interno + semântica
│   ├── auth/              # Auth headers + secret store
│   ├── login-recorder/    # Login interativo → receita de sessão
│   ├── http-client/       # RequestExecutor + ZapExecutor
│   ├── test-registry/     # Plugins de teste + loader externo
│   ├── security-engine/   # Orchestrator + custom scanners
│   ├── scan-runner/       # runProjectScan compartilhado (UI/CLI)
│   ├── findings/          # Summary, gate, JSON/SARIF
│   ├── ai/                # Client LLM + interpretação
│   └── ai-data-generator/ # Casos determinísticos, personas e IA
├── examples/              # OpenAPI de exemplo + plugin de exemplo
└── docs/                  # Produto, roadmap, arquitetura, stack, regras de IA
```

Pacotes internos usam o prefixo `@sw/*`. Na UI e na documentação o produto é **Sentinel**.

---

## Contribuindo

Issues e PRs são bem-vindos.

```bash
pnpm build          # compila packages
pnpm typecheck      # TypeScript em todo o monorepo
pnpm dev:desktop    # UI
pnpm dev:cli        # CLI em modo tsx
```

- Novos testes de segurança entram em `@sw/test-registry` como plugins — não no executor HTTP.
- Lógica de scan/parser/findings fica em `packages/`, não na UI.
- Leia [`docs/`](./docs/README.md) antes de mudar arquitetura ou escopo.
- Nunca commite secrets, bancos locais (`data/`) ou `node_modules`.

Achou uma vulnerabilidade no próprio Sentinel? Abra um [security advisory privado](https://github.com/SkDudu/sentinel/security/advisories/new) em vez de uma issue pública.

---

## Licença

[MIT](./LICENSE) © Eduardo Santos
