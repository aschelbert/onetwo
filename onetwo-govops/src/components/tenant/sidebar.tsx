'use client'
import { useTenant } from '@/lib/tenant-context'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const MODULE_NAV = [
  { module: 'Dashboard', icon: '📊', href: '' },
  { module: 'Board Room', icon: '⚖️', href: 'board-room' },
  { module: 'The Building', icon: '🏢', href: 'the-building' },
  { module: 'Fiscal Lens', icon: '💰', href: 'fiscal-lens' },
  { module: 'Community Room', icon: '👥', href: 'community-room' },
  { module: 'Association Team', icon: '🔧', href: 'association-team' },
  { module: 'The Archives', icon: '📁', href: 'the-archives' },
  { module: 'Account Management', icon: '👤', href: 'account-mgmt' },
]

export function TenantSidebar() {
  const { tenancy, accessibleModules } = useTenant()
  const pathname = usePathname()
  const basePath = `/app/${tenancy.slug}`

  const visibleNav = MODULE_NAV.filter(
    item => item.module === 'Dashboard' || accessibleModules.includes(item.module)
  )

  return (
    <aside className="w-56 bg-white border-r border-stone-200 flex flex-col">
      <div className="p-4 border-b border-stone-200">
        <div className="flex items-center gap-2">
          <Image src="/onetwo-logo.jpg" alt="ONE two" width={28} height={28} className="w-7 h-7 rounded-lg object-cover" />
          <div className="font-serif text-sm font-bold text-[#c42030]">ONE two</div>
        </div>
        <div className="text-xs text-stone-500 mt-1 truncate">{tenancy.name}</div>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {visibleNav.map(item => {
          const href = item.href ? `${basePath}/${item.href}` : basePath
          const active = item.href
            ? pathname === href || pathname.startsWith(href + '/')
            : pathname === basePath
          return (
            <Link key={item.module} href={href}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                ${active ? 'bg-stone-100 text-stone-900 font-medium' : 'text-stone-600 hover:bg-stone-50'}`}>
              <span>{item.icon}</span>
              <span>{item.module}</span>
            </Link>
          )
        })}
      </nav>
      <div className="p-4 border-t border-stone-200">
        <Link href="/auth/logout" className="text-xs text-stone-400 hover:text-stone-600">Sign out</Link>
      </div>
    </aside>
  )
}
