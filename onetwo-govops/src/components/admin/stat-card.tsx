export function StatCard({ label, value, sub, className }: {
  label: string
  value: string | number
  sub?: string
  className?: string
}) {
  return (
    <div className={`bg-white rounded-[10px] border border-gray-200 p-5 ${className || ''}`}>
      <div className="text-xs text-gray-500 font-medium">{label}</div>
      <div className="text-[1.6rem] font-bold mt-1 font-serif">{value}</div>
      {sub && <div className="text-[0.72rem] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}
