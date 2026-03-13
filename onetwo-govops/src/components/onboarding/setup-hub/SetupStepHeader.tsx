'use client'

interface Props {
  currentStep: number
  totalSteps: number
  percentComplete: number
}

export function SetupStepHeader({ currentStep, totalSteps, percentComplete }: Props) {
  return (
    <div className="sticky top-0 z-10 bg-white border-b border-[#e6e8eb] px-5 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-semibold text-[#1a1f25]">
          Step {currentStep} of {totalSteps}
        </span>
        <span className="text-[12px] font-medium text-[#929da8]">
          {percentComplete}% complete
        </span>
      </div>
      <div className="w-full bg-[#e6e8eb] rounded-full h-1.5">
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{
            width: `${percentComplete}%`,
            backgroundColor: percentComplete >= 100 ? '#047857' : '#d12626',
          }}
        />
      </div>
    </div>
  )
}
