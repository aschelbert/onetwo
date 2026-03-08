'use client'

import { useCallback, useRef } from 'react'
import { SectionCard } from '../shared/SectionCard'
import type { Step2StudyValidity } from '@/types/case-steps'
import { STUDY_TYPE_LABELS, COMPLIANCE_LABELS } from '@/types/case-steps'

interface Props {
  data: Step2StudyValidity | undefined
  isConfirmed: boolean
  isOpen: boolean
  onToggle: () => void
  onChange: (d: Partial<Step2StudyValidity>) => void
  onConfirm: (confirmed: boolean) => void
}

export function Section1StudyValidity({ data, isConfirmed, isOpen, onToggle, onChange, onConfirm }: Props) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const debouncedChange = useCallback(
    (field: keyof Step2StudyValidity, value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onChange({ [field]: value })
      }, 800)
    },
    [onChange]
  )

  const immediateChange = useCallback(
    (field: keyof Step2StudyValidity, value: string | null) => {
      onChange({ [field]: value })
    },
    [onChange]
  )

  // Compute age tag for next update due
  const getAgePill = () => {
    if (!data?.nextUpdateDue) return null
    const due = new Date(data.nextUpdateDue)
    const now = new Date()
    const diffMs = due.getTime() - now.getTime()
    const totalMonths = Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44))
    if (totalMonths <= 0) return { label: 'Overdue', color: 'bg-[#fef2f2] text-[#d12626]' }
    const years = Math.floor(totalMonths / 12)
    const months = totalMonths % 12
    const parts = []
    if (years > 0) parts.push(`${years} yr${years > 1 ? 's' : ''}`)
    if (months > 0) parts.push(`${months} mo`)
    return { label: parts.join(' '), color: 'bg-[#ecfdf5] text-[#047857]' }
  }

  const agePill = getAgePill()

  const badge = isConfirmed
    ? { label: 'Confirmed', variant: 'confirmed' as const }
    : { label: 'Pending', variant: 'pending' as const }

  return (
    <SectionCard
      title="Study Validity & Compliance"
      badge={badge}
      isConfirmed={isConfirmed}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="pt-2.5">
        {/* Field grid */}
        <div className="bg-[#f8f9fa] rounded-lg px-3 py-2.5 mb-2.5">
          {/* Date of last study */}
          <div className="grid grid-cols-[140px_1fr] gap-2 items-center py-[5px] border-b border-[#e6e8eb]">
            <span className="text-[10px] font-semibold text-[#929da8] uppercase tracking-[0.04em]">Date of Last Study</span>
            <input
              type="date"
              defaultValue={data?.lastStudyDate ?? ''}
              onChange={(e) => immediateChange('lastStudyDate', e.target.value || null)}
              className="text-[12px] px-2 py-1 border-[1.5px] border-[#e6e8eb] rounded-md font-[inherit] text-[#1a1f25] bg-white focus:outline-none focus:border-[#d12626] max-w-[160px]"
            />
          </div>

          {/* Study type */}
          <div className="grid grid-cols-[140px_1fr] gap-2 items-center py-[5px] border-b border-[#e6e8eb]">
            <span className="text-[10px] font-semibold text-[#929da8] uppercase tracking-[0.04em]">Study Type</span>
            <select
              defaultValue={data?.studyType ?? ''}
              onChange={(e) => immediateChange('studyType', e.target.value || null)}
              className="text-[12px] px-2 py-1 border-[1.5px] border-[#e6e8eb] rounded-md font-[inherit] text-[#1a1f25] bg-white focus:outline-none focus:border-[#d12626]"
            >
              <option value="">Select...</option>
              {Object.entries(STUDY_TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          {/* Preparer */}
          <div className="grid grid-cols-[140px_1fr] gap-2 items-center py-[5px] border-b border-[#e6e8eb]">
            <span className="text-[10px] font-semibold text-[#929da8] uppercase tracking-[0.04em]">Preparer</span>
            <input
              type="text"
              defaultValue={data?.preparer ?? ''}
              onChange={(e) => debouncedChange('preparer', e.target.value)}
              placeholder="e.g. Capital Reserve Group"
              className="text-[12px] px-2 py-1 border-[1.5px] border-[#e6e8eb] rounded-md font-[inherit] text-[#1a1f25] bg-white focus:outline-none focus:border-[#d12626] max-w-[260px]"
            />
          </div>

          {/* State compliance */}
          <div className="grid grid-cols-[140px_1fr] gap-2 items-center py-[5px] border-b border-[#e6e8eb]">
            <span className="text-[10px] font-semibold text-[#929da8] uppercase tracking-[0.04em]">State Compliance</span>
            <div className="flex gap-[5px] flex-wrap">
              {(Object.entries(COMPLIANCE_LABELS) as [NonNullable<Step2StudyValidity['compliance']>, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => immediateChange('compliance', data?.compliance === val ? null : val)}
                  className={`px-2.5 py-1 border-[1.5px] rounded-md text-[11px] font-medium cursor-pointer ${
                    data?.compliance === val
                      ? 'bg-[#ecfdf5] border-[#6ee7b7] text-[#047857] font-bold'
                      : 'border-[#e6e8eb] text-[#6e7b8a] bg-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Next update due */}
          <div className="grid grid-cols-[140px_1fr] gap-2 items-center py-[5px]">
            <span className="text-[10px] font-semibold text-[#929da8] uppercase tracking-[0.04em]">Next Update Due</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                defaultValue={data?.nextUpdateDue ?? ''}
                onChange={(e) => immediateChange('nextUpdateDue', e.target.value || null)}
                className="text-[12px] px-2 py-1 border-[1.5px] border-[#e6e8eb] rounded-md font-[inherit] text-[#1a1f25] bg-white focus:outline-none focus:border-[#d12626] max-w-[160px]"
              />
              {agePill && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${agePill.color}`}>
                  {agePill.label}
                </span>
              )}
            </div>
          </div>
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
