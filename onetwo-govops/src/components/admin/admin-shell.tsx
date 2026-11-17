'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

interface AdminShellProps {
  user: Record<string, unknown>
  profile: Record<string, unknown> | null
  children: React.ReactNode
}

export function AdminShell({ user, profile, children }: AdminShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const [onCallWaiting, setOnCallWaiting] = useState<number | undefined>(undefined)

  // While a console is open, look for buildings waiting for an On Call
  // advisor once a minute. The check opens their support threads, so they
  // show up without anyone reloading a page.
  useEffect(() => {
    let stopped = false
    let last: number | undefined
    const check = () => {
      if (document.visibilityState === 'hidden') return
      fetch('/api/admin/on-call')
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (stopped || !data?.rows) return
          const waiting = (data.rows as { status: string }[]).filter(r => r.status === 'requested').length
          setOnCallWaiting(waiting)
          // Re-render the page in view when something changed since the last look.
          if (data.opened > 0 || (last !== undefined && last !== waiting)) router.refresh()
          last = waiting
        })
        .catch(() => undefined)
    }
    check()
    const timer = setInterval(check, 60_000)
    return () => { stopped = true; clearInterval(timer) }
  }, [router])

  // Auto-close sidebar on navigation
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onCallWaiting={onCallWaiting} />
      <div className="flex-1 flex flex-col overflow-hidden ml-0 md:ml-60">
        <Topbar
          user={user}
          profile={profile}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
