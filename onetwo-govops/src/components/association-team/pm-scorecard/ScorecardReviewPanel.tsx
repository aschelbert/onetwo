'use client'

import { useState, useRef, useCallback, useTransition } from 'react'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Textarea, FormGroup } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { getScoreBand, SCORECARD_CATEGORIES } from '@/types/association-team'
import type { PMScorecardReview, ScorecardCategory, CategoryScores } from '@/types/association-team'
import { createScorecardReview, updateScorecardReview } from '@/app/app/[tenancy]/association-team/pm-scorecard/actions'
import { Plus, Trash2 } from 'lucide-react'

function CategoryScoreSlider({
  category,
  score,
  onChange,
}: {
  category: (typeof SCORECARD_CATEGORIES)[number]
  score: number
  onChange: (score: number) => void
}) {
  const band = getScoreBand(score)
  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[0.78rem] font-semibold text-[#1a1f25]">{category.label}</span>
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.65rem] font-semibold"
          style={{ backgroundColor: band.bg, color: band.color }}
        >
          {score}/100
        </span>
      </div>
      <p className="text-[0.68rem] text-[#929da8] mb-1.5">{category.description}</p>
      <input
        type="range"
        min={0}
        max={100}
        value={score}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  )
}

function CategoryScoreDisplay({
  categoryScores,
}: {
  categoryScores: CategoryScores
}) {
  const entries = SCORECARD_CATEGORIES.filter(
    (c) => categoryScores[c.value] !== undefined
  )
  if (entries.length === 0) return null

  return (
    <div className="space-y-2">
      <label className="block text-[0.78rem] font-semibold text-[#1a1f25] mb-1.5">
        Category Ratings
      </label>
      {entries.map((cat) => {
        const cs = categoryScores[cat.value]!
        const band = getScoreBand(cs.score)
        return (
          <div key={cat.value} className="flex items-center justify-between py-1">
            <div className="min-w-0 flex-1">
              <span className="text-[0.78rem] font-medium text-[#45505a]">{cat.label}</span>
              {cs.notes && (
                <p className="text-[0.68rem] text-[#929da8] mt-0.5 line-clamp-1">{cs.notes}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <span className="text-sm font-bold" style={{ color: band.color }}>
                {cs.score}
              </span>
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[0.6rem] font-semibold"
                style={{ backgroundColor: band.bg, color: band.color }}
              >
                {band.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

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
  const [formCategoryScores, setFormCategoryScores] = useState<
    Record<string, { score: number; notes: string }>
  >(
    Object.fromEntries(
      SCORECARD_CATEGORIES.map((c) => [c.value, { score: 75, notes: '' }])
    )
  )

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

  const updateCategoryScore = (cat: string, score: number) => {
    setFormCategoryScores((prev) => ({
      ...prev,
      [cat]: { ...prev[cat], score },
    }))
  }

  const updateCategoryNotes = (cat: string, notes: string) => {
    setFormCategoryScores((prev) => ({
      ...prev,
      [cat]: { ...prev[cat], notes },
    }))
  }

  // Derive overall rating from category scores
  const deriveOverallFromCategories = (scores: Record<string, { score: number; notes: string }>) => {
    const values = Object.values(scores).map((s) => s.score)
    if (values.length === 0) return 75
    return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length)
  }

  const handleCreate = () => {
    const overallRating = deriveOverallFromCategories(formCategoryScores)
    startTransition(async () => {
      await createScorecardReview(tenancySlug, {
        period,
        overall_rating: overallRating,
        summary: formSummary,
        strengths: formStrengths.filter(Boolean),
        improvements: formImprovements.filter(Boolean),
        category_scores: formCategoryScores,
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
            <p className="text-sm text-[#929da8] mb-3">No review for this period</p>
            <Button onClick={() => setShowForm(true)}>
              <Plus size={14} /> Create Review
            </Button>
          </CardBody>
        </Card>

        <Dialog
          open={showForm}
          onClose={() => setShowForm(false)}
          title="Create Period Review"
          size="lg"
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={isPending}>
                {isPending ? 'Creating...' : 'Create Review'}
              </Button>
            </>
          }
        >
          {/* Category Ratings */}
          <div className="mb-5">
            <label className="block text-[0.82rem] font-bold text-[#1a1f25] mb-3">
              Category Ratings
            </label>
            <div className="space-y-1 border border-[#e6e8eb] rounded-lg p-4 bg-[#f8f9fa]">
              {SCORECARD_CATEGORIES.map((cat) => (
                <div key={cat.value}>
                  <CategoryScoreSlider
                    category={cat}
                    score={formCategoryScores[cat.value]?.score ?? 75}
                    onChange={(score) => updateCategoryScore(cat.value, score)}
                  />
                  <Input
                    value={formCategoryScores[cat.value]?.notes ?? ''}
                    onChange={(e) => updateCategoryNotes(cat.value, e.target.value)}
                    placeholder={`Notes for ${cat.label.toLowerCase()}...`}
                    className="mt-1 mb-2"
                  />
                </div>
              ))}
              <div className="pt-3 border-t border-[#e6e8eb] flex items-center justify-between">
                <span className="text-[0.78rem] font-semibold text-[#929da8]">
                  Overall (avg of categories)
                </span>
                <span className="text-lg font-bold" style={{ color: getScoreBand(deriveOverallFromCategories(formCategoryScores)).color }}>
                  {deriveOverallFromCategories(formCategoryScores)}/100
                </span>
              </div>
            </div>
          </div>

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

  // Existing review — display with category scores inline
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
        {/* Category scores displayed inside the review */}
        {review.category_scores && Object.keys(review.category_scores).length > 0 && (
          <div className="mb-4 pb-4 border-b border-[#e6e8eb]">
            <CategoryScoreDisplay categoryScores={review.category_scores} />
          </div>
        )}

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
