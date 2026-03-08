'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface Props {
  stepNumber: number
  totalSteps: number
  title: string
  description: string
  required: boolean
  tenancySlug: string
  canProceed?: boolean
  onSave?: () => Promise<void>
  children: React.ReactNode
  hideSkip?: boolean
  nextLabel?: string
}

export function StepShell({
  stepNumber,
  totalSteps,
  title,
  description,
  required,
  tenancySlug,
  canProceed = true,
  onSave,
  children,
  hideSkip = false,
  nextLabel,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)

  const isLastStep = stepNumber >= totalSteps
  const prevStep = stepNumber > 1 ? stepNumber - 1 : null
  const nextStep = stepNumber < totalSteps ? stepNumber + 1 : null

  const handleContinue = async () => {
    setSaving(true)
    try {
      if (onSave) await onSave()
      startTransition(() => {
        if (isLastStep) {
          router.push(`/app/${tenancySlug}`)
        } else {
          router.push(`/app/onboarding/${tenancySlug}/step/${nextStep}`)
        }
      })
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = () => {
    startTransition(() => {
      if (nextStep) {
        router.push(`/app/onboarding/${tenancySlug}/step/${nextStep}`)
      }
    })
  }

  const handleBack = () => {
    startTransition(() => {
      if (prevStep) {
        router.push(`/app/onboarding/${tenancySlug}/step/${prevStep}`)
      }
    })
  }

  return (
    <div>
      {/* Step header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-bold text-[#929da8] uppercase tracking-[0.08em]">
            Step {stepNumber} of {totalSteps}
          </span>
          {required && <Badge variant="red">Required</Badge>}
          {!required && <Badge variant="gray">Optional</Badge>}
        </div>
        <h1 className="text-[22px] font-bold text-[#1a1f25] mb-1">{title}</h1>
        <p className="text-[13px] text-[#6e7b8a] leading-relaxed">{description}</p>
      </div>

      {/* Step content */}
      <div className="mb-8">
        {children}
      </div>

      {/* Bottom nav bar */}
      <div className="flex items-center justify-between pt-4 border-t border-[#e6e8eb]">
        <div>
          {prevStep && (
            <Button variant="ghost" onClick={handleBack} disabled={isPending}>
              ← Back
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {!required && !hideSkip && nextStep && (
            <Button variant="secondary" onClick={handleSkip} disabled={isPending}>
              Skip for now
            </Button>
          )}

          <Button
            variant="accent"
            onClick={handleContinue}
            disabled={!canProceed || saving || isPending}
            className={!canProceed ? 'opacity-45 cursor-not-allowed' : ''}
          >
            {saving ? 'Saving...' : nextLabel || (isLastStep ? 'Go to Dashboard' : 'Continue →')}
          </Button>
        </div>
      </div>
    </div>
  )
}
