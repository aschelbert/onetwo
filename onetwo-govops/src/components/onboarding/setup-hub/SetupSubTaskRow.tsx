'use client'

import { Check, ArrowRight } from 'lucide-react'

interface Props {
  label: string
  isComplete: boolean
  navigateTo: string | null
  onNavigate: (path: string) => void
}

export function SetupSubTaskRow({ label, isComplete, navigateTo, onNavigate }: Props) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-[#f8f9fa] transition-colors group">
      <div className="flex items-center gap-3 min-w-0">
        {/* Status indicator */}
        {isComplete ? (
          <div className="w-5 h-5 rounded-full bg-[#047857] flex items-center justify-center shrink-0">
            <Check size={12} className="text-white" strokeWidth={3} />
          </div>
        ) : (
          <div className="w-5 h-5 rounded-full border-[1.5px] border-[#e6e8eb] shrink-0" />
        )}

        <span className={`text-[13px] font-medium truncate ${
          isComplete ? 'text-[#047857]' : 'text-[#1a1f25]'
        }`}>
          {label}
        </span>
      </div>

      {/* Navigation pill */}
      {navigateTo && !isComplete && (
        <button
          onClick={() => onNavigate(navigateTo)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium text-[#d12626] bg-[#fef2f2] hover:bg-[#fde8e8] transition-colors shrink-0 opacity-0 group-hover:opacity-100"
        >
          Go <ArrowRight size={12} />
        </button>
      )}
      {navigateTo && isComplete && (
        <button
          onClick={() => onNavigate(navigateTo)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium text-[#45505a] bg-[#f8f9fa] hover:bg-[#e6e8eb] transition-colors shrink-0 opacity-0 group-hover:opacity-100"
        >
          View <ArrowRight size={12} />
        </button>
      )}
    </div>
  )
}
