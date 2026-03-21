'use client'

import { useState } from 'react'
import { useTenant } from '@/lib/tenant-context'
import { Card, CardBody } from '@/components/ui/card'
import { ScorecardReviewPanel } from './ScorecardReviewPanel'
import {
  getScoreBand,
  type PMScorecardReview,
  type ScorecardData,
  type ScorecardMetric,
} from '@/types/association-team'

const currentYear = new Date().getFullYear()
const PERIODS = [
  { label: 'Q1', value: `${currentYear}-Q1` },
  { label: 'Q2', value: `${currentYear}-Q2` },
  { label: 'Q3', value: `${currentYear}-Q3` },
  { label: 'Q4', value: `${currentYear}-Q4` },
]

function TrendIndicator({ trend }: { trend: 'up' | 'down' | 'flat' | null }) {
  if (!trend) return <span className="text-[#929da8]">—</span>
  if (trend === 'up') return <span className="text-[#047857]">↑</span>
  if (trend === 'down') return <span className="text-[#d12626]">↓</span>
  return <span className="text-[#929da8]">—</span>
}

function MetricCard({ metric }: { metric: ScorecardMetric }) {
  const band = metric.value !== null ? getScoreBand(metric.value) : null

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between mb-1">
          <h4 className="text-[0.82rem] font-bold text-[#1a1f25]">{metric.label}</h4>
          <TrendIndicator trend={metric.trend} />
        </div>
        <div className="flex items-end gap-2 mb-2">
          {metric.value !== null ? (
            <>
              <span className="text-2xl font-bold" style={{ color: band?.color }}>
                {metric.value}
              </span>
              <span className="text-sm text-[#929da8] mb-0.5">/100</span>
            </>
          ) : (
            <span className="text-lg text-[#929da8] italic">—</span>
          )}
        </div>
        <p className="text-[0.78rem] text-[#45505a] mb-1">{metric.display}</p>
        <p className="text-[0.68rem] text-[#929da8]">{metric.source}</p>
        {band && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.65rem] font-semibold mt-2"
            style={{ backgroundColor: band.bg, color: band.color }}
          >
            {band.label}
          </span>
        )}
      </CardBody>
    </Card>
  )
}

export function PMScorecardDashboard({
  scorecardData,
  reviews,
  tenancySlug,
}: {
  scorecardData: ScorecardData
  reviews: PMScorecardReview[]
  tenancySlug: string
}) {
  const { user } = useTenant()
  const [period, setPeriod] = useState(PERIODS[0].value)

  const periodReview = reviews.find((r) => r.period === period)
  const { pmPerformance, buildingHealth } = scorecardData

  const pmBand = pmPerformance.aggregateScore !== null
    ? getScoreBand(pmPerformance.aggregateScore)
    : null

  const pmMetrics = [
    pmPerformance.boardReviewRating,
    pmPerformance.speedOfCommunication,
    pmPerformance.taskCompletionRate,
    pmPerformance.propertyLogCompletion,
  ]

  const bhMetrics = [
    buildingHealth.financialHealth,
    buildingHealth.complianceHealth,
  ]

  return (
    <div className="bg-[#CFFAFE] border border-[#A5F3FC] rounded-xl p-6">
      {/* Period selector */}
      <div className="flex gap-0 border-b border-[#99E9F2] mb-6">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-4 py-2 text-[0.82rem] font-medium border-b-2 -mb-[1px] transition-all bg-transparent cursor-pointer ${
              period === p.value
                ? 'text-[#1a1f25] font-semibold border-b-[#1a1f25]'
                : 'text-[#45505a] border-b-transparent hover:text-[#1a1f25]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content — 2 cols */}
        <div className="lg:col-span-2 space-y-6">

          {/* ── Section 1: PM Performance ─────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-[#1a1f25]">PM Performance</h2>
                <p className="text-[0.75rem] text-[#45505a]">What the PM controls — drives the PM score</p>
              </div>
              {/* Aggregate PM Score */}
              <div className="flex items-center gap-3">
                {pmPerformance.aggregateScore !== null ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[0.78rem] font-semibold text-[#929da8] uppercase tracking-wide">
                      PM Score
                    </span>
                    <span className="text-3xl font-bold" style={{ color: pmBand?.color }}>
                      {pmPerformance.aggregateScore}
                    </span>
                    <span className="text-sm text-[#929da8]">/100</span>
                    {pmBand && (
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[0.72rem] font-semibold"
                        style={{ backgroundColor: pmBand.bg, color: pmBand.color }}
                      >
                        {pmBand.label}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-[#929da8] italic">No data yet</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {pmMetrics.map((metric) => (
                <MetricCard key={metric.label} metric={metric} />
              ))}
            </div>
          </div>

          {/* ── Divider ───────────────────────────────────────── */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#99E9F2]" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-[#CFFAFE] px-4 text-[0.72rem] font-semibold text-[#45505a] uppercase tracking-wider">
                Building Indicators
              </span>
            </div>
          </div>

          {/* ── Section 2: Building Health ─────────────────────── */}
          <div>
            <div className="mb-4">
              <h2 className="text-base font-bold text-[#1a1f25]">Building Health</h2>
              <p className="text-[0.75rem] text-[#45505a]">Reflects the building, not the PM — board sees this separately</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {bhMetrics.map((metric) => (
                <MetricCard key={metric.label} metric={metric} />
              ))}
            </div>
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
    </div>
  )
}
