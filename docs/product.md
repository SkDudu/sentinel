# Sentinel — Produto

## O que é

**Sentinel** é um workbench local de testes de segurança para APIs. Você aponta para a sua API (local ou staging), importa o contrato (OpenAPI) e executa suites de teste que geram **findings** acionáveis — com severidade, confiança, evidência e recomendação.

Não é um scanner genérico na nuvem. É uma ferramenta **pessoal/local**, com engine própria, pensada para o dia a dia de quem constrói e protege as próprias APIs.

## Problema que resolve

Testar segurança de API hoje costuma ser:

- manual e inconsistente;
- dependente demais de ferramentas externas (ex.: ZAP) sem fluxo de produto;
- fraco em casos semânticos (espaços no e-mail, role inválida, personas de usuário);
- difícil de repetir no CI.

O Sentinel unifica **projeto → endpoints → geração de casos → execução → findings**, com caminho claro para CLI/CI depois.

## Princípios do produto

1. **Local por padrão** — dados e execução na máquina; cloud AI é opcional.
2. **Engine independente da UI** — o mesmo cérebro serve desktop, CLI e CI.
3. **Determinístico primeiro** — null, missing, tipo errado, boundary não gastam token.
4. **IA como amplificador** — gera dados de teste semânticos e interpreta findings; **não** executa o scanner.
5. **Review antes do burst** — casos gerados por IA são revisáveis antes de disparar requests.
6. **Secrets fora do SQLite** — tokens no keychain/credential store do SO.
7. **Production Safety Mode** — limita testes agressivos (ex.: rate limit) em ambientes sensíveis.
8. **Plugins de teste** — novos testes entram no registry sem reescrever o executor.

## Quem usa

- Desenvolvedores e founders que mantêm APIs próprias.
- Fluxos locais/staging antes de ir para produção.
- Futuramente: pipelines CI que bloqueiam critical/high.

## Proposta de valor

| Em vez de… | Sentinel faz… |
| --- | --- |
| Só fuzz genérico | Entende o schema (OpenAPI) e a semântica dos campos |
| Só UI em cima do ZAP | Engine própria + adapters externos opcionais |
| IA “no escuro” mandando requests | IA gera casos; humano revisa; engine executa |
| Achados sem contexto | Finding padronizado com evidence + recommendation |

## Escopo do MVP

- Criar projeto e ambientes
- Importar OpenAPI e listar endpoints
- Gerar casos de validação determinísticos
- Executar via HTTP
- Persistir e listar findings
- AI Test Lab na UI (preview + seleção de casos)

Fora do MVP inicial: ZAP, injection packs completos, OAuth completo, CI publicado.

## Nome e branding

- **Produto:** Sentinel  
- **Pacotes internos (código):** prefixo `@sw/*` (security workbench) — legado técnico aceitável; UI e docs usam **Sentinel**.
