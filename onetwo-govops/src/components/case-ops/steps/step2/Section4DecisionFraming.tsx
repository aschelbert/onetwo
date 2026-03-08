'use client'

import { useCallback, useRef } from 'react'
import { SectionCard } from '../shared/SectionCard'
import type { Step2DecisionFraming } from '@/types/case-steps'
import { FRAMING_STATEMENTS } from '@/types/case-steps'

interface Props {
  data: Step2DecisionFraming | undefined
  isConfirmed: boolean
  isOpen: boolean
  onToggle: () => void
  onChange: (d: Partial<Step2DecisionFraming>) => void
  onConfirm: (confirmed: boolean) => void
}

export function Section4DecisionFraming({ data, isConfirmed, isOpen, onToggle, onChange, onConfirm }: Props) {
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const debouncedChange = useCallback(
    (field: keyof Step2DecisionFraming, value: string) => {
      if (debounceRefs.current[field]) clearTimeout(debounceRefs.current[field])
      debounceRefs.current[field] = setTimeout(() => {
        onChange({ [field]: value })
      }, 800)
    },
    [onChange]
  )

  const badge = isConfirmed
    ? { label: 'Confirmed', variant: 'confirmed' as const }
    : { label: 'Pending', variant: 'pending' as const }

  return (
    <SectionCard
      title="Decision Framing"
      badge={badge}
      isConfirmed={isConfirmed}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="pt-2.5">
        {/* Hint text */}
        <p className="text-[11px] text-[#929da8] mb-2">
          Complete each statement. These carry forward to Step 7 owner notice.
        </p>

        {/* Framing statements */}
        {FRAMING_STATEMENTS.map((stmt) => (
          <div
            key={stmt.field}
            className="bg-white border-[1.5px] border-[#e6e8eb] border-l-[3px] border-l-indigo-500 rounded-md px-2.5 py-2 mb-1.5 text-[12px] text-[#45505a] italic leading-relaxed"
          >
            <span>{stmt.prefix} </span>
            <input
              type="text"
              defaultValue={data?.[stmt.field] ?? ''}
              onChange={(e) => debouncedChange(stmt.field, e.target.value)}
              placeholder={stmt.placeholder}
              className="inline border-0 border-b-[1.5px] border-dashed border-indigo-500 text-indigo-500 font-semibold not-italic text-[12px] bg-transparent focus:outline-none min-w-[80px] px-[3px]"
            />
            <span>{stmt.suffix}</span>
          </div>
        ))}

        {/* Carry-forward callout */}
        <div className="bg-[#faf5ff] border-[1.5px] border-[#ddd6fe] rounded-lg px-3 py-2 mt-2.5 text-[11px] text-[#6d28d9] flex items-start gap-1.5">
          <span>↗</span>
          <span>Carries forward to Steps 7 &amp; 8 — pre-fills owner notice and assessment rationale.</span>
        </div>

        {/* Confirm section button */}
        <button
          onClick={() => onConfirm(!isConfirmed)}
          className={`mt-2.5 w-full py-2 rounded-lg text-[12px] font-semibold ${
            isConfirmed
              ? 'bg-[#ecfdf5] text-[#047857] border border-[#6ee7b7]'
              : 'bg-white text-[#6e7b8a] border border-[#e6e8eb] hover:border-[#047857]'
          }`}
        >
          {isConfirmed ? '✓ Section Confirmed' : 'Confirm Section'}
        </button>
      </div>
    </SectionCard>
  )
}
