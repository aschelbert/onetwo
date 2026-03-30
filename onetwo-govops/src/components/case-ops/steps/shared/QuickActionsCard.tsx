'use client'

interface QuickAction {
  label: string
  variant: 'primary' | 'secondary' | 'ghost'
  icon: string
  href?: string
  hint?: string
  onClick?: () => void
}

interface QuickActionsCardProps {
  actions: QuickAction[]
  extraAction?: React.ReactNode
}

const variantStyles: Record<QuickAction['variant'], string> = {
  primary: 'flex items-center gap-2 px-3.5 py-[9px] bg-[#d12626] text-white rounded-lg text-[12.5px] font-semibold',
  secondary: 'flex items-center gap-1.5 px-3 py-2 bg-white text-[#45505a] border-[1.5px] border-[#e6e8eb] rounded-lg text-[12px] font-medium',
  ghost: 'flex items-center gap-1.5 px-3 py-2 bg-transparent text-[#6e7b8a] border-[1.5px] border-[#e6e8eb] rounded-lg text-[12px] font-medium',
}

export function QuickActionsCard({ actions, extraAction }: QuickActionsCardProps) {
  return (
    <div className="bg-white border-[1.5px] border-[#e6e8eb] rounded-[10px] overflow-hidden mb-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-[13px] border-b border-[#f8f9fa]">
        <span className="text-[10px] font-bold text-[#929da8] uppercase tracking-[0.08em]">Quick Actions</span>
      </div>

      {/* Button row */}
      <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
        {actions.map((action) => {
          const Tag = action.href ? 'a' : 'button'
          return (
            <Tag
              key={action.label}
              href={action.href}
              onClick={action.onClick}
              className={variantStyles[action.variant]}
            >
              <span>{action.icon}</span>
              <span>{action.label}</span>
              {action.hint && <span className="text-[10px] text-[#929da8]">{action.hint}</span>}
            </Tag>
          )
        })}
        {extraAction}
      </div>
    </div>
  )
}
