'use client'

import { Check } from 'lucide-react'
import { SetupProgressDonut } from './SetupProgressDonut'
import type { SetupProgress, SetupStepProgress } from '@/types/onboarding'

interface Props {
  progress: SetupProgress
  buildingName: string
  activeStepNumber: number
  onStepClick: (stepNumber: number) => void
}

export function SetupSidebar({ progress, buildingName, activeStepNumber, onStepClick }: Props) {
  return (
    <aside className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
      <div className="bg-white border border-[#e6e8eb] rounded-[10px] p-5">
        {/* Building name */}
        <h2 className="text-[15px] font-semibold text-[#1a1f25] mb-1 truncate">
          {buildingName}
        </h2>
        <div className="flex items-center gap-2 mb-5">
          <span className="text-[11px] font-medium text-[#929da8] uppercase tracking-wide">
            Setup
          </span>
          {progress.goLive ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#ecfdf5] text-[#047857]">
              Live
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#fef2f2] text-[#d12626]">
              In Progress
            </span>
          )}
        </div>

        {/* Progress donut */}
        <div className="flex justify-center mb-6">
          <SetupProgressDonut percent={progress.percentComplete} />
        </div>

        {/* Step rail */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[15px] top-[18px] bottom-[18px] w-0.5 bg-[#e6e8eb]" />

          <div className="space-y-0.5">
            {progress.steps.map((step) => (
              <StepRailItem
                key={step.stepNumber}
                step={step}
                isActive={step.stepNumber === activeStepNumber}
                onClick={() => onStepClick(step.stepNumber)}
              />
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}

function StepRailItem({
  step,
  isActive,
  onClick,
}: {
  step: SetupStepProgress
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-3 w-full text-left py-2 px-2 rounded-md transition-colors ${
        isActive ? 'bg-[#fef2f2] border-l-2 border-[#d12626] pl-1.5' : 'hover:bg-[#f8f9fa]'
      }`}
    >
      {/* Status dot */}
      <div className="relative z-10 shrink-0">
        {step.status === 'complete' ? (
          <div className="w-[30px] h-[30px] rounded-full bg-[#047857] flex items-center justify-center">
            <Check size={14} className="text-white" strokeWidth={3} />
          </div>
        ) : step.status === 'active' ? (
          <div className="w-[30px] h-[30px] rounded-full border-[2.5px] border-[#d12626] flex items-center justify-center bg-white">
            <div className="w-2.5 h-2.5 rounded-full bg-[#d12626]" />
          </div>
        ) : (
          <div className="w-[30px] h-[30px] rounded-full border-[1.5px] border-[#e6e8eb] bg-white" />
        )}
      </div>

      {/* Label + count */}
      <div className="min-w-0 flex-1">
        <p className={`text-[12px] font-medium truncate ${
          step.status === 'complete'
            ? 'text-[#047857]'
            : isActive
              ? 'text-[#d12626]'
              : 'text-[#45505a]'
        }`}>
          {step.title}
        </p>
        <p className="text-[11px] text-[#929da8]">
          {step.completedCount}/{step.totalCount} tasks
        </p>
      </div>

      {/* Required badge */}
      {step.required && step.status !== 'complete' && (
        <span className="text-[9px] font-semibold text-[#d12626] uppercase tracking-wide shrink-0">
          Req
        </span>
      )}
    </button>
  )
}
