'use client'

import type { ReactNode } from 'react'
import {
  CircleCheckIcon,
  CircleXIcon,
  OctagonAlertIcon,
  TriangleAlertIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'

type UsageStatus = 'ok' | 'warning' | 'critical' | 'over'

interface UsageThresholds {
  /** Share of the limit, in percent, from which usage is critical. @default 95 */
  critical?: number
  /** Share of the limit, in percent, from which usage is nearing it. @default 80 */
  warning?: number
}

/** Used over the limit, in percent. Not capped, so overage reads as over 100. */
function getUsageShare(used: number, limit: number) {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return 0
  return (Math.max(0, used) / limit) * 100
}

/** Within limit, nearing it, critical or over it. */
function getUsageStatus(
  used: number,
  limit: number,
  { critical = 95, warning = 80 }: UsageThresholds = {},
): UsageStatus {
  const share = getUsageShare(used, limit)
  if (share > 100) return 'over'
  if (share >= critical) return 'critical'
  if (share >= warning) return 'warning'
  return 'ok'
}

const numberFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 1,
})
const compactFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 1,
  notation: 'compact',
})

/**
 * Formats a usage number, optionally with a unit.
 */
function formatUsage(
  value: number,
  unit?: string,
  { compact = false } = {},
) {
  const number = (compact ? compactFormatter : numberFormatter).format(value)
  return unit ? `${number} ${unit}` : number
}

interface UsageStatusConfig {
  color: string
  icon: ReactNode
  label: string
  soft: string
  text: string
}

const usageStatusConfig: Record<UsageStatus, UsageStatusConfig> = {
  critical: {
    color: 'var(--destructive)',
    icon: <OctagonAlertIcon aria-hidden />,
    label: 'Crítico',
    soft: 'bg-red-500/10 text-red-700 dark:text-red-400',
    text: 'text-red-700 dark:text-red-400',
  },
  ok: {
    color: 'var(--primary)',
    icon: <CircleCheckIcon aria-hidden />,
    label: 'Dentro do limite',
    soft: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    text: 'text-emerald-700 dark:text-emerald-400',
  },
  over: {
    color: 'var(--destructive)',
    icon: <CircleXIcon aria-hidden />,
    label: 'Acima do limite',
    soft: 'bg-red-500/10 text-red-700 dark:text-red-400',
    text: 'text-red-700 dark:text-red-400',
  },
  warning: {
    color: 'var(--color-amber-500)',
    icon: <TriangleAlertIcon aria-hidden />,
    label: 'Próximo do limite',
    soft: 'bg-amber-500/10 text-amber-800 dark:text-amber-400',
    text: 'text-amber-800 dark:text-amber-400',
  },
}

function UsageStatusBadge({
  className,
  label,
  status,
}: {
  className?: string
  label?: string
  status: UsageStatus
}) {
  const config = usageStatusConfig[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0',
        config.soft,
        className,
      )}
    >
      {config.icon}
      {label ?? config.label}
    </span>
  )
}

function UsageMeterValue({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'text-2xl font-semibold tracking-tight tabular-nums',
        className,
      )}
    >
      {children}
    </span>
  )
}

function UsageMeterLimit({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cn('text-muted-foreground text-sm', className)}>
      {children}
    </span>
  )
}

export {
  UsageMeterLimit,
  UsageMeterValue,
  UsageStatusBadge,
  formatUsage,
  getUsageShare,
  getUsageStatus,
  usageStatusConfig,
}

export type { UsageStatus, UsageStatusConfig, UsageThresholds }
