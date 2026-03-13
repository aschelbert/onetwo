'use client'

import { ChevronDown, ChevronRight, Check } from 'lucide-react'
import { SetupSubTaskRow } from './SetupSubTaskRow'
import { SetupReviewPanel } from './SetupReviewPanel'
import { Button } from '@/components/ui/button'
import type { SetupStepProgress, SetupProgress } from '@/types/onboarding'

interface Props {
  step: SetupStepProgress
  isExpanded: boolean
  onToggle: () => void
  onNavigate: (path: string) => void
  onContinue: () => void
  /** Full progress — only needed for Step 8 review panel */
  progress?: SetupProgress
  onGoLive?: () => void
  isGoingLive?: boolean
}

export function SetupStepCard({
  step,
  isExpanded,
  onToggle,
  onNavigate,
  onContinue,
  progress,
  onGoLive,
  isGoingLive,
}: Props) {
  const isReviewStep = step.stepId === 'review_go_live'

  return (
    <div className="bg-white border border-[#e6e8eb] rounded-[10px] overflow-hidden">
      {/* Card header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#f8f9fa] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          {step.status === 'complete' ? (
            <div className="w-7 h-7 rounded-full bg-[#047857] flex items-center justify-center shrink-0">
              <Check size={14} className="text-white" strokeWidth={3} />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-full border-[1.5px] border-[#e6e8eb] flex items-center justify-center text-[12px] font-semibold text-[#929da8] shrink-0">
              {step.stepNumber}
            </div>
          )}

          <div className="min-w-0 text-left">
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-semibold text-[#1a1f25] truncate">
                {step.title}
              </h3>
              {step.required && step.status !== 'complete' && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#fef2f2] text-[#d12626] shrink-0">
                  Required
                </span>
              )}
              {step.status === 'complete' && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#ecfdf5] text-[#047857] shrink-0">
                  Complete
                </span>
              )}
            </div>
            <p className="text-[12px] text-[#929da8] truncate">
              {step.completedCount}/{step.totalCount} tasks completed
            </p>
          </div>
        </div>

        {isExpanded ? (
          <ChevronDown size={18} className="text-[#929da8] shrink-0" />
        ) : (
          <ChevronRight size={18} className="text-[#929da8] shrink-0" />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-[#e6e8eb]">
          {/* Step description */}
          <div className="px-5 pt-4 pb-2">
            <p className="text-[13px] text-[#45505a]">{step.description}</p>
          </div>

          {isReviewStep && progress && onGoLive ? (
            /* Step 8: Review panel */
            <div className="px-5 pb-5">
              <SetupReviewPanel
                progress={progress}
                onGoLive={onGoLive}
                isGoingLive={isGoingLive ?? false}
              />
            </div>
          ) : (
            /* Regular step: sub-task rows + completion panel */
            <div className="px-5 pb-5">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Sub-tasks (col-span-2) */}
                <div className="lg:col-span-2 space-y-0.5">
                  {step.subTasks.map(st => (
                    <SetupSubTaskRow
                      key={st.id}
                      label={st.label}
                      isComplete={st.isComplete}
                      navigateTo={st.navigateTo}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>

                {/* Completion panel (col-span-1) */}
                <div className="lg:col-span-1">
                  <div className="bg-[#f8f9fa] rounded-lg p-4">
                    <p className="text-[11px] font-medium text-[#929da8] uppercase tracking-wide mb-2">
                      Progress
                    </p>
                    <div className="w-full bg-[#e6e8eb] rounded-full h-1.5 mb-2">
                      <div
                        className="h-1.5 rounded-full transition-all duration-500"
                        style={{
                          width: `${step.totalCount > 0 ? (step.completedCount / step.totalCount) * 100 : 0}%`,
                          backgroundColor: step.completedCount === step.totalCount ? '#047857' : '#d12626',
                        }}
                      />
                    </div>
                    <p className="text-[12px] text-[#45505a] mb-3">
                      {step.completedCount} of {step.totalCount} tasks done
                    </p>
                    {step.status !== 'complete' && (
                      <Button
                        variant="accent"
                        size="sm"
                        className="w-full"
                        onClick={onContinue}
                      >
                        Continue
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
