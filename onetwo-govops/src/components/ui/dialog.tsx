'use client'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

const sizes: Record<string, string> = {
  sm: 'max-w-[480px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[860px]',
  xl: 'max-w-[1100px]',
}

export function Dialog({ open, onClose, title, children, footer, size = 'md' }: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div ref={overlayRef} className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4" onClick={(e) => { if (e.target === overlayRef.current) onClose() }}>
      <div className={cn('bg-white rounded-xl w-full shadow-2xl max-h-[90vh] overflow-y-auto', sizes[size])}>
        <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center">
          <h3 className="font-serif text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}
