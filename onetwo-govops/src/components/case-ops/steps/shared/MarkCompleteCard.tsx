'use client'

interface MarkCompleteCardProps {
  stepNumber: number
  isComplete: boolean
  canComplete: boolean
  onComplete: () => void
}

export function MarkCompleteCard({ stepNumber, isComplete, canComplete, onComplete }: MarkCompleteCardProps) {
  return (
    <div className="border-[1.5px] border-[#e6e8eb] rounded-[10px] overflow-hidden mb-4 bg-white">
      <div className="flex items-center gap-3 px-4 py-3.5">
        {/* Circle number */}
        <div className="w-[30px] h-[30px] rounded-full border-[1.5px] border-[#e6e8eb] flex items-center justify-center text-[13px] font-bold text-[#6e7b8a] shrink-0">
          {stepNumber}
        </div>

        {/* Label */}
        <span className="text-[14px] font-semibold text-[#1a1f25] flex-1">
          {isComplete ? 'Step Complete' : 'Review Reserve Study'}
        </span>

        {/* Button */}
        <button
          onClick={onComplete}
          disabled={!canComplete || isComplete}
          className={`bg-[#d12626] text-white rounded-full px-4 py-[7px] text-[12px] font-semibold ${
            canComplete && !isComplete
              ? 'opacity-100 cursor-pointer hover:bg-[#b91c1c]'
              : 'opacity-45 cursor-not-allowed'
          }`}
        >
          {isComplete ? 'Completed ✓' : 'Mark Complete'}
        </button>
      </div>
    </div>
  )
}
