'use client'
import { cn } from '@/lib/utils'

export function TabBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-0 border-b-2 border-gray-200 mb-6', className)}>
      {children}
    </div>
  )
}

export function TabButton({ active, children, onClick }: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-2.5 text-[0.82rem] font-medium border-b-2 -mb-[2px] transition-all cursor-pointer bg-transparent border-x-0 border-t-0',
        active
          ? 'text-gray-900 font-semibold border-b-gray-900'
          : 'text-gray-500 border-b-transparent hover:text-gray-700'
      )}
    >
      {children}
    </button>
  )
}
