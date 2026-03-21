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
  updatePropertyLog,
  updatePropertyLogStatus,
  deletePropertyLog,
  addFinding,
  updateFinding,
  removeFinding,
  addActionItem,
  updateActionItem,
  removeActionItem,
} from '@/app/app/[tenancy]/association-team/property-log/actions'
import type {
  PropertyLog,
  PropertyLogStatus,
  PropertyLogType,
  PropertyLogFinding,
  PropertyLogActionItem,
} from '@/types/association-team'
import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

const STATUS_OPTIONS: { value: PropertyLogStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]

const TYPE_OPTIONS: { value: PropertyLogType; label: string }[] = [
  { value: 'walkthrough', label: 'Walkthrough' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'condition_assessment', label: 'Condition Assessment' },
  { value: 'incident', label: 'Incident' },
  { value: 'maintenance_observation', label: 'Maintenance Observation' },
]

const STATUS_VARIANT: Record<PropertyLogStatus, 'green' | 'amber' | 'blue' | 'gray'> = {
  open: 'blue',
  in_progress: 'amber',
  resolved: 'green',
  closed: 'gray',
}

export function PropertyLogDetail({
  log: initialLog,
  tenancySlug,
}: {
  log: PropertyLog
  tenancySlug: string
}) {
  const router = useRouter()
  const [log, setLog] = useState(initialLog)
  const [, startTransition] = useTransition()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [findingsOpen, setFindingsOpen] = useState(true)
  const [actionsOpen, setActionsOpen] = useState(true)
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Auto-save with 800ms debounce for text fields
  const debouncedSave = useCallback(
    (field: string, value: string) => {
      if (debounceRefs.current[field]) clearTimeout(debounceRefs.current[field])
      debounceRefs.current[field] = setTimeout(() => {
        startTransition(async () => {
          await updatePropertyLog(tenancySlug, log.id, { [field]: value })
        })
      }, 800)
    },
    [tenancySlug, log.id]
  )

  // Immediate save for selects
  const immediateSave = useCallback(
    (field: string, value: string) => {
      setLog((prev) => ({ ...prev, [field]: value }))
      startTransition(async () => {
        if (field === 'status') {
          await updatePropertyLogStatus(tenancySlug, log.id, value)
        } else {
          await updatePropertyLog(tenancySlug, log.id, { [field]: value })
        }
      })
    },
    [tenancySlug, log.id]
  )

  const handleDelete = () => {
    startTransition(async () => {
      await deletePropertyLog(tenancySlug, log.id)
      router.push(`/app/${tenancySlug}/association-team/property-log`)
    })
  }

  // ─── Finding handlers ─────────────────────────────────────────
  const handleAddFinding = () => {
    const newFinding: PropertyLogFinding = {
      id: crypto.randomUUID(),
      area: '',
      condition: '',
      description: '',
      photo_urls: [],
    }
    setLog((prev) => ({ ...prev, findings: [...(prev.findings || []), newFinding] }))
    startTransition(async () => {
      await addFinding(tenancySlug, log.id, newFinding)
    })
  }

  const handleUpdateFinding = useCallback(
    (findingId: string, field: string, value: string) => {
      setLog((prev) => ({
        ...prev,
        findings: (prev.findings || []).map((f) =>
          f.id === findingId ? { ...f, [field]: value } : f
        ),
      }))
      const key = `finding-${findingId}-${field}`
      if (debounceRefs.current[key]) clearTimeout(debounceRefs.current[key])
      debounceRefs.current[key] = setTimeout(() => {
        startTransition(async () => {
          await updateFinding(tenancySlug, log.id, findingId, { [field]: value } as Partial<PropertyLogFinding>)
        })
      }, 800)
    },
    [tenancySlug, log.id]
  )

  const handleRemoveFinding = (findingId: string) => {
    setLog((prev) => ({
      ...prev,
      findings: (prev.findings || []).filter((f) => f.id !== findingId),
    }))
    startTransition(async () => {
      await removeFinding(tenancySlug, log.id, findingId)
    })
  }

  // ─── Action Item handlers ─────────────────────────────────────
  const handleAddActionItem = () => {
    const newItem: PropertyLogActionItem = {
      id: crypto.randomUUID(),
      description: '',
      assigned_to: '',
      due_date: '',
      status: 'pending',
    }
    setLog((prev) => ({ ...prev, action_items: [...(prev.action_items || []), newItem] }))
    startTransition(async () => {
      await addActionItem(tenancySlug, log.id, newItem)
    })
  }

  const handleUpdateActionItem = useCallback(
    (itemId: string, field: string, value: string) => {
      setLog((prev) => ({
        ...prev,
        action_items: (prev.action_items || []).map((item) =>
          item.id === itemId ? { ...item, [field]: value } : item
        ),
      }))
      // Immediate for select, debounced for text
      if (field === 'status') {
        startTransition(async () => {
          await updateActionItem(tenancySlug, log.id, itemId, { [field]: value } as Partial<PropertyLogActionItem>)
        })
      } else {
        const key = `action-${itemId}-${field}`
        if (debounceRefs.current[key]) clearTimeout(debounceRefs.current[key])
        debounceRefs.current[key] = setTimeout(() => {
          startTransition(async () => {
            await updateActionItem(tenancySlug, log.id, itemId, { [field]: value } as Partial<PropertyLogActionItem>)
          })
        }, 800)
      }
    },
    [tenancySlug, log.id]
  )

  const handleRemoveActionItem = (itemId: string) => {
    setLog((prev) => ({
      ...prev,
      action_items: (prev.action_items || []).filter((item) => item.id !== itemId),
    }))
    startTransition(async () => {
      await removeActionItem(tenancySlug, log.id, itemId)
    })
  }

  return (
    <div>
      {/* Back link */}
      <Link
        href={`/app/${tenancySlug}/association-team/property-log`}
        className="inline-flex items-center gap-1 text-sm text-[#929da8] hover:text-[#45505a] no-underline mb-4"
      >
        <ArrowLeft size={14} /> Back to Property Log
      </Link>

      {/* Header card */}
      <Card className="mb-4">
        <CardBody>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <input
                type="text"
                defaultValue={log.title}
                onChange={(e) => {
                  setLog((prev) => ({ ...prev, title: e.target.value }))
                  debouncedSave('title', e.target.value)
                }}
                className="text-lg font-bold text-[#1a1f25] bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-gray-900 focus:outline-none w-full transition-colors"
              />
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANT[log.status]}>
                {STATUS_OPTIONS.find((s) => s.value === log.status)?.label}
              </Badge>
              <Button variant="danger" size="xs" onClick={() => setShowDeleteDialog(true)}>
                <Trash2 size={12} />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <FormGroup label="Type" className="mb-0">
              <Select
                value={log.type}
                onChange={(e) => immediateSave('type', e.target.value)}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </FormGroup>
            <FormGroup label="Status" className="mb-0">
              <Select
                value={log.status}
                onChange={(e) => immediateSave('status', e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </FormGroup>
            <FormGroup label="Date" className="mb-0">
              <Input
                type="date"
                defaultValue={log.date}
                onChange={(e) => debouncedSave('date', e.target.value)}
              />
            </FormGroup>
            <FormGroup label="Conducted By" className="mb-0">
              <Input
                defaultValue={log.conducted_by}
                onChange={(e) => debouncedSave('conducted_by', e.target.value)}
                placeholder="Name"
              />
            </FormGroup>
          </div>

          <div className="mt-4">
            <FormGroup label="Location" className="mb-0">
              <Input
                defaultValue={log.location}
                onChange={(e) => debouncedSave('location', e.target.value)}
                placeholder="e.g. Building A, Common Areas"
              />
            </FormGroup>
          </div>

          {log.insurance_claim_case_id && (
            <div className="mt-4">
              <Link
                href={`/app/${tenancySlug}/boardroom/cases/${log.insurance_claim_case_id}/steps/1`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[0.78rem] font-semibold bg-amber-50 text-amber-800 border border-amber-200 no-underline hover:bg-amber-100 transition-colors"
              >
                ⚖️ Insurance Claim →
              </Link>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Findings */}
      <Card className="mb-4">
        <CardHeader>
          <button
            onClick={() => setFindingsOpen(!findingsOpen)}
            className="flex items-center gap-2 bg-transparent border-0 cursor-pointer p-0"
          >
            {findingsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span className="font-bold text-sm text-[#1a1f25]">
              Findings ({(log.findings || []).length})
            </span>
          </button>
          <Button size="xs" variant="secondary" onClick={handleAddFinding}>
            <Plus size={12} /> Add
          </Button>
        </CardHeader>
        {findingsOpen && (
          <CardBody>
            {(log.findings || []).length === 0 ? (
              <p className="text-sm text-[#929da8] text-center py-4">No findings recorded</p>
            ) : (
              <div className="flex flex-col gap-4">
                {(log.findings || []).map((finding) => (
                  <div key={finding.id} className="border border-gray-100 rounded-lg p-4 relative">
                    <button
                      onClick={() => handleRemoveFinding(finding.id)}
                      className="absolute top-2 right-2 text-gray-400 hover:text-red-500 bg-transparent border-0 cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <FormGroup label="Area" className="mb-0">
                        <Input
                          defaultValue={finding.area}
                          onChange={(e) => handleUpdateFinding(finding.id, 'area', e.target.value)}
                          placeholder="e.g. Lobby, Pool Area"
                        />
                      </FormGroup>
                      <FormGroup label="Condition" className="mb-0">
                        <Input
                          defaultValue={finding.condition}
                          onChange={(e) => handleUpdateFinding(finding.id, 'condition', e.target.value)}
                          placeholder="e.g. Good, Fair, Poor"
                        />
                      </FormGroup>
                    </div>
                    <FormGroup label="Description" className="mb-0">
                      <Textarea
                        defaultValue={finding.description}
                        onChange={(e) => handleUpdateFinding(finding.id, 'description', e.target.value)}
                        placeholder="Describe the finding..."
                      />
                    </FormGroup>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        )}
      </Card>

      {/* Action Items */}
      <Card className="mb-4">
        <CardHeader>
          <button
            onClick={() => setActionsOpen(!actionsOpen)}
            className="flex items-center gap-2 bg-transparent border-0 cursor-pointer p-0"
          >
            {actionsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span className="font-bold text-sm text-[#1a1f25]">
              Action Items ({(log.action_items || []).length})
            </span>
          </button>
          <Button size="xs" variant="secondary" onClick={handleAddActionItem}>
            <Plus size={12} /> Add
          </Button>
        </CardHeader>
        {actionsOpen && (
          <CardBody>
            {(log.action_items || []).length === 0 ? (
              <p className="text-sm text-[#929da8] text-center py-4">No action items</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 px-2 text-[0.75rem] font-semibold text-[#929da8]">Description</th>
                      <th className="text-left py-2 px-2 text-[0.75rem] font-semibold text-[#929da8]">Assigned To</th>
                      <th className="text-left py-2 px-2 text-[0.75rem] font-semibold text-[#929da8]">Due Date</th>
                      <th className="text-left py-2 px-2 text-[0.75rem] font-semibold text-[#929da8]">Status</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(log.action_items || []).map((item) => (
                      <tr key={item.id} className="border-b border-gray-50">
                        <td className="py-2 px-2">
                          <Input
                            defaultValue={item.description}
                            onChange={(e) => handleUpdateActionItem(item.id, 'description', e.target.value)}
                            placeholder="What needs to be done?"
                            className="text-sm"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            defaultValue={item.assigned_to}
                            onChange={(e) => handleUpdateActionItem(item.id, 'assigned_to', e.target.value)}
                            placeholder="Name"
                            className="text-sm"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            type="date"
                            defaultValue={item.due_date}
                            onChange={(e) => handleUpdateActionItem(item.id, 'due_date', e.target.value)}
                            className="text-sm"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Select
                            value={item.status}
                            onChange={(e) => handleUpdateActionItem(item.id, 'status', e.target.value)}
                            className="text-sm"
                          >
                            <option value="pending">Pending</option>
                            <option value="in_progress">In Progress</option>
                            <option value="done">Done</option>
                          </Select>
                        </td>
                        <td className="py-2 px-2">
                          <button
                            onClick={() => handleRemoveActionItem(item.id)}
                            className="text-gray-400 hover:text-red-500 bg-transparent border-0 cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        )}
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <span className="font-bold text-sm text-[#1a1f25]">Notes</span>
        </CardHeader>
        <CardBody>
          <Textarea
            defaultValue={log.notes}
            onChange={(e) => {
              setLog((prev) => ({ ...prev, notes: e.target.value }))
              debouncedSave('notes', e.target.value)
            }}
            placeholder="Additional notes..."
            className="min-h-[120px]"
          />
        </CardBody>
      </Card>

      {/* Delete confirmation */}
      <Dialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title="Delete Property Log"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-[#45505a]">
          Are you sure you want to delete &ldquo;{log.title}&rdquo;? This action cannot be undone.
        </p>
      </Dialog>
    </div>
  )
}
