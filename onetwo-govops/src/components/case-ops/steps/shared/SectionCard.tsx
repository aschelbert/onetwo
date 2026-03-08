'use client'

interface SectionCardProps {
  title: string
  badge: { label: string; variant: 'confirmed' | 'warn' | 'pending' | 'risk_high' }
  isConfirmed: boolean
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}

const badgeStyles: Record<SectionCardProps['badge']['variant'], string> = {
  confirmed: 'bg-[#ecfdf5] text-[#047857]',
  warn: 'bg-[#fef9c3] text-[#a16207]',
  pending: 'bg-[#f8f9fa] text-[#929da8]',
  risk_high: 'bg-[#fef2f2] text-[#d12626]',
}

export function SectionCard({ title, badge, isConfirmed, isOpen, onToggle, children }: SectionCardProps) {
  return (
    <div className="bg-white border border-[#e6e8eb] rounded-[10px] overflow-hidden mb-2 hover:shadow-sm transition-shadow">
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-3.5 py-[11px] cursor-pointer"
        onClick={onToggle}
      >
        {/* Checkbox */}
        {isConfirmed ? (
          <div className="w-4 h-4 rounded bg-[#047857] border border-[#047857] flex items-center justify-center text-white text-[10px] shrink-0">
            ✓
          </div>
        ) : (
          <div className="w-4 h-4 rounded border-[1.5px] border-[#e6e8eb] shrink-0" />
        )}

        {/* Title */}
        <span className="text-[13px] font-semibold text-[#1a1f25] flex-1">{title}</span>

        {/* Badge */}
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badgeStyles[badge.variant]}`}>
          {badge.label}
        </span>

        {/* Chevron */}
        <span className={`text-[#929da8] text-[10px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </div>

      {/* Body */}
      {isOpen && (
        <div className="px-3.5 pb-3.5 border-t border-[#f8f9fa]">
          {children}
        </div>
      )}
    </div>
  )
}
