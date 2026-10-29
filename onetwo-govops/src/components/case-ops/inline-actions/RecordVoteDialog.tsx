'use client'

import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { createCaseVote, castVote, closeVote } from '@/app/app/[tenancy]/boardroom/cases/[caseId]/inline-actions'
import type { CaseVote } from '@/types/inline-actions'
import { Vote, CheckCircle2 } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  caseId: string
  tenantId: string
  onVoteClosed?: (vote: CaseVote, summary: string) => void
}

interface VoterEntry {
  name: string
  role: string
  vote: 'yea' | 'nay' | 'abstain' | null
}

const VOTE_TYPES = [
  { value: 'simple_majority' as const, label: 'Simple Majority' },
  { value: 'super_majority' as const, label: 'Super Majority (2/3)' },
  { value: 'unanimous' as const, label: 'Unanimous' },
]

export function RecordVoteDialog({ open, onClose, caseId, tenantId, onVoteClosed }: Props) {
  const [phase, setPhase] = useState<'create' | 'tally' | 'done'>('create')
  const [motion, setMotion] = useState('')
  const [voteType, setVoteType] = useState<CaseVote['vote_type']>('simple_majority')
  const [saving, setSaving] = useState(false)
  const [currentVote, setCurrentVote] = useState<CaseVote | null>(null)

  // Voter management
  const [voters, setVoters] = useState<VoterEntry[]>([
    { name: '', role: 'President', vote: null },
    { name: '', role: 'Vice President', vote: null },
    { name: '', role: 'Treasurer', vote: null },
    { name: '', role: 'Secretary', vote: null },
    { name: '', role: 'Member at Large', vote: null },
  ])

  const reset = () => {
    setPhase('create')
    setMotion('')
    setVoteType('simple_majority')
    setSaving(false)
    setCurrentVote(null)
    setVoters([
      { name: '', role: 'President', vote: null },
      { name: '', role: 'Vice President', vote: null },
      { name: '', role: 'Treasurer', vote: null },
      { name: '', role: 'Secretary', vote: null },
      { name: '', role: 'Member at Large', vote: null },
    ])
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleCreateVote = async () => {
    if (!motion.trim()) return
    setSaving(true)
    try {
      const vote = await createCaseVote(caseId, tenantId, {
        motion: motion.trim(),
        voteType,
      })
      setCurrentVote(vote)
      setPhase('tally')
    } catch (e) {
      console.error('Failed to create vote:', e)
    } finally {
      setSaving(false)
    }
  }

  const updateVoter = (index: number, field: keyof VoterEntry, value: string) => {
    setVoters((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)))
  }

  const addVoter = () => {
    setVoters((prev) => [...prev, { name: '', role: '', vote: null }])
  }

  const removeVoter = (index: number) => {
    setVoters((prev) => prev.filter((_, i) => i !== index))
  }

  const handleCloseVote = async (outcome: 'passed' | 'failed' | 'tabled') => {
    if (!currentVote) return
    setSaving(true)

    try {
      // Cast all votes
      const activeVoters = voters.filter((v) => v.name.trim() && v.vote)
      for (const voter of activeVoters) {
        await castVote(currentVote.id, voter.name, voter.role || null, voter.vote!)
      }

      await closeVote(currentVote.id, outcome)

      // Build summary
      const yeas = activeVoters.filter((v) => v.vote === 'yea').length
      const nays = activeVoters.filter((v) => v.vote === 'nay').length
      const abstains = activeVoters.filter((v) => v.vote === 'abstain').length
      const resultLabel = outcome === 'passed' ? 'Passed' : outcome === 'failed' ? 'Failed' : 'Tabled'
      const summary = `Vote on "${currentVote.motion}": ${resultLabel} ${yeas}-${nays}-${abstains}`

      onVoteClosed?.({ ...currentVote, status: outcome }, summary)
      setPhase('done')
    } catch (e) {
      console.error('Failed to close vote:', e)
    } finally {
      setSaving(false)
    }
  }

  const activeVoters = voters.filter((v) => v.name.trim())
  const allVoted = activeVoters.length > 0 && activeVoters.every((v) => v.vote)
  const yeas = activeVoters.filter((v) => v.vote === 'yea').length
  const nays = activeVoters.filter((v) => v.vote === 'nay').length
  const abstains = activeVoters.filter((v) => v.vote === 'abstain').length

  const inputClass = 'w-full rounded-lg border border-[#e6e8eb] bg-[#f8f9fa] px-3 py-2 text-[13px] text-[#1a1f25] outline-none focus:border-[#929da8] focus:bg-white transition-colors'
  const labelClass = 'block text-[11px] font-semibold text-[#45505a] mb-1'

  // ── Done state ──
  if (phase === 'done') {
    return (
      <Dialog open={open} onClose={handleClose} title="Vote Recorded" size="sm">
        <div className="text-center py-4">
          <div className="w-12 h-12 rounded-full bg-[#ecfdf5] flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 size={24} className="text-[#047857]" />
          </div>
          <p className="text-[14px] font-semibold text-[#1a1f25] mb-1">Vote recorded and posted to chat</p>
          <p className="text-[12px] text-[#6e7b8a]">{yeas} yea, {nays} nay, {abstains} abstain</p>
        </div>
      </Dialog>
    )
  }

  // ── Tally phase ──
  if (phase === 'tally' && currentVote) {
    return (
      <Dialog
        open={open}
        onClose={handleClose}
        title="Record Votes"
        size="md"
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="text-[12px] text-[#6e7b8a]">
              {activeVoters.length > 0 && (
                <span>Tally: {yeas}Y - {nays}N - {abstains}A</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleCloseVote('tabled')}
                disabled={saving}
                className="px-3 py-2 text-[12px] text-[#6e7b8a] border border-[#e6e8eb] rounded-lg hover:border-[#929da8] transition-colors disabled:opacity-40"
              >
                Table
              </button>
              <button
                onClick={() => handleCloseVote('failed')}
                disabled={!allVoted || saving}
                className="px-3 py-2 text-[12px] text-[#d12626] border border-[#e6e8eb] rounded-lg hover:border-[#d12626] transition-colors disabled:opacity-40"
              >
                Failed
              </button>
              <button
                onClick={() => handleCloseVote('passed')}
                disabled={!allVoted || saving}
                className="px-3 py-2 bg-[#047857] text-white rounded-lg text-[12px] font-medium hover:bg-[#065f46] transition-colors disabled:opacity-40"
              >
                {saving ? 'Saving...' : 'Passed'}
              </button>
            </div>
          </div>
        }
      >
        <div className="mb-4 bg-[#f8f9fa] border border-[#e6e8eb] rounded-lg p-3">
          <p className="text-[10px] font-bold text-[#929da8] uppercase tracking-[0.08em] mb-1">Motion</p>
          <p className="text-[13px] text-[#1a1f25]">{currentVote.motion}</p>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_120px_180px_32px] gap-2 text-[10px] font-bold text-[#929da8] uppercase tracking-[0.08em] px-1">
            <span>Name</span>
            <span>Role</span>
            <span>Vote</span>
            <span />
          </div>

          {voters.map((voter, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_180px_32px] gap-2 items-center">
              <input
                type="text"
                value={voter.name}
                onChange={(e) => updateVoter(i, 'name', e.target.value)}
                placeholder="Name"
                className={inputClass}
              />
              <input
                type="text"
                value={voter.role}
                onChange={(e) => updateVoter(i, 'role', e.target.value)}
                placeholder="Role"
                className={inputClass}
              />
              <div className="flex gap-1">
                {(['yea', 'nay', 'abstain'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => updateVoter(i, 'vote', v)}
                    className={`flex-1 py-1.5 rounded text-[11px] font-medium border transition-colors ${
                      voter.vote === v
                        ? v === 'yea'
                          ? 'bg-[#047857] text-white border-[#047857]'
                          : v === 'nay'
                            ? 'bg-[#d12626] text-white border-[#d12626]'
                            : 'bg-[#45505a] text-white border-[#45505a]'
                        : 'bg-white text-[#6e7b8a] border-[#e6e8eb] hover:border-[#929da8]'
                    }`}
                  >
                    {v === 'yea' ? 'Yea' : v === 'nay' ? 'Nay' : 'Abs'}
                  </button>
                ))}
              </div>
              <button
                onClick={() => removeVoter(i)}
                className="text-[#929da8] hover:text-[#d12626] text-[14px] transition-colors"
              >
                &times;
              </button>
            </div>
          ))}
        </div>

        <button onClick={addVoter} className="mt-2 text-[11px] text-[#6e7b8a] hover:text-[#45505a] transition-colors">
          + Add voter
        </button>
      </Dialog>
    )
  }

  // ── Create phase ──
  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Record Vote"
      size="sm"
      footer={
        <>
          <button onClick={handleClose} className="px-4 py-2 text-[13px] text-[#6e7b8a] hover:text-[#45505a] transition-colors">
            Cancel
          </button>
          <button
            onClick={handleCreateVote}
            disabled={!motion.trim() || saving}
            className="px-4 py-2 bg-[#0f1b2d] text-white rounded-lg text-[13px] font-medium disabled:opacity-40 hover:bg-[#1a2a40] transition-colors"
          >
            {saving ? 'Creating...' : 'Start Vote'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Vote size={16} className="text-[#6e7b8a]" />
          <span className="text-[12px] text-[#6e7b8a]">Create a formal board vote</span>
        </div>
        <div>
          <label className={labelClass}>Motion</label>
          <textarea
            value={motion}
            onChange={(e) => setMotion(e.target.value)}
            placeholder="Motion to approve the 2026 annual budget as presented..."
            rows={3}
            className={inputClass + ' resize-none'}
          />
        </div>
        <div>
          <label className={labelClass}>Vote Type</label>
          <select value={voteType} onChange={(e) => setVoteType(e.target.value as CaseVote['vote_type'])} className={inputClass}>
            {VOTE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>
    </Dialog>
  )
}
