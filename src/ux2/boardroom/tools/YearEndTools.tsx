import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { periodLabel } from '@/lib/retention';
import { saveRetention, useRetention } from '../../building/retention';
import { useFinancialStore, ALLOWANCE_ACCT } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { balanceOf, fiscalYearStart } from '@/lib/ledger';
import { invoiceRemaining, isOpenInvoice } from '@/lib/financial-logic';
import { fmt } from '@/lib/formatters';
import { DEFAULT_ALLOWANCE_PCT, MEASURES, agingBuckets, allowanceTarget, blankPlan, met, outcomeLine, showMeasure, type BucketId, type YearPlan } from '@/lib/caseTools';
import { Button, Card, Chip, Inner, SectionLabel, Why, Field, INPUT } from '../../components';
import { todayIso } from '../../runbook/adapters';
import { esc, printPage, rowsHtml, useToolDoc } from './docs';
import { measuredNow } from './planNumbers';
import { emailAnnouncement } from '../../community/notify';

interface Allowance { pct: Record<BucketId, number>; postedOn: string; posted: number }

function AllowanceTool({ fyEnd }: { fyEnd: string }) {
  const invoices = useFinancialStore(s => s.unitInvoices);
  const gl = useFinancialStore(s => s.generalLedger);
  const [doc, save] = useToolDoc<Allowance>('allowance', fyEnd, { pct: DEFAULT_ALLOWANCE_PCT, postedOn: '', posted: 0 });
  const today = todayIso();
  const asOf = fyEnd < today ? fyEnd : today;
  const open = invoices.filter(isOpenInvoice).map(i => ({ unitNumber: i.unitNumber, dueDate: i.dueDate, remaining: invoiceRemaining(i) }));
  const buckets = agingBuckets(open, asOf, doc.pct);
  const target = allowanceTarget(buckets);
  const now = Math.max(0, -balanceOf(ALLOWANCE_ACCT, 'asset', gl));
  return (
    <Inner className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm font-semibold text-ux2-ink">Allow for dues that may not be collected</b>{doc.postedOn ? <Chip tone="sage">Posted {doc.postedOn}</Chip> : null}</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm text-ux2-ink"><thead><tr className="text-xs text-ux2-muted"><th className="py-1 text-left font-semibold">How late</th><th className="py-1 text-right font-semibold">Owed</th><th className="py-1 text-right font-semibold">Units</th><th className="py-1 text-right font-semibold">Share unlikely to come in</th><th className="py-1 text-right font-semibold">Allowance</th></tr></thead>
        <tbody>{buckets.map(b => <tr key={b.id}><td className="py-1">{b.label}</td><td className="py-1 text-right">{fmt(b.owed)}</td><td className="py-1 text-right">{b.units}</td><td className="py-1 text-right"><input aria-label={'Percent for ' + b.label} inputMode="numeric" defaultValue={b.pct} onBlur={e => save({ pct: { ...doc.pct, [b.id]: Math.min(100, Math.max(0, Number(e.target.value) || 0)) } })} className="w-16 rounded-[8px] border border-ux2-line-strong px-2 py-1 text-right" />%</td><td className="py-1 text-right">{fmt((b.owed * b.pct) / 100)}</td></tr>)}
          <tr className="font-semibold"><td className="pt-2">Allowance needed</td><td className="pt-2 text-right">{fmt(buckets.reduce((t, b) => t + b.owed, 0))}</td><td /><td /><td className="pt-2 text-right">{fmt(target)}</td></tr></tbody></table></div>
      <div className="flex flex-wrap items-center gap-3"><span className="text-sm text-ux2-ink">On the books now: {fmt(now)}</span><Button size="sm" disabled={Math.abs(target - now) < 0.005} onClick={() => { const change = useFinancialStore.getState().setAllowance(target, today, 'Allowance for doubtful accounts, year ending ' + fyEnd); save({ postedOn: today, posted: change }); }}>{Math.abs(target - now) < 0.005 ? 'The allowance is right' : 'Post ' + fmt(Math.abs(target - now)) + (target > now ? ' more' : ' less')}</Button></div>
      <span className="text-xs text-ux2-muted">Owed as of {asOf}. Posting makes one entry (bad debt expense against the allowance) so the year's result shows what dues really brought in. No owner's balance changes: writing off one unit stays a board vote in that unit's collections action.</span>
    </Inner>
  );
}

function Outcomes({ year }: { year: string }) {
  const me = useAuthStore(s => s.currentUser.name);
  const building = useBuildingStore(s => s.name);
  const [plan, save] = useToolDoc<YearPlan>('objectives', year, blankPlan(year));
  if (!plan.objectives.length) return <Inner className="text-sm text-ux2-muted"><b className="font-semibold text-ux2-ink">Report outcomes against objectives</b><span className="block">No objectives were set for the year starting {year}. They are set in the annual budget action.</span></Inner>;
  const set = (id: string, c: { result?: number | null; note?: string }) => save({ objectives: plan.objectives.map(o => (o.id === id ? { ...o, ...c } : o)) });
  const fill = () => { const now = measuredNow(year); save({ objectives: plan.objectives.map(o => (now[o.measure] != null ? { ...o, result: now[o.measure]! } : o)) }); };
  const ready = plan.objectives.every(o => o.result != null && (met(o) || o.note.trim()));
  const metCount = plan.objectives.filter(o => met(o)).length;
  const print = () => printPage(building + ' · outcomes', '<h1 style="font-size:22px">' + esc(building) + '</h1><p>What the board set out to do in the year starting ' + esc(year) + ', and what happened. ' + metCount + ' of ' + plan.objectives.length + ' met.</p>' + rowsHtml(plan.objectives.map(o => [outcomeLine(o) + (o.note ? ' — ' + o.note : ''), met(o) ? 'Met' : 'Missed'])));
  return (
    <Inner className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm font-semibold text-ux2-ink">Report outcomes against objectives</b>{plan.outcomeOn ? <Chip tone="sage">Approved {plan.outcomeOn} · {metCount} of {plan.objectives.length} met</Chip> : <Button size="sm" variant="ghost" onClick={fill}>Fill in from the year's numbers</Button>}</div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">{plan.objectives.map(o => { const m = met(o); return (
        <li key={o.id} className="flex flex-wrap items-end gap-3 text-sm text-ux2-ink"><span className="min-w-[220px] flex-1">{o.text}<span className="block text-xs text-ux2-muted">Target {MEASURES[o.measure].direction === 'at-most' ? 'at most' : 'at least'} {showMeasure(o.measure, o.target)}</span></span>
          <Field label="Result" className="w-[120px]"><input key={String(o.result)} aria-label={'Result for ' + o.text} inputMode="decimal" disabled={!!plan.outcomeOn} defaultValue={o.result ?? ''} onBlur={e => set(o.id, { result: e.target.value === '' ? null : Number(e.target.value) || 0 })} className={INPUT} /></Field>
          {m === false && <Field label="A sentence on the miss" className="min-w-[220px] flex-1"><input disabled={!!plan.outcomeOn} defaultValue={o.note} onBlur={e => set(o.id, { note: e.target.value.trim() })} className={INPUT} /></Field>}
          {m != null && <Chip tone={m ? 'sage' : 'red'}>{m ? 'Met' : 'Missed'}</Chip>}</li>
      ); })}</ul>
      <div className="flex flex-wrap gap-2">{!plan.outcomeOn && <Button size="sm" disabled={!ready} onClick={() => save({ outcomeOn: todayIso(), outcomeBy: me })}>The board approved this report</Button>}<Button size="sm" variant="ghost" onClick={print}>Print the outcome report</Button></div>
      <span className="text-xs text-ux2-muted">Reserve funding, late dues and utility cost are read from the app's own records; the dues increase and anything else are entered. Once approved it shows on Building › Goals as the year's outcome.</span>
    </Inner>
  );
}

/** One unit's year-end statement as rows: each payment in the year, the total, and what is owed today. */
export function ownerStatementRows(u: { payments: { date: string; amount: number; method: string; note: string }[]; balance: number }, fyStart: string, fyEnd: string): [string, string][] {
  const paid = u.payments.filter(p => p.date >= fyStart && p.date <= fyEnd);
  return [...paid.map(p => [p.date + ' · ' + (p.note || p.method), fmt(p.amount)] as [string, string]), ['Paid in the year', fmt(paid.reduce((t, p) => t + p.amount, 0))], ['Owed today', fmt(Math.max(0, u.balance))]];
}

interface OwnerSend { sentOn: string; emailed: number; note: string }

function OwnerStatements({ fyStart, fyEnd }: { fyStart: string; fyEnd: string }) {
  const me = useAuthStore(s => s.currentUser.name);
  const units = useFinancialStore(s => s.units);
  const building = useBuildingStore(s => s.name);
  const [sent, save] = useToolDoc<OwnerSend>('owner-statements', fyEnd, { sentOn: '', emailed: 0, note: '' });
  const [busy, setBusy] = useState(false);
  const withEmail = units.filter(u => u.email);
  const total = units.reduce((t, u) => t + u.payments.filter(p => p.date >= fyStart && p.date <= fyEnd).reduce((x, p) => x + p.amount, 0), 0);
  const print = () => printPage(building + ' · year-end statements', units.map(u => '<section style="page-break-after:always"><h1 style="font-size:20px">' + esc(building) + '</h1><p>Year-end statement for unit ' + esc(u.number) + ' · ' + esc(u.owner) + '<br>' + esc(fyStart) + ' to ' + esc(fyEnd) + '</p>' + rowsHtml(ownerStatementRows(u, fyStart, fyEnd)) + '</section>').join(''));
  const email = async () => {
    setBusy(true);
    let count = 0, note = '';
    // One message per owner: each sees only their own unit.
    for (const u of withEmail) {
      const r = await emailAnnouncement({ title: building + ': your year-end statement, unit ' + u.number, body: 'Unit ' + u.number + ', ' + fyStart + ' to ' + fyEnd + '\n\n' + ownerStatementRows(u, fyStart, fyEnd).map(([a, b]) => a + ': ' + b).join('\n'), category: 'financial', postedBy: me, recipients: [{ email: u.email, name: u.owner }] });
      count += r.sent; if (r.note) note = r.note;
      if (!r.sent && !count) break;
    }
    save({ sentOn: count ? todayIso() : sent.sentOn, emailed: count, note });
    setBusy(false);
  };
  return (
    <Inner className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-ux2-ink"><b className="font-semibold">Each owner's year-end statement</b><span className="block text-xs text-ux2-muted">{units.length} units · {fmt(total)} paid between {fyStart} and {fyEnd}</span></span>{sent.sentOn && <Chip tone="sage">{sent.emailed} emailed {sent.sentOn}</Chip>}</div>
      <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy || !withEmail.length} onClick={() => void email()}>{busy ? 'Sending' : 'Email ' + withEmail.length + ' owners their own statement'}</Button><Button size="sm" variant="ghost" onClick={print}>Print every unit's statement</Button></div>
      {sent.note && <span className="text-xs text-ux2-red-ink">{sent.note}</span>}
    </Inner>
  );
}

function DisposalReview({ fyEnd }: { fyEnd: string }) {
  const me = useAuthStore(s => s.currentUser.name);
  const navigate = useNavigate();
  const today = todayIso();
  const { rows, doc } = useRetention(today);
  const due = rows.filter(r => r.due.length > 0);
  const [picked, setPicked] = useState<string[]>([]);
  const [vote, setVote] = useState('');
  const done = doc.reviews.find(r => r.year === fyEnd);
  const record = () => {
    const approved = due.filter(r => picked.includes(r.rule.kind)).map(r => ({ kind: r.rule.kind, count: r.due.length, through: r.due.map(i => i.date.slice(0, 10)).sort().pop() ?? '' }));
    saveRetention({ reviews: [...doc.reviews.filter(r => r.year !== fyEnd), { year: fyEnd, on: today, by: me, vote: vote.trim(), approved }] }, today);
  };
  return (
    <Inner className="flex flex-col gap-2" data-disposal-review={done ? done.on : ''}>
      <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm font-semibold text-ux2-ink">Review what is old enough to dispose of</b><span className="flex items-center gap-2">{done && <Chip tone="sage">Reviewed {done.on} by {done.by}</Chip>}<Button size="sm" variant="ghost" onClick={() => navigate('/records?tab=archive')}>Open the retention schedule</Button></span></div>
      {due.length === 0 ? <span className="text-sm text-ux2-ink">Nothing has passed its period on the retention schedule.</span> : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{due.map(r => (
          <li key={r.rule.kind}><label className="flex items-start gap-2.5 text-sm text-ux2-ink"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={picked.includes(r.rule.kind)} onChange={e => setPicked(p => (e.target.checked ? [...p, r.rule.kind] : p.filter(x => x !== r.rule.kind)))} /><span><b className="font-semibold">{r.rule.label}</b> · {r.due.length} past {periodLabel(r.rule).toLowerCase()}<span className="block text-xs text-ux2-muted">Oldest {r.oldest}{r.heldBack.length ? ` · ${r.heldBack.length} more held back by a hold` : ''}</span></span></label></li>
        ))}</ul>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="The vote, as in the minutes" className="min-w-[240px] flex-1"><input value={vote} onChange={e => setVote(e.target.value)} placeholder="Board, 4 to 0" className={INPUT} /></Field>
        <Button size="sm" disabled={picked.length > 0 && !vote.trim()} onClick={record}>{picked.length ? `The board approved disposing of ${picked.length} kind${picked.length === 1 ? '' : 's'}` : 'The board reviewed the list: keep everything'}</Button>
      </div>
      <span className="text-xs text-ux2-muted">Each kind of record has its own period on the retention schedule under Records › Archive. This records what the board approved and the vote; the app deletes nothing, and anything on hold for a dispute is left off the list. Ask the association's lawyer before disposing of anything.</span>
    </Inner>
  );
}

/** Year-end close: the allowance, the outcome report, owners' statements and the disposal review. */
export default function YearEndTools({ fyEnd }: { fyEnd: string }) {
  const fiscalYearEnd = useBuildingStore(s => s.details?.fiscalYearEnd) || '12-31';
  const fyStart = fiscalYearStart(fyEnd, fiscalYearEnd);
  return (
    <Card aria-label="Year-end work" className="gap-3">
      <SectionLabel>Year-end work · {fyStart} to {fyEnd}</SectionLabel>
      <AllowanceTool fyEnd={fyEnd} />
      <Outcomes year={fyStart} />
      <OwnerStatements fyStart={fyStart} fyEnd={fyEnd} />
      <DisposalReview fyEnd={fyEnd} />
      <Why>These sit beside the year-end action's own steps. Post the allowance before the books are closed for the year, so it lands in the year it belongs to.</Why>
    </Card>
  );
}
