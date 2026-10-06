'use client'

import {
  BreakdownBar,
  BreakdownLegend,
  formatShare,
} from '@/components/dashboardblocks/breakdown'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface CompositionCategory {
  color: string
  key: string
  label: string
}

interface CompositionGroup {
  label: string
  values: Record<string, number>
}

interface Breakdown2Props {
  categories: CompositionCategory[]
  description: string
  /** Column heading for each group. */
  groupLabel?: string
  groups: CompositionGroup[]
  /** The category whose share is labelled at the end of each row. */
  highlight: string
  title: string
}

const exampleProps: Breakdown2Props = {
  categories: [
    { color: 'var(--chart-2)', key: 'mobile', label: 'Mobile' },
    { color: 'var(--chart-3)', key: 'desktop', label: 'Desktop' },
    { color: 'var(--chart-4)', key: 'tablet', label: 'Tablet' },
  ],
  description: 'Sessions by device, last 30 days',
  groups: [
    { label: 'Asia Pacific', values: { desktop: 9_120, mobile: 21_480, tablet: 1_940 } },
    { label: 'Latin America', values: { desktop: 4_310, mobile: 8_760, tablet: 820 } },
    { label: 'Europe', values: { desktop: 14_920, mobile: 13_410, tablet: 2_310 } },
    {
      label: 'North America',
      values: { desktop: 18_240, mobile: 14_630, tablet: 3_180 },
    },
    { label: 'Africa', values: { desktop: 1_120, mobile: 3_870, tablet: 140 } },
  ],
  highlight: 'mobile',
  title: 'Device mix by region',
}

const Breakdown2 = (props: Breakdown2Props) => {
  const {
    categories,
    description,
    groupLabel = 'Region',
    groups,
    highlight,
    title,
  } = props
  const highlighted = categories.find((category) => category.key === highlight)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-5'>
        <BreakdownLegend
          items={categories.map((category) => ({
            color: category.color,
            label: category.label,
          }))}
        />
        <table className='w-full text-sm'>
          <caption className='sr-only'>{`${title}: ${description}`}</caption>
          <thead className='text-muted-foreground text-xs'>
            <tr>
              <th scope='col' className='pb-2 text-left font-normal'>
                {groupLabel}
              </th>
              <th scope='col' className='pb-2 font-normal'>
                <span className='sr-only'>Composição</span>
              </th>
              <th
                scope='col'
                className='pb-2 text-right font-normal whitespace-nowrap'
              >
                {highlighted?.label}
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const total = categories.reduce(
                (sum, category) => sum + (group.values[category.key] ?? 0),
                0,
              )
              return (
                <tr key={group.label}>
                  <th
                    scope='row'
                    className='max-w-36 truncate py-2 pr-4 text-left font-normal'
                    title={group.label}
                  >
                    {group.label}
                  </th>
                  <td className='w-full py-2'>
                    <BreakdownBar
                      className='h-2.5'
                      segments={categories.map((category) => ({
                        color: category.color,
                        label: category.label,
                        value: group.values[category.key] ?? 0,
                      }))}
                    />
                    <span className='sr-only'>
                      {categories
                        .map(
                          (category) =>
                            `${category.label} ${formatShare(group.values[category.key] ?? 0, total)}`,
                        )
                        .join(', ')}
                    </span>
                  </td>
                  <td className='py-2 pl-4 text-right font-medium whitespace-nowrap tabular-nums'>
                    {formatShare(group.values[highlight] ?? 0, total)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

export { Breakdown2, exampleProps as breakdown2ExampleProps, type Breakdown2Props }
