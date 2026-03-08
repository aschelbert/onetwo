'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ONBOARDING_STEPS } from '@/types/onboarding'
import type { OnboardingChecklist } from '@/types/onboarding'
import { Check } from 'lucide-react'

interface Props {
  checklist: OnboardingChecklist
  showPaymentStep: boolean
  tenancySlug: string
}

export function OnboardingStepper({ checklist, showPaymentStep, tenancySlug }: Props) {
  const pathname = usePathname()
  const currentStepMatch = pathname.match(/\/step\/(\d+)/)
  const currentStep = currentStepMatch ? parseInt(currentStepMatch[1], 10) : 0

  const steps = showPaymentStep
    ? ONBOARDING_STEPS
    : ONBOARDING_STEPS.filter(s => s.id !== 'payment_processing')

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, idx) => {
        const isComplete = checklist[step.checklistField]
        const isCurrent = step.number === currentStep
        const isAccessible = isComplete || isCurrent || steps.slice(0, idx).every(s => checklist[s.checklistField])

        return (
          <div key={step.id} className="flex items-center">
            {idx > 0 && (
              <div className={`w-6 h-[2px] mx-1 ${isComplete ? 'bg-[#047857]' : 'bg-[#e6e8eb]'}`} />
            )}

            {isAccessible ? (
              <Link
                href={`/app/onboarding/${tenancySlug}/step/${step.number}`}
                className="flex items-center gap-1.5 group"
                prefetch={false}
              >
                <StepIndicator
                  number={step.number}
                  isComplete={isComplete}
                  isCurrent={isCurrent}
                />
                <span className={`text-[11px] font-medium hidden sm:inline ${
                  isCurrent
                    ? 'text-[#1a1f25] font-semibold'
                    : isComplete
                    ? 'text-[#047857]'
                    : 'text-[#929da8] group-hover:text-[#6e7b8a]'
                }`}>
                  {step.title}
                </span>
              </Link>
            ) : (
              <div className="flex items-center gap-1.5 opacity-50 cursor-not-allowed">
                <StepIndicator
                  number={step.number}
                  isComplete={false}
                  isCurrent={false}
                />
                <span className="text-[11px] font-medium text-[#929da8] hidden sm:inline">
                  {step.title}
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StepIndicator({
  number,
  isComplete,
  isCurrent,
}: {
  number: number
  isComplete: boolean
  isCurrent: boolean
}) {
  if (isComplete) {
    return (
      <div className="w-6 h-6 rounded-full bg-[#047857] flex items-center justify-center shrink-0">
        <Check size={13} className="text-white" strokeWidth={3} />
      </div>
    )
  }

  return (
    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
      isCurrent
        ? 'bg-[#1a1f25] text-white'
        : 'border-[1.5px] border-[#e6e8eb] text-[#929da8]'
    }`}>
      {number}
    </div>
  )
}
