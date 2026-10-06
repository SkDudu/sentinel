# Sentinel — UI patterns

Padrões visuais do desktop. Preferir estes componentes a inventar layout novo.

## Informação architecture (navegação)

Dois contextos de shell. Menus e rotas não misturam escopo global com escopo de projeto.

### App global

Ao abrir o Sentinel:

| Destino | Papel |
| --- | --- |
| **Dashboard** | Home com indicadores / gráficos agregados (KPIs simples primeiro: projetos, findings abertos, último scan) |
| **Projetos** | Lista de projetos (cards) |
| **Configurações** | Settings da app (AI, vault, preferências) — sempre global |

### Projetos → dialog → abrir

1. Em **Projetos**, clique no **card** do projeto abre um **Dialog** (não navega ainda).
2. O Dialog mostra detalhe do projeto (nome, ambientes, resumo útil: endpoints, scans recentes, findings abertos, auth/safety quando fizer sentido).
3. Botão primário **Abrir projeto** entra no contexto do projeto.
4. Ações secundárias (editar, excluir, etc.) ficam no Dialog e/ou no menu ⋯ do card — sem atalho que pule o Dialog no clique do card.

### Dentro do projeto

Shell com contexto do projeto ativo (nome visível; saída clara de volta a Projetos / Dashboard global).

| Destino | Papel |
| --- | --- |
| **Dashboard do projeto** | Home do projeto: indicadores e atalhos do próprio projeto |
| **Ambientes** | CRUD de ambientes (base URL, auth, safety, secrets) |
| **Endpoints** | Import OpenAPI / lista / detalhe |
| **Scans / AI Lab** | Execução, histórico, geração e review de casos AI |
| **Findings** | Lista, filtros, evidência |

Rotas sugeridas (implementação futura):

```
/                         → Dashboard global
/projects                 → Lista de projetos
/settings                 → Configurações
/projects/:projectId      → Dashboard do projeto
/projects/:projectId/environments
/projects/:projectId/endpoints
/projects/:projectId/scans
/projects/:projectId/findings
```

O `projectId` na URL é a fonte de verdade do contexto. Evitar depender só de `activeProjectId` no store sem rota.

```
App open
  ├─ Dashboard (global)
  ├─ Projetos ──click card──► Dialog (detalhe) ──Abrir──► Dashboard do projeto
  │                                                      ├─ Ambientes
  │                                                      ├─ Endpoints
  │                                                      ├─ Scans / AI Lab
  │                                                      └─ Findings
  └─ Configurações
```

## Page shell

Arquivo: `apps/desktop/src/components/layout/page-shell.tsx`

- Título grande à esquerda
- Ações (busca, botão primário) à direita
- Largura total (`w-full`); empty state centralizado no corpo (`PageEmptyState`)

```tsx
<PageShell
  title="Projects"
  actions={
    <>
      <SearchInput />
      <Button>Adicionar</Button>
    </>
  }
>
  {children}
</PageShell>
```

## Cards de lista (decisão de UI)

Padrão **obrigatório** para listas de entidades (projetos, ambientes, e o que vier no mesmo espírito).

Arquivo: `apps/desktop/src/components/ui/card.tsx`

### Layout

- Grid responsivo: `grid gap-3 sm:grid-cols-2`
- Cada item = `Card` + `CardHeader` (+ `CardAction` para o ⋯)
- Conteúdo do card: ícone (opcional) → título → descrição/meta curta
- Sem formulário inline no card; sem links “editar / secret / remover” no corpo

### Ações

| Ação | Onde |
| --- | --- |
| Abrir / detalhar | Clique no card (ou área principal) → `Dialog` de detalhe, se o fluxo precisar de preview |
| Editar / excluir / secret | Menu ⋯ (`DropdownMenu`) e/ou botões no `Dialog` |
| Criar | Botão do `PageShell` (ou só no empty state quando a lista está vazia) |
| Forms | Sempre `Dialog` / `AlertDialog` — nunca expandir o card |

### Atalhos do dashboard do projeto

Mesma linguagem visual (tile com ícone + título + meta), em grid `sm:grid-cols-2`. Podem ser `Button variant="outline"` com `Link` ou `Card` — manter hierarquia e densidade parecidas com os cards de lista.

### Referências

- `ProjectsPage` — cards de projeto + dialog de detalhe
- `EnvironmentsPage` — cards de ambiente + CRUD via dialogs
- `ProjectDashboardPage` — atalhos em grid

## Empty state

Arquivo: `apps/desktop/src/components/layout/page-empty-state.tsx`

Usar quando:

- lista vazia (nenhum projeto / endpoint / finding)
- busca sem resultado
- falta pré-requisito (ex.: páginas de projeto sem `projectId` válido — orientar a abrir um projeto)

```tsx
<PageEmptyState
  icon={FolderKanban}
  title="Nenhum projeto ainda"
  description="Crie o primeiro projeto para começar."
  action={<Button>Adicionar projeto</Button>}
/>
```

No empty state: **um** CTA no centro. Esconder o botão duplicado do header do `PageShell` enquanto a lista estiver vazia; mostrar o botão do header quando já existir pelo menos um item.

## Demais padrões

| Padrão | Componente |
| --- | --- |
| Cards de lista | `Card` — ver secção acima |
| Ações do item | `DropdownMenu` (⋯) |
| Criar / editar form | `Dialog` |
| Confirmar destrutivo | `AlertDialog` + `Alert` destructive |
| Select em dialog | `Select` com `SelectContent portalled={false}` |
| Lista scrollável em dialog | `ScrollArea` |
| Loading em botão | `Spinner` com `data-icon="inline-start"` |
| Erro de página | `Alert` variant `destructive` |
| Sucesso / erro de ação | `toast.add({ type: "success" | "error" })` + `Toaster` no `Shell` |

Referências vivas: `ProjectsPage`, `EnvironmentsPage`.
