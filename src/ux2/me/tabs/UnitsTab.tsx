import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MyUnitPage from '@/features/unit-manager/MyUnitPage';
import { fmt } from '@/lib/formatters';
import { Button, Card, Chip, Inner, PillTabs, SectionLabel, Tile, TileRow } from '../../components';
import { dayLabel } from '../../home/calendar';
import { receiptRows, resalePacket, unitSummaries, type MeSnapshot, type UnitSummary } from '../metrics';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function Resale({ snap, units }: { snap: MeSnapshot; units: UnitSummary[] }) {
  const navigate = useNavigate();
  const packet = resalePacket(snap.legalDocuments);
  return (
    <Card tone="teal" aria-label="Resale ready">
      <div className="flex items-center justify-between">
        <SectionLabel className="text-white/[0.66]">Resale ready{units.length > 1 ? ' · either unit' : ''}</SectionLabel>
        <Chip tone="cyan">{packet.ready} of {packet.total} ready</Chip>
      </div>
      <ul className="m-0 list-none p-0 text-sm">
        {packet.items.map(i => <li key={i.label} className="flex justify-between py-0.5"><span className="text-white/[0.9]">{i.label}</span><span className={`text-xs ${i.present ? 'text-white/[0.8]' : 'font-semibold text-white'}`}>{i.detail}</span></li>)}
      </ul>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-sm text-white/[0.9]">Start a resale request{units.length > 1 ? ' · pick the unit' : ''}</span>
        <Button size="sm" variant="ghost" onClick={() => navigate('/community?tab=requests')}>Submit</Button>
      </div>
      <Inner className="border-white/20 bg-white/10 text-xs text-white/[0.8]">The packet is the building's documents plus a unit certificate showing the unit's standing, issued on request. A request to the board starts the resale runbook with its 10-business-day clock.</Inner>
    </Card>
  );
}

function UnitCard({ u, snap, one }: { u: UnitSummary; snap: MeSnapshot; one: boolean }) {
  const navigate = useNavigate();
  const year = snap.today.slice(0, 4);
  const paidMonths = new Set(u.unit.payments.filter(p => p.date.startsWith(year)).map(p => Number(p.date.slice(5, 7))));
  const thisMonth = Number(snap.today.slice(5, 7));
  return (
    <Card aria-label={`Unit ${u.unit.number}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <SectionLabel>Unit {u.unit.number}</SectionLabel>
          <div className="text-sm text-ux2-muted">{u.unit.owner}{u.movedIn ? ` · since ${dayLabel(u.movedIn)}` : ''}{u.unit.sqft ? ` · ${u.unit.sqft.toLocaleString()} sq ft` : ''}{u.unit.bedrooms ? ` · ${u.unit.bedrooms} bed` : ''}{u.unit.parking ? ` · ${u.unit.parking}` : ''}{u.unit.votingPct ? ` · ${u.unit.votingPct}% vote` : ''}</div>
        </div>
        {!one && <Chip tone={u.owed > 0 ? 'red' : 'sage'}>{u.owed > 0 ? `${fmt(u.owed)} owed` : 'Nothing owed'}</Chip>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Inner><div className="text-xs text-ux2-muted">Monthly assessment</div><div className="text-lg font-semibold text-ux2-ink">{fmt(u.unit.monthlyFee)}</div><div className="text-xs text-ux2-dim">next {dayLabel(u.nextDue)}</div></Inner>
        <Inner><div className="text-xs text-ux2-muted">Open now</div><div className="text-lg font-semibold text-ux2-ink">{fmt(u.owed)}</div><div className="text-xs text-ux2-dim">{u.openInvoices[0] ? `${u.openInvoices[0].description} · due ${dayLabel(u.openInvoices[0].dueDate)}` : u.fees ? `${fmt(u.fees)} late fees` : 'nothing owed'}</div></Inner>
        <Inner><div className="text-xs text-ux2-muted">Special assessments</div><div className="text-lg font-semibold text-ux2-ink">{fmt(u.assessments)}</div><div className="text-xs text-ux2-dim">{u.assessments ? 'open on this unit' : 'none open'}</div></Inner>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-ux2-muted"><span>Dues this year · {fmt(u.paidThisYear.amount)} paid · {u.paidThisYear.onTime} of {u.paidThisYear.months} on time</span><span>{year}</span></div>
        <div className="flex gap-1">
          {MONTHS.map((m, i) => {
            const n = i + 1;
            const state = paidMonths.has(n) ? 'paid' : n < thisMonth ? 'missed' : n === thisMonth ? 'now' : 'ahead';
            return <span key={i} title={`${m} ${year}`} className={`grid h-7 flex-1 place-items-center rounded-md text-[11px] font-semibold ${state === 'paid' ? 'bg-ux2-teal text-white' : state === 'missed' ? 'bg-ux2-red-tint text-ux2-red-ink' : state === 'now' ? 'border border-ux2-navy text-ux2-navy' : 'bg-ux2-surface text-ux2-dim'}`}>{m}</span>;
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => navigate('/my-unit/pay')}>{u.owed > 0 ? `Pay ${fmt(u.owed)}` : 'Pay ahead'}</Button>
      </div>
    </Card>
  );
}

export default function UnitsTab({ snap }: { snap: MeSnapshot }) {
  const units = useMemo(() => unitSummaries(snap), [snap]);
  const rows = useMemo(() => receiptRows(snap), [snap]);
  const [pick, setPick] = useState<string>('all');
  const [year, setYear] = useState<string>(snap.today.slice(0, 4));
  const years = useMemo(() => Array.from(new Set(rows.map(r => r.year))).sort().reverse(), [rows]);
  const shown = pick === 'all' ? units : units.filter(u => u.unit.number === pick);
  const list = rows.filter(r => (pick === 'all' || r.unit === pick) && (year === 'all' || r.year === year));
  const owed = shown.reduce((t, u) => t + u.owed, 0);
  const monthly = shown.reduce((t, u) => t + u.unit.monthlyFee, 0);
  const onTime = shown.reduce((t, u) => t + u.paidThisYear.onTime, 0);
  const months = shown.reduce((t, u) => t + u.paidThisYear.months, 0);

  if (units.length === 0) {
    return (
      <Card aria-label="No unit">
        <SectionLabel>No unit linked</SectionLabel>
        <p className="text-sm text-ux2-muted">Link the unit you own or live in below. A linked unit gives you its ledger, its documents and its vote.</p>
        <div className="ux2-legacy"><MyUnitPage embedded /></div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {units.length > 1 && (
        <PillTabs size="filter" aria-label="Your units" value={pick} onChange={setPick} tabs={[{ id: 'all', label: 'Both' }, ...units.map(u => ({ id: u.unit.number, label: u.unit.number, badge: u.owed > 0 ? fmt(u.owed) : undefined, badgeTone: 'red' as const }))]} />
      )}
      <TileRow>
        <Tile tone={owed > 0 ? 'navy' : 'teal'} label={`Balance${units.length > 1 && pick === 'all' ? ' · both units' : ''}`} meta={owed > 0 ? 'Open' : 'Current'} value={fmt(owed)} sub={owed > 0 ? shown.filter(u => u.owed > 0).map(u => `${u.unit.number} · ${fmt(u.owed)}${u.openInvoices[0] ? ` · ${u.openInvoices[0].description}` : ''}`).join(' · ') : `nothing owed · next ${fmt(monthly)} due ${dayLabel(shown[0].nextDue)}`} className="min-h-[170px]" />
        <Tile tone="grey" label="This year" value={`${onTime} of ${months}`} unit="on time" sub={`${fmt(shown.reduce((t, u) => t + u.paidThisYear.amount, 0))} paid · ${fmt(monthly)} a month${months > 0 && onTime === months ? ' · on time every month' : ''}`} className="min-h-[170px]" />
        <Tile tone="grey" label="Statements and receipts" value={rows.filter(r => pick === 'all' || r.unit === pick).length} sub="Each receipt holds the month's statement; download from the list below" className="min-h-[170px]" />
      </TileRow>

      <div className={`grid gap-5 ${units.length > 1 ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
        <div className={`flex flex-col gap-5 ${units.length > 1 ? '' : 'lg:col-span-2'}`}>
          {shown.map(u => <UnitCard key={u.unit.number} u={u} snap={snap} one={units.length === 1} />)}
        </div>
        <Resale snap={snap} units={units} />
      </div>

      <Card aria-label="Statements and receipts">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Statements and receipts{units.length > 1 && pick === 'all' ? ' · both units' : ''}</SectionLabel>
          <div className="flex gap-1.5">
            {years.map(y => <button key={y} type="button" onClick={() => setYear(y)} className="rounded-full"><Chip tone={year === y ? 'navy' : 'ghost'}>{y}</Chip></button>)}
            <button type="button" onClick={() => setYear('all')} className="rounded-full"><Chip tone={year === 'all' ? 'navy' : 'ghost'}>All</Chip></button>
          </div>
        </div>
        {list.length === 0 ? <p className="text-sm text-ux2-muted">Nothing for this period.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.06em] text-ux2-muted">
                  <th className="py-2 pr-3 font-semibold">When</th>{units.length > 1 && <th className="py-2 pr-3 font-semibold">Unit</th>}<th className="py-2 pr-3 font-semibold">For</th><th className="py-2 pr-3 text-right font-semibold">Amount</th><th className="hidden py-2 pr-3 font-semibold md:table-cell">Method</th><th className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 60).map(r => (
                  <tr key={r.id} data-receipt={r.id} className="border-t border-ux2-line">
                    <td className="py-2 pr-3 whitespace-nowrap text-ux2-muted">{dayLabel(r.date)}</td>
                    {units.length > 1 && <td className="py-2 pr-3 font-semibold text-ux2-ink">{r.unit}</td>}
                    <td className="py-2 pr-3 text-ux2-ink">{r.label}</td>
                    <td className="py-2 pr-3 text-right font-semibold text-ux2-ink">{fmt(r.amount)}</td>
                    <td className="hidden py-2 pr-3 text-ux2-muted md:table-cell">{r.method}</td>
                    <td className="py-2"><Chip tone={r.status === 'paid' ? 'sage' : r.status === 'overdue' ? 'red' : 'navy'}>{r.status === 'paid' ? 'Paid' : r.status === 'overdue' ? 'Overdue' : 'Open'}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length > 60 && <div className="pt-2 text-xs text-ux2-dim">{list.length - 60} more</div>}
          </div>
        )}
      </Card>

      <Card aria-label="Documents, moves and linked units">
        <SectionLabel>Balance and payments, documents, move history, link a unit</SectionLabel>
        <div className="ux2-legacy"><MyUnitPage embedded /></div>
      </Card>
    </div>
  );
}
