'use client'

import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { createFormalNotice, updateNoticeStatus } from '@/app/app/[tenancy]/boardroom/cases/[caseId]/inline-actions'
import type { FormalNotice } from '@/types/inline-actions'
import { FileText, Send } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  caseId: string
  tenantId: string
  onNoticeSent?: (notice: FormalNotice) => void
}

export function FormalNoticeDialog({ open, onClose, caseId, tenantId, onNoticeSent }: Props) {
  const [recipientName, setRecipientName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [phase, setPhase] = useState<'compose' | 'preview' | 'sent'>('compose')
  const [notice, setNotice] = useState<FormalNotice | null>(null)

  const reset = () => {
    setRecipientName('')
    setSubject('')
    setBody('')
    setSaving(false)
    setPhase('compose')
    setNotice(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSaveDraft = async () => {
    if (!recipientName.trim() || !subject.trim() || !body.trim()) return
    setSaving(true)
    try {
      const n = await createFormalNotice(caseId, tenantId, {
        noticeType: 'formal_notice',
        recipientName: recipientName.trim(),
        subject: subject.trim(),
        body: body.trim(),
      })
      setNotice(n)
      setPhase('preview')
    } catch (e) {
      console.error('Failed to create notice:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleSend = async () => {
    if (!notice) return
    setSaving(true)
    try {
      await updateNoticeStatus(notice.id, 'sent')
      setNotice({ ...notice, status: 'sent' })
      setPhase('sent')
      onNoticeSent?.({ ...notice, status: 'sent' })
    } catch (e) {
      console.error('Failed to send notice:', e)
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full rounded-lg border border-[#e6e8eb] bg-[#f8f9fa] px-3 py-2 text-[13px] text-[#1a1f25] outline-none focus:border-[#929da8] focus:bg-white transition-colors'
  const labelClass = 'block text-[11px] font-semibold text-[#45505a] mb-1'

  // ── Sent confirmation ──
  if (phase === 'sent') {
    return (
      <Dialog open={open} onClose={handleClose} title="Notice Sent" size="sm">
        <div className="text-center py-4">
          <div className="w-12 h-12 rounded-full bg-[#ecfdf5] flex items-center justify-center mx-auto mb-3">
            <Send size={20} className="text-[#047857]" />
          </div>
          <p className="text-[14px] font-semibold text-[#1a1f25] mb-1">Formal notice sent</p>
          <p className="text-[12px] text-[#6e7b8a]">To {notice?.recipient_name} — {notice?.subject}</p>
        </div>
      </Dialog>
    )
  }

  // ── Preview before send ──
  if (phase === 'preview' && notice) {
    return (
      <Dialog
        open={open}
        onClose={handleClose}
        title="Review Notice"
        size="sm"
        footer={
          <>
            <button onClick={() => setPhase('compose')} className="px-4 py-2 text-[13px] text-[#6e7b8a] hover:text-[#45505a] transition-colors">
              Edit
            </button>
            <button
              onClick={handleSend}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#d12626] text-white rounded-lg text-[13px] font-medium disabled:opacity-40 hover:bg-[#b91c1c] transition-colors"
            >
              <Send size={13} />
              {saving ? 'Sending...' : 'Send Notice'}
            </button>
          </>
        }
      >
        <div className="border border-[#e6e8eb] rounded-lg overflow-hidden">
          <div className="bg-[#f8f9fa] px-4 py-3 border-b border-[#e6e8eb]">
            <p className="text-[10px] text-[#929da8] uppercase tracking-[0.08em]">To</p>
            <p className="text-[13px] font-medium text-[#1a1f25]">{notice.recipient_name}</p>
          </div>
          <div className="bg-[#f8f9fa] px-4 py-3 border-b border-[#e6e8eb]">
            <p className="text-[10px] text-[#929da8] uppercase tracking-[0.08em]">Subject</p>
            <p className="text-[13px] font-medium text-[#1a1f25]">{notice.subject}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[13px] text-[#1a1f25] whitespace-pre-wrap">{notice.body}</p>
          </div>
        </div>
      </Dialog>
    )
  }

  // ── Compose form ──
  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Formal Notice"
      size="sm"
      footer={
        <>
          <button onClick={handleClose} className="px-4 py-2 text-[13px] text-[#6e7b8a] hover:text-[#45505a] transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSaveDraft}
            disabled={!recipientName.trim() || !subject.trim() || !body.trim() || saving}
            className="px-4 py-2 bg-[#0f1b2d] text-white rounded-lg text-[13px] font-medium disabled:opacity-40 hover:bg-[#1a2a40] transition-colors"
          >
            {saving ? 'Saving...' : 'Preview Notice'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <FileText size={16} className="text-[#6e7b8a]" />
          <span className="text-[12px] text-[#6e7b8a]">Draft a formal notice to the unit owner</span>
        </div>
        <div>
          <label className={labelClass}>Recipient Name</label>
          <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="John Smith" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Subject</label>
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Notice of assessment delinquency" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Dear Mr. Smith,&#10;&#10;This letter is to formally notify you that..."
            rows={6}
            className={inputClass + ' resize-none'}
          />
        </div>
      </div>
    </Dialog>
  )
}
