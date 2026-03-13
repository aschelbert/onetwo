'use client'

import { Check, Rocket, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SetupProgress } from '@/types/onboarding'

interface Props {
  progress: SetupProgress
  onGoLive: () => void
  isGoingLive: boolean
}

export function SetupReviewPanel({ progress, onGoLive, isGoingLive }: Props) {
  const requiredSteps = progress.steps.filter(s => s.required && s.stepId !== 'review_go_live')
  const optionalSteps = progress.steps.filter(s => !s.required)

  return (
    <div className="space-y-5">
      {/* Progress summary */}
      <div className="bg-[#f8f9fa] rounded-lg p-4">
        <h4 className="text-[13px] font-semibold text-[#1a1f25] mb-3">Setup Progress</h4>

        {/* Required steps */}
        <div className="mb-4">
          <p className="text-[11px] font-medium text-[#929da8] uppercase tracking-wide mb-2">
            Required
          </p>
          <div className="space-y-1.5">
            {requiredSteps.map(step => (
              <div key={step.stepId} className="flex items-center gap-2">
                {step.status === 'complete' ? (
                  <div className="w-4 h-4 rounded-full bg-[#047857] flex items-center justify-center shrink-0">
                    <Check size={10} className="text-white" strokeWidth={3} />
                  </div>
                ) : (
                  <div className="w-4 h-4 rounded-full border-[1.5px] border-[#e6e8eb] shrink-0" />
                )}
                <span className={`text-[12px] font-medium ${
                  step.status === 'complete' ? 'text-[#047857]' : 'text-[#1a1f25]'
                }`}>
                  {step.title}
                </span>
                <span className="text-[11px] text-[#929da8] ml-auto">
                  {step.completedCount}/{step.totalCount}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Optional steps */}
        <div>
          <p className="text-[11px] font-medium text-[#929da8] uppercase tracking-wide mb-2">
            Optional
          </p>
          <div className="space-y-1.5">
            {optionalSteps.map(step => (
              <div key={step.stepId} className="flex items-center gap-2">
                {step.status === 'complete' ? (
                  <div className="w-4 h-4 rounded-full bg-[#047857] flex items-center justify-center shrink-0">
                    <Check size={10} className="text-white" strokeWidth={3} />
                  </div>
                ) : (
                  <div className="w-4 h-4 rounded-full border-[1.5px] border-[#e6e8eb] shrink-0" />
                )}
                <span className={`text-[12px] font-medium ${
                  step.status === 'complete' ? 'text-[#047857]' : 'text-[#45505a]'
                }`}>
                  {step.title}
                </span>
                <span className="text-[11px] text-[#929da8] ml-auto">
                  {step.completedCount}/{step.totalCount}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Go Live */}
      <div className="border border-[#e6e8eb] rounded-lg p-4">
        {progress.allRequiredComplete ? (
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-[#ecfdf5] flex items-center justify-center mx-auto mb-3">
              <Rocket size={20} className="text-[#047857]" />
            </div>
            <h4 className="text-[14px] font-semibold text-[#1a1f25] mb-1">
              Ready to Go Live
            </h4>
            <p className="text-[12px] text-[#45505a] mb-4">
              All required steps are complete. Launch your building portal.
            </p>
            <Button
              variant="accent"
              className="w-full"
              onClick={onGoLive}
              disabled={isGoingLive}
            >
              {isGoingLive ? 'Launching...' : 'Go Live'}
            </Button>
          </div>
        ) : (
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-[#fef2f2] flex items-center justify-center mx-auto mb-3">
              <AlertCircle size={20} className="text-[#d12626]" />
            </div>
            <h4 className="text-[14px] font-semibold text-[#1a1f25] mb-1">
              Not Ready Yet
            </h4>
            <p className="text-[12px] text-[#45505a]">
              Complete all required steps before going live.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
