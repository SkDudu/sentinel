# Sentinel — Documentação

| Documento | Conteúdo |
| --- | --- |
| [product.md](./product.md) | Visão do produto, princípios, MVP |
| [roadmap.md](./roadmap.md) | Fases e prioridades |
| [architecture.md](./architecture.md) | Componentes, fluxos, contratos |
| [technologies.md](./technologies.md) | Stack e decisões técnicas |
| [ai-rules.md](./ai-rules.md) | Regras para agentes de código e IA de produto |
| [hardening.md](./hardening.md) | Pós-MVP: verificação fluxo a fluxo + gaps P0–P3 (humano + agentes) |
| [release.md](./release.md) | Build e release do app desktop (macOS + Windows via GitHub Actions) |
| [ui.md](./ui.md) | IA de navegação (global vs projeto) + padrões de UI (PageShell, empty state, cards…) |

Agentes de IA no Cursor também carregam `.cursor/rules/sentinel.mdc`, que aponta para estes arquivos.

**Agora:** Fases 0–5 do roadmap estão no código. Trabalho ativo = [hardening.md](./hardening.md) (não abrir feature nova fora dessa lista sem pedido explícito).
