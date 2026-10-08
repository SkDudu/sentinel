# Sentinel — Login Recorder (planejado)

Feature nova pedida explicitamente, fora da Fase 6. Branch: `feat/login-recorder`.

## Problema

Ambientes cujo acesso depende de **login interativo** (ex.: gate de docs Laravel em `/docs/login` só com senha) não cabem nos `AuthType` atuais: todos são header estático. Sessão expira (`Max-Age=7200`), então colar cookie não serve para scan recorrente.

Caso de referência (Laravel, validado com `curl`):

1. `GET /docs/login` → `Set-Cookie: XSRF-TOKEN, laravel_session` + `<input type="hidden" name="_token">`
2. `POST /docs/login` form-urlencoded `_token=…&password=…` → `302 /docs` + `laravel_session` novo
3. `GET /openapi.yaml` com cookie novo → spec (YAML). Sem sessão → `302 /docs/login`

## Ideia

1. Usuário cria ambiente (nome, base URL, safety, headers).
2. Opcional: **gravar login** — server abre Chrome headed (Playwright), usuário loga, Sentinel captura tráfego.
3. Sentinel deriva uma **receita de login** (passos reproduzíveis) + detecta spec OpenAPI.
4. No scan, receita é **reproduzida via `HttpExecutor`, sem browser**. Scan segue determinístico.

Browser só grava. Nunca executa scan.

## Gaps no código atual

| Gap | Onde | Impacto |
| --- | --- | --- |
| Só JSON no import OpenAPI | `EnvironmentDetailPage.tsx` (`JSON.parse`), `api-parser` sem YAML | `openapi.yaml` não importa |
| Executor segue redirect e perde `Set-Cookie` múltiplo | `http-client/src/executor.ts` (`fetch` default + `headersToRecord`) | não dá para capturar sessão do `302` |
| `stripAuth` remove só `Authorization` | `test-registry/src/utils.ts` | teste "sem auth" com cookie vira falso negativo (já afeta `AuthType.COOKIE` hoje) |

## Modelo

### `AuthType.LOGIN_RECIPE` (`@sw/core`)

```ts
LoginRecipe = {
  version: 1,
  steps: LoginStep[],
  spec?: { url: string },          // OpenAPI detectado
}

LoginStep = {
  label: string,
  role: "spec-access" | "api-auth" | "both",
  request: {
    method: "GET" | "POST",
    url: string,                   // absoluta ou relativa à baseUrl
    bodyType: "none" | "form" | "json",
    fields: Record<string, FieldValue>,
    headers?: Record<string, FieldValue>,
  },
  extract: Extract[],
}

FieldValue =
  | { kind: "literal", value: string }
  | { kind: "secret", key: string }        // vault, nunca no SQLite
  | { kind: "var", name: string }          // extraído em passo anterior

Extract =
  | { kind: "hiddenInput", name: string, as: string }   // HTML <input type=hidden>
  | { kind: "cookie", name: string, as?: string }       // ex.: XSRF-TOKEN → header
  | { kind: "jsonPath", path: string, as: string, emit?: "bearer" }
  | { kind: "header", name: string, as: string }
```

- Cookie jar carregado automático entre passos.
- Saída: `{ specHeaders, authHeaders }` separados por `role` — cookie do gate de docs não vira auth da API sem o usuário marcar.
- Mais de um login = mais passos na lista, ordem importa.

### Persistência

- `environments.login_recipe TEXT` (JSON **sem secrets**). Migração via `PRAGMA table_info` + `ALTER TABLE` (padrão de `migrate.ts`).
- Secrets: um entry no vault por ambiente (`secretRef`), JSON `{ "password": "…" }` indexado por `FieldValue.key`.
- Nunca salvar HAR / tráfego cru. Logs e UI redigem senha, cookie e token.

## Pacotes

| Package | Mudança |
| --- | --- |
| `@sw/core` | `AuthType.LOGIN_RECIPE`, `LoginRecipeSchema`, `HttpRequest.redirect?: "follow" \| "manual"`, `HttpResponse.setCookies?: string[]` |
| `@sw/http-client` | respeitar `redirect`; preencher `setCookies` via `headers.getSetCookie()` |
| `@sw/api-parser` | dep `yaml`; `parseSpecText(text): unknown` (JSON → fallback YAML) |
| `@sw/auth` | `runLoginRecipe(recipe, secrets, executor, baseUrl)`; cookie jar mínimo; `resolveAuthHeaders` ganha `{ executor }` p/ `LOGIN_RECIPE` |
| `@sw/database` | coluna + mapper + repo |
| `@sw/scan-runner` | passa executor p/ `resolveAuthHeaders` (`project-scan.ts`) |
| `@sw/test-registry` | `stripAuth` remove também `Cookie` vindo de `ctx.authHeaders` |
| `@sw/login-recorder` (novo, Node-only) | `playwright-core`; grava sessão e devolve rascunho de receita |

### `@sw/login-recorder`

- `startRecording({ baseUrl, browserPath? })` → sessão com eventos `step` / `spec` / `closed`; `stop()` → `{ recipeDraft, specCandidates }`.
- Usa Chrome/Brave instalado (`executablePath`), sem baixar Chromium. Erro claro se não achar.
- Captura `page.on("request"/"response")` para `document` / `xhr` / `fetch`.
- Heurísticas:
  - campo secret: nome `password|senha|pass|secret` ou input `type=password` no DOM (script injetado no submit) → `{ kind: "secret" }`
  - hidden field cujo valor veio no HTML do GET anterior → `hiddenInput` + `var`
  - header `X-XSRF-TOKEN` igual ao cookie decodificado → `cookie` + `var`
  - JSON com `access_token|token|jwt` → `jsonPath` + `emit: "bearer"`
  - spec: URL `openapi|swagger|api-docs` ou `.ya?ml|.json` cujo body tem `openapi:`/`swagger:`
- Ignora assets e hosts de terceiros (ex.: `api.scalar.com`).

## Server (`apps/desktop/server`)

| Rota | Função |
| --- | --- |
| `POST /api/recorder/start` `{ baseUrl }` | abre browser, devolve `sessionId` |
| `GET /api/recorder/:id/events` | SSE com passos capturados (redigidos) |
| `POST /api/recorder/:id/stop` | fecha browser, devolve rascunho |
| `POST /api/environments/:id/login/test` | roda receita, devolve status por passo (sem valores) |
| `POST /api/environments/:id/openapi/fetch` | roda receita (`spec-access`), baixa `spec.url`, `parseSpecText` → `parseOpenApi` → salva |

Lógica nos packages; rotas só orquestram.

## UI (`EnvironmentFormDialog`)

Wizard em 3 passos, mesmo `Dialog`:

1. **Dados** — nome (pré-preenchido), base URL, Production Safety, headers (opcional).
2. **Auth** — "Manual" (tipos atuais) ou "Gravar login": botão "Abrir navegador", lista ao vivo dos passos, "Concluir".
3. **Revisar** — passos com `role` editável, campos secret confirmados (vão pro vault), spec detectado com "Importar agora", botão "Testar login".

Edit: "Regravar login" e "Testar login". `EnvironmentDetailPage`: "Buscar OpenAPI" quando receita tem `spec`.

## Fallback

Receita não derivável (SPA pesada, captcha, MFA, SSO): salvar cookies finais no vault como sessão com `expiresAt`. UI avisa "sessão expira em X — regravar". Scan falha cedo com mensagem clara se expirou.

## Ordem de entrega (PRs pequenos)

1. **YAML** — `parseSpecText` + import aceita `.yaml/.yml` (parse no server).
2. **Executor** — `redirect: "manual"` + `setCookies` + testes.
3. **Receita** — schema, DB, `runLoginRecipe`, `resolveAuthHeaders`, scan, `stripAuth` com `Cookie`. Teste com receita Laravel escrita à mão (executor mockado). Já resolve o caso de referência sem recorder.
4. **Buscar OpenAPI** — rota `openapi/fetch` + botão na UI + rota `login/test`.
5. **Recorder** — `@sw/login-recorder` + rotas + wizard.
6. **Docs** — `architecture.md`, `technologies.md` (`playwright-core`, `yaml`), `roadmap.md`, `hardening.md`.

## Em aberto

- Build Tauri: server Node existe no app empacotado? Se não, recorder fica só no modo dev/Vite até ter sidecar.
- Re-login automático em `401` durante scan longo (v2).
- Receita editável à mão na UI (JSON) para casos fora das heurísticas.
