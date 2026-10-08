import type { ReactNode } from 'react'

import {
  PageHeader,
  PageHeaderActions,
  PageHeaderHeading,
  PageHeaderRow,
  type PageTab,
  PageTabs,
} from '@/components/dashboardblocks/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { UserPlusIcon } from "lucide-react"

interface PageHeader2Props {
  /** Replaces the default Invite action. */
  actions?: ReactNode
  description: string
  onInvite?: () => void
  /** The current path, used to mark the active tab. */
  pathname: string
  status: string
  tabs: PageTab[]
  tabsLabel?: string
  title: string
}

const exampleProps: PageHeader2Props = {
  description: 'Storefront, checkout and fulfilment for the EU region.',
  pathname: '/projects/acme-store',
  status: 'Live',
  tabs: [
    { href: '/projects/acme-store', title: 'Overview' },
    { badge: 12, href: '/projects/acme-store/orders', title: 'Orders' },
    { href: '/projects/acme-store/customers', title: 'Customers' },
    { badge: 3, href: '/projects/acme-store/issues', title: 'Issues' },
    { href: '/projects/acme-store/settings', title: 'Settings' },
  ],
  title: 'Acme Store',
}

const PageHeader2 = (props: PageHeader2Props) => {
  const {
    actions,
    description,
    onInvite = () => {},
    pathname,
    status,
    tabs,
    tabsLabel = 'Sections',
    title,
  } = props

  return (
    <PageHeader>
      <PageHeaderRow>
        <PageHeaderHeading
          title={title}
          description={description}
          badge={<Badge variant='secondary'>{status}</Badge>}
        />
        <PageHeaderActions>
          {actions ?? (
            <Button variant='outline' onClick={onInvite}>
              <UserPlusIcon data-icon='inline-start' />
              Invite
            </Button>
          )}
        </PageHeaderActions>
      </PageHeaderRow>
      <PageTabs items={tabs} label={tabsLabel} pathname={pathname} />
    </PageHeader>
  )
}

export { PageHeader2, exampleProps as pageHeader2ExampleProps, type PageHeader2Props }
