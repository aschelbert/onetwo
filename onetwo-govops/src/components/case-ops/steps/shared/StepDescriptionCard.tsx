'use client'

interface StepDescriptionCardProps {
  question: string
  timeline: string
  reference: string
  guidance: string
}

export function StepDescriptionCard({ question, timeline, reference, guidance }: StepDescriptionCardProps) {
  return (
    <div className="bg-white border-[1.5px] border-[#e6e8eb] rounded-[10px] p-4 mb-4">
      {/* Question text */}
      <p className="text-[14px] font-medium text-[#1a1f25] mb-3 leading-relaxed">{question}</p>

      {/* Metadata row */}
      <div className="flex gap-6 mb-3">
        <div className="flex items-start gap-1.5">
          <div>
            <span className="text-[10px] font-bold text-[#929da8] uppercase tracking-[0.06em] block">Timeline</span>
            <span className="text-[12px] text-[#45505a] font-medium">{timeline}</span>
          </div>
        </div>
        <div className="flex items-start gap-1.5">
          <div>
            <span className="text-[10px] font-bold text-[#929da8] uppercase tracking-[0.06em] block">Reference</span>
            <span className="text-[12px] text-[#45505a] font-medium">{reference}</span>
          </div>
        </div>
      </div>

      {/* Guidance block */}
      <div className="bg-[#f0fdfa] rounded-lg px-3.5 py-3">
        <span className="text-[10px] font-bold text-[#0d9488] uppercase tracking-[0.08em] mb-1.5 block">Board Guidance</span>
        <p className="text-[12.5px] text-[#45505a] leading-[1.55]">{guidance}</p>
      </div>
    </div>
  )
}
