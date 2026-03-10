'use client'

import { Card, CardBody } from '@/components/ui/card'
import { getScoreBand, SCORECARD_CATEGORIES } from '@/types/association-team'
import type { PMScorecardEntry, ScorecardCategory } from '@/types/association-team'

export function ScorecardCategoryCard({
  category,
  entry,
  onClick,
}: {
  category: ScorecardCategory
  entry: PMScorecardEntry | undefined
  onClick: () => void
}) {
  const categoryInfo = SCORECARD_CATEGORIES.find((c) => c.value === category)
  const score = entry?.score
  const band = score !== undefined ? getScoreBand(score) : null

  return (
    <Card className="cursor-pointer" onClick={onClick}>
      <CardBody>
        <div className="flex items-start justify-between mb-2">
          <h4 className="text-sm font-bold text-[#1a1f25]">{categoryInfo?.label}</h4>
          {band && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.7rem] font-semibold"
              style={{ backgroundColor: band.bg, color: band.color }}
            >
              {band.label}
            </span>
          )}
        </div>
        <p className="text-[0.75rem] text-[#929da8] mb-3">{categoryInfo?.description}</p>
        {score !== undefined ? (
          <div className="flex items-end gap-1">
            <span className="text-2xl font-bold" style={{ color: band?.color }}>{score}</span>
            <span className="text-sm text-[#929da8] mb-0.5">/100</span>
          </div>
        ) : (
          <p className="text-sm text-[#929da8] italic">Not scored</p>
        )}
        {entry?.notes && (
          <p className="text-[0.75rem] text-[#45505a] mt-2 line-clamp-2">{entry.notes}</p>
        )}
      </CardBody>
    </Card>
  )
}
