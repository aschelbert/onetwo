import { useState } from 'react';
import { ACTION_KINDS } from '@/lib/actions';
import { Button, Card, Field, INPUT, SectionLabel, Why } from '../../components';
import { startAction, startBenchmarking, startPayrollFiling } from '../recordActions';
import { ensureReview } from '../reserves';
import { nextFiscalYearStart, startGoals } from '../goals';

/** Start a guided action from the Board Room: pick the kind, name it, and its page opens at step 1. */
export default function StartAction({ initialKind, onOpenCase, onClose }: { initialKind?: string; onOpenCase: (caseId: string) => void; onClose: () => void }) {
  const [kind, setKind] = useState(ACTION_KINDS.some(k => k.kind === initialKind && k.kind !== 'utility-spike') ? initialKind! : ACTION_KINDS[0]?.kind ?? '');
  const [title, setTitle] = useState('');
  const def = ACTION_KINDS.find(k => k.kind === kind);
  /** Kinds that name themselves: the quarter's payroll filing. */
  const auto = kind === 'payroll-filing' || kind === 'benchmarking' || kind === 'reserve-review' || kind === 'goals';
  return (
    <Card aria-label="Start a guided action" className="gap-3 border-ux2-navy">
      <SectionLabel>Start a guided action</SectionLabel>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {ACTION_KINDS.filter(k => k.kind !== 'utility-spike').map(k => (
          <button key={k.kind} type="button" aria-pressed={kind === k.kind} onClick={() => setKind(k.kind)} className={`rounded-[14px] border bg-white px-3.5 py-3 text-left ${kind === k.kind ? 'border-ux2-navy' : 'border-ux2-line hover:border-ux2-line-strong'}`}>
            <span className="block text-sm font-semibold text-ux2-ink">{k.name}</span><span className="block text-xs text-ux2-muted">{k.blurb}</span>
          </button>
        ))}
      </div>
      <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); if (!def || (!auto && !title.trim())) return; const { caseId } = def.kind === 'payroll-filing' ? startPayrollFiling() : def.kind === 'benchmarking' ? startBenchmarking() : def.kind === 'reserve-review' ? ensureReview('Started by the board') : def.kind === 'goals' ? startGoals(nextFiscalYearStart()) : startAction(def.kind, title.trim()); if (caseId) onOpenCase(caseId); }}>
        {auto ? <span className="min-w-[260px] flex-1 pb-2.5 text-sm text-ux2-muted">{kind === 'goals' ? "Opens next fiscal year's goals, or takes you to them if they are already open." : kind === 'reserve-review' ? 'Opens a review, or takes you to the one already open.' : kind === 'benchmarking' ? "Opens last year's report, or takes you to it if it is already open." : 'Opens the filing for the last quarter that ended, or takes you to it if it is already open.'}</span> : <Field label={`What is this ${def?.name.toLowerCase() ?? 'action'} about`} className="min-w-[260px] flex-1"><input value={title} onChange={e => setTitle(e.target.value)} className={INPUT} /></Field>}
        <Button type="submit" size="sm" disabled={!def || (!auto && !title.trim())}>Start · {def?.stepTitles.length} steps</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
      </form>
      <Why>A guided action has fixed steps that tick themselves as the work is entered. For anything else, Take Action opens the full list of situations.</Why>
    </Card>
  );
}
