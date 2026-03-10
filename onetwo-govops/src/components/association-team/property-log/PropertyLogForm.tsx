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
  })

  const handleSubmit = () => {
    if (!form.title.trim()) return
    startTransition(async () => {
      const log = await createPropertyLog(tenancySlug, form)
      onClose()
      setForm({ type: 'walkthrough', title: '', date: new Date().toISOString().split('T')[0], conducted_by: '', location: '' })
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
        <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
          {LOG_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Select>
      </FormGroup>
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
