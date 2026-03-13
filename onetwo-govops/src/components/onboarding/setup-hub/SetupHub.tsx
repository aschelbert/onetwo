'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { SetupSidebar } from './SetupSidebar'
import { SetupStepHeader } from './SetupStepHeader'
import { SetupStepCard } from './SetupStepCard'
import { setGoLive } from '@/app/app/onboarding/[tenancy]/actions'
import type { SetupProgress, SetupContextPillState } from '@/types/onboarding'

interface Props {
  progress: SetupProgress
  tenancySlug: string
  tenancyId: string
  buildingName: string
}

const PILL_STORAGE_KEY = 'setup-context-pill'

export function SetupHub({ progress, tenancySlug, tenancyId, buildingName }: Props) {
  const router = useRouter()

  // Find first incomplete step (active), default to step 1
  const firstActive = progress.steps.find(s => s.status === 'active')
  const [activeStepNumber, setActiveStepNumber] = useState(
    firstActive?.stepNumber ?? progress.steps[0]?.stepNumber ?? 1
  )
  const [isGoingLive, setIsGoingLive] = useState(false)

  const activeStep = progress.steps.find(s => s.stepNumber === activeStepNumber)
  const handleStepClick = useCallback((stepNumber: number) => {
    setActiveStepNumber(stepNumber)
  }, [])

  const handleNavigate = useCallback((modulePath: string) => {
    // Set context pill state in sessionStorage
    const step = progress.steps.find(s => s.stepNumber === activeStepNumber)
    if (step) {
      const pillState: SetupContextPillState = {
        activeStepNumber,
        activeStepTitle: step.title,
        completedSubTasks: progress.completedSubTasks,
        totalSubTasks: progress.totalSubTasks,
        setupHubUrl: `/app/onboarding/${tenancySlug}/setup`,
      }
      try {
        sessionStorage.setItem(PILL_STORAGE_KEY, JSON.stringify(pillState))
      } catch {
        // sessionStorage not available
      }
    }
    router.push(`/app/${tenancySlug}/${modulePath}`)
  }, [activeStepNumber, progress, tenancySlug, router])

  const handleContinue = useCallback(() => {
    // Navigate to the first incomplete sub-task's module
    const step = progress.steps.find(s => s.stepNumber === activeStepNumber)
    if (!step) return

    const firstIncomplete = step.subTasks.find(st => !st.isComplete && st.navigateTo)
    if (firstIncomplete?.navigateTo) {
      handleNavigate(firstIncomplete.navigateTo)
    } else {
      // Move to next step
      const nextStep = progress.steps.find(s => s.stepNumber > activeStepNumber)
      if (nextStep) {
        setActiveStepNumber(nextStep.stepNumber)
      }
    }
  }, [activeStepNumber, progress, handleNavigate])

  const handleGoLive = useCallback(async () => {
    if (!progress.allRequiredComplete) return
    setIsGoingLive(true)
    try {
      await setGoLive(tenancyId)
      router.push(`/app/${tenancySlug}`)
    } catch {
      setIsGoingLive(false)
    }
  }, [progress.allRequiredComplete, tenancyId, tenancySlug, router])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
      {/* Sidebar */}
      <SetupSidebar
        progress={progress}
        buildingName={buildingName}
        activeStepNumber={activeStepNumber}
        onStepClick={handleStepClick}
      />

      {/* Main content */}
      <div className="min-w-0">
        <SetupStepHeader
          currentStep={activeStepNumber}
          totalSteps={progress.steps.length}
          percentComplete={progress.percentComplete}
        />

        <div className="mt-4 space-y-3">
          {progress.steps.map(step => (
            <SetupStepCard
              key={step.stepNumber}
              step={step}
              isExpanded={step.stepNumber === activeStepNumber}
              onToggle={() => handleStepClick(step.stepNumber)}
              onNavigate={handleNavigate}
              onContinue={handleContinue}
              progress={step.stepId === 'review_go_live' ? progress : undefined}
              onGoLive={step.stepId === 'review_go_live' ? handleGoLive : undefined}
              isGoingLive={step.stepId === 'review_go_live' ? isGoingLive : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
