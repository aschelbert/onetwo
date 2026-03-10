'use client'

import { useState, useTransition } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Textarea, FormGroup } from '@/components/ui/input'
import { getScoreBand, SCORECARD_CATEGORIES } from '@/types/association-team'
import type { PMScorecardEntry, ScorecardCategory } from '@/types/association-team'
import { upsertScorecardEntry } from '@/app/app/[tenancy]/association-team/pm-scorecard/actions'

export function ScorecardEntryForm({
  open,
  onClose,
  category,
  entry,
  period,
  tenancySlug,
  scoredBy,
}: {
  open: boolean
  onClose: () => void
  category: ScorecardCategory
  entry: PMScorecardEntry | undefined
  period: string
  tenancySlug: string
  scoredBy: string
}) {
  const [isPending, startTransition] = useTransition()
  const [score, setScore] = useState(entry?.score ?? 75)
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const categoryInfo = SCORECARD_CATEGORIES.find((c) => c.value === category)
  const band = getScoreBand(score)

  const handleSubmit = () => {
    startTransition(async () => {
      await upsertScorecardEntry(tenancySlug, {
        id: entry?.id,
        period,
        category,
        score,
        notes,
        scored_by: scoredBy,
      })
      onClose()
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Score: ${categoryInfo?.label}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Saving...' : 'Save Score'}
          </Button>
        </>
      }
    >
      <p className="text-[0.8rem] text-[#45505a] mb-4">{categoryInfo?.description}</p>

      <FormGroup label={`Score: ${score}/100`}>
        <input
          type="range"
          min={0}
          max={100}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between mt-1">
          <span className="text-[0.7rem] text-[#929da8]">0</span>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.7rem] font-semibold"
            style={{ backgroundColor: band.bg, color: band.color }}
          >
            {band.label}
          </span>
          <span className="text-[0.7rem] text-[#929da8]">100</span>
        </div>
      </FormGroup>

      <FormGroup label="Notes">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes about this score..."
        />
      </FormGroup>
    </Dialog>
  )
}
