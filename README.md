# Sentinel

[![CI](https://github.com/SkDudu/sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/SkDudu/sentinel/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**Local-first API security testing workbench.**

Import an OpenAPI spec, generate test cases (deterministic + optional AI), run them against your own environment and get findings with severity, confidence, evidence and a recommendation.

Not a cloud scanner. Sentinel runs on your machine with its own engine — desktop app today, CLI/CI too.

🇧🇷 [Leia em português](./README.pt-BR.md)

> [!WARNING]
> Only test APIs you own or are explicitly authorized to test (local, staging, your own services). Aggressive tests are gated behind **Production Safety Mode**. You are responsible for how you use this tool.

---

## Why

API security testing is usually manual, inconsistent, or locked into external tools with no product flow. Sentinel covers the whole loop:

```
Project → Environment (OpenAPI) → Test cases → Run → Findings
```

| Instead of… | Sentinel does… |
| --- | --- |
| Generic fuzzing | Understands the schema and field semantics (`email`, `cpf`, `role`…) |
| A UI on top of ZAP | Own engine; external adapters are optional |
| AI firing requests on its own | AI generates cases → you review → the engine runs them |
| Findings without context | Standard finding (severity + confidence + evidence) |

---

## Principles

1. **Local by default** — cloud AI is optional
2. **Engine ≠ UI** — the same core powers desktop, CLI and CI
3. **Deterministic first** — null, missing field, wrong type don't spend tokens
4. **AI as an amplifier** — generates data / interprets findings; never drives the scanner
5. **Review before burst** — AI cases go through human selection
6. **Secrets in the keychain** — never plaintext in SQLite
7. **Test plugins** — a new test is a registry plugin, no executor rewrite

---

## Stack

| Layer | Technology |
| --- | --- |
| Desktop | React + TypeScript + Tailwind (Vite) → Tauri |
| Monorepo | pnpm workspaces |
| Validation | Zod |
| Database | SQLite + Drizzle |
| HTTP | `fetch` via `RequestExecutor` |
| AI (optional) | Ollama / LM Studio / OpenAI-compatible |
| External scanner | OWASP ZAP (`ZapExecutor`, optional) |

---

## Getting started

Requirements: **Node ≥ 22.5** (native SQLite) and **pnpm 10**. Optional: **Rust** for the Tauri desktop shell.

```bash
git clone https://github.com/SkDudu/sentinel.git
cd sentinel
pnpm install
pnpm build
pnpm dev:desktop
```

The UI runs at `http://localhost:1420`. Tauri shell: `pnpm tauri:dev`.

Optional AI config: copy `.env.example` to `.env` (defaults point to a local Ollama).

### First scan

1. Create a project and an environment in **Projects**
2. Open the environment and import an `openapi.json` (try `examples/sample-openapi.json`)
3. Run the scan in **Scans** (optional per-run Bearer token)
4. Review and triage in **Findings**

### CLI

```bash
pnpm --filter @sw/cli build

# Ad-hoc OpenAPI
pnpm --filter @sw/cli exec node ./dist/index.js scan \
  --openapi examples/sample-openapi.json \
  --base-url http://localhost:3000 \
  --format sarif --output report.sarif

# Persisted project (desktop SQLite)
pnpm --filter @sw/cli exec node ./dist/index.js scan \
  --project <uuid> --environment <uuid> --db ./data/sentinel.db
```

Exit codes: `0` gate passed · `1` error · `2` gate failed (critical/high).
Plugins: `--plugins examples/plugins` · ZAP: `--executor zap --zap-url http://127.0.0.1:8080`.
CI example: [`.github/workflows/sentinel-scan.example.yml`](./.github/workflows/sentinel-scan.example.yml).

---

## Project layout

```
sentinel/
├── apps/
│   ├── desktop/           # Workbench (Projects, Environments, Findings)
│   └── cli/               # Headless scan
├── packages/
│   ├── core/              # Types and Zod schemas
│   ├── database/          # Drizzle / SQLite schema
│   ├── api-parser/        # OpenAPI → internal model + semantics
│   ├── auth/              # Auth headers + secret store
│   ├── login-recorder/    # Interactive login → session recipe
│   ├── http-client/       # RequestExecutor + ZapExecutor
│   ├── test-registry/     # Test plugins + external loader
│   ├── security-engine/   # Orchestrator + custom scanners
│   ├── scan-runner/       # Shared runProjectScan (UI/CLI)
│   ├── findings/          # Summary, gate, JSON/SARIF
│   ├── ai/                # LLM client + interpretation
│   └── ai-data-generator/ # Deterministic cases, personas and AI
├── examples/              # Sample OpenAPI + sample plugin
└── docs/                  # Product, roadmap, architecture, stack, AI rules
```

Internal packages use the `@sw/*` prefix. The product name is **Sentinel**.

---

## Contributing

Issues and PRs are welcome.

```bash
pnpm build          # build packages
pnpm typecheck      # TypeScript across the monorepo
pnpm dev:desktop    # UI
pnpm dev:cli        # CLI via tsx
```

- New security tests go into `@sw/test-registry` as plugins — not into the HTTP executor.
- Scan/parser/findings logic lives in `packages/`, not in the UI.
- Read [`docs/`](./docs/README.md) before changing architecture or scope (docs are in Portuguese).
- Never commit secrets, local databases (`data/`) or `node_modules`.

Found a vulnerability in Sentinel itself? Please open a [private security advisory](https://github.com/SkDudu/sentinel/security/advisories/new) instead of a public issue.

---

## License

[MIT](./LICENSE) © Eduardo Santos
