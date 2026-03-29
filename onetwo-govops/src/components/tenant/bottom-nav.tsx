'use client'
import { useState, useEffect, useRef } from 'react'
import { useTenant } from '@/lib/tenant-context'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, Monitor, BarChart3, Users, MoreHorizontal, Building2, Wrench, Archive } from 'lucide-react'

const TABS = [
  { module: 'Dashboard', href: '', icon: LayoutGrid },
  { module: 'Board Room', href: 'board-room', icon: Monitor },
  { module: 'Fiscal Lens', href: 'fiscal-lens', icon: BarChart3 },
  { module: 'Community Room', href: 'community-room', label: 'Community', icon: Users },
] as const

const MORE_ITEMS = [
  { module: 'The Building', href: 'the-building', icon: Building2 },
  { module: 'Association Team', href: 'association-team', icon: Wrench },
  { module: 'The Archives', href: 'the-archives', icon: Archive },
] as const

export function BottomNav() {
  const { tenancy, accessibleModules } = useTenant()
  const pathname = usePathname()
  const basePath = `/app/${tenancy.slug}`
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

  function isActive(href: string) {
    const full = href ? `${basePath}/${href}` : basePath
    return href
      ? pathname === full || pathname.startsWith(full + '/')
      : pathname === basePath || pathname.startsWith(basePath + '/dashboard')
  }

  const moreActive = MORE_ITEMS.some(item => isActive(item.href))

  useEffect(() => {
    setMoreOpen(false)
  }, [pathname])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const visibleTabs = TABS.filter(
    t => t.module === 'Dashboard' || accessibleModules.includes(t.module)
  )
  const visibleMore = MORE_ITEMS.filter(
    t => accessibleModules.includes(t.module)
  )

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-[#0D1B2E]" style={{ height: 60, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-around h-full px-1">
        {visibleTabs.map(tab => {
          const active = isActive(tab.href)
          const href = tab.href ? `${basePath}/${tab.href}` : basePath
          const Icon = tab.icon
          const label = 'label' in tab ? tab.label : tab.module
          return (
            <Link
              key={tab.module}
              href={href}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 no-underline pt-1"
            >
              <Icon size={20} color={active ? '#A5F3FC' : 'rgba(255,255,255,0.45)'} strokeWidth={active ? 2.2 : 1.8} />
              <span className="text-[10px] leading-tight" style={{ color: active ? '#A5F3FC' : 'rgba(255,255,255,0.45)' }}>
                {label}
              </span>
              {active && <span className="w-1 h-1 rounded-full bg-[#A5F3FC]" />}
            </Link>
          )
        })}

        {/* More tab */}
        {visibleMore.length > 0 && (
          <div ref={moreRef} className="flex flex-col items-center justify-center gap-0.5 flex-1 relative pt-1">
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className="flex flex-col items-center gap-0.5 bg-transparent border-none cursor-pointer p-0"
            >
              <MoreHorizontal size={20} color={moreActive ? '#A5F3FC' : 'rgba(255,255,255,0.45)'} strokeWidth={moreActive ? 2.2 : 1.8} />
              <span className="text-[10px] leading-tight" style={{ color: moreActive ? '#A5F3FC' : 'rgba(255,255,255,0.45)' }}>
                More
              </span>
              {moreActive && <span className="w-1 h-1 rounded-full bg-[#A5F3FC]" />}
            </button>

            {moreOpen && (
              <div className="absolute bottom-full mb-2 right-0 w-52 bg-[#0a1624] border border-white/10 rounded-lg shadow-xl overflow-hidden">
                {visibleMore.map(item => {
                  const active = isActive(item.href)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.module}
                      href={`${basePath}/${item.href}`}
                      onClick={() => setMoreOpen(false)}
                      className={`flex items-center gap-3 px-4 h-12 text-sm no-underline transition-colors
                        ${active
                          ? 'text-[#A5F3FC] bg-white/5 border-l-[3px] border-[#A5F3FC]'
                          : 'text-white/60 hover:text-white/80 hover:bg-white/5 border-l-[3px] border-transparent'
                        }`}
                    >
                      <Icon size={16} />
                      {item.module}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}
