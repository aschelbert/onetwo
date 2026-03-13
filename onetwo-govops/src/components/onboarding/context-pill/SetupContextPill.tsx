'use client'

import { usePathname, useRouter } from 'next/navigation'
import { X, ArrowLeft } from 'lucide-react'
import { usePillContext } from './SetupContextPillProvider'

export function SetupContextPill() {
  const { pillState, dismissPill } = usePillContext()
  const pathname = usePathname()
  const router = useRouter()

  // Hide on setup hub pages
  if (!pillState) return null
  if (pathname.includes('/onboarding/') && pathname.includes('/setup')) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-3 bg-white border border-[#e6e8eb] rounded-full shadow-lg px-4 py-2.5">
        {/* Step info */}
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-[#1a1f25] truncate">
            {pillState.activeStepTitle}
          </p>
          <p className="text-[11px] text-[#929da8]">
            {pillState.completedSubTasks}/{pillState.totalSubTasks} tasks
          </p>
        </div>

        {/* Return button */}
        <button
          onClick={() => {
            dismissPill()
            router.push(pillState.setupHubUrl)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium text-white bg-[#d12626] hover:bg-[#b91f1f] transition-colors shrink-0"
        >
          <ArrowLeft size={12} />
          Return to Setup
        </button>

        {/* Dismiss */}
        <button
          onClick={dismissPill}
          className="text-[#929da8] hover:text-[#45505a] transition-colors p-0.5"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
