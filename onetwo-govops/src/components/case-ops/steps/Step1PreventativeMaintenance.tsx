'use client'

import { useState, useCallback, useTransition, useEffect } from 'react'
import { upsertStepData, toggleStepSectionConfirmed, markStepComplete } from '@/app/app/[tenancy]/boardroom/cases/[caseId]/steps/actions'
import { getStepAttachments, batchCreateCaseEvents } from '@/app/app/[tenancy]/boardroom/cases/[caseId]/inline-actions'
import type { Step1PMData, Step1PMSectionId, PMTask, Vendor } from '@/types/case-steps'
import { STEP1PM_SECTIONS, DEFAULT_STEP1PM_DATA, PM_TASK_TEMPLATES, PM_CATEGORY_LABELS, computeTaskMonths } from '@/types/case-steps'
import type { StepAttachment } from '@/types/inline-actions'

import { TaskListTable, migrateTask } from './step1-pm/TaskListTable'
import { CalendarPreview } from './step1-pm/CalendarPreview'
import { QuickActionsCard } from './shared/QuickActionsCard'
import { StepDescriptionCard } from './shared/StepDescriptionCard'
import { MarkCompleteCard } from './shared/MarkCompleteCard'
import { UploadDocumentDialog } from '../inline-actions/UploadDocumentDialog'
import { StepAttachmentList } from '../inline-actions/StepAttachmentList'

const FREQUENCY_LABELS: Record<PMTask['frequency'], string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semi_annual: 'Semi-Annual',
  annual: 'Annual',
  as_needed: 'As Needed',
}

interface Props {
  caseId: string
  tenantId: string
  initialData: Partial<Step1PMData>
  confirmedSections: string[]
  isComplete: boolean
  initialVendors: Vendor[]
}

export function Step1PreventativeMaintenance({
  caseId,
  tenantId,
  initialData,
  confirmedSections: initialConfirmed,
  isComplete: initialComplete,
  initialVendors,
}: Props) {
  // Migrate any old-format tasks on initial load
  const migratedInitialData: Step1PMData = {
    ...DEFAULT_STEP1PM_DATA,
    ...initialData,
    tasks: (initialData.tasks ?? []).map((t) => migrateTask(t as Parameters<typeof migrateTask>[0])),
  }

  const [data, setData] = useState<Step1PMData>(migratedInitialData)
  const [confirmed, setConfirmed] = useState<string[]>(initialConfirmed)
  const [isComplete, setIsComplete] = useState(initialComplete)
  const [openSections, setOpenSections] = useState<Record<Step1PMSectionId, boolean>>({
    tasks: true,
    calendar: true,
  })
  const [vendors, setVendors] = useState<Vendor[]>(initialVendors)
  const [, startTransition] = useTransition()

  // Inline action state
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [attachments, setAttachments] = useState<StepAttachment[]>([])
  const [scheduling, setScheduling] = useState(false)

  // Load attachments on mount
  useEffect(() => {
    getStepAttachments(caseId, 1).then(setAttachments)
  }, [caseId])

  const persistData = useCallback(
    (newData: Step1PMData) => {
      startTransition(async () => {
        await upsertStepData(caseId, 1, newData as unknown as Record<string, unknown>)
      })
    },
    [caseId]
  )

  const handleTasksChange = useCallback(
    (tasks: PMTask[]) => {
      setData((prev) => {
        const newData = { ...prev, tasks }
        persistData(newData)
        return newData
      })
    },
    [persistData]
  )

  const handleTaskScheduled = useCallback(
    (taskId: string) => {
      setData((prev) => {
        const newData = {
          ...prev,
          tasks: prev.tasks.map((t) => (t.id === taskId ? { ...t, eventCreated: true } : t)),
        }
        persistData(newData)
        return newData
      })
    },
    [persistData]
  )

  const handleConfirmSection = useCallback(
    async (sectionId: Step1PMSectionId, value: boolean) => {
      const result = await toggleStepSectionConfirmed(
        caseId,
        1,
        sectionId,
        value,
        STEP1PM_SECTIONS
      )
      setConfirmed(result.confirmedSections)
      setIsComplete(result.isComplete)
    },
    [caseId]
  )

  const handleMarkComplete = useCallback(async () => {
    try {
      await markStepComplete(caseId, 1, STEP1PM_SECTIONS)
      setIsComplete(true)
    } catch (e) {
      alert((e as Error).message)
    }
  }, [caseId])

  const toggleSection = (id: Step1PMSectionId) =>
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))

  const handleLoadTemplates = () => {
    if (data.tasks.length > 0) return
    const tasks: PMTask[] = PM_TASK_TEMPLATES.map((t) => ({
      ...t,
      id: crypto.randomUUID(),
      eventCreated: false,
    }))
    const newData = { ...data, tasks }
    setData(newData)
    persistData(newData)
  }

  const handleScheduleAll = async () => {
    const unscheduled = data.tasks.filter((t) => !t.eventCreated)
    if (unscheduled.length === 0) return

    setScheduling(true)
    try {
      const events = unscheduled.map((task) => {
        // Use startMonth for the first event
        const months = computeTaskMonths(task.startMonth, task.frequency)
        const month = months.length > 0 ? months[0] : task.startMonth
        return {
          stepNumber: 1,
          eventType: 'deadline' as const,
          title: task.name,
          description: `${PM_CATEGORY_LABELS[task.category]} \u2014 ${FREQUENCY_LABELS[task.frequency]}${task.notes ? `\n${task.notes}` : ''}`,
          startsAt: `${data.calendarYear}-${String(month).padStart(2, '0')}-01`,
          allDay: true,
        }
      })

      await batchCreateCaseEvents(caseId, tenantId, events)

      // Mark all as scheduled
      setData((prev) => {
        const newData = {
          ...prev,
          tasks: prev.tasks.map((t) => ({ ...t, eventCreated: true })),
        }
        persistData(newData)
        return newData
      })
    } finally {
      setScheduling(false)
    }
  }

  const handleVendorCreated = useCallback((vendor: Vendor) => {
    setVendors((prev) => [...prev, vendor].sort((a, b) => a.name.localeCompare(b.name)))
  }, [])

  const allConfirmed = STEP1PM_SECTIONS.every((s) => confirmed.includes(s))
  const unscheduledCount = data.tasks.filter((t) => !t.eventCreated).length

  return (
    <div className="px-7 py-[18px] pb-8">
      {/* Mark Complete */}
      <MarkCompleteCard
        stepNumber={1}
        isComplete={isComplete}
        canComplete={allConfirmed}
        onComplete={handleMarkComplete}
        label="Annual Maintenance Calendar"
      />

      {/* Description + Guidance */}
      <StepDescriptionCard
        question="Create comprehensive annual maintenance calendar covering all building systems"
        timeline="Start of each calendar year"
        reference="Reserve study & DC building codes"
        guidance="Build a month-by-month maintenance calendar covering every building system \u2014 HVAC, roofing, plumbing, electrical, fire/life safety, elevators, exterior envelope, pest control, and common area upkeep. Reference the reserve study component list to ensure all items with limited useful life are tracked."
      />

      {/* Quick Actions */}
      <QuickActionsCard
        actions={[
          {
            label: 'Load Template Tasks',
            variant: 'primary',
            icon: '\uD83D\uDCCB',
            onClick: handleLoadTemplates,
          },
          {
            label: scheduling ? 'Scheduling...' : `Schedule All Events${unscheduledCount > 0 ? ` (${unscheduledCount})` : ''}`,
            variant: 'secondary',
            icon: '\uD83D\uDCC5',
            onClick: handleScheduleAll,
          },
          {
            label: 'Upload Document',
            variant: 'ghost',
            icon: '\uD83D\uDCCE',
            onClick: () => setShowUploadDialog(true),
          },
        ]}
        extraAction={
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-[10px] font-semibold text-[#929da8] uppercase tracking-[0.04em]">Calendar Year</label>
            <input
              type="number"
              value={data.calendarYear}
              onChange={(e) => {
                const yr = parseInt(e.target.value, 10)
                if (!isNaN(yr)) {
                  const newData = { ...data, calendarYear: yr }
                  setData(newData)
                  persistData(newData)
                }
              }}
              className="text-[12px] px-2 py-1 border-[1.5px] border-[#e6e8eb] rounded-md text-[#1a1f25] bg-white focus:outline-none focus:border-[#d12626] w-[80px]"
            />
          </div>
        }
      />

      {/* Attached files */}
      <StepAttachmentList attachments={attachments} />

      {/* Section progress label */}
      <div className="flex items-center justify-between mb-2 mt-4">
        <span className="text-[10px] font-bold text-[#929da8] uppercase tracking-[0.08em]">
          Maintenance Calendar
        </span>
        <span className="text-[11px] font-semibold text-[#6e7b8a]">
          {confirmed.length} / {STEP1PM_SECTIONS.length} sections
        </span>
      </div>

      {/* Task List section */}
      <TaskListTable
        tasks={data.tasks}
        calendarYear={data.calendarYear}
        caseId={caseId}
        tenantId={tenantId}
        vendors={vendors}
        isConfirmed={confirmed.includes('tasks')}
        isOpen={openSections.tasks}
        onToggle={() => toggleSection('tasks')}
        onChange={handleTasksChange}
        onTaskScheduled={handleTaskScheduled}
        onConfirm={(v) => handleConfirmSection('tasks', v)}
        onVendorCreated={handleVendorCreated}
      />

      {/* Calendar Preview section */}
      <CalendarPreview
        tasks={data.tasks}
        isConfirmed={confirmed.includes('calendar')}
        isOpen={openSections.calendar}
        onToggle={() => toggleSection('calendar')}
        onConfirm={(v) => handleConfirmSection('calendar', v)}
      />

      <div className="mt-4 text-center text-[11px] text-[#929da8]">
        \u2193 Click step 2 in the sidebar to continue
      </div>

      {/* Inline action dialogs */}
      <UploadDocumentDialog
        open={showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        caseId={caseId}
        stepNumber={1}
        tenantId={tenantId}
        onAttachmentsChange={setAttachments}
      />
    </div>
  )
}
