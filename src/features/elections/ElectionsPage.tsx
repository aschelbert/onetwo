import { useState, useEffect } from 'react';
import { useElectionStore, generateComplianceChecks, type Election, type BallotItem, type VoteMethod, type VoteChoice, type ElectionType, type Candidate, type ComplianceCheck } from '@/store/useElectionStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useTenantContext } from '@/components/TenantProvider';
import { useUndoableAction } from '@/hooks/useUndoableAction';
import { Play, Square, CheckCircle2, Trash2, Vote } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import FileUpload from '@/components/ui/FileUpload';

const TYPE_LABELS: Record<ElectionType, string> = { board_election: 'Board Election', budget_approval: 'Budget Approval', special_assessment: 'Special Assessment', bylaw_amendment: 'Bylaw Amendment', rule_change: 'Rule Change', meeting_motion: 'Meeting Motion', other: 'Other' };
const STATUS_STYLE: Record<string, string> = { draft: 'bg-ink-100 text-ink-600', open: 'bg-green-100 text-green-700', closed: 'bg-yellow-100 text-yellow-700', certified: 'bg-sage-100 text-sage-700' };
const METHOD_ICON: Record<VoteMethod, string> = { paper: '📄', oral: '🗣', virtual: '💻' };
const CHECK_ICON: Record<string, string> = { pass: '✅', fail: '❌', warning: '⚠️', not_checked: '⬜' };

type ModalType = null | 'createElection' | 'addBallotItem' | 'addCandidate' | 'recordBallot' | 'castVote' | 'addAttachment' | 'viewBallotDetail' | 'addComment' | 'addResolution' | 'linkCaseToVote';
type DetailTab = 'ballot' | 'compliance' | 'timeline' | 'comments' | 'resolution';

// ─── V2 Elections Page (flagged) ───
function V2ElectionsPage() {
  const store = useElectionStore();
  const fin = useFinancialStore();
  const { currentUser, currentRole } = useAuthStore();
  const { run: undoRun } = useUndoableAction();
  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';
  const units = fin.units;

  const visibleElections = isBoard ? store.elections : store.elections.filter(e => e.status !== 'draft');

  const handleOpen = (id: string) => {
    const e = store.elections.find(x => x.id === id);
    if (!e || !e.ballotItems.length) return;
    const prev = e.status;
    store.openElection(id, currentUser?.name || 'Board');
    undoRun({
      label: 'Voting opened',
      undo: () => store.updateElection(id, { status: prev as any, openedAt: null }),
      commit: () => {},
    });
  };

  const handleClose = (id: string) => {
    const e = store.elections.find(x => x.id === id);
    if (!e) return;
    const prev = e.status;
    store.closeElection(id, currentUser?.name || 'Board');
    undoRun({
      label: 'Voting closed',
      undo: () => store.updateElection(id, { status: prev as any, closedAt: null }),
      commit: () => {},
    });
  };

  const handleCertify = (id: string) => {
    const e = store.elections.find(x => x.id === id);
    if (!e) return;
    const prev = e.status;
    store.certifyWithTally(id, currentUser?.name || 'Board', units.map(u => ({ number: u.number, votingPct: u.votingPct, status: u.status })));
    undoRun({
      label: 'Results certified',
      undo: () => store.updateElection(id, { status: prev as any, certifiedAt: null, certifiedBy: null, resolution: null }),
      commit: () => {},
    });
  };

  const handleDelete = (id: string) => {
    const e = store.elections.find(x => x.id === id);
    if (!e) return;
    store.deleteElection(id);
    undoRun({
      label: 'Election deleted',
      undo: () => {
        // Re-add with all original fields
        store.addElection({
          title: e.title, type: e.type, status: e.status,
          description: e.description, createdBy: e.createdBy,
          openedAt: e.openedAt, closedAt: e.closedAt,
          certifiedAt: e.certifiedAt, certifiedBy: e.certifiedBy,
          scheduledCloseDate: e.scheduledCloseDate, noticeDate: e.noticeDate,
          quorumRequired: e.quorumRequired, ballotItems: e.ballotItems,
          legalRef: e.legalRef, notes: e.notes,
          complianceChecks: e.complianceChecks, linkedMeetingId: e.linkedMeetingId,
        });
      },
      commit: () => {},
    });
  };

  const STATUS_STYLE_V2: Record<string, string> = {
    draft: 'bg-ink-100 text-ink-600',
    open: 'bg-green-100 text-green-700',
    closed: 'bg-yellow-100 text-yellow-700',
    certified: 'bg-sage-100 text-sage-700',
  };

  return (
    <div className="space-y-4">
      {visibleElections.length === 0 ? (
        <div className="text-center py-8">
          <Vote size={32} className="mx-auto text-ink-300 mb-3" />
          <p className="text-sm text-ink-500">No votes yet.</p>
        </div>
      ) : (
        visibleElections.map(e => {
          const r = store.getResults(e.id, units.map(u => ({ number: u.number, votingPct: u.votingPct, status: u.status })));
          return (
            <div key={e.id} className="border border-ink-100 rounded-xl p-4 hover:shadow-sm transition-all">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-ink-800 truncate">{e.title}</h4>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${STATUS_STYLE_V2[e.status]}`}>
                      {e.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-ink-500 mt-0.5">
                    {e.ballotItems.length} item{e.ballotItems.length !== 1 ? 's' : ''}
                    {r ? ` -- ${r.unitsBalloted}/${r.unitsEligible} voted` : ''}
                    {e.scheduledCloseDate ? ` -- Closes ${e.scheduledCloseDate}` : ''}
                  </p>
                  {e.resolution && (
                    <p className="text-xs text-sage-600 mt-1 truncate">
                      {e.resolution.text.split('\n')[0]}
                    </p>
                  )}
                </div>
                {isBoard && (
                  <div className="flex items-center gap-2 shrink-0">
                    {e.status === 'draft' && (
                      <button
                        onClick={() => handleOpen(e.id)}
                        disabled={!e.ballotItems.length}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors disabled:opacity-40"
                      >
                        <Play size={12} />
                        Open
                      </button>
                    )}
                    {e.status === 'open' && (
                      <button
                        onClick={() => handleClose(e.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors"
                      >
                        <Square size={12} />
                        Close
                      </button>
                    )}
                    {e.status === 'closed' && (
                      <button
                        onClick={() => handleCertify(e.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-sage-100 text-sage-700 rounded-lg hover:bg-sage-200 transition-colors"
                      >
                        <CheckCircle2 size={12} />
                        Certify
                      </button>
                    )}
                    {e.status === 'draft' && (
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function VotingPage() {
  const store = useElectionStore();
  const fin = useFinancialStore();
  const { currentUser, currentRole } = useAuthStore();
  const building = useBuildingStore();
  const issues = useIssuesStore();
  const compStore = useComplianceStore();
  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';
  const isResident = currentRole === 'RESIDENT';

  // v2 flags removed -- always use v2 elections view
  return <V2ElectionsPage />;
}

// Legacy VotingPage dead code removed — V2ElectionsPage is now the only path
