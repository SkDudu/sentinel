'use client'

import { SegmentedProgressBar } from '@/components/dashboardblocks/progress-bar'
import {
  UsageMeterLimit,
  UsageMeterValue,
  UsageStatusBadge,
  formatUsage,
  getUsageStatus,
} from '@/components/dashboardblocks/usage-meter'

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface StorageCategory {
  color?: string
  label: string
  value: number
}

interface UsageMeter5Props {
  /** Largest first reads best. Optional color overrides chart cycle. */
  categories: StorageCategory[]
  description?: string
  limit: number
  title: string
  unit: string
}

const exampleProps: UsageMeter5Props = {
  categories: [
    { label: 'CRITICAL', value: 4 },
    { label: 'HIGH', value: 12 },
    { label: 'MEDIUM', value: 28 },
    { label: 'LOW', value: 9 },
    { label: 'INFO', value: 3 },
  ],
  description: 'Findings abertos por severidade',
  limit: 56,
  title: 'Severidade',
  unit: 'findings',
}

const DEFAULT_COLORS = [
  'var(--destructive)',
  'var(--warning)',
  'var(--chart-1)',
  'var(--chart-3)',
  'color-mix(in oklab, var(--muted-foreground) 55%, transparent)',
]

const percent = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
  style: 'percent',
})

const UsageMeter5 = (props: UsageMeter5Props) => {
  const { categories, description, limit, title, unit } = props
  const used = categories.reduce((sum, category) => sum + category.value, 0)
  const safeLimit = limit > 0 ? limit : Math.max(used, 1)
  const remaining = Math.max(0, safeLimit - used)
  const composition = used > 0 && remaining === 0
  const blockers = categories
    .filter(
      (category) =>
        category.label === 'CRITICAL' || category.label === 'HIGH',
    )
    .reduce((sum, category) => sum + category.value, 0)
  const status = composition
    ? getUsageStatus(blockers, used, { warning: 20, critical: 40 })
    : getUsageStatus(used, safeLimit)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description ??
            (remaining > 0
              ? `${formatUsage(remaining, unit)} restantes`
              : `${formatUsage(used, unit)} abertos`)}
        </CardDescription>
        <CardAction>
          <UsageStatusBadge status={status} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <UsageMeterValue>{formatUsage(used, unit)}</UsageMeterValue>
            <UsageMeterLimit>de {formatUsage(safeLimit, unit)}</UsageMeterLimit>
          </div>
          <SegmentedProgressBar
            className="h-2.5 gap-0.5"
            segments={categories.map((category, index) => ({
              color:
                category.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length],
              label: category.label,
              value: category.value,
            }))}
            total={safeLimit}
          />
        </div>
        <ul className="flex flex-col gap-2.5">
          {categories.map((category, index) => (
            <li
              key={category.label}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-[3px]"
                  style={{
                    backgroundColor:
                      category.color ??
                      DEFAULT_COLORS[index % DEFAULT_COLORS.length],
                  }}
                />
                <span className="truncate">{category.label}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3 tabular-nums">
                <span>{formatUsage(category.value, unit)}</span>
                <span className="text-muted-foreground w-10 text-right">
                  {percent.format(
                    safeLimit > 0 ? category.value / safeLimit : 0,
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export {
  UsageMeter5,
  exampleProps as usageMeter5ExampleProps,
  type StorageCategory,
  type UsageMeter5Props,
}
