'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, BellOff, Menu } from 'lucide-react'
import { usePushNotifications } from '@/hooks/use-push-notifications'

const pageTitles: Record<string, [string, string]> = {
  '/admin/dashboard': ['Dashboard', 'Admin Console > Overview'],
  '/admin': ['Dashboard', 'Admin Console > Overview'],
  '/admin/subscriptions': ['Subscriptions', 'Admin Console > Product > Subscriptions'],
  '/admin/modules': ['Module Registry', 'Admin Console > Product > Modules'],
  '/admin/simulator': ['Permission Simulator', 'Admin Console > Product > Simulator'],
  '/admin/console-users': ['Console Users', 'Admin Console > Access Control > Console Users'],
  '/admin/console-permissions': ['Console Permissions', 'Admin Console > Access Control > Console Permissions'],
  '/admin/roles': ['User Roles', 'Admin Console > Access Control > Roles'],
  '/admin/tenancies': ['Tenancies', 'Admin Console > Operations > Tenancies'],
  '/admin/support': ['Support', 'Admin Console > Operations > Support'],
  '/admin/feedback': ['Feedback', 'Admin Console > Operations > Feedback'],
  '/admin/problems': ['Problem Statements', 'Admin Console > Operations > Problem Statements'],
  '/admin/billing': ['Billing Events', 'Admin Console > Operations > Billing'],
  '/admin/audit': ['Audit Log', 'Admin Console > Operations > Audit'],
}

interface TopbarProps {
  user: Record<string, unknown>
  profile: Record<string, unknown> | null
  onMenuClick?: () => void
}

export function Topbar({ profile, onMenuClick }: TopbarProps) {
  const pathname = usePathname()
  const [title, breadcrumb] = pageTitles[pathname] || ['Admin', 'Admin Console']
  const initials = ((profile?.display_name as string) || (profile?.email as string) || 'PA').slice(0, 2).toUpperCase()
  const { permission, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotifications()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const handleBellClick = () => {
    if (isSubscribed) {
      unsubscribe()
    } else {
      subscribe()
    }
  }

  return (
    <div className="flex justify-between items-center px-4 md:px-8 py-4 bg-white border-b border-gray-200">
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="md:hidden p-1.5 -ml-1.5 text-gray-600 hover:text-gray-900"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
        )}
        <div>
          <div className="font-serif text-xl font-bold">{title}</div>
          <div className="text-xs text-gray-400 mt-0.5 hidden sm:block">{breadcrumb}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {mounted && (
          <button
            onClick={handleBellClick}
            disabled={isLoading || permission === 'denied'}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={
              permission === 'denied'
                ? 'Notifications blocked in browser settings'
                : isSubscribed
                  ? 'Disable push notifications'
                  : 'Enable push notifications'
            }
          >
            {isSubscribed ? <Bell size={18} className="text-[#c42030]" /> : <BellOff size={18} />}
          </button>
        )}
        <div className="text-right hidden md:block">
          <div className="text-sm font-semibold">{(profile?.display_name as string) || 'Platform Admin'}</div>
          <div className="text-[0.72rem] text-gray-500">{(profile?.email as string) || ''}</div>
        </div>
        <div className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-bold">
          {initials}
        </div>
      </div>
    </div>
  )
}
