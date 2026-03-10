'use client'

import { useState, useRef, useCallback, useTransition } from 'react'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Textarea, FormGroup } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { getScoreBand } from '@/types/association-team'
import type { PMScorecardReview } from '@/types/association-team'
import { createScorecardReview, updateScorecardReview } from '@/app/app/[tenancy]/association-team/pm-scorecard/actions'
import { Plus, Trash2 } from 'lucide-react'

export function ScorecardReviewPanel({
  review,
  period,
  tenancySlug,
  reviewedBy,
}: {
  review: PMScorecardReview | undefined
  period: string
  tenancySlug: string
  reviewedBy: string
}) {
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Form state for new reviews
  const [formRating, setFormRating] = useState(75)
  const [formSummary, setFormSummary] = useState('')
  const [formStrengths, setFormStrengths] = useState<string[]>([''])
  const [formImprovements, setFormImprovements] = useState<string[]>([''])

  const debouncedUpdate = useCallback(
    (field: string, value: unknown) => {
      if (!review) return
      if (debounceRefs.current[field]) clearTimeout(debounceRefs.current[field])
      debounceRefs.current[field] = setTimeout(() => {
        startTransition(async () => {
          await updateScorecardReview(tenancySlug, review.id, { [field]: value })
        })
      }, 800)
    },
    [tenancySlug, review]
  )

  const handleCreate = () => {
    startTransition(async () => {
      await createScorecardReview(tenancySlug, {
        period,
        overall_rating: formRating,
        summary: formSummary,
        strengths: formStrengths.filter(Boolean),
        improvements: formImprovements.filter(Boolean),
        reviewed_by: reviewedBy,
      })
      setShowForm(false)
    })
  }

  if (!review) {
    return (
      <>
        <Card>
          <CardBody className="text-center py-8">
            <p className="text-sm text-[#929da8] mb-3">No formal review for this period</p>
            <Button onClick={() => setShowForm(true)}>
              <Plus size={14} /> Create Review
            </Button>
          </CardBody>
        </Card>

        <Dialog
          open={showForm}
          onClose={() => setShowForm(false)}
          title="Create Period Review"
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={isPending}>
                {isPending ? 'Creating...' : 'Create Review'}
              </Button>
            </>
          }
        >
          <FormGroup label={`Overall Rating: ${formRating}/100`}>
            <input
              type="range"
              min={0}
              max={100}
              value={formRating}
              onChange={(e) => setFormRating(Number(e.target.value))}
              className="w-full"
            />
          </FormGroup>
          <FormGroup label="Summary">
            <Textarea
              value={formSummary}
              onChange={(e) => setFormSummary(e.target.value)}
              placeholder="Overall assessment..."
            />
          </FormGroup>
          <FormGroup label="Strengths">
            {formStrengths.map((s, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <Input
                  value={s}
                  onChange={(e) => {
                    const next = [...formStrengths]
                    next[i] = e.target.value
                    setFormStrengths(next)
                  }}
                  placeholder="Add a strength..."
                />
                {formStrengths.length > 1 && (
                  <button
                    onClick={() => setFormStrengths(formStrengths.filter((_, j) => j !== i))}
                    className="text-gray-400 hover:text-red-500 bg-transparent border-0 cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            <Button size="xs" variant="ghost" onClick={() => setFormStrengths([...formStrengths, ''])}>
              <Plus size={12} /> Add
            </Button>
          </FormGroup>
          <FormGroup label="Areas for Improvement">
            {formImprovements.map((s, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <Input
                  value={s}
                  onChange={(e) => {
                    const next = [...formImprovements]
                    next[i] = e.target.value
                    setFormImprovements(next)
                  }}
                  placeholder="Add an area..."
                />
                {formImprovements.length > 1 && (
                  <button
                    onClick={() => setFormImprovements(formImprovements.filter((_, j) => j !== i))}
                    className="text-gray-400 hover:text-red-500 bg-transparent border-0 cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            <Button size="xs" variant="ghost" onClick={() => setFormImprovements([...formImprovements, ''])}>
              <Plus size={12} /> Add
            </Button>
          </FormGroup>
        </Dialog>
      </>
    )
  }

  // Existing review — auto-save inline editing
  const band = getScoreBand(review.overall_rating)

  return (
    <Card>
      <CardHeader>
        <span className="font-bold text-sm text-[#1a1f25]">Period Review</span>
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.7rem] font-semibold"
          style={{ backgroundColor: band.bg, color: band.color }}
        >
          {review.overall_rating}/100 — {band.label}
        </span>
      </CardHeader>
      <CardBody>
        <FormGroup label="Summary">
          <Textarea
            defaultValue={review.summary}
            onChange={(e) => debouncedUpdate('summary', e.target.value)}
            placeholder="Overall assessment..."
          />
        </FormGroup>

        <div className="mb-4">
          <label className="block text-[0.78rem] font-semibold text-[#047857] mb-1.5">Strengths</label>
          <ul className="list-disc pl-5 text-sm text-[#45505a]">
            {(review.strengths || []).map((s, i) => (
              <li key={i}>{typeof s === 'string' ? s : JSON.stringify(s)}</li>
            ))}
          </ul>
        </div>

        <div>
          <label className="block text-[0.78rem] font-semibold text-[#d12626] mb-1.5">Areas for Improvement</label>
          <ul className="list-disc pl-5 text-sm text-[#45505a]">
            {(review.improvements || []).map((s, i) => (
              <li key={i}>{typeof s === 'string' ? s : JSON.stringify(s)}</li>
            ))}
          </ul>
        </div>

        <p className="text-[0.7rem] text-[#929da8] mt-4">Reviewed by {review.reviewed_by}</p>
      </CardBody>
    </Card>
  )
}
