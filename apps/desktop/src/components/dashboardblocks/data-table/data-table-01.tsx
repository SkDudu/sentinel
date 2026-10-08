'use client'

import { useMemo } from 'react'

import {
  createDataTableColumnHelper,
  DataTableContent,
  DataTableSortMenu,
  useDataTable,
} from '@/components/dashboardblocks/data-table'
import {
  StatusBadge,
  type StatusLevel,
} from '@/components/dashboardblocks/status'

import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

interface DataTable1Row {
  blockers: number
  environment: string
  findings: number
  id: string
  method: HttpMethod
  path: string
}

interface DataTable1Props {
  description: string
  empty?: string
  onSelect?: (id: string) => void
  rows: DataTable1Row[]
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

const exampleProps: DataTable1Props = {
  description: 'Findings abertos agregados por endpoint',
  rows: [
    {
      blockers: 4,
      environment: 'Staging',
      findings: 12,
      id: '1',
      method: 'POST',
      path: '/api/auth/login',
    },
    {
      blockers: 2,
      environment: 'Staging',
      findings: 8,
      id: '2',
      method: 'GET',
      path: '/api/users/{id}',
    },
    {
      blockers: 1,
      environment: 'Staging',
      findings: 5,
      id: '3',
      method: 'PUT',
      path: '/api/admin/config',
    },
  ],
  title: 'Rotas com mais erros',
}

const columnHelper = createDataTableColumnHelper<DataTable1Row>()

const DataTable1 = (props: DataTable1Props) => {
  const {
    description,
    empty = 'Nenhuma rota com findings abertos.',
    onSelect,
    rows,
    title,
  } = props

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor('path', {
          header: 'Rota',
          meta: { primary: true, truncate: true },
          cell: ({ row }) =>
            onSelect ? (
              <button
                type='button'
                className='block min-w-0 max-w-full truncate text-left font-mono text-xs hover:underline'
                onClick={() => onSelect(row.original.id)}
              >
                {row.original.path}
              </button>
            ) : (
              <span className='block truncate font-mono text-xs'>
                {row.original.path}
              </span>
            ),
        }),
        columnHelper.accessor('method', {
          cell: ({ row }) => (
            <StatusBadge
              hideIcon
              status={METHOD_STATUS[row.original.method]}
              label={row.original.method}
            />
          ),
          header: 'Método',
        }),
        columnHelper.accessor('environment', {
          cell: ({ getValue }) => getValue() || '—',
          header: 'Ambiente',
          meta: { truncate: true },
        }),
        columnHelper.accessor('findings', {
          cell: ({ getValue }) => getValue().toLocaleString('pt-BR'),
          header: 'Findings',
          meta: { align: 'end' },
        }),
        columnHelper.accessor('blockers', {
          cell: ({ getValue }) => {
            const value = getValue()
            return (
              <span className={value > 0 ? 'text-destructive font-medium' : undefined}>
                {value.toLocaleString('pt-BR')}
              </span>
            )
          },
          header: 'Critical / High',
          meta: { align: 'end' },
        }),
      ]),
    [onSelect],
  )

  const table = useDataTable({
    columns,
    data: rows,
    getRowId: (row) => row.id,
    initialState: { sorting: [{ desc: true, id: 'findings' }] },
  })

  return (
    <Card className='@container/data-table gap-0 pb-0'>
      <CardHeader className='border-b'>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <DataTableSortMenu className='@2xl/data-table:hidden' table={table} />
        </CardAction>
      </CardHeader>
      <DataTableContent
        caption={`${title}, ${description.toLowerCase()}`}
        empty={empty}
        table={table}
      />
    </Card>
  )
}

export {
  DataTable1,
  exampleProps as dataTable1ExampleProps,
  type DataTable1Props,
  type DataTable1Row,
}
