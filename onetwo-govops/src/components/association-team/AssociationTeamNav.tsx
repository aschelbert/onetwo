'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useTenant } from '@/lib/tenant-context'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const TABS = [
  { label: 'Property Log', segment: 'property-log', implemented: true },
  { label: 'PM Scorecard', segment: 'pm-scorecard', implemented: true },
  { label: 'Task Tracking', segment: 'task-tracking', implemented: true },
  { label: 'Communications', segment: 'communications', implemented: true },
  { label: 'PM Tools', segment: 'pm-tools', implemented: false },
  { label: 'Staff Scorecard', segment: 'staff-scorecard', implemented: false },
  { label: 'Payroll & 1099s', segment: 'payroll-1099s', implemented: false },
]

export function AssociationTeamNav() {
  const pathname = usePathname()
  const { tenancy, user } = useTenant()
  const basePath = `/app/${tenancy.slug}/association-team`
  const [unreadCount, setUnreadCount] = useState(0)

  // Fetch unread count for Communications tab badge
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function fetchUnread() {
      // Get tenant_users.id for current user
      const { data: tu } = await (supabase as any)
        .from('tenant_users')
        .select('id')
        .eq('user_id', user.id)
        .single()
      if (!tu || cancelled) return

      const { data: messages } = await (supabase as any)
        .from('team_messages')
        .select('id, read_by, sender_id')
        .neq('sender_id', tu.id)

      if (cancelled || !messages) return
      const count = messages.filter(
        (m: { read_by: string[]; sender_id: string }) => !m.read_by?.includes(tu.id)
      ).length
      setUnreadCount(count)
    }

    fetchUnread()

    // Subscribe to new messages to update badge
    const channel = supabase
      .channel('nav-team-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_messages' }, () => {
        fetchUnread()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'team_messages' }, () => {
        fetchUnread()
      })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [user.id])

  return (
    <div className="flex gap-0 border-b-2 border-gray-200 mb-6 overflow-x-auto">
      {TABS.map((tab) => {
        const href = `${basePath}/${tab.segment}`
        const active = pathname.startsWith(href)

        return (
          <Link
            key={tab.segment}
            href={href}
            className={cn(
              'px-4 py-2.5 text-[0.82rem] font-medium border-b-2 -mb-[2px] transition-all no-underline inline-flex items-center gap-1.5 whitespace-nowrap',
              active
                ? 'text-gray-900 font-semibold border-b-gray-900'
                : 'text-gray-500 border-b-transparent hover:text-gray-700'
            )}
          >
            {tab.label}
            {tab.segment === 'communications' && unreadCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[0.6rem] font-bold bg-[#D62839] text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
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
