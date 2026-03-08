'use client'

import { useCallback } from 'react'
import { SectionCard } from '../shared/SectionCard'
import type { Step2ComponentSchedule, ReserveComponent } from '@/types/case-steps'
import { computeComponentFlag, getTotalReplacement, getTotalAnnualRequired, getFlaggedComponents } from '@/types/case-steps'

interface Props {
  data: Step2ComponentSchedule | undefined
  isConfirmed: boolean
  isOpen: boolean
  onToggle: () => void
  onChange: (d: Partial<Step2ComponentSchedule>) => void
  onConfirm: (confirmed: boolean) => void
}

function formatDollars(n: number | null): string {
  if (n === null) return '—'
  return '$' + n.toLocaleString()
}

export function Section2ComponentSchedule({ data, isConfirmed, isOpen, onToggle, onChange, onConfirm }: Props) {
  const components = (data?.components ?? []).map((c) => ({
    ...c,
    flag: computeComponentFlag(c.lifeRemainingYears),
  }))

  const flagged = getFlaggedComponents(components)
  const totalReplacement = getTotalReplacement(components)
  const totalAnnual = getTotalAnnualRequired(components)

  const handleAddComponent = useCallback(() => {
    const newComponent: ReserveComponent = {
      id: crypto.randomUUID(),
      name: '',
      lifeRemainingYears: null,
      estimatedCost: null,
      annualRequired: null,
      flag: null,
    }
    onChange({ components: [...(data?.components ?? []), newComponent] })
  }, [data, onChange])

  const handleUpdateComponent = useCallback(
    (id: string, field: keyof ReserveComponent, value: string | number | null) => {
      const updated = (data?.components ?? []).map((c) =>
        c.id === id ? { ...c, [field]: value } : c
      )
      onChange({ components: updated })
    },
    [data, onChange]
  )

  const handleRemoveComponent = useCallback(
    (id: string) => {
      const updated = (data?.components ?? []).filter((c) => c.id !== id)
      onChange({ components: updated })
    },
    [data, onChange]
  )

  const badge = isConfirmed
    ? { label: 'Confirmed', variant: 'confirmed' as const }
    : flagged.length > 0
      ? { label: `${flagged.length} flagged`, variant: 'risk_high' as const }
      : { label: 'Pending', variant: 'pending' as const }

  return (
    <SectionCard
      title="Component Schedule"
      badge={badge}
      isConfirmed={isConfirmed}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="pt-2.5">
        {/* Alert box for flagged components */}
        {flagged.length > 0 && (
          <div className="bg-[#fef2f2] border border-[#fbc8c8] rounded-lg px-3 py-[9px] flex gap-2 mb-2.5 text-[11px] text-[#45505a]">
            <span>⚠️</span>
            <span>
              <strong className="text-[#d12626]">{flagged.length} component{flagged.length > 1 ? 's' : ''}</strong>{' '}
              {flagged.length > 1 ? 'are' : 'is'} flagged for near-term replacement (≤ 2 years remaining).
            </span>
          </div>
        )}

        {/* Component table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="text-[9px] font-bold text-[#929da8] uppercase tracking-[0.06em] px-2 py-1 bg-[#f8f9fa] text-left border-b border-[#e6e8eb]">Component</th>
                <th className="text-[9px] font-bold text-[#929da8] uppercase tracking-[0.06em] px-2 py-1 bg-[#f8f9fa] text-left border-b border-[#e6e8eb]">Life Rem.</th>
                <th className="text-[9px] font-bold text-[#929da8] uppercase tracking-[0.06em] px-2 py-1 bg-[#f8f9fa] text-left border-b border-[#e6e8eb]">Est. Cost</th>
                <th className="text-[9px] font-bold text-[#929da8] uppercase tracking-[0.06em] px-2 py-1 bg-[#f8f9fa] text-left border-b border-[#e6e8eb]">Annual Req.</th>
                <th className="text-[9px] font-bold text-[#929da8] uppercase tracking-[0.06em] px-2 py-1 bg-[#f8f9fa] text-left border-b border-[#e6e8eb]">Flag</th>
                <th className="text-[9px] font-bold text-[#929da8] uppercase tracking-[0.06em] px-2 py-1 bg-[#f8f9fa] text-left border-b border-[#e6e8eb]"></th>
              </tr>
            </thead>
            <tbody>
              {components.map((c) => {
                const isFlagged = c.flag !== null
                return (
                  <tr key={c.id} className={isFlagged ? 'bg-[#fef2f2]' : ''}>
                    <td className={`px-2 py-[6px] border-b border-[#f8f9fa] ${isFlagged ? 'text-[#d12626]' : 'text-[#45505a]'}`}>
                      <input
                        type="text"
                        defaultValue={c.name}
                        onChange={(e) => handleUpdateComponent(c.id, 'name', e.target.value)}
                        placeholder="Component name"
                        className="bg-transparent border-0 text-[11px] w-full focus:outline-none"
                      />
                    </td>
                    <td className={`px-2 py-[6px] border-b border-[#f8f9fa] ${isFlagged ? 'text-[#d12626]' : 'text-[#45505a]'}`}>
                      <input
                        type="number"
                        defaultValue={c.lifeRemainingYears ?? ''}
                        onChange={(e) => handleUpdateComponent(c.id, 'lifeRemainingYears', e.target.value ? Number(e.target.value) : null)}
                        placeholder="—"
                        className="bg-transparent border-0 text-[11px] w-16 focus:outline-none"
                      />
                    </td>
                    <td className={`px-2 py-[6px] border-b border-[#f8f9fa] ${isFlagged ? 'text-[#d12626]' : 'text-[#45505a]'}`}>
                      <input
                        type="number"
                        defaultValue={c.estimatedCost ?? ''}
                        onChange={(e) => handleUpdateComponent(c.id, 'estimatedCost', e.target.value ? Number(e.target.value) : null)}
                        placeholder="—"
                        className="bg-transparent border-0 text-[11px] w-24 focus:outline-none"
                      />
                    </td>
                    <td className={`px-2 py-[6px] border-b border-[#f8f9fa] ${isFlagged ? 'text-[#d12626]' : 'text-[#45505a]'}`}>
                      <input
                        type="number"
                        defaultValue={c.annualRequired ?? ''}
                        onChange={(e) => handleUpdateComponent(c.id, 'annualRequired', e.target.value ? Number(e.target.value) : null)}
                        placeholder="—"
                        className="bg-transparent border-0 text-[11px] w-24 focus:outline-none"
                      />
                    </td>
                    <td className="px-2 py-[6px] border-b border-[#f8f9fa]">
                      {c.flag && (
                        <span className="bg-[#fef2f2] text-[#d12626] rounded-full px-1.5 text-[9px] font-bold">
                          {c.flag === 'critical' ? 'Critical' : 'Near-term'}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-[6px] border-b border-[#f8f9fa]">
                      <button
                        onClick={() => handleRemoveComponent(c.id)}
                        className="text-[#929da8] hover:text-[#d12626] text-[10px]"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {components.length > 0 && (
              <tfoot>
                <tr>
                  <td className="font-bold text-[10px] text-[#6e7b8a] bg-[#f8f9fa] px-2 py-[5px]">Total</td>
                  <td className="font-bold text-[10px] text-[#6e7b8a] bg-[#f8f9fa] px-2 py-[5px]"></td>
                  <td className="font-bold text-[10px] text-[#6e7b8a] bg-[#f8f9fa] px-2 py-[5px]">{formatDollars(totalReplacement)}</td>
                  <td className="font-bold text-[10px] text-[#6e7b8a] bg-[#f8f9fa] px-2 py-[5px]">{formatDollars(totalAnnual)}</td>
                  <td className="bg-[#f8f9fa] px-2 py-[5px]" colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Add component button */}
        <button
          onClick={handleAddComponent}
          className="text-[11px] text-[#6e7b8a] border border-dashed border-[#e6e8eb] rounded-lg px-3 py-2 mt-2 w-full text-center hover:border-[#929da8] cursor-pointer"
        >
          + Add Component
        </button>

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
