'use client'

import { useState } from 'react'
import { useTenant } from '@/lib/tenant-context'
import { Card, CardBody } from '@/components/ui/card'
import { TabBar, TabButton } from '@/components/ui/tabs'
import { ScorecardCategoryCard } from './ScorecardCategoryCard'
import { ScorecardEntryForm } from './ScorecardEntryForm'
import { ScorecardReviewPanel } from './ScorecardReviewPanel'
import {
  getScoreBand,
  SCORECARD_CATEGORIES,
  type PMScorecardEntry,
  type PMScorecardReview,
  type ScorecardCategory,
} from '@/types/association-team'

const currentYear = new Date().getFullYear()
const PERIODS = [
  { label: 'Q1', value: `${currentYear}-Q1` },
  { label: 'Q2', value: `${currentYear}-Q2` },
  { label: 'Q3', value: `${currentYear}-Q3` },
  { label: 'Q4', value: `${currentYear}-Q4` },
  { label: 'Annual', value: `${currentYear}-Annual` },
]

export function PMScorecardDashboard({
  entries,
  reviews,
  tenancySlug,
}: {
  entries: PMScorecardEntry[]
  reviews: PMScorecardReview[]
  tenancySlug: string
}) {
  const { user } = useTenant()
  const [period, setPeriod] = useState(PERIODS[0].value)
  const [editingCategory, setEditingCategory] = useState<ScorecardCategory | null>(null)

  const periodEntries = entries.filter((e) => e.period === period)
  const periodReview = reviews.find((r) => r.period === period)

  // Overall score is average of all scored categories
  const scoredEntries = periodEntries.filter((e) => e.score !== null && e.score !== undefined)
  const overallScore =
    scoredEntries.length > 0
      ? Math.round(scoredEntries.reduce((sum, e) => sum + e.score, 0) / scoredEntries.length)
      : null

  const overallBand = overallScore !== null ? getScoreBand(overallScore) : null

  const getEntry = (category: ScorecardCategory) =>
    periodEntries.find((e) => e.category === category)

  return (
    <div>
      {/* Period selector */}
      <TabBar>
        {PERIODS.map((p) => (
          <TabButton key={p.value} active={period === p.value} onClick={() => setPeriod(p.value)}>
            {p.label}
          </TabButton>
        ))}
      </TabBar>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content — 2 cols */}
        <div className="lg:col-span-2 space-y-6">
          {/* Overall score card */}
          <Card>
            <CardBody>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[0.78rem] font-semibold text-[#929da8] uppercase tracking-wide mb-1">
                    Overall Score
                  </p>
                  {overallScore !== null ? (
                    <div className="flex items-end gap-2">
                      <span className="text-4xl font-bold" style={{ color: overallBand?.color }}>
                        {overallScore}
                      </span>
                      <span className="text-lg text-[#929da8] mb-1">/100</span>
                    </div>
                  ) : (
                    <p className="text-lg text-[#929da8] italic">No scores yet</p>
                  )}
                </div>
                {overallBand && (
                  <span
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold"
                    style={{ backgroundColor: overallBand.bg, color: overallBand.color }}
                  >
                    {overallBand.label}
                  </span>
                )}
              </div>
              <p className="text-[0.75rem] text-[#929da8] mt-2">
                {scoredEntries.length} of {SCORECARD_CATEGORIES.length} categories scored
              </p>
            </CardBody>
          </Card>

          {/* Category cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SCORECARD_CATEGORIES.map((cat) => (
              <ScorecardCategoryCard
                key={cat.value}
                category={cat.value}
                entry={getEntry(cat.value)}
                onClick={() => setEditingCategory(cat.value)}
              />
            ))}
          </div>
        </div>

        {/* Sidebar — review panel */}
        <div>
          <ScorecardReviewPanel
            review={periodReview}
            period={period}
            tenancySlug={tenancySlug}
            reviewedBy={user.display_name}
          />
        </div>
      </div>

      {/* Entry edit dialog */}
      {editingCategory && (
        <ScorecardEntryForm
          open={!!editingCategory}
          onClose={() => setEditingCategory(null)}
          category={editingCategory}
          entry={getEntry(editingCategory)}
          period={period}
          tenancySlug={tenancySlug}
          scoredBy={user.display_name}
        />
      )}
    </div>
  )
}
