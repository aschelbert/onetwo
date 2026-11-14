/**
 * Book a Tasker, under a checklist item of an action: the booking form until
 * a Tasker is asked, then the job card through accept, the day, the review,
 * the payment and the rating. Everything it does goes through lifecycle.ts,
 * which keeps the action's work order and decision trail in step.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useTaskerStore, jobFor, type TaskerJob, type TaskerJobStatus } from '@/store/useTaskerStore';
import type { StepAction } from '@/store/useIssuesStore';
import type { CaseTrackerCase, CaseStep } from '@/types/issues';
import { fmt } from '@/lib/formatters';
import {
  ACCEPT_HOURS, TASKER_MODE, TASK_CATEGORIES, TIME_SLOTS, estimateFor, guessCategory, needsLicensedTrade, searchTaskers,
  type TaskCategoryId, type TimeSlotId,
} from './taskRabbit';
import {
  acceptReturnVisit, answerScope, applyUpdate, book, cancel, confirmAndPay, nextDemoUpdate, ratingsHere, rate, rebook,
  reportProblem, slotLabel, spendGate, taskerLimit, type SpendGate,
} from './lifecycle';

const BOOKING_ROLES = ['BOARD_MEMBER', 'PROPERTY_MANAGER', 'PLATFORM_ADMIN'];
const isoDay = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };

const INPUT = 'w-full rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[13px] text-ink-800 focus:border-accent-400 focus:outline-none';
const BTN = 'inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const PRIMARY = `${BTN} bg-ink-900 text-white hover:bg-ink-800`;
const RED = `${BTN} bg-accent-600 text-white hover:bg-accent-700`;
const GHOST = `${BTN} border border-ink-200 bg-white text-ink-700 hover:bg-mist-50`;
const QUIET = `${BTN} text-accent-700 hover:underline`;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink-600">{label}{children}</label>;
}

function Gate({ gate, onVote }: { gate: SpendGate; onVote?: () => void }) {
  if (gate.ok) return <p className="text-[12px] text-sage-700">✓ {gate.why}</p>;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-[12px] text-accent-800">
      <span className="flex-1">{gate.why}</span>
      {gate.needs === 'board-vote' && onVote && <button type="button" className={GHOST} onClick={onVote}>Record the board vote</button>}
    </div>
  );
}

/** The opening of the action's notes, without the runbook's preamble. */
function detailsFrom(c: CaseTrackerCase): string {
  const parts = (c.notes || '').split(/\n\n/);
  const body = parts.length > 1 ? parts.slice(1).join('\n\n') : '';
  return body.slice(0, 400);
}

// ── Booking ─────────────────────────────────────────────────────────────────
function BookingForm({ c, stepIndex, checkId, canBook, onVote, onWorkOrder, after }: {
  c: CaseTrackerCase; stepIndex: number; checkId: string; canBook: boolean;
  onVote: () => void; onWorkOrder: () => void; after?: TaskerJob;
}) {
  const me = useAuthStore(s => s.currentUser);
  const words = `${c.title} ${c.notes || ''}`;
  const licensed = needsLicensedTrade(words);
  const [override, setOverride] = useState(false);
  const [category, setCategory] = useState<TaskCategoryId>(after?.category ?? guessCategory(words));
  const [title, setTitle] = useState(after?.title ?? c.title);
  const [details, setDetails] = useState(after?.details ?? detailsFrom(c));
  const [date, setDate] = useState(isoDay(0));
  const [slot, setSlot] = useState<TimeSlotId>(after?.slot ?? 'afternoon');
  const [access, setAccess] = useState(after?.access ?? 'The front desk hands over the key or fob and takes it back');
  const [hours, setHours] = useState(after?.estimateHours ?? 1);
  const [notify, setNotify] = useState(c.source === 'issue');
  const taskers = useMemo(() => searchTaskers(category, ratingsHere()), [category]);
  const [taskerId, setTaskerId] = useState<string>('');
  const chosen = taskers.find(t => t.id === taskerId) ?? taskers[0];
  const estimate = chosen ? estimateFor(chosen.rate, hours) : 0;
  const gate = spendGate(estimate, c);

  if (licensed && !override) {
    return (
      <div className="space-y-2 rounded-lg border border-accent-200 bg-accent-50 p-3 text-[13px] text-accent-900">
        <p><strong>This reads like {licensed} work.</strong> That needs a licensed, insured vendor, not a Tasker.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={PRIMARY} onClick={onWorkOrder}>Create a work order for a vendor</button>
          <button type="button" className={GHOST} onClick={() => setOverride(true)}>It isn't. Book a Tasker anyway</button>
        </div>
      </div>
    );
  }

  const submit = () => {
    if (!chosen) return;
    book({ caseId: c.id, stepIdx: stepIndex, checkId, category, title: title.trim() || c.title, details: details.trim(), date, slot, access: access.trim(), taskerId: chosen.id, estimateHours: hours, notifyOwner: notify, bookedBy: me.name });
  };

  return (
    <div className="space-y-3">
      {after && <p className="text-[12px] text-ink-500">The booking with {after.taskerName} was cancelled. Book again below.</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Kind of job"><select className={INPUT} value={category} onChange={e => { setCategory(e.target.value as TaskCategoryId); setTaskerId(''); }}>{TASK_CATEGORIES.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select></Field>
        <Field label="Day"><input type="date" className={INPUT} value={date} min={isoDay(0)} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Window"><select className={INPUT} value={slot} onChange={e => setSlot(e.target.value as TimeSlotId)}>{TIME_SLOTS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></Field>
      </div>
      <Field label="Task"><input className={INPUT} value={title} onChange={e => setTitle(e.target.value)} /></Field>
      <Field label="What the Tasker sees"><textarea className={INPUT} rows={3} value={details} placeholder="Where it is, what to bring, where tools and parts are" onChange={e => setDetails(e.target.value)} /></Field>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px]">
        <Field label="How they get in (sent only once they accept)"><input className={INPUT} value={access} onChange={e => setAccess(e.target.value)} /></Field>
        <Field label="Estimated time"><select className={INPUT} value={hours} onChange={e => setHours(Number(e.target.value))}>{[1, 1.5, 2, 3, 4, 6, 8].map(h => <option key={h} value={h}>{h} hr</option>)}</select></Field>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-ink-600">Tasker</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Tasker">
          {taskers.map(t => {
            const on = chosen?.id === t.id;
            return (
              <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => setTaskerId(t.id)}
                className={`flex flex-col gap-0.5 rounded-lg border bg-white p-2.5 text-left ${on ? 'border-ink-900 ring-1 ring-ink-900' : 'border-ink-200 hover:border-ink-300'}`}>
                <span className="text-[13px] font-semibold text-ink-900">{t.name} <span className="font-normal text-ink-500">★ {t.rating.toFixed(1)} ({t.reviews})</span></span>
                <span className="text-[11px] text-ink-500">{ratingsHere()[t.id] ? `Rated ${ratingsHere()[t.id]}/5 by your board · ` : ''}{t.blurb}</span>
                <span className="text-[13px] font-semibold text-ink-900">{fmt(t.rate)}/hr</span>
              </button>
            );
          })}
        </div>
      </div>
      {c.source === 'issue' && <label className="flex items-center gap-2 text-[12px] text-ink-600"><input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} /> Tell {c.owner || 'the owner'} on their request once it's scheduled</label>}
      <div className="space-y-2 border-t border-ink-100 pt-3">
        <Gate gate={gate} onVote={onVote} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12px] text-ink-500">Est. {fmt(estimate)} for labour, plus TaskRabbit's fee on the final bill. Charged to Maintenance &amp; Repairs once you confirm the work.</span>
          <button type="button" className={RED} disabled={!canBook || !gate.ok || !chosen} onClick={submit}>{chosen ? `Ask ${chosen.name.split(' ')[0]} · est. ${fmt(estimate)}` : 'No Taskers for this kind of job'}</button>
        </div>
        {!canBook && <p className="text-[11px] text-ink-400">Board members and the manager can book Taskers.</p>}
      </div>
    </div>
  );
}

// ── The job ────────────────────────────────────────────────────────────────
const STATUS: Record<TaskerJobStatus, { label: string; cls: string }> = {
  requested: { label: 'Waiting to accept', cls: 'bg-mist-100 text-mist-800' },
  'no-reply': { label: 'No reply', cls: 'bg-amber-100 text-amber-800' },
  scheduled: { label: 'Scheduled', cls: 'bg-ink-900 text-white' },
  'on-the-way': { label: 'On the way', cls: 'bg-ink-900 text-white' },
  working: { label: 'Working', cls: 'bg-ink-900 text-white' },
  'scope-request': { label: 'Asks for more', cls: 'bg-amber-100 text-amber-800' },
  done: { label: 'Your review', cls: 'bg-amber-100 text-amber-800' },
  problem: { label: 'Problem · payment held', cls: 'bg-accent-100 text-accent-800' },
  paid: { label: 'Paid', cls: 'bg-sage-100 text-sage-800' },
  'tasker-cancelled': { label: 'Tasker cancelled', cls: 'bg-accent-100 text-accent-800' },
  cancelled: { label: 'Cancelled', cls: 'bg-ink-100 text-ink-600' },
};
const TRACK: { label: string; at: TaskerJobStatus[] }[] = [
  { label: 'Asked', at: ['requested', 'no-reply', 'tasker-cancelled'] },
  { label: 'Accepted', at: ['scheduled'] },
  { label: 'On the way', at: ['on-the-way'] },
  { label: 'Working', at: ['working', 'scope-request'] },
  { label: 'Done', at: ['done', 'problem'] },
  { label: 'Paid', at: ['paid'] },
];

function Row({ k, v }: { k: string; v: ReactNode }) {
  return <div className="flex justify-between gap-3 border-b border-ink-100 py-1.5 text-[12px] last:border-0"><span className="text-ink-500">{k}</span><span className="text-right font-semibold text-ink-800">{v}</span></div>;
}

function JobCard({ j, c, canBook, onVote, onWorkOrder }: { j: TaskerJob; c: CaseTrackerCase; canBook: boolean; onVote: () => void; onWorkOrder: () => void }) {
  const me = useAuthStore(s => s.currentUser).name;
  const [problem, setProblem] = useState('');
  const [writingProblem, setWritingProblem] = useState(false);
  const [scopeGate, setScopeGate] = useState<SpendGate | null>(null);
  const others = searchTaskers(j.category, ratingsHere()).filter(t => t.id !== j.taskerId);
  const stage = TRACK.findIndex(t => t.at.includes(j.status));
  const s = STATUS[j.status];
  const flagged = j.final ? needsLicensedTrade(j.final.note) : null;
  const total = j.estimate + j.parts;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full bg-mist-100 text-xs font-bold text-mist-800">{j.taskerName.split(' ').map(x => x[0]).join('')}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-ink-900">{j.taskerName} · {j.date}, {slotLabel(j.slot)}{j.returnVisit ? ' · return visit' : ''}</p>
          <p className="text-[12px] text-ink-500">{j.title} · {fmt(j.rate)}/hr{j.woId ? ` · work order ${j.woId}` : ''}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>
      </div>

      {stage >= 0 && j.status !== 'cancelled' && (
        <ol className="grid grid-cols-6 gap-1" aria-label="Progress">
          {TRACK.map((t, i) => <li key={t.label} className="flex flex-col gap-1"><span className={`h-1.5 rounded-full ${i <= stage ? 'bg-mist-700' : 'bg-mist-100'}`} /><span className="text-[10px] font-semibold text-ink-500">{t.label}</span></li>)}
        </ol>
      )}

      {j.status === 'requested' && <p className="text-[13px] text-ink-700">Waiting for {j.taskerName} to accept. They have about {ACCEPT_HOURS} hours. How to get in stays hidden until they do.</p>}

      {(j.status === 'no-reply' || j.status === 'tasker-cancelled') && (
        <div className="space-y-2">
          <p className="text-[13px] text-ink-700">{j.status === 'no-reply' ? `${j.taskerName} didn't accept in time. Nothing was shared with them.` : `${j.taskerName} cancelled.${j.notifyOwner ? ` ${c.owner || 'The owner'} still thinks it is scheduled.` : ''}`} Ask someone else with the same details:</p>
          <div className="flex flex-wrap gap-2">{others.map(t => <button key={t.id} type="button" className={GHOST} disabled={!canBook || !spendGate(estimateFor(t.rate, j.estimateHours) + j.parts, c).ok} onClick={() => rebook(j.id, t.id, me)}>Ask {t.name} · {fmt(t.rate)}/hr</button>)}</div>
        </div>
      )}

      {['scheduled', 'on-the-way', 'working', 'scope-request'].includes(j.status) && (
        <div className="rounded-lg bg-white px-3 py-1">
          <Row k="When" v={`${j.date}, ${slotLabel(j.slot)}`} />
          {j.status === 'on-the-way' && <Row k="Arriving" v={j.eta ?? 'soon'} />}
          <Row k="Access sent" v={j.access || '—'} />
          <Row k="Estimate" v={j.returnVisit ? 'No charge (return visit)' : `${fmt(total)} · ${j.estimateHours} hr${j.parts ? ' + parts' : ''}`} />
        </div>
      )}

      {j.status === 'scope-request' && j.scope && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900">
          <p><strong>{j.taskerName} asks for {j.scope.extraHours} more hr{j.scope.parts ? ` and ${fmt(j.scope.parts)} in parts` : ''}.</strong> "{j.scope.note}"</p>
          <p className="text-[12px]">New estimate {fmt(estimateFor(j.rate, j.estimateHours + j.scope.extraHours) + j.parts + j.scope.parts)}.</p>
          {scopeGate && !scopeGate.ok && <Gate gate={scopeGate} onVote={onVote} />}
          <div className="flex gap-2">
            <button type="button" className={PRIMARY} disabled={!canBook} onClick={() => setScopeGate(answerScope(j.id, true, me))}>Approve</button>
            <button type="button" className={GHOST} disabled={!canBook} onClick={() => answerScope(j.id, false, me)}>Decline</button>
          </div>
        </div>
      )}

      {j.status === 'done' && j.final && (
        <div className="space-y-2">
          <div className="rounded-lg bg-white px-3 py-1">
            <Row k="Time" v={j.returnVisit ? 'Return visit, no charge' : `${j.final.billedHours} hr billed (worked ${j.final.hoursWorked.toFixed(2)} hr)`} />
            <Row k="Final bill" v={fmt(j.final.amount)} />
            <Row k="Photos" v={`${j.final.photos} attached`} />
            <Row k={`${j.taskerName.split(' ')[0]}'s note`} v={j.final.note} />
          </div>
          {flagged && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-[12px] text-accent-800">
              <span className="flex-1">The note mentions {flagged} work. That needs a licensed vendor.</span>
              <button type="button" className={GHOST} onClick={onWorkOrder}>Create a work order for a vendor</button>
            </div>
          )}
          {writingProblem ? (
            <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); if (problem.trim()) { reportProblem(j.id, problem.trim(), me); setWritingProblem(false); } }}>
              <input autoFocus aria-label="What is wrong" className={`${INPUT} flex-1`} value={problem} onChange={e => setProblem(e.target.value)} placeholder="What is wrong with the work?" />
              <button type="submit" className={PRIMARY}>Report and hold payment</button>
              <button type="button" className={GHOST} onClick={() => setWritingProblem(false)}>Back</button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={PRIMARY} disabled={!canBook} onClick={() => confirmAndPay(j.id, me)}>Confirm &amp; pay {fmt(j.final.amount)}</button>
              <button type="button" className={GHOST} disabled={!canBook} onClick={() => setWritingProblem(true)}>Report a problem</button>
            </div>
          )}
        </div>
      )}

      {j.status === 'problem' && (
        <div className="space-y-2 text-[13px] text-ink-700">
          <p>You reported: "{j.problem}". Payment is held and the problem is raised with TaskRabbit.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={PRIMARY} disabled={!canBook} onClick={() => acceptReturnVisit(j.id, isoDay(1), 'morning', me)}>Accept a free return visit tomorrow morning</button>
            <button type="button" className={GHOST} disabled={!canBook} onClick={() => cancel(j.id, me, 'Closed without paying; raised with TaskRabbit')}>Close without paying</button>
          </div>
        </div>
      )}

      {j.status === 'paid' && (
        <div className="space-y-2 text-[13px] text-ink-700">
          <p>Paid {fmt(j.final?.amount ?? 0)}.{j.woId ? ` Work order ${j.woId} is invoiced and paid in Funds.` : ''} The checklist item is ticked.</p>
          {j.rating ? <p className="text-[12px] text-ink-500">You rated {j.taskerName} {j.rating} of 5.</p> : (
            <div className="flex flex-wrap items-center gap-1.5"><span className="text-[12px] text-ink-500">Rate {j.taskerName.split(' ')[0]}:</span>
              {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" className={GHOST} aria-label={`${n} of 5`} onClick={() => rate(j.id, n, me)}>{'★'.repeat(n)}</button>)}
            </div>
          )}
          {c.source === 'issue' && <p className="text-[12px] text-ink-500">Next: reply to {c.owner || 'the owner'} and resolve the request. The last step ticks itself.</p>}
        </div>
      )}

      {['requested', 'scheduled', 'on-the-way', 'no-reply', 'tasker-cancelled'].includes(j.status) && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={QUIET} disabled={!canBook} onClick={() => cancel(j.id, me)}>{j.status === 'requested' || j.status === 'no-reply' ? 'Withdraw' : j.status === 'tasker-cancelled' ? 'Close the job' : 'Cancel the booking'}</button>
          {(j.status === 'scheduled' || j.status === 'on-the-way') && <span className="text-[11px] text-ink-400">TaskRabbit may charge a late-cancellation fee close to the start time.</span>}
        </div>
      )}

      <details className="text-[12px] text-ink-500">
        <summary className="cursor-pointer font-semibold">Activity ({j.events.length})</summary>
        <ul className="mt-1.5 space-y-1">{[...j.events].reverse().map((e, i) => <li key={i}><span className="text-ink-400">{new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span> · <strong className="text-ink-700">{e.who}</strong> · {e.text}</li>)}</ul>
      </details>

      {TASKER_MODE === 'demo' && <DemoControls j={j} />}
    </div>
  );
}

/** Until TaskRabbit's webhooks are connected, the board can play TaskRabbit's side to walk the lifecycle. */
function DemoControls({ j }: { j: TaskerJob }) {
  const next = nextDemoUpdate(j);
  const nextLabel: Partial<Record<TaskerJobStatus, string>> = { requested: 'Tasker accepts', scheduled: 'On the way', 'on-the-way': 'Checks in', working: 'Marks it done' };
  const extra: { label: string; run: () => void }[] = [];
  if (j.status === 'requested') extra.push({ label: 'No reply', run: () => applyUpdate(j.id, { kind: 'no-reply' }) });
  if (['requested', 'scheduled', 'on-the-way'].includes(j.status)) extra.push({ label: 'Tasker cancels', run: () => applyUpdate(j.id, { kind: 'tasker-cancelled', reason: 'Something came up' }) });
  if (j.status === 'working') {
    extra.push({ label: 'Asks for more time', run: () => applyUpdate(j.id, { kind: 'scope-request', extraHours: 1, parts: 14, note: 'The other fittings need a different part. I can pick it up nearby.' }) });
    extra.push({ label: 'Done, flags wiring', run: () => applyUpdate(j.id, { kind: 'done', hoursWorked: j.estimateHours, note: 'Done. One socket is loose and the wiring should be checked by an electrician.', photos: 2 }) });
  }
  if (!next && extra.length === 0) return null;
  return (
    <div className="rounded-lg border border-dashed border-ink-200 p-2.5" data-tasker-demo>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-ink-400">Demo · play TaskRabbit's side</p>
      <div className="flex flex-wrap gap-1.5">
        {next && <button type="button" className={GHOST} onClick={() => applyUpdate(j.id, next)}>{nextLabel[j.status] ?? 'Next update'}</button>}
        {extra.map(x => <button key={x.label} type="button" className={GHOST} onClick={x.run}>{x.label}</button>)}
      </div>
    </div>
  );
}

// ── The panel ──────────────────────────────────────────────────────────────
export function TaskerPanel({ c, step, stepIndex, checkId, onAction }: {
  c: CaseTrackerCase; step: CaseStep; stepIndex: number; checkId: string;
  onAction?: (action: StepAction, stepIdx: number) => void;
}) {
  const role = useAuthStore(s => s.currentUser.role);
  const jobs = useTaskerStore(s => s.jobs);
  const j = jobFor(jobs, c.id, checkId);
  const canBook = BOOKING_ROLES.includes(role);
  const onVote = () => onAction?.({ type: 'modal', target: 'board-vote', label: 'Record the board vote' }, stepIndex);
  const onWorkOrder = () => onAction?.({ type: 'modal', target: 'create-wo', label: 'Create a work order' }, stepIndex);
  const live = j && j.status !== 'cancelled';
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-ink-100 bg-mist-50 p-3" data-check-panel="tasker" data-tasker-status={j?.status ?? 'new'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-ink-500">{live ? 'Tasker job' : 'Book a Tasker'} <span className="font-semibold normal-case tracking-normal text-ink-400">through TaskRabbit{TASKER_MODE === 'demo' ? ' (demo)' : ''}</span></p>
        <span className="text-[11px] text-ink-400">Limit {fmt(taskerLimit())} a job without a vote</span>
      </div>
      {live
        ? <JobCard j={j} c={c} canBook={canBook} onVote={onVote} onWorkOrder={onWorkOrder} />
        : <BookingForm c={c} stepIndex={stepIndex} checkId={checkId} canBook={canBook} onVote={onVote} onWorkOrder={onWorkOrder} after={j} />}
      <p className="sr-only">Step: {step.s}</p>
    </div>
  );
}
