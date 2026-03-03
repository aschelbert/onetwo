'use client'
import { useTenant } from '@/lib/tenant-context'
import { usePathname } from 'next/navigation'

export function TenantTopbar() {
  const { user, tenancy } = useTenant()
  const pathname = usePathname()

  const segments = pathname.replace(`/app/${tenancy.slug}`, '').split('/').filter(Boolean)
  const pageTitle = segments.length > 0
    ? segments[segments.length - 1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    : 'Dashboard'

  return (
    <header className="h-14 border-b border-stone-200 bg-white flex items-center justify-between px-6">
      <div>
        <h1 className="font-serif text-lg font-semibold text-stone-900">{pageTitle}</h1>
        {segments.length > 1 && (
          <div className="text-xs text-stone-400">
            {segments.slice(0, -1).map(s => s.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())).join(' / ')}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-sm font-medium text-stone-700">{user.display_name}</div>
          <div className="text-xs text-stone-400">{user.role_name}</div>
        </div>
        <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-xs font-medium text-stone-600">
          {user.display_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
        </div>
      </div>
    </header>
  )
}
