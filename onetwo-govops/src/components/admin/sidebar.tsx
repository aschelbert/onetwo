'use client'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Package, Grid3X3, Monitor, Users, UserCog, Shield, Building2, MessageCircle, Lightbulb, CreditCard, ClipboardCheck, ClipboardList, TrendingUp, X } from 'lucide-react'
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
  { href: '/admin/console-users', label: 'Console Users', icon: UserCog },
  { href: '/admin/console-permissions', label: 'Console Permissions', icon: Shield },
  { href: '/admin/roles', label: 'User Roles', icon: Users, count: 4 },
  { section: 'Operations' },
  { href: '/admin/tenancies', label: 'Tenancies', icon: Building2 },
  { href: '/admin/support', label: 'Support', icon: MessageCircle },
  { href: '/admin/feedback', label: 'Feedback', icon: Lightbulb },
  { href: '/admin/problems', label: 'Problem Statements', icon: ClipboardList },
  { href: '/admin/fiscal-lens', label: 'Fiscal Lens', icon: TrendingUp },
  { href: '/admin/billing', label: 'Billing Events', icon: CreditCard },
  { href: '/admin/audit', label: 'Audit Log', icon: ClipboardCheck },
]

interface SidebarProps {
  open?: boolean
  onClose?: () => void
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname()

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside className={cn(
        'w-60 bg-navy text-white flex flex-col fixed top-0 left-0 bottom-0 z-50 overflow-y-auto transition-transform duration-200 ease-in-out',
        // Mobile: slide in/out
        open ? 'translate-x-0' : '-translate-x-full',
        // Desktop: always visible
        'md:translate-x-0'
      )}>
        <div className="px-4 py-5 border-b border-white/[0.08] flex items-center gap-2.5">
          <Image src="/onetwo-logo.jpg" alt="ONE two" width={28} height={28} className="w-7 h-7 rounded-lg object-cover" />
          <div className="flex-1">
            <span className="font-serif text-[1.05rem] font-bold tracking-tight">ONE two</span>
            <small className="block text-[0.65rem] text-gray-500 font-normal uppercase tracking-wider mt-px">Admin Console</small>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden p-1 text-gray-400 hover:text-white"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          )}
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
    </>
  )
}
