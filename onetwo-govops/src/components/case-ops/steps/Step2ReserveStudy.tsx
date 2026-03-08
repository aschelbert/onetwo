'use client'

import { useState, useCallback, useTransition } from 'react'
import { upsertStep2Data, toggleSectionConfirmed, markStep2Complete } from '@/app/app/[tenancy]/boardroom/cases/[caseId]/steps/actions'
import type { Step2Data, Step2SectionId } from '@/types/case-steps'

// Sub-sections
import { Section1StudyValidity } from './step2/Section1StudyValidity'
import { Section2ComponentSchedule } from './step2/Section2ComponentSchedule'
import { Section3PercentFunded } from './step2/Section3PercentFunded'
import { Section4DecisionFraming } from './step2/Section4DecisionFraming'
import { QuickActionsCard } from './shared/QuickActionsCard'
import { StepDescriptionCard } from './shared/StepDescriptionCard'
import { MarkCompleteCard } from './shared/MarkCompleteCard'

interface Props {
  caseId: string
  initialData: Partial<Step2Data>
  confirmedSections: string[]
  isComplete: boolean
}

export function Step2ReserveStudy({ caseId, initialData, confirmedSections: initialConfirmed, isComplete: initialComplete }: Props) {
  const [data, setData] = useState<Partial<Step2Data>>(initialData)
  const [confirmed, setConfirmed] = useState<string[]>(initialConfirmed)
  const [isComplete, setIsComplete] = useState(initialComplete)
  const [openSections, setOpenSections] = useState<Record<Step2SectionId, boolean>>({
    study_validity: false,
    component_schedule: true,
    percent_funded: true,
    decision_framing: true,
  })
  const [, startTransition] = useTransition()

  const handleDataChange = useCallback((section: keyof Step2Data, sectionData: Partial<Step2Data[keyof Step2Data]>) => {
    setData((prev) => {
      const merged = { ...prev, [section]: { ...(prev[section] as object), ...sectionData } }
      startTransition(async () => {
        await upsertStep2Data(caseId, { [section]: { ...(prev[section] as object), ...sectionData } })
      })
      return merged
    })
  }, [caseId])

  const handleConfirmSection = useCallback(async (sectionId: Step2SectionId, value: boolean) => {
    const result = await toggleSectionConfirmed(caseId, sectionId, value)
    setConfirmed(result.confirmedSections)
    setIsComplete(result.isComplete)
  }, [caseId])

  const handleMarkComplete = useCallback(async () => {
    try {
      await markStep2Complete(caseId)
      setIsComplete(true)
    } catch (e) {
      alert((e as Error).message)
    }
  }, [caseId])

  const toggleSection = (id: Step2SectionId) =>
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))

  const allConfirmed = ['study_validity', 'component_schedule', 'percent_funded', 'decision_framing']
    .every((s) => confirmed.includes(s))

  return (
    <div className="px-7 py-[18px] pb-8">
      {/* Mark Complete */}
      <MarkCompleteCard
        stepNumber={2}
        isComplete={isComplete}
        canComplete={allConfirmed}
        onComplete={handleMarkComplete}
      />

      {/* Description + Guidance */}
      <StepDescriptionCard
        question="Review Reserve Study"
        timeline="60–90 days out"
        reference="Reserve study & Fiscal Lens: Reserves"
        guidance="Before any budget number is set, the board must understand the reserve picture. Work through all four sections. This step cannot be marked complete until each section is confirmed — and the outputs here feed directly into the owner notice (Step 7) and assessment rationale (Step 8)."
      />

      {/* Quick Actions */}
      <QuickActionsCard
        actions={[
          { label: 'Review Reserve Study', variant: 'primary', icon: '📊', href: '#' },
          { label: 'Open Reserves', variant: 'secondary', icon: '🏦', href: '/fiscal-lens/reserves', hint: '→ Fiscal Lens → Reserves' },
          { label: 'Upload Document', variant: 'ghost', icon: '📎', onClick: () => { /* TODO */ } },
        ]}
      />

      {/* Section progress label */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-[#929da8] uppercase tracking-[0.08em]">Review Checklist</span>
        <span className="text-[11px] font-semibold text-[#6e7b8a]">{confirmed.length} / 4 sections</span>
      </div>

      {/* 4 collapsible section cards */}
      <Section1StudyValidity
        data={data.studyValidity}
        isConfirmed={confirmed.includes('study_validity')}
        isOpen={openSections.study_validity}
        onToggle={() => toggleSection('study_validity')}
        onChange={(d) => handleDataChange('studyValidity', d)}
        onConfirm={(v) => handleConfirmSection('study_validity', v)}
      />

      <Section2ComponentSchedule
        data={data.componentSchedule}
        isConfirmed={confirmed.includes('component_schedule')}
        isOpen={openSections.component_schedule}
        onToggle={() => toggleSection('component_schedule')}
        onChange={(d) => handleDataChange('componentSchedule', d)}
        onConfirm={(v) => handleConfirmSection('component_schedule', v)}
      />

      <Section3PercentFunded
        data={data.percentFunded}
        isConfirmed={confirmed.includes('percent_funded')}
        isOpen={openSections.percent_funded}
        onToggle={() => toggleSection('percent_funded')}
        onChange={(d) => handleDataChange('percentFunded', d)}
        onConfirm={(v) => handleConfirmSection('percent_funded', v)}
      />

      <Section4DecisionFraming
        data={data.decisionFraming}
        isConfirmed={confirmed.includes('decision_framing')}
        isOpen={openSections.decision_framing}
        onToggle={() => toggleSection('decision_framing')}
        onChange={(d) => handleDataChange('decisionFraming', d)}
        onConfirm={(v) => handleConfirmSection('decision_framing', v)}
      />

      <div className="mt-4 text-center text-[11px] text-[#929da8]">
        ↓ Click step 3 in the sidebar to continue
      </div>
    </div>
  )
}
