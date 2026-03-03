'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Package, Grid3X3, Monitor, Users, Building2, CreditCard, ClipboardCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

type NavItem = { href: string; label: string; icon: React.ElementType; count?: number } | { section: string }

const navItems: NavItem[] = [
  { section: 'Overview' },
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { section: 'Product' },
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: Package },
  { href: '/admin/modules', label: 'Module Registry', icon: Grid3X3, count: 8 },
  { href: '/admin/simulator', label: 'Permission Simulator', icon: Monitor },
  { section: 'Access Control' },
  { href: '/admin/roles', label: 'User Roles', icon: Users, count: 4 },
  { section: 'Operations' },
  { href: '/admin/tenancies', label: 'Tenancies', icon: Building2 },
  { href: '/admin/billing', label: 'Billing Events', icon: CreditCard },
  { href: '/admin/audit', label: 'Audit Log', icon: ClipboardCheck },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-60 bg-gray-900 text-white flex flex-col fixed top-0 left-0 bottom-0 z-50 overflow-y-auto">
      <div className="px-4 py-5 border-b border-white/[0.08] flex items-center gap-2.5">
        <div className="w-7 h-7 bg-[#c42030] rounded-lg flex items-center justify-center text-white text-xs font-bold font-serif">1|2</div>
        <div>
          <span className="font-serif text-[1.05rem] font-bold tracking-tight">ONE two</span>
          <small className="block text-[0.65rem] text-gray-500 font-normal uppercase tracking-wider mt-px">Admin Console</small>
        </div>
      </div>
      <nav className="flex-1 py-3 px-2">
        {navItems.map((item, i) => {
          if ('section' in item) {
            return <div key={i} className="px-3 pt-3 pb-1 text-[0.6rem] uppercase tracking-[0.1em] text-gray-500 font-semibold">{item.section}</div>
          }
          const Icon = item.icon
          const active = pathname === item.href || (item.href === '/admin/dashboard' && pathname === '/admin')
          return (
            <Link key={item.href} href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[0.82rem] font-medium transition-all no-underline',
                active ? 'text-white bg-white/10 font-semibold' : 'text-gray-400 hover:text-white hover:bg-white/[0.06]'
              )}>
              <Icon size={18} className="flex-shrink-0" />
              {item.label}
              {item.count !== undefined && (
                <span className="ml-auto bg-[#c42030] text-white text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full">{item.count}</span>
              )}
            </Link>
          )
        })}
      </nav>
      <div className="p-4 border-t border-white/[0.08] text-[0.7rem] text-gray-500 text-center">
        ONE two GovOps Platform<br />Admin Console v2.0
      </div>
    </aside>
  )
}
