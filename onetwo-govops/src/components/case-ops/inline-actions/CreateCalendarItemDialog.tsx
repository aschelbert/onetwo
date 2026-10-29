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

export function CreateCalendarItemDialog({ open, onClose, caseId, tenantId, stepNumber, onCreated }: Props) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [allDay, setAllDay] = useState(true)
  const [time, setTime] = useState('')
  const [description, setDescription] = useState('')
  const [eventType, setEventType] = useState<'deadline' | 'reminder'>('deadline')
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<CaseEvent | null>(null)

  const reset = () => {
    setTitle('')
    setDate('')
    setAllDay(true)
    setTime('')
    setDescription('')
    setEventType('deadline')
    setSaving(false)
    setCreated(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleCreate = async () => {
    if (!title.trim() || !date) return
    setSaving(true)

    const startsAt = allDay ? new Date(`${date}T00:00:00`) : new Date(`${date}T${time || '09:00'}`)

    try {
      const event = await createCaseEvent(caseId, tenantId, {
        stepNumber,
        eventType,
        title: title.trim(),
        description: description.trim() || undefined,
        startsAt: startsAt.toISOString(),
        allDay,
      })
      setCreated(event)
      onCreated?.(event)
    } catch (e) {
      console.error('Failed to create calendar item:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadICS = () => {
    if (!created) return
    const ics = generateICS({
      title: created.title,
      description: created.description ?? undefined,
      startsAt: new Date(created.starts_at),
      allDay: created.all_day,
    })
    downloadICS(ics, created.title.replace(/\s+/g, '-'))
  }

  const inputClass = 'w-full rounded-lg border border-[#e6e8eb] bg-[#f8f9fa] px-3 py-2 text-[13px] text-[#1a1f25] outline-none focus:border-[#929da8] focus:bg-white transition-colors'
  const labelClass = 'block text-[11px] font-semibold text-[#45505a] mb-1'

  if (created) {
    return (
      <Dialog open={open} onClose={handleClose} title="Calendar Item Added" size="sm">
        <div className="text-center py-4">
          <div className="w-12 h-12 rounded-full bg-[#ecfdf5] flex items-center justify-center mx-auto mb-3">
            <CalendarDays size={24} className="text-[#047857]" />
          </div>
          <p className="text-[14px] font-semibold text-[#1a1f25] mb-1">{created.title}</p>
          <p className="text-[12px] text-[#6e7b8a] mb-1 capitalize">{created.event_type}</p>
          <p className="text-[12px] text-[#6e7b8a] mb-4">
            {new Date(created.starts_at).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
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
      title="Add Calendar Item"
      size="sm"
      footer={
        <>
          <button onClick={handleClose} className="px-4 py-2 text-[13px] text-[#6e7b8a] hover:text-[#45505a] transition-colors">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || !date || saving}
            className="px-4 py-2 bg-[#0f1b2d] text-white rounded-lg text-[13px] font-medium disabled:opacity-40 hover:bg-[#1a2a40] transition-colors"
          >
            {saving ? 'Adding...' : 'Add to Calendar'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {/* Type selector */}
        <div className="flex gap-2">
          {(['deadline', 'reminder'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setEventType(t)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
                eventType === t
                  ? 'bg-[#0f1b2d] text-white border-[#0f1b2d]'
                  : 'bg-white text-[#45505a] border-[#e6e8eb] hover:border-[#929da8]'
              }`}
            >
              {t === 'deadline' ? 'Deadline' : 'Reminder'}
            </button>
          ))}
        </div>

        <div>
          <label className={labelClass}>Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Budget approval deadline" className={inputClass} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>
          {!allDay && (
            <div>
              <label className={labelClass}>Time</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="rounded border-[#e6e8eb] text-[#0f1b2d]"
          />
          <span className="text-[12px] text-[#45505a]">All day</span>
        </label>

        <div>
          <label className={labelClass}>Description <span className="font-normal text-[#929da8]">(optional)</span></label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Additional notes..." rows={2} className={inputClass + ' resize-none'} />
        </div>
      </div>
    </Dialog>
  )
}
