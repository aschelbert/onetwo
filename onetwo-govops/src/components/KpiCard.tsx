interface KpiCardProps {
  label: string
  value: string | number
  sub?: string
  variant?: 'default' | 'warn' | 'ok'
  className?: string
  onClick?: () => void
}

const VARIANT_STYLES = {
  default: 'bg-white border-gray-200',
  warn: 'bg-[#fff8f8] border-[#f0c4c8]',
  ok: 'bg-[#f4fbf9] border-[#b8ddd4]',
} as const

export function KpiCard({ label, value, sub, variant = 'default', className, onClick }: KpiCardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-[10px] border p-5 transition-shadow hover:shadow-md ${VARIANT_STYLES[variant]} ${onClick ? 'cursor-pointer' : ''} ${className || ''}`}
    >
      <div className="text-xs text-gray-500 font-medium">{label}</div>
      <div className="text-[1.6rem] font-bold mt-1 font-serif">{value}</div>
      {sub && <div className="text-[0.72rem] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}
