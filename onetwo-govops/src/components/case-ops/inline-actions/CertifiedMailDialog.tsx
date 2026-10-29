'use client'

import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { createFormalNotice, updateNoticeStatus } from '@/app/app/[tenancy]/boardroom/cases/[caseId]/inline-actions'
import type { FormalNotice } from '@/types/inline-actions'
import { Mail } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  caseId: string
  tenantId: string
  onCreated?: (notice: FormalNotice) => void
}

const STATUS_COLORS: Record<FormalNotice['status'], string> = {
  draft: 'bg-[#f8f9fa] text-[#6e7b8a] border-[#e6e8eb]',
  sent: 'bg-blue-50 text-blue-700 border-blue-200',
  delivered: 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]',
  returned: 'bg-red-50 text-[#d12626] border-red-200',
}

export function CertifiedMailDialog({ open, onClose, caseId, tenantId, onCreated }: Props) {
  const [recipientName, setRecipientName] = useState('')
  const [recipientAddress, setRecipientAddress] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<FormalNotice | null>(null)
  const [trackingNumber, setTrackingNumber] = useState('')

  const reset = () => {
    setRecipientName('')
    setRecipientAddress('')
    setSubject('')
    setBody('')
    setSaving(false)
    setNotice(null)
    setTrackingNumber('')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleCreate = async () => {
    if (!recipientName.trim() || !subject.trim() || !body.trim()) return
    setSaving(true)
    try {
      const n = await createFormalNotice(caseId, tenantId, {
        noticeType: 'certified_mail',
        recipientName: recipientName.trim(),
        recipientAddress: recipientAddress.trim() || undefined,
        subject: subject.trim(),
        body: body.trim(),
      })
      setNotice(n)
      onCreated?.(n)
    } catch (e) {
      console.error('Failed to create certified mail:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateStatus = async (status: FormalNotice['status']) => {
    if (!notice) return
    setSaving(true)
    try {
      await updateNoticeStatus(notice.id, status, trackingNumber.trim() || undefined)
      setNotice({ ...notice, status, tracking_number: trackingNumber.trim() || notice.tracking_number })
    } catch (e) {
      console.error('Failed to update status:', e)
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full rounded-lg border border-[#e6e8eb] bg-[#f8f9fa] px-3 py-2 text-[13px] text-[#1a1f25] outline-none focus:border-[#929da8] focus:bg-white transition-colors'
  const labelClass = 'block text-[11px] font-semibold text-[#45505a] mb-1'

  // ── Status tracking view (after creation) ──
  if (notice) {
    return (
      <Dialog open={open} onClose={handleClose} title="Certified Mail Record" size="sm">
        <div className="space-y-4">
          {/* Status badge */}
          <div className="flex items-center gap-2">
            <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-medium border ${STATUS_COLORS[notice.status]}`}>
              {notice.status.charAt(0).toUpperCase() + notice.status.slice(1)}
            </span>
            <span className="text-[11px] text-[#929da8]">
              {new Date(notice.created_at).toLocaleDateString()}
            </span>
          </div>

          {/* Summary */}
          <div className="bg-[#f8f9fa] border border-[#e6e8eb] rounded-lg p-3 space-y-2">
            <div>
              <p className="text-[10px] text-[#929da8] uppercase tracking-[0.08em]">To</p>
              <p className="text-[13px] text-[#1a1f25]">{notice.recipient_name}</p>
              {notice.recipient_address && (
                <p className="text-[11px] text-[#6e7b8a]">{notice.recipient_address}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-[#929da8] uppercase tracking-[0.08em]">Subject</p>
              <p className="text-[13px] text-[#1a1f25]">{notice.subject}</p>
            </div>
          </div>

          {/* Tracking number */}
          <div>
            <label className={labelClass}>Tracking Number</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={trackingNumber || notice.tracking_number || ''}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="USPS tracking number"
                className={inputClass}
              />
            </div>
          </div>

          {/* Status update buttons */}
          <div>
            <p className={labelClass}>Update Status</p>
            <div className="flex gap-2">
              {notice.status === 'draft' && (
                <button
                  onClick={() => handleUpdateStatus('sent')}
                  disabled={saving}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[12px] font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors"
                >
                  Mark Sent
                </button>
              )}
              {notice.status === 'sent' && (
                <>
                  <button
                    onClick={() => handleUpdateStatus('delivered')}
                    disabled={saving}
                    className="px-3 py-1.5 bg-[#047857] text-white rounded-lg text-[12px] font-medium disabled:opacity-40 hover:bg-[#065f46] transition-colors"
                  >
                    Mark Delivered
                  </button>
                  <button
                    onClick={() => handleUpdateStatus('returned')}
                    disabled={saving}
                    className="px-3 py-1.5 bg-[#d12626] text-white rounded-lg text-[12px] font-medium disabled:opacity-40 hover:bg-[#b91c1c] transition-colors"
                  >
                    Mark Returned
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </Dialog>
    )
  }

  // ── Create form ──
  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Certified Mail"
      size="sm"
      footer={
        <>
          <button onClick={handleClose} className="px-4 py-2 text-[13px] text-[#6e7b8a] hover:text-[#45505a] transition-colors">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!recipientName.trim() || !subject.trim() || !body.trim() || saving}
            className="px-4 py-2 bg-[#0f1b2d] text-white rounded-lg text-[13px] font-medium disabled:opacity-40 hover:bg-[#1a2a40] transition-colors"
          >
            {saving ? 'Creating...' : 'Create Record'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Mail size={16} className="text-[#6e7b8a]" />
          <span className="text-[12px] text-[#6e7b8a]">Create a certified mail record for tracking</span>
        </div>
        <div>
          <label className={labelClass}>Recipient Name</label>
          <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="John Smith" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Mailing Address</label>
          <textarea
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="123 Main St&#10;Apt 4B&#10;Springfield, IL 62701"
            rows={3}
            className={inputClass + ' resize-none'}
          />
        </div>
        <div>
          <label className={labelClass}>Subject</label>
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Notice of lien filing" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Dear Mr. Smith,&#10;&#10;Please be advised that..."
            rows={5}
            className={inputClass + ' resize-none'}
          />
        </div>
        <div>
          <label className={labelClass}>Tracking Number <span className="font-normal text-[#929da8]">(can be added later)</span></label>
          <input type="text" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="USPS tracking number" className={inputClass} />
        </div>
      </div>
    </Dialog>
  )
}
