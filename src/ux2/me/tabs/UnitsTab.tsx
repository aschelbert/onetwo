import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { fmt } from '@/lib/formatters';
import { Button, Card, Chip, Inner, PillTabs, SectionLabel, Tile, TileRow, Table, Th, Td, Cell, KV, Why, Field, INPUT } from '../../components';
import { dayLabel } from '../../home/calendar';
import { ONLINE_METHODS } from '../../funds/metrics';
import { receiptRows, resalePacket, unitSummaries, type MeSnapshot, type UnitSummary } from '../metrics';

const lastPay = (u: UnitSummary) => [...u.unit.payments].sort((a, b) => b.date.localeCompare(a.date))[0];
const autopayOn = (u: UnitSummary) => { const p = lastPay(u); return !!p && ONLINE_METHODS.includes((p.method || '').toLowerCase()); };
const methodLabel = (m?: string) => (!m ? '—' : /stripe|card|online/i.test(m) ? 'Autopay · card on file' : /bank|ach/i.test(m) ? 'Autopay · bank' : m.charAt(0).toUpperCase() + m.slice(1));

function LinkUnit({ onClose }: { onClose: () => void }) {
  const units = useFinancialStore(s => s.units);
  const user = useAuthStore(s => s.currentUser);
  const update = useAuthStore(s => s.updateProfile);
  const [n, setN] = useState('');
  const known = units.some(u => u.number === n.trim());
  return (
    <form aria-label="Link a unit" onSubmit={e => { e.preventDefault(); if (!known) return; update({ linkedUnits: Array.from(new Set([...(user.linkedUnits ?? []), n.trim()])) }); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <Field label="Unit" className="w-[160px]"><input value={n} onChange={e => setN(e.target.value)} placeholder="4B" className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!known}>Link</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
      <Why className="basis-full">The board checks the deed on record and the unit joins this sign-in. Votes stay one per unit.</Why>
    </form>
  );
}

function UnitCard({ u, snap, packetReady, packetTotal }: { u: UnitSummary; snap: MeSnapshot; packetReady: number; packetTotal: number }) {
  const navigate = useNavigate();
  const year = snap.today.slice(0, 4);
  const p = lastPay(u);
  const residents = useAuthStore(s => s.buildingMembers).filter(m => m.unit === u.unit.number && m.name !== u.unit.owner);
  return (
    <Card aria-label={`Unit ${u.unit.number}`} className="gap-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ux2-navy text-xs font-bold text-white">{u.unit.number}</span><span><span className="block text-base font-semibold text-ux2-ink">Unit {u.unit.number}</span><span className="block text-xs text-ux2-muted">{u.unit.owner === snap.viewer.name ? 'Owner-occupant' : 'Owner'}{u.movedIn ? ` since ${dayLabel(u.movedIn)}` : ''}{u.unit.sqft ? ` · ${u.unit.sqft.toLocaleString()} sq ft` : ''}{u.unit.parking ? ` · ${u.unit.parking}` : ''}{u.unit.votingPct ? ` · ${u.unit.votingPct}% vote` : ''}</span></span></span>
        <Button size="sm" variant="ghost" onClick={() => navigate('/funds?tab=income')}>Open {u.unit.number}</Button>
      </div>
      <Inner className="py-1">
        <KV label="Balance"><span className={u.owed > 0 ? 'text-ux2-red-ink' : ''}>{fmt(u.owed)}</span></KV>
        <Why className="pb-2">{u.openInvoices[0] ? `${u.openInvoices[0].description}, ${u.openInvoices[0].id}, due ${dayLabel(u.openInvoices[0].dueDate)}. ` : ''}{p ? `Dues paid ${dayLabel(p.date)} by ${methodLabel(p.method).toLowerCase()}.` : 'No payment on record yet.'}{u.owed === 0 ? ' Nothing open.' : ''}</Why>
        <KV label="Autopay">{autopayOn(u) ? `On · ${methodLabel(p?.method)}` : 'Off'}</KV>
        <Why className="pb-2">Runs the {snap.hoaDueDay}{['th', 'st', 'nd', 'rd'][(snap.hoaDueDay % 100 - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][snap.hoaDueDay % 100] ?? 'th'} · {u.paidThisYear.onTime} of {u.paidThisYear.months} on time this year</Why>
        <KV label="Residents">{[u.unit.owner, ...residents.map(r => r.name)].filter(Boolean).join(', ') || '—'}</KV>
        <KV label="Resale packet">{packetReady} of {packetTotal} ready</KV>
        <Why className="pb-2">Unit certificate issued on request{year ? '' : ''}</Why>
      </Inner>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => navigate('/my-unit/pay')}>{u.owed > 0 ? `Pay ${fmt(u.owed)}` : 'Pay ahead'}</Button>
        <Button size="sm" variant="ghost" onClick={() => navigate('/building?tab=directory')}>Add a resident</Button>
      </div>
    </Card>
  );
}

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const floorOf = (n: string) => { const m = n.match(/^\d+/); if (!m) return '—'; return m[0].length >= 3 ? m[0].slice(0, -2) : m[0].slice(0, 1); };
const nth = (d: number) => `${d}${['th', 'st', 'nd', 'rd'][(d % 100 - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][d % 100] ?? 'th'}`;

/** Twelve month boxes per unit: filled when a dues payment landed that month, dashed for the current month. */
function DuesThisYear({ units, snap }: { units: UnitSummary[]; snap: MeSnapshot }) {
  const year = snap.today.slice(0, 4);
  const curMonth = Number(snap.today.slice(5, 7));
  const paid = units.reduce((t, u) => t + u.paidThisYear.amount, 0);
  const onTime = units.reduce((t, u) => t + u.paidThisYear.onTime, 0);
  const months = units.reduce((t, u) => t + u.paidThisYear.months, 0);
  const extras = units.reduce((t, u) => t + u.unit.lateFees.filter(f => f.date.startsWith(year) && !f.waived).length + u.unit.specialAssessments.filter(a => a.date.startsWith(year)).length, 0);
  const monthly = units.reduce((t, u) => t + u.unit.monthlyFee, 0);
  return (
    <Card aria-label="Dues and fees this year" className="gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Dues and fees this year</SectionLabel><Chip tone={months > 0 && onTime === months ? 'sage' : months > 0 ? 'amber' : 'ghost'}>{months === 0 ? 'Nothing paid yet' : onTime === months ? 'On time every month' : `${onTime} of ${months} on time`}</Chip></div>
      <div className="flex items-baseline gap-2"><span className="font-display text-[34px] font-semibold leading-none tracking-[-0.02em] text-ux2-ink">{fmt(paid)}</span><span className="text-sm text-ux2-muted">paid · {onTime} of {months} on time</span></div>
      {units.map(u => {
        const done = new Set(u.unit.payments.filter(p => p.date.startsWith(year)).map(p => Number(p.date.slice(5, 7))));
        return (
          <div key={u.unit.number} className="flex flex-col gap-1">
            {units.length > 1 && <span className="text-xs font-semibold text-ux2-muted">Unit {u.unit.number}</span>}
            <div className="grid grid-cols-12 gap-1.5" aria-label={`Months paid ${u.unit.number}`}>
              {MONTHS.map((m, i) => { const n = i + 1; const isPaid = done.has(n); const isCur = n === curMonth && !isPaid; return <span key={i} className={`flex h-9 flex-col items-center justify-center rounded-lg text-[11px] font-semibold ${isPaid ? 'bg-ux2-navy text-white' : isCur ? 'border border-dashed border-ux2-navy text-ux2-navy' : n < curMonth ? 'bg-ux2-red-tint text-ux2-red-ink' : 'bg-white text-ux2-dim'}`} title={`${m} · ${isPaid ? 'paid' : isCur ? 'this month' : n < curMonth ? 'not recorded' : 'ahead'}`}>{m}</span>; })}
            </div>
          </div>
        );
      })}
      <Why>{fmt(monthly)} a month{months ? `, ${months} month${months === 1 ? '' : 's'} recorded so far` : ''}. {extras === 0 ? `No fees, fines or special assessments on ${units.map(u => u.unit.number).join(' or ')} in ${year}.` : `${extras} fee${extras === 1 ? '' : 's'} or assessment${extras === 1 ? '' : 's'} this year; see the receipts below.`}</Why>
    </Card>
  );
}

function UnitDocuments({ units, snap }: { units: UnitSummary[]; snap: MeSnapshot }) {
  const navigate = useNavigate();
  const docs = useFinancialStore(s => s.unitDocuments);
  const upload = useFinancialStore(s => s.uploadDocument);
  const tenantId = useFinancialStore(s => s.tenantId);
  const [note, setNote] = useState<string | null>(null);
  const numbers = units.map(u => u.unit.number);
  const mine = docs.filter(d => numbers.includes(d.unitNumber) && d.visibleToOwner);
  const rows = [
    ...units.filter(u => u.unit.moveIn).map(u => ({ id: `deed-${u.unit.number}`, title: 'Deed', note: `Recorded ${dayLabel(u.unit.moveIn!)} · from the unit record${units.length > 1 ? ` · ${u.unit.number}` : ''}`, status: 'On file' })),
    ...mine.map(d => ({ id: d.id, title: d.filename.replace(/\.[a-z0-9]+$/i, ''), note: `${d.docType.replace(/_/g, ' ')} · uploaded ${dayLabel(d.createdAt.slice(0, 10))}${d.uploadedByName ? ` by ${d.uploadedByName}` : ''}${units.length > 1 ? ` · ${d.unitNumber}` : ''}`, status: 'On file' })),
  ];
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!tenantId) { setNote('Uploads keep to a live building; the demo keeps the list as it is.'); return; }
    void upload(units[0].unit.number, f, 'other', true, snap.viewer.id, snap.viewer.name).then(() => setNote(`${f.name} is on file.`));
  };
  return (
    <Card aria-label="Documents for this unit" className="gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Documents for this unit</SectionLabel><label className="inline-flex h-9 cursor-pointer items-center rounded-full border border-ux2-line-strong bg-white px-3.5 text-xs font-semibold text-ux2-ink hover:bg-ux2-surface">Upload<input type="file" aria-label="Upload a unit document" className="sr-only" onChange={onFile} /></label></div>
      {rows.length === 0 && <Inner className="text-sm text-ux2-muted">Nothing on file yet. The deed, the HO-6 certificate and pet or vehicle registrations go here.</Inner>}
      {rows.map(r => <Inner key={r.id} className="flex flex-wrap items-center justify-between gap-3"><Cell title={r.title} note={r.note} /><Chip tone="sage">{r.status}</Chip></Inner>)}
      {note && <Why>{note}</Why>}
      <Why>Building-wide documents, the bylaws, CC&Rs and policies, live in <button type="button" className="font-semibold text-ux2-ink underline" onClick={() => navigate('/building?tab=documents')}>Building › Documents</button>.</Why>
    </Card>
  );
}

function MoveHistory({ units, snap }: { units: UnitSummary[]; snap: MeSnapshot }) {
  const events = useFinancialStore(s => s.moveEvents);
  const add = useFinancialStore(s => s.addMoveEvent);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'in' | 'out'>('out');
  const [date, setDate] = useState('');
  const [win, setWin] = useState('');
  const numbers = units.map(u => u.unit.number);
  const mine = events.filter(e => numbers.includes(e.unitNumber)).sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
  return (
    <Card aria-label="Move history" className="gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Move history</SectionLabel>{!open && <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Report a move</Button>}</div>
      {open && (
        <form aria-label="Report a move" onSubmit={e => { e.preventDefault(); if (!date) return; void add({ unitNumber: units[0].unit.number, moveType: type, scheduledDate: date, timeWindow: win || null, elevatorSlot: null, depositAmount: 0, depositStatus: 'pending', accessStatus: 'pending', insuranceConfirmed: false, inspectionStatus: 'pending', residentName: snap.viewer.name, moverName: null, caseId: null, notes: null }); setOpen(false); setDate(''); setWin(''); }} className="flex flex-wrap items-end gap-2 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
          <Field label="Move" className="w-[140px]"><select aria-label="Move type" value={type} onChange={e => setType(e.target.value as 'in' | 'out')} className={INPUT}><option value="out">Out</option><option value="in">In</option></select></Field>
          <Field label="Date" className="w-[170px]"><input type="date" aria-label="Move date" value={date} onChange={e => setDate(e.target.value)} className={INPUT} /></Field>
          <Field label="Window" className="w-[170px]"><input aria-label="Time window" value={win} onChange={e => setWin(e.target.value)} placeholder="9am to noon" className={INPUT} /></Field>
          <div className="flex gap-2"><Button type="submit" size="sm">Report</Button><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
        </form>
      )}
      {mine.map(e => <Inner key={e.id} data-move={e.id} className="flex flex-wrap items-center justify-between gap-3"><Cell title={`Move ${e.moveType} · ${dayLabel(e.scheduledDate)}`} note={`${e.timeWindow ? `${e.timeWindow} · ` : ''}${e.elevatorSlot ? 'elevator booked' : 'elevator not booked'} · deposit ${e.depositStatus}${units.length > 1 ? ` · ${e.unitNumber}` : ''}`} /><Chip tone={e.insuranceConfirmed ? 'sage' : 'amber'}>{e.insuranceConfirmed ? 'Insured' : 'Insurance pending'}</Chip></Inner>)}
      {units.filter(u => u.unit.moveIn).map(u => <Inner key={u.unit.number} className="flex flex-wrap items-center justify-between gap-3"><Cell title={`Moved in · ${dayLabel(u.unit.moveIn!)}`} note={`${u.unit.owner === snap.viewer.name ? 'Owner-occupant' : 'Owner'} · from the unit record${units.length > 1 ? ` · ${u.unit.number}` : ''}`} /><Chip tone="sage">On record</Chip></Inner>)}
      <Why>Moves need 48 hours notice and an elevator booking; the welcome packet goes out from the Board Room.</Why>
    </Card>
  );
}

function UnitRequests({ units }: { units: UnitSummary[] }) {
  const navigate = useNavigate();
  const issues = useIssuesStore(s => s.issues);
  const numbers = units.map(u => u.unit.number);
  const mine = issues.filter(i => i.unitNumber && numbers.includes(i.unitNumber)).sort((a, b) => b.submittedDate.localeCompare(a.submittedDate));
  const open = mine.filter(i => i.status !== 'RESOLVED' && i.status !== 'CLOSED');
  return (
    <Card aria-label="Requests from this unit" className="gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Requests from this unit</SectionLabel><button type="button" className="text-xs font-semibold text-ux2-ink underline" onClick={() => navigate('/community?tab=requests')}>Community › Requests</button></div>
      {open.length === 0 ? (
        <Inner className="flex flex-col gap-2"><Cell title={`Nothing open from ${numbers.join(' or ')}`} note="Owner requests get a reply within 14 days, and the board's answer is scored" /><div><Button size="sm" onClick={() => navigate('/community?tab=requests')}>New request</Button></div></Inner>
      ) : open.slice(0, 3).map(i => <Inner key={i.id} data-request={i.id} className="flex flex-wrap items-center justify-between gap-3"><Cell title={i.title} note={`${i.category} · sent ${dayLabel(i.submittedDate.slice(0, 10))}`} /><Chip tone={i.status === 'IN_PROGRESS' ? 'navy' : 'amber'}>{i.status === 'IN_PROGRESS' ? 'In progress' : 'Received'}</Chip></Inner>)}
      {mine.length > open.length && <Why>{mine.length - open.length} resolved; they stay here for 2 years.</Why>}
    </Card>
  );
}

function UnitDetails({ units, snap }: { units: UnitSummary[]; snap: MeSnapshot }) {
  const navigate = useNavigate();
  const members = useAuthStore(s => s.buildingMembers);
  return (
    <Card aria-label="Unit details" className="gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Unit details</SectionLabel><button type="button" className="text-xs font-semibold text-ux2-ink underline" onClick={() => navigate('/building?tab=directory')}>In the building directory</button></div>
      {units.map(u => {
        const residents = [u.unit.owner === snap.viewer.name ? `${u.unit.owner} · owner-occupant` : u.unit.owner, ...members.filter(m => m.unit === u.unit.number && m.name !== u.unit.owner).map(m => m.name)].filter(Boolean);
        return (
          <Inner key={u.unit.number} className="py-1">
            {units.length > 1 && <div className="pb-1 text-xs font-semibold text-ux2-muted">Unit {u.unit.number}</div>}
            <KV label="Floor">{floorOf(u.unit.number)}</KV>
            <KV label="Size">{u.unit.sqft ? `${u.unit.sqft.toLocaleString()} sq ft` : '—'}</KV>
            <KV label="Bedrooms">{u.unit.bedrooms || '—'}</KV>
            <KV label="Parking">{u.unit.parking || 'None'}</KV>
            <KV label="Voting percent">{u.unit.votingPct}%</KV>
            <KV label="Monthly dues">{fmt(u.unit.monthlyFee)}</KV>
            <KV label="Residents">{residents.join(', ') || '—'}</KV>
          </Inner>
        );
      })}
      <div><Button size="sm" variant="ghost" onClick={() => navigate('/building?tab=directory')}>Add a resident</Button></div>
      <Why>Floor, size and voting percent come from the CC&Rs and only the board can change them. Ask from Help & Support if something is wrong.</Why>
    </Card>
  );
}

function Responsibilities({ units, snap }: { units: UnitSummary[]; snap: MeSnapshot }) {
  const navigate = useNavigate();
  const docs = useFinancialStore(s => s.unitDocuments);
  const issues = useIssuesStore(s => s.issues);
  const numbers = units.map(u => u.unit.number);
  const owed = units.reduce((t, u) => t + u.owed, 0);
  const ins = docs.find(d => numbers.includes(d.unitNumber) && /insur|ho-?6/i.test(`${d.docType} ${d.filename}`));
  const pets = docs.filter(d => numbers.includes(d.unitNumber) && /pet|vehicle|parking/i.test(`${d.docType} ${d.filename}`)).length;
  const open = issues.filter(i => i.unitNumber && numbers.includes(i.unitNumber) && i.status !== 'RESOLVED' && i.status !== 'CLOSED');
  const violations = open.filter(i => /violation|rule/i.test(`${i.category} ${i.title}`)).length;
  const hazards = open.filter(i => /leak|water|hazard|fire|smoke/i.test(`${i.category} ${i.title}`)).length;
  const auto = units.length > 0 && units.every(autopayOn);
  const rows = [
    ['Pay assessments by the ' + nth(snap.hoaDueDay), owed > 0 ? `${fmt(owed)} open` : auto ? 'Current · autopay' : 'Current', owed > 0 ? 'red' : 'sage'],
    ['Keep HO-6 insurance on file', ins ? `On file · uploaded ${dayLabel(ins.createdAt.slice(0, 10))}` : 'Upload the certificate below', ins ? 'sage' : 'amber'],
    ['Follow the rules and policies', violations ? `${violations} open` : 'No open violations', violations ? 'red' : 'sage'],
    ['Give 48 hours access for repairs', 'None scheduled', 'ghost'],
    ['Register pets and vehicles', pets ? `${pets} registered` : 'Nothing registered', pets ? 'sage' : 'ghost'],
    ['Report leaks and hazards the day they happen', hazards ? `${hazards} reported` : 'Nothing reported', hazards ? 'amber' : 'sage'],
  ] as const;
  return (
    <Card aria-label="Owner responsibilities" className="gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Owner responsibilities</SectionLabel><button type="button" className="text-xs font-semibold text-ux2-ink underline" onClick={() => navigate('/building?tab=documents')}>Rules and policies</button></div>
      {rows.map(([t, v, tone]) => <Inner key={t} className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm font-semibold text-ux2-ink">{t}</span><Chip tone={tone}>{v}</Chip></Inner>)}
      <Why>These come from the CC&Rs and the policies. Each one feeds your Timeliness or Compliance score. DC Code § 42-1903.13 for unpaid assessments.</Why>
    </Card>
  );
}

export default function UnitsTab({ snap }: { snap: MeSnapshot }) {
  const navigate = useNavigate();
  const units = useMemo(() => unitSummaries(snap), [snap]);
  const rows = useMemo(() => receiptRows(snap), [snap]);
  const packet = resalePacket(snap.legalDocuments);
  const [pick, setPick] = useState<string>('all');
  const [year, setYear] = useState<string>(snap.today.slice(0, 4));
  const [linking, setLinking] = useState(false);
  const years = useMemo(() => Array.from(new Set(rows.map(r => r.year))).sort().reverse(), [rows]);
  const shown = pick === 'all' ? units : units.filter(u => u.unit.number === pick);
  const list = rows.filter(r => (pick === 'all' || r.unit === pick) && (year === 'all' || r.year === year));
  const owed = shown.reduce((t, u) => t + u.owed, 0);
  const monthly = shown.reduce((t, u) => t + u.unit.monthlyFee, 0);
  const onTime = shown.reduce((t, u) => t + u.paidThisYear.onTime, 0);
  const months = shown.reduce((t, u) => t + u.paidThisYear.months, 0);
  const paid = shown.reduce((t, u) => t + u.paidThisYear.amount, 0);
  const allAutopay = shown.length > 0 && shown.every(autopayOn);
  const dueDay = snap.hoaDueDay;

  if (units.length === 0) {
    return (
      <Card aria-label="No unit" className="gap-3">
        <SectionLabel>No unit linked</SectionLabel>
        <Why>Link the unit you own or live in. A linked unit gives you its ledger, its documents and its vote.</Why>
        {linking ? <LinkUnit onClose={() => setLinking(false)} /> : <Button size="sm" className="self-start" onClick={() => setLinking(true)}>Link a unit</Button>}
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {units.length > 1 && <PillTabs size="filter" aria-label="Your units" value={pick} onChange={setPick} tabs={[{ id: 'all', label: 'Both' }, ...units.map(u => ({ id: u.unit.number, label: u.unit.number, badge: u.owed > 0 ? fmt(u.owed) : undefined, badgeTone: 'red' as const }))]} />}
      <TileRow>
        <Tile tone="navy" label={`Balance${units.length > 1 && pick === 'all' ? ' · both units' : ''}`} meta={<Chip tone="white" className="!bg-white !text-ux2-navy">{owed > 0 ? 'Open' : 'Current'}</Chip>} value={fmt(owed)} unit={owed > 0 ? `owed${shown.find(u => u.owed > 0)?.openInvoices[0] ? ` · ${shown.find(u => u.owed > 0)!.unit.number} ${shown.find(u => u.owed > 0)!.openInvoices[0].description.toLowerCase()}` : ''}` : 'owed'}>
          <div>
            {shown.map(u => <KV dark key={u.unit.number} label={`${u.unit.number} · monthly ${fmt(u.unit.monthlyFee)}`}>{u.owed > 0 ? `${fmt(u.owed)} open${u.openInvoices[0] ? ` · due ${dayLabel(u.openInvoices[0].dueDate)}` : ''}` : '$0 · nothing owed'}</KV>)}
            <KV dark label="Past due, fees, special assessments">{fmt(shown.reduce((t, u) => t + u.fees + u.assessments, 0))}</KV>
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 rounded-xl bg-white/[0.1] px-3 py-2 text-[13px]"><span className="min-w-0 truncate"><b className="font-semibold">Pay</b> · {owed > 0 ? 'the open amount' : 'pay ahead on either unit'}</span><button type="button" onClick={() => navigate('/my-unit/pay')} className="inline-flex h-8 shrink-0 items-center rounded-full bg-white px-3 text-[11px] font-semibold text-ux2-navy">Pay now</button></div>
        </Tile>
        <Tile tone="grey" label={`Autopay${units.length > 1 && pick === 'all' ? ' · both units' : ''}`} meta={<Chip tone={allAutopay ? 'sage' : 'ghost'}>{allAutopay ? 'On' : shown.some(autopayOn) ? 'Partly on' : 'Off'}</Chip>} value={fmt(monthly)} unit={`on the ${dueDay}${['th', 'st', 'nd', 'rd'][(dueDay % 100 - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][dueDay % 100] ?? 'th'}`}>
          <div>
            {shown.map(u => <KV key={u.unit.number} label={u.unit.number}>{autopayOn(u) ? methodLabel(lastPay(u)?.method) : 'Off · pay by hand'}</KV>)}
            <KV label={`This year${shown.length > 1 ? ', both units' : ''}`}>{fmt(paid)} · {onTime} of {months} on time</KV>
          </div>
          <div className="flex flex-wrap gap-1.5"><Button size="sm" variant="ghost" onClick={() => navigate('/my-unit/pay')}>Add a payment method</Button><Button size="sm" variant="ghost" onClick={() => navigate('/my-unit/pay')}>{allAutopay ? 'Change autopay' : 'Set up autopay'}</Button></div>
          <div className="mt-auto flex items-center justify-between gap-2 rounded-xl border border-ux2-line bg-white px-3 py-2 text-[13px]"><span className="min-w-0 truncate"><b className="font-semibold">Make a payment</b> · {owed > 0 ? `${fmt(owed)} open, or pay ahead` : 'pay ahead'}</span><button type="button" onClick={() => navigate('/my-unit/pay')} className="inline-flex h-8 shrink-0 items-center rounded-full border border-ux2-line-strong bg-white px-3 text-[11px] font-semibold text-ux2-ink">Pay</button></div>
        </Tile>
        <Tile tone="grey" label="Resale ready" meta={<span className="normal-case tracking-normal">{units.length > 1 ? 'either unit' : ''}</span>} value={packet.ready} unit={`of ${packet.total} ready · same packet, one certificate each`}>
          <div>
            {packet.items.map(i => <KV key={i.label} label={i.label}><Chip tone={i.label === 'Unit certificate' ? 'navy' : i.present ? 'sage' : 'red'}>{i.label === 'Unit certificate' ? 'Issued on request' : i.present ? 'On file' : 'Missing'}</Chip></KV>)}
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 rounded-xl border border-ux2-line bg-white px-3 py-2 text-[13px]"><span className="min-w-0 truncate"><b className="font-semibold">Start a resale request</b>{units.length > 1 ? ' · pick the unit' : ''}</span><button type="button" onClick={() => navigate('/community?tab=requests')} className="inline-flex h-8 shrink-0 items-center rounded-full border border-ux2-line-strong bg-white px-3 text-[11px] font-semibold text-ux2-ink">Submit</button></div>
        </Tile>
      </TileRow>

      <div className={`grid grid-cols-1 gap-4 ${shown.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {shown.map(u => <UnitCard key={u.unit.number} u={u} snap={snap} packetReady={packet.ready} packetTotal={packet.total} />)}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <DuesThisYear units={shown} snap={snap} />
      <Card aria-label="Statements and receipts" className="gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionLabel>Statements and receipts{units.length > 1 && pick === 'all' ? ' · both units' : ''}</SectionLabel>
              <PillTabs size="filter" surface="white" aria-label="Receipt years" value={year} onChange={setYear} tabs={[...years.map(y => ({ id: y, label: y })), { id: 'all', label: 'All' }]} />
            </div>
            {list.length === 0 ? <Inner className="text-sm text-ux2-muted">Nothing for this period.</Inner> : (
              <Table minWidth={700}>
                <thead><tr><Th>Month</Th>{units.length > 1 && <Th>Unit</Th>}<Th num>Amount</Th><Th>Status</Th><Th>Method</Th><Th aria-label="Receipt" /></tr></thead>
                <tbody>
                  {list.slice(0, 12).map(r => (
                    <tr key={r.id} data-receipt={r.id}>
                      <Td><Cell title={new Date(r.date + 'T00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} note={r.label} /></Td>
                      {units.length > 1 && <Td className="font-semibold">{r.unit}</Td>}
                      <Td num className="font-semibold">{fmt(r.amount)}</Td>
                      <Td><Chip tone={r.status === 'paid' ? 'sage' : r.status === 'overdue' ? 'red' : 'navy'}>{r.status === 'paid' ? `Paid ${dayLabel(r.date)}` : r.status === 'overdue' ? 'Overdue' : `Due ${dayLabel(r.date)}`}</Chip></Td>
                      <Td className="text-ux2-muted">{methodLabel(r.method)}</Td>
                      <Td num><Button size="sm" variant="ghost" onClick={() => window.print()}>Receipt</Button></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">{list.length > 12 && <Chip tone="ghost">{list.length - 12} more this period</Chip>}<Why>Each unit keeps its own ledger and annual statement{units.length > 1 ? '; a rented unit\'s statement is also addressed to the tenant for the amounts the lease passes through' : ''}.</Why></div>
          </Card>
          <UnitDetails units={shown} snap={snap} />
        </div>
        <div className="flex flex-col gap-4">
          <UnitDocuments units={shown} snap={snap} />
          <MoveHistory units={shown} snap={snap} />
          <UnitRequests units={shown} />
          <Responsibilities units={shown} snap={snap} />
        </div>
      </div>

      <Card aria-label="Link a unit" className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Link a unit you own</SectionLabel>{!linking && <Button size="sm" variant="ghost" onClick={() => setLinking(true)}>Link a unit</Button>}</div>
        {linking ? <LinkUnit onClose={() => setLinking(false)} /> : <Why>Enter the unit; the board checks the deed on record and the unit joins this sign-in. Votes stay one per unit.</Why>}
      </Card>
    </div>
  );
}
