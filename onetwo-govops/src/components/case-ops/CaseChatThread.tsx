'use client'

import { useEffect, useRef } from 'react'
import { CaseChatMessage } from './CaseChatMessage'
import type { CaseMessage, ThreadType } from '@/types/caseChat'

interface Props {
  messages: CaseMessage[]
  isLoading: boolean
  activeThread: ThreadType
}

export function CaseChatThread({ messages, isLoading, activeThread }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-xs text-[#929da8]">Loading...</div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1">
      {activeThread === 'internal' && (
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-px bg-[#e6e8eb]" />
          <span className="text-[10px] text-[#929da8] bg-[#f8f9fa] border border-[#e6e8eb] rounded px-2 py-0.5">
            Internal — board &amp; PM only
          </span>
          <div className="flex-1 h-px bg-[#e6e8eb]" />
        </div>
      )}

      {messages.length === 0 && (
        <div className="flex-1 flex items-center justify-center py-8">
          <p className="text-xs text-[#929da8]">No messages yet</p>
        </div>
      )}

      {messages.map((msg) => (
        <CaseChatMessage key={msg.id} message={msg} />
      ))}

      <div ref={bottomRef} />
    </div>
  )
}
