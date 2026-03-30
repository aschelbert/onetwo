'use client'

import { useTenant } from '@/lib/tenant-context'
import type { CaseMessage } from '@/types/caseChat'

interface Props { message: CaseMessage }

export function CaseChatMessage({ message }: Props) {
  const { user } = useTenant()
  const isOwn = message.sender_id === user?.id
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  // System/event messages — centered timeline entries
  if (message.msg_type === 'event' || message.msg_type === 'step_complete' || message.msg_type === 'status_change') {
    return (
      <div className="flex items-center gap-2 py-1.5 my-0.5">
        <div className="flex-1 h-px bg-[#e6e8eb]" />
        <div className="flex items-center gap-1.5 bg-[#f8f9fa] border border-[#e6e8eb] rounded-md px-2.5 py-1.5 max-w-[85%]">
          <span className="text-[10px] font-semibold text-[#45505a]">{message.body}</span>
          <span className="text-[9px] text-[#929da8]">{time}</span>
        </div>
        <div className="flex-1 h-px bg-[#e6e8eb]" />
      </div>
    )
  }

  // Note messages — left-aligned, no avatar, distinct style
  if (message.msg_type === 'note') {
    return (
      <div className="my-0.5 bg-amber-50 border border-amber-100 border-l-2 border-l-amber-400 rounded-r-lg px-2.5 py-2">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] font-semibold text-amber-700">Note</span>
          <span className="text-[9px] text-[#929da8]">{message.sender_name}</span>
          <span className="text-[9px] text-[#929da8]">{time}</span>
        </div>
        <p className="text-[12px] text-[#45505a]">{message.body}</p>
      </div>
    )
  }

  // Standard messages — board/PM right-aligned, owner left-aligned
  const isBoard = message.sender_role === 'board' || message.sender_role === 'pm'
  const initials = message.sender_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className={`flex items-end gap-1.5 my-0.5 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold mb-0.5 ${
        isBoard
          ? 'bg-[#0f1b2d] text-cyan-200'
          : 'bg-red-50 text-red-600 border border-red-100'
      }`}>
        {initials}
      </div>
      <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        {!isOwn && (
          <span className="text-[10px] text-[#929da8] px-1">{message.sender_name}</span>
        )}
        <div className={`px-2.5 py-2 rounded-xl text-[12px] leading-relaxed ${
          isOwn
            ? 'bg-[#0f1b2d] text-white/90 rounded-br-sm'
            : 'bg-[#f8f9fa] border border-[#e6e8eb] text-[#1a1f25] rounded-bl-sm'
        }`}>
          {message.body}
          {message.attachment_name && (
            <a
              href={message.attachment_url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-1.5 text-[10px] underline opacity-70"
            >
              {message.attachment_name}
            </a>
          )}
        </div>
        <span className="text-[9px] text-[#929da8] px-1">{time}</span>
      </div>
    </div>
  )
}
