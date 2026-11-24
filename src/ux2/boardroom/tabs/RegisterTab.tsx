import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRegisterStore } from '@/store/useRegisterStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useAuthStore } from '@/store/useAuthStore';
import { fmt } from '@/lib/formatters';
import {
  DEFAULT_CURE_DAYS, DEFAULT_REVIEW_DAYS, RESALE_DAYS, blankArchitectural, blankLien, blankResale, blankViolation, priorViolations, standingOf,
  type ArchitecturalRequest, type Lien, type RegisterEntry, type RegisterKind, type ResaleRequest, type Standing, type Violation,
} from '@/lib/register';
import { Button, Card, Chip, Inner, PillTabs, SectionLabel, RowMenu, Why, Field, INPUT } from '../../components';
import { todayIso } from '../../runbook/adapters';
import { registerCase } from '../register';

const FORM = 'flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3';
const KINDS: { id: RegisterKind; label: string; one: string; empty: string; why: string }[] = [
  { id: 'violation', label: 'Violations', one: 'violation', empty: 'No violations on the register.', why: 'Each violation gets an action with its steps: notice, the cure date, a hearing if it is not cured, and the fine if the board imposes one. The owner is told what rule was broken, given time to put it right, and offered a hearing before any fine. Earlier violations of the same rule by the same unit are counted, so a repeat is visible.' },
  { id: 'architectural', label: 'Architectural requests', one: 'request', empty: 'No architectural requests on the register.', why: 'The board\'s deadline runs from the day the application came in. Decide in writing before it: some documents treat silence as approval. An approved job stays open until the finished work has been looked at.' },
  { id: 'resale', label: 'Resale certificates', one: 'request', empty: 'No resale certificates requested.', why: `The certificate is due ${RESALE_DAYS} days after the request (DC Code § 42-1904.11). Preparing the statement takes the unit's balance and assessments from Funds on that day, so the figures on the certificate are the ledger's.` },
  { id: 'lien', label: 'Liens', one: 'lien', empty: 'No liens on the register.', why: 'Under DC Code § 42-1903.13 an unpaid assessment is a lien from the day it falls due; recording it gives notice of it. A lien belongs to the unit\'s collections action. Once the unit has paid, the release has to be recorded, and the register says so.' },
];

type Ask = { id: string; act: string } | null;

/** One line of inputs under an entry, for the dates and amounts an action needs. */
function Prompt({ title, fields, submit, onSubmit, onClose }: { title: string; fields: { key: string; label: string; type?: 'date' | 'number' | 'text'; value?: string; wide?: boolean; placeholder?: string }[]; submit: string; onSubmit: (v: Record<string, string>) => void; onClose: () => void }) {
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(fields.map(f => [f.key, f.value ?? ''])));
  return (
    <form aria-label={title} onSubmit={e => { e.preventDefault(); onSubmit(v); onClose(); }} className={FORM}>
      <div className="w-full text-sm font-semibold text-ux2-ink">{title}</div>
      {fields.map(f => <Field key={f.key} label={f.label} className={f.wide ? 'min-w-[240px] flex-1' : 'w-[170px]'}><input type={f.type === 'date' ? 'date' : 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined} value={v[f.key]} placeholder={f.placeholder} onChange={e => setV(x => ({ ...x, [f.key]: e.target.value }))} className={INPUT} /></Field>)}
      <div className="flex gap-2"><Button type="submit" size="sm">{submit}</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

function AddForm({ kind, onClose }: { kind: RegisterKind; onClose: () => void }) {
  const add = useRegisterStore(s => s.add);
  const units = useFinancialStore(s => s.units);
  const me = useAuthStore(s => s.currentUser.name);
  const today = todayIso();
  const [unit, setUnit] = useState(units[0]?.number ?? '');
  const [title, setTitle] = useState('');
  const [openedOn, setOpenedOn] = useState(today);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [days, setDays] = useState(String(kind === 'violation' ? DEFAULT_CURE_DAYS : DEFAULT_REVIEW_DAYS));
  const u = units.find(x => x.number === unit);
  const needsTitle = kind === 'violation' || kind === 'architectural';
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unit || (needsTitle && !title.trim())) return;
    const base = { unit, owner: u?.owner ?? '', openedOn, closedOn: '', notes: '' };
    if (kind === 'violation') add<'violation'>({ ...base, kind, title: title.trim(), data: { ...blankViolation(), rule: a.trim(), description: b.trim(), observedBy: me, cureDays: Math.max(1, Number(days) || DEFAULT_CURE_DAYS) } });
    else if (kind === 'architectural') add<'architectural'>({ ...base, kind, title: title.trim(), data: { ...blankArchitectural(), description: b.trim(), contractor: a.trim(), reviewDays: Math.max(1, Number(days) || DEFAULT_REVIEW_DAYS) } });
    else if (kind === 'resale') add<'resale'>({ ...base, kind, title: `Resale certificate · Unit ${unit}`, data: { ...blankResale(), requestedBy: a.trim() || u?.owner || '', requesterEmail: b.trim() } });
    else add<'lien'>({ ...base, kind, title: `Lien · Unit ${unit}`, data: { ...blankLien(), amount: Number(a) || Math.max(0, u?.balance ?? 0), attorney: b.trim() } });
    onClose();
  };
  return (
    <form aria-label={`Add a ${KINDS.find(k => k.id === kind)!.one}`} onSubmit={save} className={FORM}>
      <Field label="Unit" className="w-[200px]"><select value={unit} onChange={e => setUnit(e.target.value)} className={INPUT}>{units.map(x => <option key={x.number} value={x.number}>{x.number}{x.owner ? ` · ${x.owner}` : ''}{kind === 'lien' && x.balance > 0 ? ` · owes ${fmt(x.balance)}` : ''}</option>)}</select></Field>
      {kind === 'violation' && <>
        <Field label="What happened, in a line" className="min-w-[220px] flex-1"><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Storage on the balcony" className={INPUT} /></Field>
        <Field label="Rule or provision" className="w-[200px]"><input value={a} onChange={e => setA(e.target.value)} placeholder="Rules § 4.2" className={INPUT} /></Field>
        <Field label="Seen on" className="w-[160px]"><input type="date" value={openedOn} max={today} onChange={e => setOpenedOn(e.target.value)} className={INPUT} /></Field>
        <Field label="Days to put it right" className="w-[150px]"><input inputMode="numeric" value={days} onChange={e => setDays(e.target.value)} className={INPUT} /></Field>
        <Field label="What was seen" className="min-w-[260px] flex-1"><input value={b} onChange={e => setB(e.target.value)} placeholder="Where, and what exactly" className={INPUT} /></Field>
      </>}
      {kind === 'architectural' && <>
        <Field label="What they want to do, in a line" className="min-w-[220px] flex-1"><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Replace the unit's windows" className={INPUT} /></Field>
        <Field label="Received" className="w-[160px]"><input type="date" value={openedOn} max={today} onChange={e => setOpenedOn(e.target.value)} className={INPUT} /></Field>
        <Field label="Days the board has to decide" className="w-[190px]"><input inputMode="numeric" value={days} onChange={e => setDays(e.target.value)} className={INPUT} /></Field>
        <Field label="Contractor" className="w-[200px]"><input value={a} onChange={e => setA(e.target.value)} className={INPUT} /></Field>
        <Field label="Details" className="min-w-[260px] flex-1"><input value={b} onChange={e => setB(e.target.value)} placeholder="Scope, materials, dates" className={INPUT} /></Field>
      </>}
      {kind === 'resale' && <>
        <Field label="Requested on" className="w-[160px]"><input type="date" value={openedOn} max={today} onChange={e => setOpenedOn(e.target.value)} className={INPUT} /></Field>
        <Field label="Requested by" className="w-[220px]"><input value={a} onChange={e => setA(e.target.value)} placeholder={u?.owner || 'Owner, agent or title company'} className={INPUT} /></Field>
        <Field label="Send it to (email)" className="min-w-[220px] flex-1"><input value={b} onChange={e => setB(e.target.value)} className={INPUT} /></Field>
      </>}
      {kind === 'lien' && <>
        <Field label="Referred on" className="w-[160px]"><input type="date" value={openedOn} max={today} onChange={e => setOpenedOn(e.target.value)} className={INPUT} /></Field>
        <Field label="Amount" className="w-[150px]"><input inputMode="decimal" value={a} onChange={e => setA(e.target.value)} placeholder={u ? String(Math.max(0, u.balance)) : '$'} className={INPUT} /></Field>
        <Field label="Attorney or firm" className="min-w-[220px] flex-1"><input value={b} onChange={e => setB(e.target.value)} className={INPUT} /></Field>
      </>}
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!unit || (needsTitle && !title.trim())}>Add</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

const money = (s: string) => Math.max(0, Math.round((Number(String(s).replace(/[^0-9.]/g, '')) || 0) * 100) / 100);

function Entry({ e, st, all, onOpenCase }: { e: RegisterEntry; st: Standing; all: RegisterEntry[]; onOpenCase: (id: string) => void }) {
  const navigate = useNavigate();
  const patch = useRegisterStore(s => s.patchData);
  const update = useRegisterStore(s => s.update);
  const remove = useRegisterStore(s => s.remove);
  const units = useFinancialStore(s => s.units);
  const createInvoice = useFinancialStore(s => s.createUnitInvoice);
  const cases = useIssuesStore(s => s.cases);
  const [ask, setAsk] = useState<Ask>(null);
  const today = todayIso();
  const linked = registerCase(cases, e);
  const unit = units.find(u => u.number === e.unit);
  const go = (act: string) => setAsk({ id: e.id, act });
  const actions: { label: string; run: () => void; primary?: boolean }[] = [];
  let facts: string[] = [];

  if (e.kind === 'violation') {
    const v = e as Violation; const d = v.data;
    const prior = priorViolations(v, all).length;
    facts = [d.rule, d.description, d.noticeSentOn && `notice sent ${d.noticeSentOn}`, d.hearingOn && `hearing ${d.hearingOn}`, d.hearingNotes, prior > 0 && `${prior} earlier violation${prior === 1 ? '' : 's'} of this rule by the unit`].filter(Boolean) as string[];
    if (st.stage === 'logged') { actions.push({ label: 'Notice sent', run: () => go('notice'), primary: true }); actions.push({ label: 'Draft the notice', run: () => navigate('/boardroom?tab=outbox') }); }
    if (st.stage === 'noticed' || st.stage === 'uncured') { actions.push({ label: 'Mark cured', run: () => go('cured'), primary: st.stage === 'noticed' }); actions.push({ label: 'Set a hearing', run: () => go('hearing'), primary: st.stage === 'uncured' }); }
    if (st.stage === 'hearing-set' || st.stage === 'hearing-held') { actions.push({ label: 'Record the outcome', run: () => go('outcome'), primary: true }); actions.push({ label: 'Mark cured', run: () => go('cured') }); }
    if (st.stage === 'fine-due') actions.push({ label: `Charge the ${fmt(d.fineAmount)} fine`, primary: true, run: () => { const inv = createInvoice(v.unit, 'fee', d.fineAmount, `Fine · ${v.title}${d.rule ? ` (${d.rule})` : ''}`, linked?.id, undefined, { revenueAcct: '4070' }); patch(v.id, { fineInvoiceId: inv.id }); update(v.id, { closedOn: today }); } });
  } else if (e.kind === 'architectural') {
    const a = e as ArchitecturalRequest; const d = a.data;
    facts = [d.description, d.contractor && `contractor ${d.contractor}`, d.decidedOn && `decided ${d.decidedOn}`, d.conditions && `conditions: ${d.conditions}`].filter(Boolean) as string[];
    if (st.stage === 'review') { actions.push({ label: 'Approve', run: () => go('approve'), primary: true }); actions.push({ label: 'Deny', run: () => go('deny') }); actions.push({ label: 'Withdrawn by the owner', run: () => update(a.id, { closedOn: today }) }); }
    if (st.stage === 'approved') actions.push({ label: 'Work inspected', run: () => go('inspected'), primary: true });
  } else if (e.kind === 'resale') {
    const r = e as ResaleRequest; const d = r.data;
    facts = [d.requestedBy && `requested by ${d.requestedBy}`, d.requesterEmail, d.statement && `statement ${d.statement.preparedOn}: owes ${fmt(d.statement.balance)}, ${fmt(d.statement.monthlyFee)} a month${d.statement.specialAssessments ? `, ${fmt(d.statement.specialAssessments)} in special assessments` : ''}`, d.feeInvoiceId ? `fee ${fmt(d.feeAmount)} charged` : d.feeWaived ? 'no fee' : '', d.deliveredTo && `delivered to ${d.deliveredTo}`].filter(Boolean) as string[];
    if (st.open) {
      actions.push({ label: d.statement ? 'Refresh the statement' : 'Prepare statement', primary: !d.statement, run: () => patch(r.id, { statement: { preparedOn: today, balance: Math.max(0, unit?.balance ?? 0), monthlyFee: unit?.monthlyFee ?? 0, specialAssessments: (unit?.specialAssessments ?? []).filter(s => !s.paid).reduce((t, s) => t + s.amount, 0) } }) });
      if (!d.feeInvoiceId && !d.feeWaived) { actions.push({ label: 'Charge the fee', run: () => go('fee') }); actions.push({ label: 'No fee', run: () => patch(r.id, { feeWaived: true }) }); }
      actions.push({ label: 'Delivered', run: () => go('delivered'), primary: !!d.statement });
      actions.push({ label: 'Cancel the request', run: () => update(r.id, { closedOn: today }) });
    }
  } else {
    const l = e as Lien; const d = l.data;
    facts = [`${fmt(d.amount)} when referred`, unit && `unit owes ${fmt(Math.max(0, unit.balance))} today`, d.attorney, d.noticeSentOn && `owner notified ${d.noticeSentOn}`, d.instrument && `instrument ${d.instrument}`, d.releaseInstrument && `release ${d.releaseInstrument}`].filter(Boolean) as string[];
    if (st.stage === 'referred') { if (!d.noticeSentOn) actions.push({ label: 'Owner notified', run: () => go('lien-notice'), primary: true }); actions.push({ label: 'Lien recorded', run: () => go('recorded'), primary: !!d.noticeSentOn }); }
    if (st.stage === 'moot') actions.push({ label: 'Withdraw the referral', primary: true, run: () => remove(l.id) });
    if (st.stage === 'recorded' || st.stage === 'release-due') actions.push({ label: 'Release recorded', run: () => go('released'), primary: st.stage === 'release-due' });
  }

  const asking = ask?.id === e.id ? ask.act : null;
  const closeAsk = () => setAsk(null);
  return (
    <>
      <Inner data-register={e.id} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ux2-ink">Unit {e.unit}{e.owner ? ` · ${e.owner}` : ''}{e.kind === 'violation' || e.kind === 'architectural' ? ` · ${e.title}` : ''}</div>
            <div className="text-xs text-ux2-muted">{e.kind === 'resale' ? 'Requested' : e.kind === 'lien' ? 'Referred' : e.kind === 'architectural' ? 'Received' : 'Seen'} {e.openedOn}{facts.length ? ` · ${facts.join(' · ')}` : ''}</div>
          </div>
          <span className="flex flex-wrap items-center gap-2"><Chip tone={st.tone}>{st.label}</Chip>
            <RowMenu label={`More for Unit ${e.unit}`} items={[...(linked ? [{ label: 'Open the action', onSelect: () => onOpenCase(linked.id) }] : []), { label: 'Remove from the register', danger: true, onSelect: () => { if (window.confirm('Remove this entry from the register? Its action, if it has one, stays in Current Actions.')) remove(e.id); } }]} />
          </span>
        </div>
        {(st.next || actions.length > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ux2-line pt-2">
            <span className="text-xs text-ux2-ink">{st.next ? <><b className="font-semibold">Next:</b> {st.next}{st.due && st.open ? ` · ${st.overdue ? 'was due' : 'by'} ${st.due}` : ''}</> : null}</span>
            <span className="flex flex-wrap gap-1.5">{actions.map(a => <Button key={a.label} size="sm" variant={a.primary ? 'primary' : 'ghost'} onClick={a.run}>{a.label}</Button>)}</span>
          </div>
        )}
      </Inner>
      {asking === 'notice' && <Prompt title="When did the notice of violation go out?" fields={[{ key: 'on', label: 'Sent on', type: 'date', value: today }]} submit="Save" onSubmit={v => patch(e.id, { noticeSentOn: v.on })} onClose={closeAsk} />}
      {asking === 'cured' && <Prompt title="When was it put right?" fields={[{ key: 'on', label: 'Cured on', type: 'date', value: today }]} submit="Mark cured" onSubmit={v => { patch(e.id, { curedOn: v.on }); update(e.id, { closedOn: v.on }); }} onClose={closeAsk} />}
      {asking === 'hearing' && <Prompt title="Set the hearing · the owner gets written notice of it" fields={[{ key: 'on', label: 'Hearing date', type: 'date' }]} submit="Set the hearing" onSubmit={v => { if (v.on) patch(e.id, { hearingOn: v.on }); }} onClose={closeAsk} />}
      {asking === 'outcome' && <Prompt title="What did the board decide at the hearing?" fields={[{ key: 'fine', label: 'Fine (0 for none)', type: 'number', value: '0' }, { key: 'notes', label: 'The decision, as it is in the minutes', wide: true }]} submit="Upheld" onSubmit={v => { const fine = money(v.fine); patch(e.id, { hearingOutcome: 'upheld', fineAmount: fine, hearingNotes: v.notes.trim() }); if (!fine) update(e.id, { closedOn: today }); }} onClose={closeAsk} />}
      {asking === 'outcome' && <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={() => { patch(e.id, { hearingOutcome: 'dismissed' }); update(e.id, { closedOn: today }); closeAsk(); }}>Or: dismissed, no violation found</Button></div>}
      {asking === 'approve' && <Prompt title="Approve the request" fields={[{ key: 'on', label: 'Decided on', type: 'date', value: today }, { key: 'conditions', label: 'Conditions, if any', wide: true, placeholder: 'Work hours, protection of common areas, licensed contractor' }]} submit="Approve" onSubmit={v => patch(e.id, { decision: v.conditions.trim() ? 'approved_with_conditions' : 'approved', conditions: v.conditions.trim(), decidedOn: v.on || today })} onClose={closeAsk} />}
      {asking === 'deny' && <Prompt title="Deny the request · give the reason, with the provision it rests on" fields={[{ key: 'on', label: 'Decided on', type: 'date', value: today }, { key: 'conditions', label: 'Reason', wide: true }]} submit="Deny" onSubmit={v => { patch(e.id, { decision: 'denied', conditions: v.conditions.trim(), decidedOn: v.on || today }); update(e.id, { closedOn: v.on || today }); }} onClose={closeAsk} />}
      {asking === 'inspected' && <Prompt title="When was the finished work inspected?" fields={[{ key: 'on', label: 'Inspected on', type: 'date', value: today }]} submit="Save" onSubmit={v => { patch(e.id, { inspectedOn: v.on }); update(e.id, { closedOn: v.on }); }} onClose={closeAsk} />}
      {asking === 'fee' && <Prompt title="Charge the certificate fee to the unit" fields={[{ key: 'amount', label: 'Fee', type: 'number' }]} submit="Charge" onSubmit={v => { const amt = money(v.amount); if (!amt) return; const inv = createInvoice(e.unit, 'fee', amt, 'Resale certificate fee', linked?.id, undefined, { revenueAcct: '4090' }); patch(e.id, { feeAmount: amt, feeInvoiceId: inv.id }); }} onClose={closeAsk} />}
      {asking === 'delivered' && <Prompt title="The certificate was delivered" fields={[{ key: 'on', label: 'Delivered on', type: 'date', value: today }, { key: 'to', label: 'To whom, and how', wide: true, value: (e as ResaleRequest).data.requesterEmail || (e as ResaleRequest).data.requestedBy }]} submit="Save" onSubmit={v => { patch(e.id, { deliveredOn: v.on || today, deliveredTo: v.to.trim() }); update(e.id, { closedOn: v.on || today }); }} onClose={closeAsk} />}
      {asking === 'lien-notice' && <Prompt title="When was the owner told the lien would be recorded?" fields={[{ key: 'on', label: 'Notified on', type: 'date', value: today }]} submit="Save" onSubmit={v => patch(e.id, { noticeSentOn: v.on })} onClose={closeAsk} />}
      {asking === 'recorded' && <Prompt title="The lien was recorded" fields={[{ key: 'on', label: 'Recorded on', type: 'date', value: today }, { key: 'instrument', label: 'Instrument number', wide: true }]} submit="Save" onSubmit={v => patch(e.id, { recordedOn: v.on || today, instrument: v.instrument.trim() })} onClose={closeAsk} />}
      {asking === 'released' && <Prompt title="The release of lien was recorded" fields={[{ key: 'on', label: 'Released on', type: 'date', value: today }, { key: 'instrument', label: 'Release instrument number', wide: true }]} submit="Save" onSubmit={v => { patch(e.id, { releasedOn: v.on || today, releaseInstrument: v.instrument.trim() }); update(e.id, { closedOn: v.on || today }); }} onClose={closeAsk} />}
    </>
  );
}

/** How many register entries are waiting on someone, and how many of those are past their date. */
export function registerSummary(entries: RegisterEntry[], today: string, balanceOf: (unit: string) => number) {
  const open = entries.map(e => standingOf(e, today, balanceOf)).filter(s => s.open);
  return { open: open.length, waiting: open.filter(s => !!s.next).length, overdue: open.filter(s => s.overdue).length };
}

/** Board Room › Register: violations, architectural requests, resale certificates and liens. */
export default function RegisterTab({ section, onSection, onOpenCase }: { section?: string; onSection: (s: string) => void; onOpenCase: (id: string) => void }) {
  const entries = useRegisterStore(s => s.entries);
  const saveError = useRegisterStore(s => s.saveError);
  const units = useFinancialStore(s => s.units);
  const today = todayIso();
  const kind: RegisterKind = KINDS.some(k => k.id === section) ? (section as RegisterKind) : 'violation';
  const meta = KINDS.find(k => k.id === kind)!;
  const [adding, setAdding] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const balanceOf = useMemo(() => { const m = new Map(units.map(u => [u.number, u.balance])); return (unit: string) => m.get(unit) ?? 0; }, [units]);
  const rows = useMemo(() => entries.filter(e => e.kind === kind).map(e => ({ e, st: standingOf(e, today, balanceOf) })).sort((a, b) => Number(b.st.overdue) - Number(a.st.overdue) || (a.st.due ?? '9999').localeCompare(b.st.due ?? '9999') || b.e.openedOn.localeCompare(a.e.openedOn)), [entries, kind, today, balanceOf]);
  const open = rows.filter(r => r.st.open);
  const closed = rows.filter(r => !r.st.open);
  const count = (k: RegisterKind) => entries.filter(e => e.kind === k && standingOf(e, today, balanceOf).open).length;

  return (
    <div className="flex flex-col gap-4">
      <PillTabs size="filter" aria-label="Register sections" value={kind} onChange={k => { setAdding(false); onSection(k); }} tabs={KINDS.map(k => ({ id: k.id, label: count(k.id) ? `${k.label} · ${count(k.id)}` : k.label }))} />
      <Card aria-label={meta.label} className="gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-2"><SectionLabel>{meta.label} · {open.length} open</SectionLabel>{open.some(r => r.st.overdue) && <Chip tone="red">{open.filter(r => r.st.overdue).length} past their date</Chip>}</span>
          <Button size="sm" onClick={() => setAdding(v => !v)}>Add a {meta.one}</Button>
        </div>
        {saveError && <div role="alert" className="rounded-[10px] bg-ux2-red-tint px-3 py-2 text-xs text-ux2-ink">{saveError}</div>}
        {adding && <AddForm key={kind} kind={kind} onClose={() => setAdding(false)} />}
        {open.length === 0 && !adding && <Inner className="text-sm text-ux2-muted">{rows.length ? 'Nothing open.' : meta.empty}</Inner>}
        {open.map(r => <Entry key={r.e.id} e={r.e} st={r.st} all={entries} onOpenCase={onOpenCase} />)}
        {closed.length > 0 && <button type="button" className="self-start text-xs font-semibold text-ux2-ink underline" onClick={() => setShowClosed(v => !v)}>{showClosed ? 'Hide' : 'Show'} {closed.length} closed</button>}
        {showClosed && closed.map(r => <Entry key={r.e.id} e={r.e} st={r.st} all={entries} onOpenCase={onOpenCase} />)}
        <Why>{meta.why}</Why>
      </Card>
    </div>
  );
}
