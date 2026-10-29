'use client'

import { useState, useRef } from 'react'
import type { ThreadType } from '@/types/caseChat'
import { useTenant } from '@/lib/tenant-context'
import { RecordVoteDialog } from './inline-actions/RecordVoteDialog'
import { FormalNoticeDialog } from './inline-actions/FormalNoticeDialog'
import { CertifiedMailDialog } from './inline-actions/CertifiedMailDialog'
import { ChatAttachButton } from './inline-actions/ChatAttachButton'

interface Props {
  activeThread: ThreadType
  isSending: boolean
  onSend: (body: string, opts?: { msgType?: string; attachmentUrl?: string; attachmentName?: string; eventMeta?: Record<string, unknown> }) => Promise<void>
  caseId: string
}

export function CaseChatInput({ activeThread, isSending, onSend, caseId }: Props) {
  const { tenancy } = useTenant()
  const tenantId = tenancy.id
  const [body, setBody] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isInternal = activeThread === 'internal'
  const [activeDialog, setActiveDialog] = useState<'vote' | 'notice' | 'certified' | null>(null)

  const handleSend = async () => {
    if (!body.trim() || isSending) return
    await onSend(body)
    setBody('')
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleNote = async () => {
    if (!body.trim() || isSending) return
    await onSend(body, { msgType: 'note' })
    setBody('')
  }

  const handleAttached = async (attachmentUrl: string, attachmentName: string) => {
    await onSend(`Attached: ${attachmentName}`, { attachmentUrl, attachmentName })
  }

  const handleVoteClosed = async (_vote: unknown, summary: string) => {
    await onSend(summary, { msgType: 'event' })
    setActiveDialog(null)
  }

  const handleNoticeSent = async (notice: { recipient_name: string; subject: string }) => {
    await onSend(`Formal notice sent to ${notice.recipient_name}: "${notice.subject}"`, { msgType: 'event' })
    setActiveDialog(null)
  }

  return (
    <div className="flex-shrink-0 border-t border-[#e6e8eb] p-2.5">
      {/* Context indicator */}
      <div className="flex items-center gap-1.5 mb-2 text-[10px] text-[#929da8]">
        <div className={`w-1.5 h-1.5 rounded-full ${isInternal ? 'bg-[#45505a]' : 'bg-red-500'}`} />
        {isInternal ? 'Internal — board & PM only' : 'Owner thread — formal record'}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {isInternal ? (
          <>
            <button onClick={handleNote} className="text-[10px] px-2 py-1 rounded border border-[#e6e8eb] bg-[#f8f9fa] text-[#45505a] hover:border-[#929da8]">
              + Note
            </button>
            <button onClick={() => setActiveDialog('vote')} className="text-[10px] px-2 py-1 rounded border border-[#e6e8eb] bg-[#f8f9fa] text-[#45505a] hover:border-[#929da8]">
              Record vote
            </button>
            <ChatAttachButton caseId={caseId} tenantId={tenantId} onAttached={handleAttached} />
          </>
        ) : (
          <>
            <button onClick={() => setActiveDialog('notice')} className="text-[10px] px-2 py-1 rounded border border-[#e6e8eb] bg-[#f8f9fa] text-[#45505a] hover:border-[#929da8]">
              Formal notice
            </button>
            <button onClick={() => setActiveDialog('certified')} className="text-[10px] px-2 py-1 rounded border border-[#e6e8eb] bg-[#f8f9fa] text-[#45505a] hover:border-[#929da8]">
              Certified mail
            </button>
          </>
        )}
      </div>

      {/* Compose row */}
      <div className="flex items-end gap-1.5">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isInternal ? 'Internal note or message... (Cmd+Enter to send)' : 'Message to owner...'}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-[#e6e8eb] bg-[#f8f9fa] px-2.5 py-2 text-[12px] text-[#1a1f25] placeholder:text-[#929da8] outline-none focus:border-[#929da8] focus:bg-white transition-colors min-h-[34px]"
          style={{ maxHeight: 100, overflowY: 'auto' }}
        />
        <button
          onClick={handleSend}
          disabled={!body.trim() || isSending}
          className="w-8 h-8 rounded-lg bg-[#0f1b2d] flex items-center justify-center flex-shrink-0 disabled:opacity-40"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="rgba(165,243,252,0.9)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2L2 7l4.5 4.5L14 2z"/>
            <path d="M6.5 11.5V14l2.5-2.5"/>
          </svg>
        </button>
      </div>

      {/* Dialogs */}
      <RecordVoteDialog
        open={activeDialog === 'vote'}
        onClose={() => setActiveDialog(null)}
        caseId={caseId}
        tenantId={tenantId}
        onVoteClosed={handleVoteClosed}
      />
      <FormalNoticeDialog
        open={activeDialog === 'notice'}
        onClose={() => setActiveDialog(null)}
        caseId={caseId}
        tenantId={tenantId}
        onNoticeSent={handleNoticeSent}
      />
      <CertifiedMailDialog
        open={activeDialog === 'certified'}
        onClose={() => setActiveDialog(null)}
        caseId={caseId}
        tenantId={tenantId}
      />
    </div>
  )
}
