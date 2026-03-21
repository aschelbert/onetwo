'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Select, FormGroup } from '@/components/ui/input'
import { createPropertyLog } from '@/app/app/[tenancy]/association-team/property-log/actions'

const LOG_TYPES = [
  { value: 'walkthrough', label: 'Walkthrough' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'condition_assessment', label: 'Condition Assessment' },
  { value: 'incident', label: 'Incident' },
  { value: 'maintenance_observation', label: 'Maintenance Observation' },
]

const CLAIM_OPTIONS: { value: 'yes' | 'no' | 'unknown'; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unknown', label: 'Unknown' },
]

export function PropertyLogForm({
  open,
  onClose,
  tenancySlug,
}: {
  open: boolean
  onClose: () => void
  tenancySlug: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    type: 'walkthrough',
    title: '',
    date: new Date().toISOString().split('T')[0],
    conducted_by: '',
    location: '',
    insurance_claim_needed: 'unknown' as 'yes' | 'no' | 'unknown',
  })

  const handleSubmit = () => {
    if (!form.title.trim()) return
    startTransition(async () => {
      const log = await createPropertyLog(tenancySlug, {
        type: form.type,
        title: form.title,
        date: form.date,
        conducted_by: form.conducted_by,
        location: form.location,
        insurance_claim_needed: form.type === 'incident' ? form.insurance_claim_needed : 'unknown',
      })
      onClose()
      setForm({ type: 'walkthrough', title: '', date: new Date().toISOString().split('T')[0], conducted_by: '', location: '', insurance_claim_needed: 'unknown' })
      router.push(`/app/${tenancySlug}/association-team/property-log/${log.id}`)
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New Property Log"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending || !form.title.trim()}>
            {isPending ? 'Creating...' : 'Create Log'}
          </Button>
        </>
      }
    >
      <FormGroup label="Type">
        <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value, insurance_claim_needed: 'unknown' }))}>
          {LOG_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Select>
      </FormGroup>

      {form.type === 'incident' && (
        <FormGroup label="Insurance claim needed?">
          <div className="flex gap-1">
            {CLAIM_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, insurance_claim_needed: opt.value }))}
                className={`flex-1 px-3 py-2 text-[0.82rem] font-medium rounded-lg border transition-all cursor-pointer ${
                  form.insurance_claim_needed === opt.value
                    ? 'bg-[#1a1f25] text-white border-[#1a1f25]'
                    : 'bg-white text-[#45505a] border-gray-200 hover:border-gray-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </FormGroup>
      )}

      <FormGroup label="Title">
        <Input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Monthly walkthrough — Building A"
        />
      </FormGroup>
      <FormGroup label="Date">
        <Input
          type="date"
          value={form.date}
          onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
        />
      </FormGroup>
      <FormGroup label="Conducted By">
        <Input
          value={form.conducted_by}
          onChange={(e) => setForm((f) => ({ ...f, conducted_by: e.target.value }))}
          placeholder="e.g. John Smith"
        />
      </FormGroup>
      <FormGroup label="Location">
        <Input
          value={form.location}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          placeholder="e.g. Building A, Common Areas"
        />
      </FormGroup>
    </Dialog>
  )
}
