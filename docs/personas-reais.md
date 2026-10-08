# Sentinel — Personas reais e fluxos de negócio (planejado)

Feature nova pedida explicitamente, fora da Fase 6. Branch: `feat/personas-reais`.

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

### Editor visual de fluxos — [React Flow](https://reactflow.dev/) (`@xyflow/react`)

Editor = só UI sobre `FlowSchema`. Fonte da verdade continua o JSON validado por Zod; runner em `@sw/flows` não conhece React Flow. CLI/CI rodam o mesmo `Flow`.

| Editor | `Flow` |
| --- | --- |
| Nó | `FlowStep` (actor, endpoint, extract, expect) |
| Aresta | ordem de execução; rótulo = variáveis repassadas (`{{orderId}}`) |
| Cor do nó | persona/ator |
| Grupo (sub flow) | `setup` / `steps` / `teardown` |
| Status no nó pós-run | passou / falhou / finding; clique → request/response |

Conversão `nodes/edges ↔ Flow` em função pura testada (`apps/desktop`, sem lógica de execução). Ordem = topological sort das arestas; editor rejeita ciclo e mais de uma saída por nó (v1 sequencial).

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
| `PUT /api/environments/:id/relations/:relationId` | confirmar / rejeitar / editar |
| `POST /api/environments/:id/relations` | relação manual |
| `GET/PUT /api/environments/:id/access-rules` | matriz |
| `GET/POST/PUT/DELETE /api/projects/:id/flows` | CRUD de fluxos |
| `POST /api/ai/suggest-access` / `suggest-flows` | sugestão IA (review gate) |

Scan: `runScan` ganha `flowIds?` e `matrix?: boolean`.

## UI

Abas do `EnvironmentDetailPage` (`PageHeader2` tabs) ficam: **Informações · Endpoints · Relacionamentos · Acesso · Scan do ambiente · AI Test Lab**. Rotas: `${base}/relations`, `${base}/access` (somar em `sectionOf`). Badge de Relacionamentos = nº de sugeridas pendentes.

- **Relacionamentos**: tabela recurso → recurso (tipo, via, confiança, origem, status); filtro "só sugeridas"; confirmar/rejeitar em lote; clique abre endpoints de evidência. Vazio (sem OpenAPI) → `PageEmptyState` apontando "Adicionar documentação". Toggle tabela/grafo (React Flow, somente leitura) depois da tabela.
- **Acesso** (Personas + Matriz como sub-seções, para não inflar a barra):
  - **Personas**: personas do projeto; por linha: auth (tipo + "Secret"), fixtures (chave/valor), "Testar login".
  - **Matriz**: tabela endpoint × persona com `allow/deny/own-only` (pré-preenchida pelo grafo); filtro por tag/método; "Sugerir com IA".
- **Projeto → "Fluxos"**: lista; abrir fluxo → editor visual (React Flow) com aba "JSON" ao lado; "Rodar" usa ambiente escolhido e pinta status nos nós.
- **Scan scope**: checkbox "Matriz de acesso" + seleção de fluxos.
- **AI Lab**: seleção de endpoints para geração (resolve o "1 caso por endpoint").

## Segurança

- Credenciais de persona **só no vault**; nunca em `data/personas/*.json`, SQLite, logs, evidence ou prompt de IA.
- Evidence/logs redigem `Authorization`, `Cookie`, `Set-Cookie`, campos `password|token|secret`.
- **Production Safety Mode ligado**: matriz só `GET/HEAD/OPTIONS`; fluxos com método de escrita bloqueados com erro claro. Sem override na v1.
- Fluxos criam dados com prefixo `sentinel-<runId>` quando houver campo texto livre; teardown sempre roda e reporta o que sobrou.
- Rate limit do ambiente vale para todas as personas somadas.
- IA recebe só nomes, roles, chaves de fixture e contrato — nunca secrets nem valores de fixture.

## Ordem de entrega (PRs pequenos)

1. **Persona autenticada** — `role`, `PersonaBinding`, vault, `resolvePersonaAuthHeaders`, aba Personas, "Testar login". `authorization.idor` usa token + fixture da persona B. Testes com executor mockado.
2. **Relacionamentos** — parser guarda component/`links`; `inferRelations` com testes em specs reais (Laravel do ambiente Development + petstore); tabelas; aba Relacionamentos com review.
3. **Matriz** — `AccessRule`, plugin `authorization.matrix`, `TestContext.personas`, UI da matriz (pré-preenchida pelo grafo), opção no scan scope.
4. **Fluxos (motor)** — `@sw/flows`, schema, CRUD, editor JSON, esqueletos gerados do grafo, execução no scan, findings `business-logic`.
5. **Fluxos (editor visual)** — `@xyflow/react` no desktop; conversão `nodes/edges ↔ Flow`; paleta de endpoints; sugestão por relações; validação; status ao vivo nos nós. Grafo somente leitura na aba Relacionamentos.
6. **IA** — sugestão de matriz/fluxos/relações + seleção de endpoints no AI Lab.
7. **Docs** — `architecture.md`, `roadmap.md`, `hardening.md`, `ai-rules.md`, `technologies.md` (`@xyflow/react`).

## Em aberto

- Personas para SQLite junto com bindings, ou manter JSON em `data/personas/` na v1?
- Receita gravada com e-mail literal: recorder deve marcar identificador de login como secret automaticamente?
- Re-login em `401` no meio de fluxo longo (mesmo ponto do login recorder v2).
- Fixtures criadas no setup vs. fixtures fixas no binding — v1 aceita as duas?
- CLI/CI rodar matriz e fluxos (`apps/cli`).
- Reimport do OpenAPI: preservar relações `confirmed`/`manual` casando por `method + path` (endpointId muda a cada import).
- Relação `observed` (aprendida do tráfego do scan) entra na v1 ou fica pra v2?
- Fluxo com branch/condicional ("se 403 → passo X") — modelo de aresta com condição na v2?
- Editor visual dentro do Tauri: checar performance com fluxos grandes (>50 nós) e bundle do `@xyflow/react`.
