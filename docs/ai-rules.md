# Sentinel — Regras para IA

Este arquivo governa **duas IAs**:

1. **Agentes de código** (Cursor / Copilot / etc.) trabalhando neste repo  
2. **IA de produto** (geração de dados / interpretação de findings)

Leia também: [product.md](./product.md), [architecture.md](./architecture.md), [roadmap.md](./roadmap.md), [technologies.md](./technologies.md), [hardening.md](./hardening.md).

**Estado atual do repo:** Fases 0–5 feitas. Sem pedido explícito de feature nova, trabalhar pela ordem P0→P1 em [hardening.md](./hardening.md) e atualizar esse arquivo ao fechar gaps.

---

## A. Agentes de código (obrigatório)

### Identidade do projeto

- Nome do produto: **Sentinel** (não renomear para “Security Workbench” na UI/docs).
- Packages internos podem continuar `@sw/*`.
- Responder e documentar em **português**, salvo código/identifiers em inglês.

### Arquitetura — não quebrar

1. **Engine ≠ UI.** Lógica de scan, parsing, findings e AI data fica em `packages/`. Apps só orquestram.
2. **Não colocar testes de segurança hardcoded no executor.** Novos testes = plugin em `@sw/test-registry`.
3. **Não tornar ZAP/IA obrigatórios** no caminho feliz do MVP.
4. **Secrets nunca em plaintext** no SQLite, `.env` commitado, ou fixtures de exemplo reais.
5. Respeitar o **roadmap**: Fase 1 antes de Fase 3–5, salvo pedido explícito do usuário.

### Stack — não sair do padrão

| Usar | Evitar sem pedido explícito |
| --- | --- |
| pnpm + workspaces | npm/yarn workspaces paralelos |
| TypeScript strict | `any` solto, JS sem tipos |
| Zod + Drizzle + SQLite | Prisma/Postgres “por default” |
| React + Tailwind (+ shadcn quando entrar) | Electron, outro UI kit aleatório |
| fetch via `RequestExecutor` | HTTP client paralelo sem adapter |
| Ollama-first para AI | Forçar OpenAI como único path |

### Qualidade de mudança

- Escopo mínimo: só o necessário para a tarefa.
- Não reescrever packages estáveis sem motivo.
- Não adicionar markdown/docs extras sem pedido (exceto atualizar estes docs quando a arquitetura mudar de verdade).
- Não commitar secrets, `*.db`, `node_modules`, `dist`.
- Não inventar features fora do MVP sem alinhar com o roadmap.

### Segurança / ética no código

- Sentinel testa **APIs autorizadas pelo usuário** (próprias/staging).
- Não adicionar packs ofensivos “prontos para abuso” (exploits weaponizados) como default.
- Injection/authz avançados: stubs + design controlado; payloads agressivos só com contexto claro de lab autorizado.
- Rate limit: configurável + Production Safety Mode.

### Quando a tarefa for ambígua

Seguir esta ordem:

1. O que dizem `docs/*` e o roadmap?  
2. O que o usuário pediu nesta mensagem?  
3. Se conflitar com docs, **perguntar** — não “melhorar” o produto sozinho.

---

## B. IA de produto (runtime)

### Papéis permitidos

| Módulo | Pode | Não pode |
| --- | --- | --- |
| `@sw/ai-data-generator` | Gerar casos/personas semânticos | Executar HTTP / marcar finding sozinha |
| `@sw/ai` interpret | Explicar/correlacionar findings | Alterar severity sem evidência do engine |
| UI AI Test Lab | Sugerir casos | Rodar casos AI sem seleção/review |

### Camadas de geração

```
Deterministic (sempre)     → null, empty, missing, type, boundary
Business / personas        → combinações semânticas fixas
AI generated (opcional)    → edge semântico; passa por Safety Filter + review
```

### Safety Filter (mínimo)

Rejeitar ou exigir review humano se o caso:

- parecer destrutivo (ex.: SQL DDL, wipe);
- for absurdamente grande (payload mega);
- tentar mass-burst sem config explícita de rate-limit;
- não tiver `mutations`/estrutura parseável.

### Providers

Ordem preferencial: **Ollama → LM Studio → OpenAI-compatible**.  
Falhas de AI **não** podem quebrar scan determinístico.

### Prompts de produto — tom

- Pedir JSON estruturado quando for gerar casos.
- Preferir português nas explicações de findings para o usuário.
- Não pedir ao modelo “hackear produção” — contexto é teste autorizado de API do usuário.

---

## C. Checklist rápido (antes de merge/PR mental)

- [ ] Mudança respeita engine desacoplada?
- [ ] Cabe na fase atual do roadmap?
- [ ] Stack ainda é a de `technologies.md`?
- [ ] Secrets/safe mode ok?
- [ ] Docs atualizados se a arquitetura mudou?
- [ ] IA (se tocada) continua opcional + com review?

Se algum item falhar: corrigir antes de seguir.
