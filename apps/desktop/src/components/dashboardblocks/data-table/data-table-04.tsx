import { useMemo, useState } from 'react'

import {
  createDataTableColumnHelper,
  DataTableContent,
  DataTableSortMenu,
  useDataTable,
} from '@/components/dashboardblocks/data-table'
import {
  AddFilterMenu,
  FilterChip,
  type Filter,
  type FilterField,
  isSameFilter,
} from '@/components/dashboardblocks/dashboard-header'
import {
  StatusBadge,
  type StatusLevel,
} from '@/components/dashboardblocks/status'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { PlusIcon, Trash2 } from 'lucide-react'

const METHOD_ORDER: HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

interface DataTable4Row {
  id: string
  method: HttpMethod
  parameters: number
  path: string
  summary: string
  tags: string
}

interface DataTable4Props {
  busyId?: string | null
  description?: string
  empty?: string
  onDelete?: (id: string) => void
  onSelect?: (id: string) => void
  rows: DataTable4Row[]
  selectedId?: string | null
  title: string
}

const METHOD_STATUS: Record<HttpMethod, StatusLevel> = {
  GET: 'operational',
  POST: 'degraded',
  PUT: 'partial',
  PATCH: 'maintenance',
  DELETE: 'major',
  HEAD: 'unknown',
  OPTIONS: 'unknown',
}

const exampleProps: DataTable4Props = {
  rows: [
    {
      id: 'health',
      method: 'GET',
      parameters: 0,
      path: '/health',
      summary: 'Health check',
      tags: 'system',
    },
    {
      id: 'login',
      method: 'POST',
      parameters: 1,
      path: '/api/v1/auth/login',
      summary: 'Login do admin',
      tags: 'auth',
    },
    {
      id: 'profile',
      method: 'PATCH',
      parameters: 2,
      path: '/api/v1/client/auth/me',
      summary: 'Atualizar perfil',
      tags: 'client',
    },
    {
      id: 'remove',
      method: 'DELETE',
      parameters: 1,
      path: '/api/v1/admin/brands/{brandId}',
      summary: 'Excluir marca',
      tags: 'admin',
    },
  ],
  title: 'OpenAPI',
}

const columnHelper = createDataTableColumnHelper<DataTable4Row>()

function getRowId(row: DataTable4Row) {
  return row.id
}

const DataTable4 = (props: DataTable4Props) => {
  const {
    busyId = null,
    description,
    empty = 'Nenhum endpoint neste ambiente.',
    onDelete,
    onSelect,
    rows,
    selectedId = null,
    title,
  } = props
  const [filters, setFilters] = useState<Filter[]>([])

  const filterFields = useMemo<FilterField[]>(() => {
    const methods = METHOD_ORDER.filter((method) =>
      rows.some((row) => row.method === method),
    )
    const tags = [
      ...new Set(
        rows.flatMap((row) =>
          row.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    const fields: FilterField[] = []
    if (methods.length > 0) fields.push({ field: 'Status', values: methods })
    if (tags.length > 0) fields.push({ field: 'Tags', values: tags })
    return fields
  }, [rows])

  const filteredRows = useMemo(() => {
    const byField = new Map<string, Set<string>>()
    for (const filter of filters) {
      const values = byField.get(filter.field) ?? new Set<string>()
      values.add(filter.value)
      byField.set(filter.field, values)
    }
    if (byField.size === 0) return rows
    return rows.filter((row) => {
      for (const [field, values] of byField) {
        if (field === 'Status' && !values.has(row.method)) return false
        if (field === 'Tags') {
          const rowTags = row.tags.split(',').map((tag) => tag.trim())
          if (!rowTags.some((tag) => values.has(tag))) return false
        }
      }
      return true
    })
  }, [filters, rows])

  const toggleFilter = (filter: Filter, checked: boolean) =>
    setFilters((current) =>
      checked
        ? [...current, filter]
        : current.filter((item) => !isSameFilter(item, filter)),
    )

  const columns = useMemo(() => {
    const dataColumns = [
      columnHelper.accessor('path', {
        cell: ({ row }) => (
          <button
            type='button'
            className='block min-w-0 max-w-full text-left'
            onClick={() => onSelect?.(row.original.id)}
          >
            <span className='block truncate font-mono text-xs'>{row.original.path}</span>
            <span className='text-muted-foreground block truncate text-xs font-normal'>
              {row.original.summary || '—'}
            </span>
          </button>
        ),
        header: 'Endpoint',
        meta: { primary: true, truncate: true },
      }),
      columnHelper.accessor('method', {
        cell: ({ row }) => (
          <StatusBadge
            hideIcon
            status={METHOD_STATUS[row.original.method]}
            label={row.original.method}
          />
        ),
        header: 'Status',
        meta: { cellClassName: '@max-2xl/data-table:col-span-2' },
      }),
      columnHelper.accessor('parameters', {
        cell: ({ getValue }) => getValue().toLocaleString('pt-BR'),
        header: 'Parâmetros',
        meta: { align: 'end' },
      }),
      columnHelper.accessor('tags', {
        cell: ({ getValue }) => getValue() || '—',
        header: 'Tags',
        meta: { truncate: true },
      }),
    ]

    if (!onDelete) return columnHelper.columns(dataColumns)

    return columnHelper.columns([
      ...dataColumns,
      columnHelper.display({
        id: 'actions',
        enableSorting: false,
        enableColumnFilter: false,
        enableGlobalFilter: false,
        header: '',
        cell: ({ row }) => (
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label={`Excluir ${row.original.method} ${row.original.path}`}
            disabled={busyId === row.original.id}
            onClick={() => onDelete(row.original.id)}
          >
            {busyId === row.original.id ? <Spinner /> : <Trash2 />}
          </Button>
        ),
        meta: { align: 'end', hideLabelWhenStacked: true },
      }),
    ])
  }, [busyId, onDelete, onSelect])

  const table = useDataTable({
    columns,
    data: filteredRows,
    getRowId,
    state: { rowSelection: selectedId ? { [selectedId]: true } : {} },
  })

  const totalLabel = `${rows.length.toLocaleString('pt-BR')} endpoint${rows.length === 1 ? '' : 's'}`
  const summary =
    description ??
    (filters.length > 0
      ? `${filteredRows.length.toLocaleString('pt-BR')} de ${totalLabel}`
      : totalLabel)
  const emptyMessage =
    filters.length > 0 ? 'Nenhum endpoint com esses filtros.' : empty

  return (
    <Card className='@container/data-table gap-0 pb-0'>
      <CardHeader className='border-b'>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{summary}</CardDescription>
        <CardAction>
          <DataTableSortMenu className='@2xl/data-table:hidden' table={table} />
        </CardAction>
      </CardHeader>
      {filterFields.length > 0 ? (
        <div className='flex flex-wrap items-center gap-2 border-b px-(--card-spacing) py-3'>
          <ul aria-label='Filtros ativos' className='flex flex-wrap items-center gap-2'>
            {filters.map((filter) => (
              <li key={`${filter.field}-${filter.value}`} className='flex'>
                <FilterChip
                  field={filter.field}
                  value={filter.value}
                  onRemove={() => toggleFilter(filter, false)}
                />
              </li>
            ))}
          </ul>
          <AddFilterMenu fields={filterFields} onFilterChange={toggleFilter} value={filters}>
            <PlusIcon />
            Adicionar filtro
          </AddFilterMenu>
        </div>
      ) : null}
      <ScrollArea className='h-128'>
        <DataTableContent caption={title} empty={emptyMessage} table={table} />
      </ScrollArea>
    </Card>
  )
}

export {
  DataTable4,
  exampleProps as dataTable4ExampleProps,
  type DataTable4Props,
  type DataTable4Row,
}
