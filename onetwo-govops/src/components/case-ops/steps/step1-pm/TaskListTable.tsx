'use client'

import { useCallback, useRef } from 'react'
import { Trash2, CalendarPlus, CheckCircle } from 'lucide-react'
import { SectionCard } from '../shared/SectionCard'
import { VendorCombobox } from '@/components/ui/VendorCombobox'
import { createCaseEvent } from '@/app/app/[tenancy]/boardroom/cases/[caseId]/inline-actions'
import { generateICS, downloadICS } from '@/lib/ics'
import type { PMTask, PMCategory, Vendor } from '@/types/case-steps'
import { PM_CATEGORY_LABELS } from '@/types/case-steps'

const MONTH_LABELS: Record<number, string> = {
  1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun',
  7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dec',
}

const FREQUENCY_LABELS: Record<PMTask['frequency'], string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semi_annual: 'Semi-Annual',
  annual: 'Annual',
  as_needed: 'As Needed',
}

const CATEGORY_OPTIONS = Object.entries(PM_CATEGORY_LABELS) as [PMCategory, string][]
const FREQUENCY_OPTIONS = Object.entries(FREQUENCY_LABELS) as [PMTask['frequency'], string][]

// ─── Migrate old-format tasks (with season/month/assignee) ───────────

interface OldFormatTask {
  id: string
  name: string
  category: PMCategory
  season?: string
  month?: number | null
  startMonth?: number
  frequency: PMTask['frequency']
  assignee?: string
  vendorId?: string | null
  vendorName?: string
  notes: string
  eventCreated: boolean
}

const SEASON_FIRST_MONTH: Record<string, number> = {
  spring: 3,
  summer: 6,
  fall: 9,
  winter: 12,
  year_round: 1,
}

export function migrateTask(raw: OldFormatTask): PMTask {
  // Already new format
  if (typeof raw.startMonth === 'number' && !('season' in raw && !('startMonth' in raw))) {
    return {
      id: raw.id,
      name: raw.name,
      category: raw.category,
      startMonth: raw.startMonth,
      frequency: raw.frequency,
      vendorId: raw.vendorId ?? null,
      vendorName: raw.vendorName ?? '',
      notes: raw.notes,
      eventCreated: raw.eventCreated,
    }
  }

  // Old format: derive startMonth from season/month
  let startMonth = 1
  if (typeof raw.month === 'number' && raw.month >= 1 && raw.month <= 12) {
    startMonth = raw.month
  } else if (raw.season && SEASON_FIRST_MONTH[raw.season]) {
    startMonth = SEASON_FIRST_MONTH[raw.season]
  }

  return {
    id: raw.id,
    name: raw.name,
    category: raw.category,
    startMonth,
    frequency: raw.frequency,
    vendorId: null,
    vendorName: raw.assignee ?? '',
    notes: raw.notes,
    eventCreated: raw.eventCreated,
  }
}

// ─── Component ───────────────────────────────────────────────────────

interface Props {
  tasks: PMTask[]
  calendarYear: number
  caseId: string
  tenantId: string
  vendors: Vendor[]
  isConfirmed: boolean
  isOpen: boolean
  onToggle: () => void
  onChange: (tasks: PMTask[]) => void
  onTaskScheduled: (taskId: string) => void
  onConfirm: (confirmed: boolean) => void
  onVendorCreated: (vendor: Vendor) => void
}

export function TaskListTable({
  tasks,
  calendarYear,
  caseId,
  tenantId,
  vendors,
  isConfirmed,
  isOpen,
  onToggle,
  onChange,
  onTaskScheduled,
  onConfirm,
  onVendorCreated,
}: Props) {
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const updateTask = useCallback(
    (taskId: string, updates: Partial<PMTask>) => {
      onChange(tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)))
    },
    [tasks, onChange]
  )

  const debouncedUpdate = useCallback(
    (taskId: string, field: keyof PMTask, value: string) => {
      const key = `${taskId}-${field}`
      if (debounceRefs.current[key]) clearTimeout(debounceRefs.current[key])
      debounceRefs.current[key] = setTimeout(() => {
        updateTask(taskId, { [field]: value })
      }, 800)
    },
    [updateTask]
  )

  const addTask = () => {
    const newTask: PMTask = {
      id: crypto.randomUUID(),
      name: '',
      category: 'other',
      startMonth: 1,
      frequency: 'annual',
      vendorId: null,
      vendorName: '',
      notes: '',
      eventCreated: false,
    }
    onChange([...tasks, newTask])
  }

  const deleteTask = (taskId: string) => {
    onChange(tasks.filter((t) => t.id !== taskId))
  }

  const scheduleTask = async (task: PMTask) => {
    const startsAt = `${calendarYear}-${String(task.startMonth).padStart(2, '0')}-01`

    await createCaseEvent(caseId, tenantId, {
      stepNumber: 1,
      eventType: 'deadline',
      title: task.name,
      description: `${PM_CATEGORY_LABELS[task.category]} \u2014 ${FREQUENCY_LABELS[task.frequency]}${task.notes ? `\n${task.notes}` : ''}`,
      startsAt,
      allDay: true,
    })

    const ics = generateICS({
      title: task.name,
      description: `${PM_CATEGORY_LABELS[task.category]} \u2014 ${FREQUENCY_LABELS[task.frequency]}`,
      startsAt: new Date(startsAt),
      allDay: true,
    })
    downloadICS(ics, `${task.name.replace(/\s+/g, '-').toLowerCase()}.ics`)

    onTaskScheduled(task.id)
  }

  const badge = isConfirmed
    ? { label: 'Confirmed', variant: 'confirmed' as const }
    : { label: `${tasks.length} task${tasks.length !== 1 ? 's' : ''}`, variant: 'pending' as const }

  return (
    <SectionCard
      title="Task List"
      badge={badge}
      isConfirmed={isConfirmed}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="pt-2.5">
        {tasks.length === 0 ? (
          <p className="text-[12px] text-[#929da8] py-3 text-center">No tasks yet. Click &quot;Load Template Tasks&quot; above to get started.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[#e6e8eb]">
                  <th className="text-left text-[10px] font-semibold text-[#929da8] uppercase tracking-[0.04em] py-1.5 px-1">Task</th>
                  <th className="text-left text-[10px] font-semibold text-[#929da8] uppercase tracking-[0.04em] py-1.5 px-1">Category</th>
                  <th className="text-left text-[10px] font-semibold text-[#929da8] uppercase tracking-[0.04em] py-1.5 px-1">Vendor</th>
                  <th className="text-left text-[10px] font-semibold text-[#929da8] uppercase tracking-[0.04em] py-1.5 px-1">Frequency</th>
                  <th className="text-left text-[10px] font-semibold text-[#929da8] uppercase tracking-[0.04em] py-1.5 px-1">Start Mo.</th>
                  <th className="text-left text-[10px] font-semibold text-[#929da8] uppercase tracking-[0.04em] py-1.5 px-1 w-[90px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} className="border-b border-[#f8f9fa] hover:bg-[#f8f9fa]">
                    {/* Task name */}
                    <td className="py-1.5 px-1">
                      <input
                        type="text"
                        defaultValue={task.name}
                        onChange={(e) => debouncedUpdate(task.id, 'name', e.target.value)}
                        placeholder="Task name"
                        className="text-[12px] px-1.5 py-1 border-[1.5px] border-[#e6e8eb] rounded-md text-[#1a1f25] bg-white focus:outline-none focus:border-[#d12626] w-full min-w-[140px]"
                      />
                    </td>

                    {/* Category */}
                    <td className="py-1.5 px-1">
                      <select
                        defaultValue={task.category}
                        onChange={(e) => updateTask(task.id, { category: e.target.value as PMCategory })}
                        className="text-[11px] px-1.5 py-1 border-[1.5px] border-[#e6e8eb] rounded-md text-[#1a1f25] bg-white focus:outline-none focus:border-[#d12626]"
                      >
                        {CATEGORY_OPTIONS.map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </td>

                    {/* Vendor */}
                    <td className="py-1.5 px-1">
                      <VendorCombobox
                        vendors={vendors}
                        value={{ vendorId: task.vendorId, vendorName: task.vendorName }}
                        onChange={(vendorId, vendorName) =>
                          updateTask(task.id, { vendorId, vendorName })
                        }
                        onVendorCreated={onVendorCreated}
                        tenantId={tenantId}
                      />
                    </td>

                    {/* Frequency */}
                    <td className="py-1.5 px-1">
                      <select
                        defaultValue={task.frequency}
                        onChange={(e) => updateTask(task.id, { frequency: e.target.value as PMTask['frequency'] })}
                        className="text-[11px] px-1.5 py-1 border-[1.5px] border-[#e6e8eb] rounded-md text-[#1a1f25] bg-white focus:outline-none focus:border-[#d12626]"
                      >
                        {FREQUENCY_OPTIONS.map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </td>

                    {/* Start Month */}
                    <td className="py-1.5 px-1">
                      <select
                        value={task.startMonth}
                        onChange={(e) => updateTask(task.id, { startMonth: parseInt(e.target.value, 10) })}
                        className="text-[11px] px-1.5 py-1 border-[1.5px] border-[#e6e8eb] rounded-md text-[#1a1f25] bg-white focus:outline-none focus:border-[#d12626]"
                      >
                        {Object.entries(MONTH_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </td>

                    {/* Actions */}
                    <td className="py-1.5 px-1">
                      <div className="flex items-center gap-1">
                        {task.eventCreated ? (
                          <span title="Scheduled">
                            <CheckCircle size={14} className="text-[#047857]" />
                          </span>
                        ) : (
                          <button
                            onClick={() => scheduleTask(task)}
                            title="Schedule event"
                            className="p-1 rounded hover:bg-[#ecfdf5] text-[#6e7b8a] hover:text-[#047857] transition-colors"
                          >
                            <CalendarPlus size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => deleteTask(task.id)}
                          title="Delete task"
                          className="p-1 rounded hover:bg-[#fef2f2] text-[#6e7b8a] hover:text-[#d12626] transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add task button */}
        <button
          onClick={addTask}
          className="mt-2 text-[11px] font-medium text-[#6e7b8a] hover:text-[#1a1f25] transition-colors"
        >
          + Add Task
        </button>

        {/* Confirm section button */}
        <button
          onClick={() => onConfirm(!isConfirmed)}
          className={`mt-2.5 w-full py-2 rounded-lg text-[12px] font-semibold ${
            isConfirmed
              ? 'bg-[#ecfdf5] text-[#047857] border border-[#6ee7b7]'
              : 'bg-white text-[#6e7b8a] border border-[#e6e8eb] hover:border-[#047857]'
          }`}
        >
          {isConfirmed ? '\u2713 Section Confirmed' : 'Confirm Section'}
        </button>
      </div>
    </SectionCard>
  )
}
