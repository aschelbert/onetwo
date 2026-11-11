import { useState } from 'react';
import IssuesPage from '@/features/issues/IssuesPage';
import DecisionTrail from '@/features/issues/components/workflow/DecisionTrail';
import { SpendingDecisionPanel } from '@/features/issues/components/workflow/SpendingDecisionPanel';
import { BidComparisonPanel } from '@/features/issues/components/workflow/BidComparisonPanel';
import { ConflictCheckPanel } from '@/features/issues/components/workflow/ConflictCheckPanel';
import { AddBidModal } from '@/features/issues/components/CaseModals';
import { BoardVoteDisplay } from '@/features/issues/components/CaseComponents';
import { useIssuesStore } from '@/store/useIssuesStore';
import { Button, Card, Chip, Inner, SectionLabel } from '../../components';
import { dayLabel } from '../../home/calendar';
import { caseRows, type BoardRoomSnapshot, situationLabel } from '../metrics';

/**
 * The case frame: breadcrumb, the production case workspace or wizard, and
 * the decision panels the codebase has but the production page never
 * mounted (spending decision, bid comparison, conflict check) plus the
 * decision trail and the board vote result, for the case's open steps.
 */
export default function CaseFrame({ snap, view, prefill, onBack, onOpenCase }: { snap: BoardRoomSnapshot; view: string; prefill?: { catId: string; sitId: string }; onBack: () => void; onOpenCase: (id: string) => void }) {
  const store = useIssuesStore();
  const caseId = view.startsWith('case:') ? view.slice(5) : null;
  const c = caseId ? snap.cases.find(x => x.id === caseId) : undefined;
  const row = c ? caseRows({ ...snap, cases: [c] })[0] : undefined;
  const [bidStep, setBidStep] = useState<number | null>(null);
  const steps = c?.steps ?? [];
  const decisionSteps = steps.map((s, i) => ({ s, i })).filter(({ s }) => !s.done && (s.isSpendingDecision || s.requiresBids || s.requiresConflictCheck));
  const sitName = c ? situationLabel(snap, c) : null;

  return (
    <div data-page="ux2-boardroom-case" className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-ux2-muted">
          <button type="button" onClick={onBack} className="font-semibold text-ux2-teal hover:underline">Current Actions</button>
          {c && <><span>/</span><span>{snap.categories.find(x => x.id === c.catId)?.label ?? c.catId}</span><span>/</span><span className="text-ux2-ink">{c.id}</span></>}
          {!c && <><span>/</span><span className="text-ux2-ink">Take Action</span></>}
        </nav>
        {c && row && (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ux2-ink">{c.title}</h1>
              <p className="text-sm text-ux2-muted">{sitName}{c.unit ? ` · Unit ${c.unit}` : ''}{c.owner ? ` · ${c.owner}` : ''} · driver {row.driver} · opened {dayLabel(c.created.slice(0, 10))}{row.due ? ` · due ${dayLabel(row.due)}` : ''}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={c.priority === 'urgent' ? 'red' : c.priority === 'high' ? 'amber' : 'ghost'}>{c.priority[0].toUpperCase() + c.priority.slice(1)} priority</Chip>
              <Chip tone={c.status === 'closed' ? 'sage' : c.status === 'on-hold' ? 'amber' : 'navy'}>{c.status === 'on-hold' ? 'On hold' : c.status === 'closed' ? 'Closed' : `Step ${row.stepIndex} of ${row.stepTotal}`}</Chip>
              {row.overdue && <Chip tone="red">Overdue</Chip>}
            </div>
          </div>
        )}
      </header>

      <div className="ux2-legacy"><IssuesPage embedded prefill={prefill} /></div>

      {c && c.status !== 'closed' && decisionSteps.length > 0 && (
        <Card aria-label="Decisions on this action">
          <SectionLabel>Decisions on this action</SectionLabel>
          <p className="text-sm text-ux2-muted">The spending decision, the bids and the conflict check for the open steps that need them. Each records onto the action and its decision trail.</p>
          {decisionSteps.map(({ s, i }) => (
            <Inner key={s.id} className="flex flex-col gap-3">
              <div className="text-sm font-semibold text-ux2-ink">Step {i + 1} · {s.s}</div>
              {s.requiresConflictCheck && <ConflictCheckPanel caseId={c.id} stepId={s.id} />}
              {s.isSpendingDecision && <SpendingDecisionPanel caseId={c.id} stepIdx={i} step={s} />}
              {s.requiresBids && (
                <>
                  <BidComparisonPanel caseId={c.id} stepIdx={i} step={s} onOpenBidModal={() => setBidStep(i)} />
                  {!s.bidCollection && <Button size="sm" variant="ghost" className="self-start" onClick={() => { store.initBidCollection(c.id, i, s.minimumBids ?? 3); setBidStep(i); }}>Start collecting bids</Button>}
                </>
              )}
            </Inner>
          ))}
          {bidStep !== null && <AddBidModal caseId={c.id} stepIdx={bidStep} store={store} onClose={() => setBidStep(null)} />}
        </Card>
      )}

      {c && (c.boardVotes || (c.decisionTrail && c.decisionTrail.length > 0)) && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {c.boardVotes && (
            <Card aria-label="Board vote">
              <SectionLabel>Board vote · recorded for every owner on Community › Votes</SectionLabel>
              <div className="ux2-legacy"><BoardVoteDisplay vote={c.boardVotes} /></div>
            </Card>
          )}
          {c.decisionTrail && c.decisionTrail.length > 0 && (
            <Card aria-label="Decision trail">
              <SectionLabel>Decision trail · {c.decisionTrail.length} entr{c.decisionTrail.length === 1 ? 'y' : 'ies'}</SectionLabel>
              <div className="ux2-legacy"><DecisionTrail entries={c.decisionTrail} /></div>
            </Card>
          )}
        </div>
      )}

      {c && (c.source === 'obligation' || c.source === 'filing') && c.sourceId && (
        <Inner className="text-xs text-ux2-muted">
          Opened from {c.source === 'filing' ? 'the filing' : 'the obligation'} {c.sourceId} on Building › Obligations. Closing this action as Resolved marks it {c.source === 'filing' ? 'filed' : 'done'} there; closing it any other way leaves it open.
        </Inner>
      )}
      {c && c.source === 'runbook' && c.sourceId && (
        <Inner className="text-xs text-ux2-muted">Opened by the {sitName ?? 'runbook'} runbook on {dayLabel(c.created.slice(0, 10))}. Steps the app can see done tick themselves; the rest are yours.{c.sourceId.startsWith('month-close:') ? ' The day it starts is under Funds › Settings › Billing rules.' : ''}</Inner>
      )}
      {c && c.source === 'issue' && c.sourceId && (
        <Inner className="text-xs text-ux2-muted">Opened from request {c.sourceId}. The owner follows it on Community › Requests; the 14-day reply clock runs on the Inbox. <button type="button" className="text-ux2-teal hover:underline" onClick={() => onOpenCase(c.id)}>Refresh</button></Inner>
      )}
    </div>
  );
}
