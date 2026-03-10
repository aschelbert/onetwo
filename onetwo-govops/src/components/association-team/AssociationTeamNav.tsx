'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTenant } from '@/lib/tenant-context'
import { cn } from '@/lib/utils'

const TABS = [
  { label: 'Property Log', segment: 'property-log', implemented: true },
  { label: 'PM Scorecard', segment: 'pm-scorecard', implemented: true },
  { label: 'Task Tracking', segment: 'task-tracking', implemented: true },
  { label: 'PM Tools', segment: 'pm-tools', implemented: false },
  { label: 'Staff Scorecard', segment: 'staff-scorecard', implemented: false },
  { label: 'Payroll & 1099s', segment: 'payroll-1099s', implemented: false },
]

export function AssociationTeamNav() {
  const pathname = usePathname()
  const { tenancy } = useTenant()
  const basePath = `/app/${tenancy.slug}/association-team`

  return (
    <div className="flex gap-0 border-b-2 border-gray-200 mb-6">
      {TABS.map((tab) => {
        const href = `${basePath}/${tab.segment}`
        const active = pathname.startsWith(href)

        return (
          <Link
            key={tab.segment}
            href={href}
            className={cn(
              'px-4 py-2.5 text-[0.82rem] font-medium border-b-2 -mb-[2px] transition-all no-underline inline-flex items-center gap-1.5',
              active
                ? 'text-gray-900 font-semibold border-b-gray-900'
                : 'text-gray-500 border-b-transparent hover:text-gray-700'
            )}
          >
            {tab.label}
            {!tab.implemented && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[0.6rem] font-semibold bg-gray-100 text-gray-500">
                Soon
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
