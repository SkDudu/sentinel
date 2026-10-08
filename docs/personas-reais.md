# Sentinel — Personas reais e fluxos de negócio (v1 entregue)

Feature nova pedida explicitamente, fora da Fase 6 (roadmap: Fase 8). Branch: `feat/personas-reais`.

Status: as 7 entregas abaixo estão no branch. O que ficou para depois está só em [Em aberto](#em-aberto).

## Problema

Hoje persona é **fixture de payload** (`fields` para preencher body/query). Não tem identidade. Resultado: Sentinel não valida regra de negócio nem autorização real entre usuários.

| Gap | Onde | Impacto |
| --- | --- | --- |
| Persona sem login | `TestPersonaSchema` (`@sw/core`), `personas-store.ts` | todo request sai com a auth do ambiente; não existe "usuário B" |
| IDOR com fixture manual | `authorization.idor` usa `{{otherToken}}` / `{{otherUserId}}` do JSON de variáveis; default `999999` | id inexistente → `404` → falso negativo; sem token de B não testa horizontal |
| Scan sem estado entre endpoints | `TestOrchestrator` roda caso por endpoint | não dá pra encadear "A cria → B lê/edita" |
| `analyse` sem expectativa | plugins tratam `2xx` como suspeito | não sabe se role X **deveria** acessar; não detecta BFLA nem regressão de permissão |
| Personas em JSON plaintext | `data/personas/<projectId>.json` | não pode guardar credencial ali |
| AI Lab: 1 caso por endpoint | `maxAiCases / endpoints.length` em `ai-lab.ts` | com muitos endpoints, seed usa só a 1ª persona |

## Ideia

1. **Persona com identidade**: role + credencial (vault) + fixtures próprias (ids que ela possui), por ambiente.
2. **Relacionamentos**: grafo de recursos inferido do OpenAPI (quem pertence a quem, quem cria o id que outro consome). Base para matriz, fixtures e fluxos.
3. **Matriz de acesso**: persona × endpoint → esperado (`allow` / `deny` / `own-only`). Divergência = finding. Cobre BOLA e BFLA (OWASP API1/API5) de forma determinística.
4. **Fluxos**: cenário multi-step com ator por passo, extração de variáveis, asserts, setup/teardown. Valida regra de negócio ("pedido pago não pode ser cancelado por user", "user não aprova o próprio reembolso").
5. **IA sugere** matriz, fluxos e relações que a heurística não achou, a partir do OpenAPI + roles + grafo. Review gate obrigatório. Execução e finding seguem determinísticos (`docs/ai-rules.md`).

## Modelo

### Persona (projeto) — `@sw/core`

```ts
TestPersona = {
  id, name, description?, fields, tags,   // atual
  role?: string,                          // "user" | "admin" | "support" | livre
}
```

Persona continua no projeto (mesma "pessoa" em dev/staging). O que muda por ambiente vai no binding.

### Binding (ambiente × persona) — sem secrets

```ts
PersonaBinding = {
  environmentId: string,
  personaId: string,
  authType: AuthType,                 // BEARER | BASIC | API_KEY | COOKIE | LOGIN_RECIPE
  secretRef?: string,                 // vault: `persona:<environmentId>:<personaId>:auth`
  fixtures: Record<string, string>,   // ex.: { userId: "42", orderId: "ord_9" } — recursos DESSA persona
}
```

- `LOGIN_RECIPE`: reusa a receita do ambiente, trocando só os secrets (`{ "username": "...", "password": "..." }` da persona). Exige que o identificador de login na receita seja `{ kind: "secret", key: "username" }`, não literal.
- Persistência: tabela SQLite `persona_bindings` (padrão `migrate.ts`). Secrets só no vault.

### Relacionamentos (ambiente) — `@sw/api-parser`

Inferidos no import do OpenAPI; usuário revisa/edita. 824 endpoints = custo zero (sem IA).

```ts
Resource = {
  name: string,                 // "orders" (segmento do path) ou "Order" (nome do component)
  idParam?: string,             // "orderId"
  operations: Partial<Record<"create" | "list" | "read" | "update" | "delete", string>>, // endpointId
}

ResourceRelation = {
  from: string,                 // resource
  to: string,                   // resource
  kind: "parent" | "reference" | "owner" | "produces",
  via: string,                  // param ou campo: "userId", "body.customer_id", "response.id"
  evidence: string[],           // endpointIds que sustentam a relação
  confidence: number,           // 0–100
  origin: "links" | "path" | "field" | "observed" | "ai" | "manual",
  status: "suggested" | "confirmed" | "rejected",
}
```

Heurísticas, em ordem de confiança:

| Sinal | Exemplo | Relação |
| --- | --- | --- |
| OpenAPI `links` explícito | `createOrder` → `getOrder` via `$response.body#/id` | `produces` (100) |
| Path aninhado | `/users/{userId}/orders/{orderId}` | `orders` `parent` → `users` (90) |
| Response de create → param de read | `POST /orders` devolve `id`; `GET /orders/{orderId}` | `produces` (80) |
| Campo FK no body/response | `customer_id`, `userId` → recurso `customers`/`users` (singular/plural) | `reference` (60) |
| Campo de dono | `ownerId`, `createdBy`, `user_id` em recurso não-`users` | `owner` (60) |
| Observado no scan (v2) | valor de `response.id` reaparece como path param depois | `produces` (`observed`) |

Usos:

- **Matriz `own-only`**: `pathFixtures` preenchido sozinho (param `orderId` → fixture `orderId` do recurso `orders`).
- **Fixtures**: mostra que ids cada persona precisa; setup pode criá-los via endpoint `create` do recurso.
- **Fluxos gerados**: esqueleto CRUD por recurso e BOLA cruzado (A cria → B lê/edita/apaga → espera negar).
- **Mass assignment**: body aceita campo `owner`/FK → caso que troca o dono para outra persona.
- **IA**: recebe o grafo (compacto) em vez de 824 endpoints crus.

Parser precisa guardar o nome do component antes de resolver `$ref` (hoje `resolveRef` descarta) e ler `links` das responses.

### Matriz de acesso

```ts
AccessRule = {
  endpointId: string,
  personaId: string | "anonymous",
  expect: "allow" | "deny" | "own-only",
  // own-only: path params preenchidos com fixtures da própria persona (deve passar)
  // e de outra persona (deve negar). Map param → chave de fixture.
  pathFixtures?: Record<string, string>,   // ex.: { id: "orderId" }
}
```

Avaliação:

| expect | Resposta | Finding |
| --- | --- | --- |
| `deny` | `2xx` | BFLA — HIGH/CRITICAL |
| `allow` | `401/403` | regressão de permissão — LOW (funcional) |
| `own-only` (fixture de outra persona) | `2xx` | BOLA — CRITICAL |
| `own-only` (fixture própria) | `401/403/404` | regressão — LOW |

### Fluxo

```ts
Flow = {
  id, name, description?,
  setup?: FlowStep[],
  steps: FlowStep[],
  teardown?: FlowStep[],          // sempre roda (finally), best-effort
}

FlowStep = {
  id: string,                     // estável; = id do nó no editor visual
  label: string,
  actor: string,                  // personaId | "anonymous"
  request: {
    method: HttpMethod,
    path: string,                 // template: /orders/{{orderId}}
    query?: Record<string, string>,
    body?: unknown,               // templates {{var}} / {{persona.fields.email}} / {{fixtures.userId}}
  },
  extract?: Extract[],            // mesmo Extract da receita (jsonPath, header, cookie)
  expect: {
    status: number[] | "2xx" | "4xx",
    json?: Array<{ path: string, equals?: unknown, exists?: boolean }>,
  },
  severityOnFail?: Severity,      // default MEDIUM
  ui?: { x: number, y: number },  // posição no editor; runner ignora
}
```

Step falha → finding `business-logic`, `testId: flow:<flowId>:<stepId>`, evidence com request/response redigidos.

v1 é **sequencial**: runner executa `setup → steps → teardown` na ordem do array. Sem branch/condicional (v2).

Decisões v1: só falha em `steps` vira finding (severity default MEDIUM, confiança 70); falha em `setup` encerra o fluxo como `error`, sem finding (é problema de preparação, não do alvo). Cada passo vira `test_result` (`testId flow:<id>`, `testCaseId <fase>:<stepId>`). Variáveis embutidas: `{{runId}}` e `{{prefix}}` (`sentinel-<runId>`).

### Editor visual de fluxos — [React Flow](https://reactflow.dev/) (`@xyflow/react`)

Editor = só UI sobre `FlowSchema`. Fonte da verdade continua o JSON validado por Zod; runner em `@sw/flows` não conhece React Flow. CLI/CI rodam o mesmo `Flow`.

| Editor | `Flow` |
| --- | --- |
| Nó | `FlowStep` (actor, endpoint, extract, expect) |
| Aresta | ordem de execução; rótulo = variáveis repassadas (`{{orderId}}`) |
| Cor do nó | persona/ator |
| Fase do nó (coluna) | `setup` / `steps` / `teardown` |
| Status no nó pós-run | passou / falhou / erro / pulado |

Conversão `nodes/edges ↔ Flow` em função pura testada (`apps/desktop/src/pages/flows/flow-graph.ts`, sem lógica de execução). Ordem = cadeias a partir dos nós sem entrada, de cima para baixo; editor rejeita ciclo e mais de uma saída/entrada por nó (v1 sequencial).

Decisões v1: fase é campo do nó desenhado em colunas, não grupo/sub flow do React Flow; "Organizar" alinha por fase e ordem, sem dagre; import/export = aba JSON (mesma fonte de verdade); request/response do passo aparecem na lista "Último run" abaixo do canvas.

Interações:

- **Paleta de endpoints** com busca (método, path, tag) — 824 endpoints não cabem em lista solta.
- **Sugestão pelo grafo de relacionamentos**: após `POST /orders`, sugerir `GET /orders/{orderId}` e já ligar `id` → `orderId`.
- **Validação ao conectar** (`isValidConnection`): sem ciclo; aviso quando passo usa `{{var}}` que nenhum passo anterior extrai.
- **Auto layout** (dagre) + minimap + controls.
- **Painel lateral** do nó selecionado: form de actor/request/extract/expect (mesmos componentes do resto do app).
- **Import/export JSON** do `Flow`.
- Production Safety ligado → nós com método de escrita marcados e run bloqueado.

Mesma lib renderiza o grafo da aba Relacionamentos (somente leitura).

## Pacotes

| Package | Mudança |
| --- | --- |
| `@sw/core` | `role` na persona; `PersonaBindingSchema`, `ResourceSchema`, `ResourceRelationSchema`, `AccessRuleSchema`, `FlowSchema` |
| `@sw/api-parser` | preservar nome do component e `links`; `inferRelations(endpoints, doc?)` → `{ resources, relations }` |
| `@sw/auth` | `resolvePersonaAuthHeaders(env, binding, store, { executor })` — monta ambiente virtual com `authType`/`secretRef` do binding e reusa `resolveAuthHeaders`; exportar helpers de `Extract` |
| `@sw/database` | tabelas `persona_bindings`, `resources`, `resource_relations`, `access_rules`, `flows` + repos |
| `@sw/test-registry` | `TestContext.personas?: Record<personaId, { headers, fixtures, role }>`; plugin `authorization.matrix`; `authorization.idor` usa persona B quando houver (fallback atual mantido) |
| `@sw/scan-runner` | resolve headers de todas as personas com binding antes do scan; injeta em `TestContext`; roda fluxos selecionados |
| `@sw/flows` (novo) | runner de `Flow`: templates, extract, expect, teardown; usa `RequestExecutor` |
| `apps/desktop` | dep `@xyflow/react`; editor visual + conversão `nodes/edges ↔ Flow` (sem execução) |
| `@sw/ai-data-generator` | sugestão de `AccessRule[]` / `Flow[]` (JSON), Zod + safety filter + `needs-review` |

Lógica nos packages; rotas e UI só orquestram.

## Server (`apps/desktop/server`)

| Rota | Função |
| --- | --- |
| `GET/PUT /api/environments/:id/personas/:personaId` | binding (sem secret) |
| `PUT/DELETE /api/environments/:id/personas/:personaId/secret` | credencial no vault |
| `POST /api/environments/:id/personas/:personaId/login/test` | testa auth da persona (passos sem valores) |
| `GET /api/environments/:id/relations` | recursos + relações (inferidas no import OpenAPI) |
| `PATCH /api/environments/:id/relations` | confirmar / rejeitar em lote |
| `PUT/DELETE /api/environments/:id/relations/:relationId` | editar (vira `manual`) / remover |
| `POST /api/environments/:id/relations` | relação manual |
| `GET/PUT /api/environments/:id/access-rules` | matriz |
| `POST /api/environments/:id/access-rules/suggest` | pré-preenche pelo grafo (sem IA) |
| `GET/POST/PUT/DELETE /api/projects/:id/flows` | CRUD de fluxos |
| `POST /api/environments/:id/flows/skeletons` | esqueletos CRUD/BOLA do grafo |
| `POST /api/ai/suggest-access` / `suggest-flows` / `suggest-relations` | sugestão IA (review gate) |

Scan: `runScan` ganha `flowIds?` e `matrix?: boolean`, mais `matrixOnly` / `flowsOnly` (sem eles, categorias vazias = todas as suites).

## UI

Abas do `EnvironmentDetailPage` (`PageHeader2` tabs) ficam: **Informações · Endpoints · Relacionamentos · Acesso · Scan do ambiente · AI Test Lab**. Rotas: `${base}/relations`, `${base}/access` (somar em `sectionOf`). Badge de Relacionamentos = nº de sugeridas pendentes.

- **Relacionamentos**: tabela recurso → recurso (tipo, via, confiança, origem, status); filtro "só sugeridas"; confirmar/rejeitar em lote; clique abre endpoints de evidência. Vazio (sem OpenAPI) → `PageEmptyState` apontando "Adicionar documentação". Toggle tabela/grafo (React Flow, somente leitura) depois da tabela.
- **Acesso** (Personas + Matriz como sub-seções, para não inflar a barra):
  - **Personas**: personas do projeto; por linha: auth (tipo + "Secret"), fixtures (chave/valor), "Testar login".
  - **Matriz**: tabela endpoint × persona com `allow/deny/own-only` (pré-preenchida pelo grafo); filtro por tag/método; "Sugerir com IA".
- **Projeto → "Fluxos"**: lista; abrir fluxo → editor visual (React Flow) com aba "JSON" ao lado; "Rodar" usa ambiente escolhido e pinta status nos nós.
- **Scan scope**: checkbox "Matriz de acesso". Fluxo roda separado, só pelo "Rodar" do editor (backend de scan ainda aceita `flowIds`).
- **AI Lab**: seleção de endpoints para geração (resolve o "1 caso por endpoint").

## Segurança

- Credenciais de persona **só no vault**; nunca em `data/personas/*.json`, SQLite, logs, evidence ou prompt de IA.
- Evidence/logs redigem `Authorization`, `Cookie`, `Set-Cookie`, campos `password|token|secret`.
- **Production Safety Mode ligado**: matriz só `GET/HEAD/OPTIONS`; fluxos com método de escrita bloqueados com erro claro. Sem override na v1.
- Fluxos criam dados com prefixo `sentinel-<runId>` quando houver campo texto livre; teardown sempre roda e reporta o que sobrou.
- Rate limit do ambiente vale para todas as personas somadas.
- IA recebe só nomes, roles, chaves de fixture e contrato — nunca secrets nem valores de fixture.

## Ordem de entrega (PRs pequenos)

1. ✅ **Persona autenticada** — `role`, `PersonaBinding`, vault, `resolvePersonaAuthHeaders`, aba Personas, "Testar login". `authorization.idor` usa token + fixture da persona B. Testes com executor mockado.
2. ✅ **Relacionamentos** — parser guarda component/`links`; `inferRelations` com testes em specs reais (Laravel do ambiente Development + petstore); tabelas; aba Relacionamentos com review.
3. ✅ **Matriz** — `AccessRule`, plugin `authorization.matrix`, `TestContext.personas`, UI da matriz (pré-preenchida pelo grafo), opção no scan scope.
4. ✅ **Fluxos (motor)** — `@sw/flows`, schema, CRUD, editor JSON, esqueletos gerados do grafo, execução no scan, findings `business-logic`.
5. ✅ **Fluxos (editor visual)** — `@xyflow/react` no desktop; conversão `nodes/edges ↔ Flow`; paleta de endpoints; sugestão por relações; validação; status ao vivo nos nós. Grafo somente leitura na aba Relacionamentos.
6. ✅ **IA** — sugestão de matriz/fluxos/relações + filtro de endpoints no AI Lab; seed de personas rotaciona entre endpoints.
7. ✅ **Docs** — `architecture.md`, `roadmap.md`, `hardening.md`, `ai-rules.md`, `technologies.md` (`@xyflow/react`), `ui.md`.

Reimport do OpenAPI (resolvido na v1): relações têm id estável (`from|kind|to|via`) e o merge preserva status, `manual`, `ai` e `confirmed`; regras da matriz guardam `method + path` e são remapeadas para os novos endpointIds (órfãs são descartadas).

## Em aberto

Única lista de pendências desta feature. Cada item diz o que a v1 faz hoje.

- **Personas em SQLite** — v1 mantém `data/personas/<projectId>.json` (só role + fields, sem credencial); bindings já estão no SQLite.
- **Recorder marcar login como secret** — v1 não marca sozinho; persona exige `{ kind: "secret", key: "username" }` na receita e o "Testar login" acusa receita com identificador literal.
- **Re-login em `401` no meio do fluxo** — v1 resolve auth uma vez por scan; sem retry de login (mesmo ponto do login recorder v2).
- **Fixtures** — v1 aceita as duas: fixas no binding (`{{fixtures.x}}`) e criadas no setup via `extract` (`{{var}}`). Criar fixture automaticamente pelo `create` do recurso ainda não existe.
- **CLI/CI** — `apps/cli` não roda matriz nem fluxos; só a desktop.
- **Relação `observed`** (aprendida do tráfego do scan) — v2.
- **Branch/condicional em fluxo** ("se 403 → passo X") — v2; editor rejeita mais de uma saída por nó.
- **Editor visual no Tauri** — performance com >50 nós e bundle (`@xyflow/react` soma ao chunk único do desktop) não medidos.
- **Matriz × `idor` legado** — `authorization.idor` só reconhece params de path com cara de id; params estilo Laravel (`{company_unit}`) ficam só com a matriz `own-only`.
- **Mass assignment pelo grafo** (trocar `owner`/FK para outra persona) — não implementado.
