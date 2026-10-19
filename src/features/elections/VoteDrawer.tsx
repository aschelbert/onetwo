/**
 * VoteDrawer -- Three-step drawer to create a new vote/election.
 *
 * Step 1: What (Board election, Budget/assessment, Bylaw amendment, Something else)
 * Step 2: Options (for elections: candidates from owner roster; for others: title/description)
 * Step 3: When (close date)
 *
 * Primary: "Create and notify owners" calls createFromDrawer on the election store.
 */

import { useState, useCallback } from 'react';
import { Calendar } from 'lucide-react';
import DrawerShell from '@/components/ui/DrawerShell';
import { useElectionStore, type ElectionType, type Candidate } from '@/store/useElectionStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { generateLocalId } from '@/lib/generateId';

interface VoteDrawerProps {
  open: boolean;
  onClose: () => void;
}

type VoteKind = 'board_election' | 'budget_approval' | 'bylaw_amendment' | 'other';

const KIND_OPTIONS: { value: VoteKind; label: string; description: string }[] = [
  { value: 'board_election', label: 'Board Election', description: 'Elect board members or officers' },
  { value: 'budget_approval', label: 'Budget / Assessment', description: 'Budget ratification or special assessment' },
  { value: 'bylaw_amendment', label: 'Bylaw Amendment', description: 'Amend CC&Rs, bylaws, or rules' },
  { value: 'other', label: 'Something Else', description: 'Custom vote or resolution' },
];

export default function VoteDrawer({ open, onClose }: VoteDrawerProps) {
  const store = useElectionStore();
  const { currentUser } = useAuthStore();
  const fin = useFinancialStore();
  const units = fin.units;

  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<VoteKind | ''>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateName, setCandidateName] = useState('');
  const [candidateUnit, setCandidateUnit] = useState('');
  const [closeDate, setCloseDate] = useState('');

  const handleAddCandidate = useCallback(() => {
    if (!candidateName.trim()) return;
    setCandidates(prev => [
      ...prev,
      { id: generateLocalId('cand_'), name: candidateName.trim(), unit: candidateUnit, bio: '' },
    ]);
    setCandidateName('');
    setCandidateUnit('');
  }, [candidateName, candidateUnit]);

  const handleRemoveCandidate = useCallback((id: string) => {
    setCandidates(prev => prev.filter(c => c.id !== id));
  }, []);

  const handleCreate = useCallback(() => {
    if (!kind) return;

    const typeMap: Record<VoteKind, ElectionType> = {
      board_election: 'board_election',
      budget_approval: 'budget_approval',
      bylaw_amendment: 'bylaw_amendment',
      other: 'other',
    };

    const electionType = typeMap[kind];
    const elTitle = title || KIND_OPTIONS.find(k => k.value === kind)?.label || 'New Vote';

    store.addElection({
      title: elTitle,
      type: electionType,
      status: 'draft',
      description: description || '',
      createdBy: currentUser?.name || 'Board',
      openedAt: null,
      closedAt: null,
      certifiedAt: null,
      certifiedBy: null,
      scheduledCloseDate: closeDate || null,
      noticeDate: new Date().toISOString().split('T')[0],
      quorumRequired: kind === 'board_election' ? 40 : 25,
      ballotItems: kind === 'board_election' && candidates.length > 0
        ? [{
            id: generateLocalId('bi_'),
            title: 'Board Seat Election',
            description: `Elect board members`,
            rationale: '',
            type: 'multi_candidate' as const,
            candidates,
            maxSelections: Math.min(candidates.length, 3),
            requiredThreshold: 0,
            legalRef: '',
            attachments: [],
          }]
        : title
        ? [{
            id: generateLocalId('bi_'),
            title,
            description: description || '',
            rationale: '',
            type: 'yes_no' as const,
            requiredThreshold: kind === 'bylaw_amendment' ? 66.7 : 50.1,
            legalRef: '',
            attachments: [],
          }]
        : [],
      legalRef: '',
      notes: '',
      complianceChecks: [],
      linkedMeetingId: null,
    });

    onClose();
  }, [kind, title, description, candidates, closeDate, currentUser, store, onClose]);

  const canProceed = step === 1 ? !!kind : step === 2 ? (kind === 'board_election' ? candidates.length > 0 : !!title) : !!closeDate;

  const stepLabel = step === 1 ? 'What are you voting on?' : step === 2 ? 'Details' : 'When?';

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      breadcrumb={['Board Room', 'New Vote']}
      title={stepLabel}
      step={{ current: step, total: 3 }}
      footer={{
        primaryLabel: step === 3 ? 'Create and Notify Owners' : 'Next',
        onPrimary: step === 3 ? handleCreate : () => setStep(step + 1),
        primaryDisabled: !canProceed,
        secondaryLabel: step > 1 ? 'Back' : undefined,
        onSecondary: step > 1 ? () => setStep(step - 1) : undefined,
      }}
    >
      {/* Step 1: What */}
      {step === 1 && (
        <div className="space-y-3">
          {KIND_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setKind(opt.value)}
              className={`w-full text-left px-4 py-4 rounded-xl border-2 transition-all ${
                kind === opt.value
                  ? 'border-brand-teal bg-brand-teal-light'
                  : 'border-ink-100 bg-white hover:border-ink-200'
              }`}
            >
              <p className="text-sm font-medium text-ink-800">{opt.label}</p>
              <p className="text-xs text-ink-500 mt-0.5">{opt.description}</p>
            </button>
          ))}
        </div>
      )}

      {/* Step 2: Options */}
      {step === 2 && (
        <div className="space-y-4">
          {kind === 'board_election' ? (
            <>
              <p className="text-sm text-ink-600">
                Add candidates from the owner roster. Owners will select up to the number of open seats.
              </p>

              {/* Candidate list */}
              {candidates.length > 0 && (
                <div className="space-y-2">
                  {candidates.map(c => (
                    <div key={c.id} className="flex items-center justify-between px-3 py-2 bg-mist-50 border border-mist-200 rounded-lg">
                      <div>
                        <span className="text-sm font-medium text-ink-800">{c.name}</span>
                        {c.unit && <span className="text-xs text-ink-400 ml-2">Unit {c.unit}</span>}
                      </div>
                      <button
                        onClick={() => handleRemoveCandidate(c.id)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add candidate form */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={candidateName}
                  onChange={e => setCandidateName(e.target.value)}
                  placeholder="Candidate name"
                  className="flex-1 px-3 py-2 text-sm border border-ink-200 rounded-lg"
                />
                <select
                  value={candidateUnit}
                  onChange={e => setCandidateUnit(e.target.value)}
                  className="px-3 py-2 text-sm border border-ink-200 rounded-lg bg-white"
                >
                  <option value="">Unit</option>
                  {units.map(u => (
                    <option key={u.number} value={u.number}>Unit {u.number}</option>
                  ))}
                </select>
                <button
                  onClick={handleAddCandidate}
                  disabled={!candidateName.trim()}
                  className="px-3 py-2 text-sm bg-navy text-white rounded-lg hover:bg-navy-800 disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs text-ink-500 block mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="What is being voted on?"
                  className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg"
                />
              </div>
              <div>
                <label className="text-xs text-ink-500 block mb-1">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Provide context for voters..."
                  className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg resize-none"
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 3: When */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <Calendar size={20} className="text-accent-500" />
            <p className="text-sm text-ink-600">
              Set the deadline for voting. Owners will be notified when the vote opens.
            </p>
          </div>
          <div>
            <label className="text-xs text-ink-500 block mb-1">Close date</label>
            <input
              type="date"
              value={closeDate}
              onChange={e => setCloseDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg"
            />
          </div>
          <div className="bg-mist-50 border border-mist-200 rounded-lg p-3 mt-4">
            <p className="text-xs font-medium text-ink-600">Summary</p>
            <p className="text-sm text-ink-700 mt-1">
              {KIND_OPTIONS.find(k => k.value === kind)?.label || 'Vote'}
              {title ? `: ${title}` : ''}
            </p>
            {kind === 'board_election' && candidates.length > 0 && (
              <p className="text-xs text-ink-500 mt-1">
                {candidates.length} candidate{candidates.length !== 1 ? 's' : ''}
              </p>
            )}
            {closeDate && (
              <p className="text-xs text-ink-500 mt-1">Closes: {closeDate}</p>
            )}
          </div>
        </div>
      )}
    </DrawerShell>
  );
}
