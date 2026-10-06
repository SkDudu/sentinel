# Sentinel — Arquitetura

## Visão geral

```
┌─────────────────────────────────────────────────────────────┐
│                         SENTINEL                            │
│                      Aplicação local                        │
│                                                             │
│  ┌──────────────────────┐       ┌────────────────────────┐  │
│  │       FRONTEND       │       │      TEST ENGINE        │  │
│  │  Projects / Endpoints│◄─────►│  Orchestrator           │  │
│  │  Suites / Findings   │       │  Registry / Payloads    │  │
│  │  AI Test Lab         │       │  Executor / Analyzer    │  │
│  └──────────┬───────────┘       └────────────┬────────────┘  │
│             ▼                                ▼               │
│       Local DB (SQLite)              Security Tools (opt.)  │
│                                      ZAP / Nuclei / custom  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                        SUA API / STAGING
```

## Seis partes

| # | Parte | Responsabilidade |
| --- | --- | --- |
| 1 | Desktop/UI | Experiência (React). Sem lógica de scanner. |
| 2 | Project Manager | Projetos, ambientes, configs |
| 3 | API Intelligence | OpenAPI, endpoints manuais, auth, exemplos |
| 4 | Security Engine | Cérebro: orquestra testes |
| 5 | Execution Layer | Envia requests (HTTP, depois ZAP…) |
| 6 | Findings Engine | Interpreta resultados → vulnerabilidades/avisos |

## Packages (monorepo)

```
sentinel/
├── apps/
│   ├── desktop/          # UI Vite/React (→ Tauri)
│   └── cli/              # scan headless
└── packages/
    ├── core/             # tipos, enums, Zod
    ├── database/         # Drizzle schema
    ├── api-parser/       # OpenAPI + semantics
    ├── auth/             # auth headers + secret store
    ├── http-client/      # RequestExecutor
    ├── test-registry/    # plugins SecurityTest
    ├── security-engine/  # TestOrchestrator
    ├── findings/         # summary + CI gate
    ├── ai/               # client LLM + interpret findings
    └── ai-data-generator/# casos det. + AI + personas
```

Regra: **UI e CLI dependem dos packages; packages não dependem de apps.**

## Fluxo de um scan

```
OpenAPI / Endpoint
        │
        ▼
 Schema Analyzer
        │
 ┌──────┴──────┐
 ▼             ▼
Deterministic  AI Generator (opcional)
        │             │
        └──────┬──────┘
               ▼
        Test Scenarios
               │
               ▼
        Safety Filter (+ review AI)
               │
               ▼
        Test Orchestrator
               │
               ▼
        Request Builder → HTTP Executor
               │
               ▼
        Response Analyzer → Finding Detector
               │
               ▼
        Findings (+ AI interpret opcional)
```

## Modelo de dados (conceitual)

```
Project
├── environments (baseUrl, auth, safety mode)
│   └── endpoints (contrato OpenAPI daquele ambiente)
├── authentication (refs de secret)
├── test suites
├── variables ({{token}}, {{userId}})
├── findings
└── scan history
```

Cada ambiente tem o próprio contrato. O scan usa os endpoints daquele ambiente.

## Test plugin contract

```
SecurityTest
├── id, name, category, severity, description
├── requirements?
├── generateCases(ctx)
├── execute?(ctx, case)
└── analyse(ctx, case, request, response)
```

Categorias: authentication, authorization, injection, validation, rate-limit, http, business-logic, ai-generated.

## Finding padronizado

- severity: CRITICAL | HIGH | MEDIUM | LOW | INFO  
- confidence: 0–100 (separado da severity)  
- status: OPEN | CONFIRMED | FALSE_POSITIVE | RESOLVED | IGNORED  
- evidence, request, response, recommendation, timestamp  

## AI na arquitetura

| Papel | Permitido | Proibido |
| --- | --- | --- |
| Gerar dados/casos de teste | ✅ | Executar scanner sozinha |
| Interpretar/correlacionar findings | ✅ | Decidir severity sem evidência do engine |
| Personas semânticas | ✅ | Inventar exploits destrutivos / DB drop |

Providers: Ollama / LM Studio (local primeiro) → OpenAI-compatible opcional.

## Execution adapters

```
RequestExecutor
├── HttpExecutor      ← MVP
├── ZapExecutor       ← futuro
└── ProxyExecutor     ← futuro
```

## Segurança operacional

- Secrets: keychain, nunca coluna plaintext de token.
- Production Safety Mode: caps em concurrency/rate tests.
- Escopo ético: testes apenas em APIs autorizadas pelo usuário (próprias/staging).
