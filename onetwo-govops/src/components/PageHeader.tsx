import type { ReactNode } from 'react'

interface Grade {
  value: string
  label: string
  color?: string
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  grades?: Grade[]
  action?: ReactNode
}

export function PageHeader({ title, subtitle, grades, action }: PageHeaderProps) {
  return (
    <div
      className="rounded-xl px-[26px] py-[22px] text-white shadow-sm"
      style={{
        background: 'linear-gradient(135deg, #0D1B2E 0%, #123352 55%, #155E75 100%)',
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold leading-tight">{title}</h1>
          {subtitle && (
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {grades?.map((g, i) => (
            <div
              key={i}
              className="text-center rounded-lg px-4 py-2"
              style={{ background: 'rgba(255,255,255,0.10)' }}
            >
              <p className="text-lg font-bold" style={{ color: g.color || '#fff' }}>
                {g.value}
              </p>
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {g.label}
              </p>
            </div>
          ))}
          {action}
        </div>
      </div>
    </div>
  )
}
