'use client'

import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { createCaseEvent } from '@/app/app/[tenancy]/boardroom/cases/[caseId]/inline-actions'
import { generateICS, downloadICS } from '@/lib/ics'
import type { CaseEvent } from '@/types/inline-actions'
import { CalendarDays, Download } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  caseId: string
  tenantId: string
  stepNumber?: number
  onCreated?: (event: CaseEvent) => void
}

export function CreateMeetingDialog({ open, onClose, caseId, tenantId, stepNumber, onCreated }: Props) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<CaseEvent | null>(null)

  const reset = () => {
    setTitle('')
    setDate('')
    setStartTime('')
    setEndTime('')
    setLocation('')
    setDescription('')
    setSaving(false)
    setCreated(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleCreate = async () => {
    if (!title.trim() || !date || !startTime) return
    setSaving(true)

    const startsAt = new Date(`${date}T${startTime}`)
    const endsAt = endTime ? new Date(`${date}T${endTime}`) : undefined

    try {
      const event = await createCaseEvent(caseId, tenantId, {
        stepNumber,
        eventType: 'meeting',
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt?.toISOString(),
      })
      setCreated(event)
      onCreated?.(event)
    } catch (e) {
      console.error('Failed to create meeting:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadICS = () => {
    if (!created) return
    const ics = generateICS({
      title: created.title,
      description: created.description ?? undefined,
      location: created.location ?? undefined,
      startsAt: new Date(created.starts_at),
      endsAt: created.ends_at ? new Date(created.ends_at) : undefined,
    })
    downloadICS(ics, created.title.replace(/\s+/g, '-'))
  }

  const inputClass = 'w-full rounded-lg border border-[#e6e8eb] bg-[#f8f9fa] px-3 py-2 text-[13px] text-[#1a1f25] outline-none focus:border-[#929da8] focus:bg-white transition-colors'
  const labelClass = 'block text-[11px] font-semibold text-[#45505a] mb-1'

  if (created) {
    return (
      <Dialog open={open} onClose={handleClose} title="Meeting Created" size="sm">
        <div className="text-center py-4">
          <div className="w-12 h-12 rounded-full bg-[#ecfdf5] flex items-center justify-center mx-auto mb-3">
            <CalendarDays size={24} className="text-[#047857]" />
          </div>
          <p className="text-[14px] font-semibold text-[#1a1f25] mb-1">{created.title}</p>
          <p className="text-[12px] text-[#6e7b8a] mb-4">
            {new Date(created.starts_at).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            {' at '}
            {new Date(created.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <button
            onClick={handleDownloadICS}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0f1b2d] text-white rounded-lg text-[13px] font-medium hover:bg-[#1a2a40] transition-colors"
          >
            <Download size={14} />
            Download .ics
          </button>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Schedule Meeting"
      size="sm"
      footer={
        <>
          <button onClick={handleClose} className="px-4 py-2 text-[13px] text-[#6e7b8a] hover:text-[#45505a] transition-colors">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || !date || !startTime || saving}
            className="px-4 py-2 bg-[#0f1b2d] text-white rounded-lg text-[13px] font-medium disabled:opacity-40 hover:bg-[#1a2a40] transition-colors"
          >
            {saving ? 'Creating...' : 'Create Meeting'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className={labelClass}>Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Board meeting to review reserve study" className={inputClass} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Start Time</label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>End Time</label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Location <span className="font-normal text-[#929da8]">(optional)</span></label>
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Community clubhouse" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Description <span className="font-normal text-[#929da8]">(optional)</span></label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Agenda items..." rows={3} className={inputClass + ' resize-none'} />
        </div>
      </div>
    </Dialog>
  )
}
