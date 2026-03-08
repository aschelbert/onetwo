'use client'
import { useState, useEffect, useRef } from 'react'
import { useTenant } from '@/lib/tenant-context'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { HelpCircle, LogOut } from 'lucide-react'

export function TenantTopbar() {
  const { user, tenancy } = useTenant()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const segments = pathname.replace(`/app/${tenancy.slug}`, '').split('/').filter(Boolean)
  const pageTitle = segments.length > 0
    ? segments[segments.length - 1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    : 'Dashboard'

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

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
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-3 cursor-pointer bg-transparent border-none p-0"
        >
          <div className="text-right">
            <div className="text-sm font-medium text-stone-700">{user.display_name}</div>
            <div className="text-xs text-stone-400">{user.role_name}</div>
          </div>
          <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-xs font-medium text-stone-600">
            {user.display_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-stone-200 rounded-lg shadow-lg z-50 py-1">
            <div className="px-3 py-2 border-b border-stone-100">
              <div className="text-sm font-medium text-stone-800">{user.display_name}</div>
              <div className="text-xs text-stone-400">{user.role_name}</div>
            </div>
            <Link
              href={`/app/${tenancy.slug}/support`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-stone-600 hover:bg-stone-50 transition-colors no-underline"
            >
              <HelpCircle size={15} className="text-stone-400" />
              Help & Support
            </Link>
            <Link
              href="/auth/logout"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-stone-600 hover:bg-stone-50 transition-colors no-underline"
            >
              <LogOut size={15} className="text-stone-400" />
              Sign out
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
