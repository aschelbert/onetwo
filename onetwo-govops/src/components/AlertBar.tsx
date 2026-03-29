interface AlertBarProps {
  badge: string
  message: string
  linkText?: string
  onLinkClick?: () => void
}

export function AlertBar({ badge, message, linkText, onLinkClick }: AlertBarProps) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-4 py-3"
      style={{
        background: '#fff0f1',
        borderLeft: '4px solid #D62839',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}
    >
      <span className="shrink-0 rounded-full bg-[#D62839] px-2.5 py-0.5 text-[11px] font-bold text-white">
        {badge}
      </span>
      <p className="text-sm text-[#1a1f25] flex-1">{message}</p>
      {linkText && onLinkClick && (
        <button
          onClick={onLinkClick}
          className="shrink-0 text-sm font-medium text-[#D62839] hover:underline cursor-pointer bg-transparent border-none p-0"
        >
          {linkText}
        </button>
      )}
    </div>
  )
}
