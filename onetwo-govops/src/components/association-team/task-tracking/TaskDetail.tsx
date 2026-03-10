'use client'

import { useState, useCallback, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Input, Select, Textarea, FormGroup } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'
import {
  updateTask,
  updateTaskStatus,
  assignTask,
  deleteTask,
} from '@/app/app/[tenancy]/association-team/task-tracking/actions'
import type { AssociationTask, TaskStatus, TaskPriority } from '@/types/association-team'
import { PRIORITY_CONFIG, STATUS_CONFIG, TASK_CATEGORIES } from '@/types/association-team'
import { ArrowLeft, Trash2, ExternalLink } from 'lucide-react'

interface TeamMember {
  id: string
  name: string
  role: string
}

export function TaskDetail({
  task: initialTask,
  teamMembers,
  linkedLog,
  tenancySlug,
}: {
  task: AssociationTask
  teamMembers: TeamMember[]
  linkedLog: { id: string; title: string; status: string } | null
  tenancySlug: string
}) {
  const router = useRouter()
  const [task, setTask] = useState(initialTask)
  const [, startTransition] = useTransition()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const debouncedSave = useCallback(
    (field: string, value: string) => {
      if (debounceRefs.current[field]) clearTimeout(debounceRefs.current[field])
      debounceRefs.current[field] = setTimeout(() => {
        startTransition(async () => {
          await updateTask(tenancySlug, task.id, { [field]: value })
        })
      }, 800)
    },
    [tenancySlug, task.id]
  )

  const immediateSave = useCallback(
    (field: string, value: string | null) => {
      setTask((prev) => ({ ...prev, [field]: value }))
      startTransition(async () => {
        if (field === 'status') {
          await updateTaskStatus(tenancySlug, task.id, value as string)
        } else if (field === 'assigned_to') {
          await assignTask(tenancySlug, task.id, value)
        } else {
          await updateTask(tenancySlug, task.id, { [field]: value })
        }
      })
    },
    [tenancySlug, task.id]
  )

  const handleDelete = () => {
    startTransition(async () => {
      await deleteTask(tenancySlug, task.id)
      router.push(`/app/${tenancySlug}/association-team/task-tracking`)
    })
  }

  const priorityInfo = PRIORITY_CONFIG[task.priority as TaskPriority]
  const statusInfo = STATUS_CONFIG[task.status as TaskStatus]

  return (
    <div>
      <Link
        href={`/app/${tenancySlug}/association-team/task-tracking`}
        className="inline-flex items-center gap-1 text-sm text-[#929da8] hover:text-[#45505a] no-underline mb-4"
      >
        <ArrowLeft size={14} /> Back to Tasks
      </Link>

      {/* Header card */}
      <Card className="mb-4">
        <CardBody>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <input
                type="text"
                defaultValue={task.title}
                onChange={(e) => {
                  setTask((prev) => ({ ...prev, title: e.target.value }))
                  debouncedSave('title', e.target.value)
                }}
                className="text-lg font-bold text-[#1a1f25] bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-gray-900 focus:outline-none w-full transition-colors"
              />
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={statusInfo.variant as 'green' | 'amber' | 'blue' | 'gray'}>
                {statusInfo.label}
              </Badge>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[0.7rem] font-semibold ${priorityInfo.className}`}>
                {priorityInfo.label}
              </span>
              <Button variant="danger" size="xs" onClick={() => setShowDeleteDialog(true)}>
                <Trash2 size={12} />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <FormGroup label="Status" className="mb-0">
              <Select
                value={task.status}
                onChange={(e) => immediateSave('status', e.target.value)}
              >
                <option value="backlog">Backlog</option>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
                <option value="canceled">Canceled</option>
              </Select>
            </FormGroup>
            <FormGroup label="Priority" className="mb-0">
              <Select
                value={task.priority}
                onChange={(e) => immediateSave('priority', e.target.value)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </FormGroup>
            <FormGroup label="Category" className="mb-0">
              <Select
                value={task.category}
                onChange={(e) => immediateSave('category', e.target.value)}
              >
                {TASK_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </FormGroup>
            <FormGroup label="Due Date" className="mb-0">
              <Input
                type="date"
                defaultValue={task.due_date || ''}
                onChange={(e) => debouncedSave('due_date', e.target.value)}
              />
            </FormGroup>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <FormGroup label="Assigned To" className="mb-0">
              <Select
                value={task.assigned_to || ''}
                onChange={(e) => immediateSave('assigned_to', e.target.value || null)}
              >
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>
            </FormGroup>
            <FormGroup label="Created By" className="mb-0">
              <p className="text-sm text-[#45505a] py-2">{task.created_by_name || 'Unknown'}</p>
            </FormGroup>
          </div>
        </CardBody>
      </Card>

      {/* Description */}
      <Card className="mb-4">
        <CardHeader>
          <span className="font-bold text-sm text-[#1a1f25]">Description</span>
        </CardHeader>
        <CardBody>
          <Textarea
            defaultValue={task.description}
            onChange={(e) => {
              setTask((prev) => ({ ...prev, description: e.target.value }))
              debouncedSave('description', e.target.value)
            }}
            placeholder="Add a description..."
            className="min-h-[100px]"
          />
        </CardBody>
      </Card>

      {/* Linked Property Log */}
      {linkedLog && (
        <Card className="mb-4">
          <CardHeader>
            <span className="font-bold text-sm text-[#1a1f25]">Linked Property Log</span>
          </CardHeader>
          <CardBody>
            <Link
              href={`/app/${tenancySlug}/association-team/property-log/${linkedLog.id}`}
              className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 no-underline"
            >
              <ExternalLink size={14} />
              {linkedLog.title}
              <Badge variant={linkedLog.status === 'resolved' ? 'green' : linkedLog.status === 'closed' ? 'gray' : 'blue'}>
                {linkedLog.status}
              </Badge>
            </Link>
          </CardBody>
        </Card>
      )}

      {/* Notes */}
      <Card>
        <CardHeader>
          <span className="font-bold text-sm text-[#1a1f25]">Notes</span>
        </CardHeader>
        <CardBody>
          <Textarea
            defaultValue={task.notes}
            onChange={(e) => {
              setTask((prev) => ({ ...prev, notes: e.target.value }))
              debouncedSave('notes', e.target.value)
            }}
            placeholder="Additional notes..."
            className="min-h-[100px]"
          />
        </CardBody>
      </Card>

      {/* Timestamps */}
      <div className="flex items-center gap-4 mt-4 text-[0.7rem] text-[#929da8]">
        <span>Created {formatDate(task.created_at)}</span>
        {task.updated_at && <span>Updated {formatDate(task.updated_at)}</span>}
        {task.completed_at && <span>Completed {formatDate(task.completed_at)}</span>}
      </div>

      {/* Delete confirmation */}
      <Dialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title="Delete Task"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-[#45505a]">
          Are you sure you want to delete &ldquo;{task.title}&rdquo;? This action cannot be undone.
        </p>
      </Dialog>
    </div>
  )
}
