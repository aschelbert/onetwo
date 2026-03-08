'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { StepShell } from '../shared/StepShell'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, Circle, AlertTriangle, Rocket } from 'lucide-react'
import { setGoLive } from '@/app/app/onboarding/[tenancy]/actions'
import { ONBOARDING_STEPS } from '@/types/onboarding'
import type { OnboardingChecklist } from '@/types/onboarding'

interface Props {
  tenancyId: string
  tenancySlug: string
  checklist: OnboardingChecklist
  showPaymentStep: boolean
}

export function Step8ReviewSummary({ tenancyId, tenancySlug, checklist, showPaymentStep }: Props) {
  const router = useRouter()
  const [launching, setLaunching] = useState(false)
  const [, startTransition] = useTransition()

  const steps = showPaymentStep
    ? ONBOARDING_STEPS.filter(s => s.id !== 'review_go_live')
    : ONBOARDING_STEPS.filter(s => s.id !== 'payment_processing' && s.id !== 'review_go_live')

  const requiredSteps = steps.filter(s => s.required)
  const allRequiredComplete = requiredSteps.every(s => checklist[s.checklistField])
  const completedCount = steps.filter(s => checklist[s.checklistField]).length
  const skippedSteps = steps.filter(s => !s.required && !checklist[s.checklistField])

  const handleGoLive = async () => {
    setLaunching(true)
    await setGoLive(tenancyId)
    startTransition(() => {
      router.push(`/app/${tenancySlug}`)
    })
  }

  return (
    <StepShell
      stepNumber={8}
      totalSteps={8}
      title="Review & Go Live"
      description="Review your setup and launch your building's portal."
      required
      tenancySlug={tenancySlug}
      canProceed={allRequiredComplete}
      onSave={handleGoLive}
      nextLabel={launching ? 'Launching...' : 'Go to Dashboard'}
      hideSkip
    >
      <div className="space-y-5">
        {/* Progress summary */}
        <Card>
          <CardBody>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[14px] font-semibold text-[#1a1f25]">Setup Progress</span>
              <span className="text-[13px] font-medium text-[#6e7b8a]">
                {completedCount} of {steps.length} steps completed
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-[#e6e8eb] rounded-full h-2 mb-6">
              <div
                className="bg-[#047857] h-2 rounded-full transition-all"
                style={{ width: `${(completedCount / steps.length) * 100}%` }}
              />
            </div>

            {/* Step list */}
            <div className="space-y-2">
              {steps.map(step => {
                const isComplete = checklist[step.checklistField]
                const isSkipped = !step.required && !isComplete

                return (
                  <div
                    key={step.id}
                    className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[#f8f9fa]"
                  >
                    {isComplete ? (
                      <div className="w-5 h-5 rounded-full bg-[#047857] flex items-center justify-center shrink-0">
                        <Check size={12} className="text-white" strokeWidth={3} />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border-[1.5px] border-[#e6e8eb] flex items-center justify-center shrink-0">
                        <Circle size={8} className="text-[#929da8]" />
                      </div>
                    )}

                    <div className="flex-1">
                      <span className={`text-[13px] font-medium ${
                        isComplete ? 'text-[#1a1f25]' : 'text-[#6e7b8a]'
                      }`}>
                        {step.title}
                      </span>
                      {step.required && !isComplete && (
                        <span className="text-[10px] text-[#d12626] font-semibold ml-2">Required</span>
                      )}
                    </div>

                    <span className={`text-[11px] font-medium ${
                      isComplete ? 'text-[#047857]' : isSkipped ? 'text-[#929da8]' : 'text-[#a16207]'
                    }`}>
                      {isComplete ? 'Complete' : isSkipped ? 'Skipped' : 'Incomplete'}
                    </span>
                  </div>
                )
              })}
            </div>
          </CardBody>
        </Card>

        {/* Warnings */}
        {skippedSteps.length > 0 && (
          <div className="bg-[#fef9c3] border border-[#fcd34d] rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-[#a16207] mt-0.5 shrink-0" />
              <div>
                <p className="text-[13px] font-medium text-[#a16207] mb-1">
                  {skippedSteps.length} optional step{skippedSteps.length > 1 ? 's' : ''} skipped
                </p>
                <p className="text-[12px] text-[#a16207]">
                  You can complete these later from your dashboard: {skippedSteps.map(s => s.title).join(', ')}.
                </p>
              </div>
            </div>
          </div>
        )}

        {!allRequiredComplete && (
          <div className="bg-[#fef2f2] border border-[#fbc8c8] rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-[#d12626] mt-0.5 shrink-0" />
              <div>
                <p className="text-[13px] font-medium text-[#d12626]">
                  Required steps incomplete
                </p>
                <p className="text-[12px] text-[#d12626]">
                  Please complete all required steps before going live: {
                    requiredSteps.filter(s => !checklist[s.checklistField]).map(s => s.title).join(', ')
                  }.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Launch card */}
        {allRequiredComplete && (
          <Card>
            <CardBody>
              <div className="text-center py-4">
                <Rocket size={28} className="text-[#047857] mx-auto mb-3" />
                <h3 className="text-[16px] font-semibold text-[#1a1f25] mb-1">
                  Ready to Launch
                </h3>
                <p className="text-[13px] text-[#6e7b8a] max-w-md mx-auto">
                  Your building portal is set up and ready to go. Click &ldquo;Go to Dashboard&rdquo;
                  below to activate your portal and start managing your community.
                </p>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </StepShell>
  )
}
