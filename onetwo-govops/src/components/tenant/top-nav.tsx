'use client'
import { useState, useEffect, useRef } from 'react'
import { useTenant } from '@/lib/tenant-context'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HelpCircle, LogOut } from 'lucide-react'

const MODULE_NAV = [
  { module: 'Dashboard', href: '' },
  { module: 'Board Room', href: 'board-room' },
  { module: 'The Building', href: 'the-building' },
  { module: 'Fiscal Lens', href: 'fiscal-lens' },
  { module: 'Community Room', href: 'community-room' },
  { module: 'Association Team', href: 'association-team' },
  { module: 'The Archives', href: 'the-archives' },
]

export function TopNav() {
  const { tenancy, user, accessibleModules } = useTenant()
  const pathname = usePathname()
  const basePath = `/app/${tenancy.slug}`
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  const visibleNav = MODULE_NAV.filter(
    item => item.module === 'Dashboard' || accessibleModules.includes(item.module)
  )

  function isActive(item: { href: string }) {
    const href = item.href ? `${basePath}/${item.href}` : basePath
    return item.href
      ? pathname === href || pathname.startsWith(href + '/')
      : pathname === basePath
  }

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Close mobile menu on route change
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const initials = user.display_name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <nav className="sticky top-0 z-50 bg-[#0D1B2E]" style={{ height: 58 }}>
      <div className="flex items-center h-full px-4">
        {/* Left: Logo */}
        <Link href={basePath} className="flex-shrink-0">
          <img
            src="/onetwo-logo-mark.jpg"
            alt="ONE two"
            className="h-10 w-10 object-contain rounded-lg"
          />
        </Link>

        {/* Hamburger (visible below 1080px) */}
        <div ref={menuRef} className="min-[1080px]:hidden ml-3">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex flex-col justify-center gap-[5px] w-8 h-8 cursor-pointer bg-transparent border-none"
            aria-label="Toggle navigation"
          >
            <span className={`block h-[2px] w-5 bg-white rounded transition-transform ${menuOpen ? 'translate-y-[7px] rotate-45' : ''}`} />
            <span className={`block h-[2px] w-5 bg-white rounded transition-opacity ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block h-[2px] w-5 bg-white rounded transition-transform ${menuOpen ? '-translate-y-[7px] -rotate-45' : ''}`} />
          </button>
        </div>

        {/* Desktop nav items (hidden below 1080px) */}
        <div className="hidden min-[1080px]:flex items-center ml-6 gap-1 h-full">
          {visibleNav.map(item => {
            const href = item.href ? `${basePath}/${item.href}` : basePath
            const active = isActive(item)
            return (
              <Link
                key={item.module}
                href={href}
                className={`relative flex items-center px-3 h-full text-sm no-underline transition-colors whitespace-nowrap
                  ${active ? 'text-white font-medium' : 'text-white/48 hover:text-white/72'}`}
              >
                {item.module}
                {active && (
                  <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-[#A5F3FC] rounded-full" />
                )}
              </Link>
            )
          })}
        </div>

        {/* Right side: spacer + user info + avatar */}
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden sm:block text-right">
            <div className="text-xs text-white/48 leading-tight">{tenancy.name}</div>
            <div className="text-xs text-white/72 leading-tight">{user.role_name}</div>
          </div>

          <div ref={profileRef} className="relative">
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="w-9 h-9 rounded-full bg-[#A5F3FC]/16 flex items-center justify-center text-xs font-semibold text-[#A5F3FC] cursor-pointer border-2 border-[#A5F3FC]/32 hover:border-[#A5F3FC]/64 transition-colors"
            >
              {initials}
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-stone-200 rounded-lg shadow-lg z-50 py-1">
                <div className="px-3 py-2 border-b border-stone-100">
                  <div className="text-sm font-medium text-stone-800">{user.display_name}</div>
                  <div className="text-xs text-stone-400">{user.role_name}</div>
                </div>
                <Link
                  href={`/app/${tenancy.slug}/support`}
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-stone-600 hover:bg-stone-50 transition-colors no-underline"
                >
                  <HelpCircle size={15} className="text-stone-400" />
                  Help & Support
                </Link>
                <Link
                  href="/auth/logout"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-stone-600 hover:bg-stone-50 transition-colors no-underline"
                >
                  <LogOut size={15} className="text-stone-400" />
                  Sign out
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="min-[1080px]:hidden bg-[#0a1624] border-t border-white/8">
          {visibleNav.map(item => {
            const href = item.href ? `${basePath}/${item.href}` : basePath
            const active = isActive(item)
            return (
              <Link
                key={item.module}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center h-12 px-4 text-sm no-underline transition-colors
                  ${active
                    ? 'text-white font-medium border-l-[3px] border-[#A5F3FC] bg-white/4'
                    : 'text-white/48 border-l-[3px] border-transparent hover:text-white/72 hover:bg-white/4'
                  }`}
              >
                {item.module}
              </Link>
            )
          })}
        </div>
      )}
    </nav>
  )
}
