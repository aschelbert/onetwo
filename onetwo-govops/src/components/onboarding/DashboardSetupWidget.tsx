'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Circle, X, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ONBOARDING_STEPS } from '@/types/onboarding'
import type { OnboardingChecklist } from '@/types/onboarding'

interface Props {
  checklist: OnboardingChecklist
  tenancySlug: string
  showPaymentStep?: boolean
}

export function DashboardSetupWidget({ checklist, tenancySlug, showPaymentStep = false }: Props) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || checklist.go_live) return null

  const steps = showPaymentStep
    ? ONBOARDING_STEPS.filter(s => s.id !== 'review_go_live')
    : ONBOARDING_STEPS.filter(s => s.id !== 'payment_processing' && s.id !== 'review_go_live')

  const completedCount = steps.filter(s => checklist[s.checklistField]).length
  const progressPct = (completedCount / steps.length) * 100

  return (
    <div className="bg-white border border-[#e6e8eb] rounded-[10px] p-5 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-[14px] font-semibold text-[#1a1f25] mb-0.5">
            Complete Your Setup
          </h3>
          <p className="text-[12px] text-[#6e7b8a]">
            {completedCount} of {steps.length} steps completed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/app/onboarding/${tenancySlug}`} prefetch={false}>
            <Button variant="accent" size="sm">
              Continue Setup <ArrowRight size={13} />
            </Button>
          </Link>
          <button
            onClick={() => setDismissed(true)}
            className="text-[#929da8] hover:text-[#6e7b8a] p-1 transition-colors"
            title="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-[#e6e8eb] rounded-full h-1.5 mb-4">
        <div
          className="bg-[#047857] h-1.5 rounded-full transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Step grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {steps.map(step => {
          const isComplete = checklist[step.checklistField]
          return (
            <div
              key={step.id}
              className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-[#f8f9fa]"
            >
              {isComplete ? (
                <div className="w-4 h-4 rounded-full bg-[#047857] flex items-center justify-center shrink-0">
                  <Check size={10} className="text-white" strokeWidth={3} />
                </div>
              ) : (
                <div className="w-4 h-4 rounded-full border-[1.5px] border-[#e6e8eb] shrink-0" />
              )}
              <span className={`text-[11px] font-medium truncate ${
                isComplete ? 'text-[#047857]' : 'text-[#929da8]'
              }`}>
                {step.title}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
