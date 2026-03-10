'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTenant } from '@/lib/tenant-context'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea, FormGroup } from '@/components/ui/input'
import { TASK_CATEGORIES } from '@/types/association-team'
import { createTask } from '@/app/app/[tenancy]/association-team/task-tracking/actions'

interface TeamMember {
  id: string
  name: string
  role: string
}

export function TaskForm({
  open,
  onClose,
  tenancySlug,
  teamMembers,
  prefill,
}: {
  open: boolean
  onClose: () => void
  tenancySlug: string
  teamMembers: TeamMember[]
  prefill?: {
    description?: string
    property_log_id?: string
  }
}) {
  const router = useRouter()
  const { user } = useTenant()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    title: '',
    description: prefill?.description || '',
    category: 'other',
    priority: 'medium',
    assigned_to: '',
    due_date: '',
  })

  const handleSubmit = () => {
    if (!form.title.trim()) return
    startTransition(async () => {
      const task = await createTask(tenancySlug, {
        title: form.title,
        description: form.description,
        category: form.category,
        priority: form.priority,
        assigned_to: form.assigned_to || null,
        due_date: form.due_date || null,
        property_log_id: prefill?.property_log_id || null,
        created_by: user.id,
      })
      onClose()
      setForm({ title: '', description: '', category: 'other', priority: 'medium', assigned_to: '', due_date: '' })
      router.push(`/app/${tenancySlug}/association-team/task-tracking/${task.id}`)
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New Task"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending || !form.title.trim()}>
            {isPending ? 'Creating...' : 'Create Task'}
          </Button>
        </>
      }
    >
      <FormGroup label="Title">
        <Input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="What needs to be done?"
        />
      </FormGroup>
      <FormGroup label="Description">
        <Textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Details..."
        />
      </FormGroup>
      <div className="grid grid-cols-2 gap-4">
        <FormGroup label="Category">
          <Select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            {TASK_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
        </FormGroup>
        <FormGroup label="Priority">
          <Select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>
        </FormGroup>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormGroup label="Assigned To">
          <Select value={form.assigned_to} onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}>
            <option value="">Unassigned</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </FormGroup>
        <FormGroup label="Due Date">
          <Input
            type="date"
            value={form.due_date}
            onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
          />
        </FormGroup>
      </div>
    </Dialog>
  )
}
