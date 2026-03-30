'use client'

interface Props {
  isOpen: boolean
  totalUnread: number
  onClick: () => void
}

export function CaseChatToggleButton({ isOpen, totalUnread, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-md border transition-colors ${
        isOpen
          ? 'bg-[#0f1b2d] text-cyan-200 border-[#0f1b2d]'
          : 'bg-[#f8f9fa] text-[#45505a] border-[#e6e8eb] hover:border-[#929da8]'
      }`}
    >
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 10c0 1.1-.9 2-2 2H4l-3 3V4c0-1.1.9-2 2-2h9c1.1 0 2 .9 2 2v6z"/>
      </svg>
      Chat
      {totalUnread > 0 && (
        <span className="bg-red-500 text-white text-[9px] font-bold min-w-[14px] h-3.5 rounded-full px-1 flex items-center justify-center">
          {totalUnread}
        </span>
      )}
    </button>
  )
}
