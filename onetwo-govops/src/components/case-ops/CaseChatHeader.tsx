'use client'

import type { ThreadType } from '@/types/caseChat'

interface Props {
  caseLocalId: string
  caseTitle: string
  caseStatus: string
  activeStep: string
  activeThread: ThreadType
  onSwitchThread: (t: ThreadType) => void
  onClose: () => void
  canSeeInternal: boolean
}

export function CaseChatHeader({ caseLocalId, caseTitle, caseStatus, activeStep, activeThread, onSwitchThread, onClose, canSeeInternal }: Props) {
  return (
    <div className="flex-shrink-0 border-b border-[#e6e8eb]">
      {/* Title row */}
      <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#929da8]">
            <path d="M14 10c0 1.1-.9 2-2 2H4l-3 3V4c0-1.1.9-2 2-2h9c1.1 0 2 .9 2 2v6z"/>
          </svg>
          <span className="text-[13px] font-semibold text-[#1a1f25]">Case Chat</span>
        </div>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-md border border-[#e6e8eb] bg-[#f8f9fa] text-[#929da8] hover:bg-[#e6e8eb] text-sm">
          ✕
        </button>
      </div>

      {/* Case context strip */}
      <div className="mx-3 mb-2 bg-[#f8f9fa] border border-[#e6e8eb] rounded-lg px-2.5 py-2">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[11px] font-semibold text-[#45505a]">{caseLocalId}</span>
          <span className="text-[10px] font-semibold text-[#d12626] bg-red-50 border border-red-100 rounded px-1.5 py-0.5">
            {activeStep}
          </span>
        </div>
        <p className="text-[11px] text-[#929da8] truncate">{caseTitle}</p>
      </div>

      {/* Thread tabs */}
      {canSeeInternal && (
        <div className="flex border-b border-[#e6e8eb]">
          <button
            onClick={() => onSwitchThread('internal')}
            className={`flex-1 py-2 text-[11px] font-semibold border-b-2 transition-colors ${
              activeThread === 'internal'
                ? 'text-[#1a1f25] border-[#1a1f25]'
                : 'text-[#929da8] border-transparent hover:text-[#45505a]'
            }`}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#45505a] mr-1.5 mb-px align-middle" />
            Internal
          </button>
          <button
            onClick={() => onSwitchThread('owner')}
            className={`flex-1 py-2 text-[11px] font-semibold border-b-2 transition-colors ${
              activeThread === 'owner'
                ? 'text-red-600 border-red-500'
                : 'text-[#929da8] border-transparent hover:text-[#45505a]'
            }`}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5 mb-px align-middle" />
            Owner thread
          </button>
        </div>
      )}
    </div>
  )
}
