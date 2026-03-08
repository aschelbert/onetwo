'use client'

import { useCallback, useRef } from 'react'
import { SectionCard } from '../shared/SectionCard'
import type { Step2PercentFunded } from '@/types/case-steps'
import { calcPercentFunded, getRiskBand, RISK_BAND_CONFIG } from '@/types/case-steps'

interface Props {
  data: Step2PercentFunded | undefined
  isConfirmed: boolean
  isOpen: boolean
  onToggle: () => void
  onChange: (d: Partial<Step2PercentFunded>) => void
  onConfirm: (confirmed: boolean) => void
}

function formatDollars(n: number | null): string {
  if (n === null) return '—'
  return '$' + n.toLocaleString()
}

export function Section3PercentFunded({ data, isConfirmed, isOpen, onToggle, onChange, onConfirm }: Props) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const debouncedNumericChange = useCallback(
    (field: keyof Step2PercentFunded, value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onChange({ [field]: value ? Number(value) : null })
      }, 800)
    },
    [onChange]
  )

  const pct = calcPercentFunded(data?.reserveBalance ?? null, data?.totalReplacement ?? null)
  const riskBand = pct !== null ? getRiskBand(pct) : null
  const riskConfig = riskBand ? RISK_BAND_CONFIG[riskBand] : null

  const badge = isConfirmed
    ? { label: 'Confirmed', variant: 'confirmed' as const }
    : riskBand === 'high'
      ? { label: 'High Risk', variant: 'risk_high' as const }
      : riskBand === 'moderate'
        ? { label: 'Moderate', variant: 'warn' as const }
        : { label: 'Pending', variant: 'pending' as const }

  return (
    <SectionCard
      title="Percent Funded & Risk"
      badge={badge}
      isConfirmed={isConfirmed}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="pt-2.5">
        {/* Stat trio */}
        <div className="grid grid-cols-3 gap-1.5 mb-2.5">
          {/* Total Replacement */}
          <div className="bg-[#f8f9fa] rounded-lg px-2.5 py-2 border border-[#e6e8eb]">
            <div className="text-[9px] font-bold text-[#929da8] uppercase tracking-[0.06em] mb-[3px]">Total Replacement</div>
            <input
              type="number"
              defaultValue={data?.totalReplacement ?? ''}
              onChange={(e) => debouncedNumericChange('totalReplacement', e.target.value)}
              placeholder="0"
              className="text-[15px] font-extrabold text-[#1a1f25] bg-transparent border-0 w-full focus:outline-none"
            />
            <div className="text-[9px] text-[#929da8] mt-0.5">{formatDollars(data?.totalReplacement ?? null)}</div>
          </div>

          {/* Reserve Balance */}
          <div className="bg-[#f8f9fa] rounded-lg px-2.5 py-2 border border-[#e6e8eb]">
            <div className="text-[9px] font-bold text-[#929da8] uppercase tracking-[0.06em] mb-[3px]">Reserve Balance</div>
            <input
              type="number"
              defaultValue={data?.reserveBalance ?? ''}
              onChange={(e) => debouncedNumericChange('reserveBalance', e.target.value)}
              placeholder="0"
              className="text-[15px] font-extrabold text-[#1a1f25] bg-transparent border-0 w-full focus:outline-none"
            />
            <div className="text-[9px] text-[#929da8] mt-0.5">{formatDollars(data?.reserveBalance ?? null)}</div>
          </div>

          {/* Percent Funded (derived) */}
          <div className="bg-[#f8f9fa] rounded-lg px-2.5 py-2 border border-[#e6e8eb]">
            <div className="text-[9px] font-bold text-[#929da8] uppercase tracking-[0.06em] mb-[3px]">% Funded</div>
            <div className={`text-[15px] font-extrabold ${riskConfig?.textClass ?? 'text-[#1a1f25]'}`}>
              {pct !== null ? `${pct}%` : '—'}
            </div>
            <div className="text-[9px] text-[#929da8] mt-0.5">Auto-calculated</div>
          </div>
        </div>

        {/* Risk band */}
        {riskConfig && pct !== null && (
          <div className={`rounded-lg px-3 py-2.5 mb-2.5 ${riskConfig.bgClass} border ${riskConfig.borderClass}`}>
            <div className={`text-[9px] font-bold uppercase tracking-[0.08em] mb-1 ${riskConfig.textClass}`}>
              Risk Band
            </div>
            <div className={`text-[18px] font-extrabold ${riskConfig.textClass}`}>
              {riskConfig.icon} {riskConfig.label} — {pct}%
            </div>
            <div className="text-[10px] text-[#6e7b8a] mt-0.5">
              {riskBand === 'high' && 'Below 30% funded — significant shortfall risk'}
              {riskBand === 'moderate' && '30–70% funded — monitor and plan increases'}
              {riskBand === 'strong' && '70%+ funded — healthy reserve position'}
            </div>
          </div>
        )}

        {/* Diagnostic questions */}
        <div className="mb-2.5">
          {/* Funding trend */}
          <div className="mb-3">
            <div className="text-[12px] font-semibold text-[#45505a] mb-[5px]">Funding trend vs. last year?</div>
            <div className="flex gap-[5px] flex-wrap">
              {([
                { value: 'up', label: '↑ Up', selectedClass: 'bg-[#ecfdf5] border-[#6ee7b7] text-[#047857]' },
                { value: 'down', label: '↓ Down', selectedClass: 'bg-[#fef2f2] border-[#fbc8c8] text-[#d12626]' },
                { value: 'flat', label: '→ Flat', selectedClass: 'bg-[#fef9c3] border-[#fcd34d] text-[#a16207]' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onChange({ fundingTrend: data?.fundingTrend === opt.value ? null : opt.value })}
                  className={`px-2.5 py-1 border-[1.5px] rounded-md text-[11px] font-medium cursor-pointer ${
                    data?.fundingTrend === opt.value
                      ? `${opt.selectedClass} font-bold`
                      : 'border-[#e6e8eb] text-[#6e7b8a] bg-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Underfunded risk */}
          <div>
            <div className="text-[12px] font-semibold text-[#45505a] mb-[5px]">Underfunded relative to near-term risk?</div>
            <div className="flex gap-[5px] flex-wrap">
              {([
                { value: 'yes', label: 'Yes — underfunded', selectedClass: 'bg-[#fef2f2] border-[#fbc8c8] text-[#d12626]' },
                { value: 'no', label: 'No', selectedClass: 'bg-[#ecfdf5] border-[#6ee7b7] text-[#047857]' },
                { value: 'borderline', label: 'Borderline', selectedClass: 'bg-[#fef9c3] border-[#fcd34d] text-[#a16207]' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onChange({ underfundedRisk: data?.underfundedRisk === opt.value ? null : opt.value })}
                  className={`px-2.5 py-1 border-[1.5px] rounded-md text-[11px] font-medium cursor-pointer ${
                    data?.underfundedRisk === opt.value
                      ? `${opt.selectedClass} font-bold`
                      : 'border-[#e6e8eb] text-[#6e7b8a] bg-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
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
