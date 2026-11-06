import { useMemo } from 'react';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { fmt } from '@/lib/formatters';
import { Card, Chip, Inner, SectionLabel, Tile, TileRow } from '../../components';
import { dayLabel } from '../../home/calendar';
import { daysBetween } from '../../runbook/model';
import { ISO_DATE } from '../../runbook/adapters';
import { bills, budgetSummary, collected, doneForYou, monthsOfCash, reserveSummary, type FundsSnapshot } from '../metrics';
import type { FundsTab } from '../FundsPage';

function Action({ label, button, dark, onClick }: { label: string; button: string; dark?: boolean; onClick: () => void }) {
  return (
    <>
      <span className="min-w-0 truncate">{label}</span>
      <button type="button" onClick={onClick} className={`inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-xs font-semibold ${dark ? 'border border-white/40 text-white hover:bg-white/10' : 'border border-ux2-line-strong bg-white text-ux2-ink hover:bg-ux2-surface'}`}>
        {button}
      </button>
    </>
  );
}

export interface YearItem {
  date: string;
  title: string;
  detail: string;
  tag: 'Automatic' | 'Needs the vote' | 'Runbook' | 'Renewal';
}

/** The next twelve months of money events, from filings, insurance and the budget meeting. */
export function nextTwelveMonths(input: {
  today: string;
  filings: { name: string; dueDate: string; status: string; category: string; responsible: string }[];
  insurance: { type: string; expires: string; carrier: string; premium: string }[];
  meetings: { title: string; date: string; status: string; agenda: string[] }[];
  duesStartYear: number;
}): YearItem[] {
  const out: YearItem[] = [];
  const within = (d: string) => ISO_DATE.test(d) && daysBetween(input.today, d) >= 0 && daysBetween(input.today, d) <= 365;
  for (const f of input.filings) {
    if (f.status !== 'pending' || !within(f.dueDate)) continue;
    if (!/tax|financ|1099|1120|audit|statement|report/i.test(`${f.category} ${f.name}`)) continue;
    out.push({ date: f.dueDate, title: f.name, detail: `${f.responsible}`, tag: 'Runbook' });
  }
  for (const p of input.insurance) {
    if (!within(p.expires)) continue;
    out.push({ date: p.expires, title: `${p.type} renewal`, detail: `${p.carrier}${p.premium ? ` · ${p.premium}` : ''}`, tag: 'Renewal' });
  }
  for (const m of input.meetings) {
    if ((m.status !== 'SCHEDULED' && m.status !== 'RESCHEDULED') || !within(m.date)) continue;
    if (!m.agenda.some(a => /budget|dues|assessment/i.test(a))) continue;
    out.push({ date: m.date, title: `${m.title} · budget on the agenda`, detail: m.agenda.find(a => /budget|dues|assessment/i.test(a)) ?? '', tag: 'Needs the vote' });
  }
  const jan = `${input.duesStartYear}-01-01`;
  if (within(jan)) out.push({ date: jan, title: `${input.duesStartYear} dues start`, detail: 'Owners are notified 30 days before', tag: 'Automatic' });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export default function OverviewTab({ snap, onGo }: { snap: FundsSnapshot; onGo: (tab: FundsTab, section?: string) => void }) {
  const col = collected(snap);
  const bl = bills(snap);
  const bud = budgetSummary(snap);
  const res = reserveSummary(snap);
  const cash = monthsOfCash(snap);
  const done = doneForYou(snap);

  const filings = useComplianceStore(s => s.filings);
  const insurance = useBuildingStore(s => s.insurance);
  const meetings = useMeetingsStore(s => s.meetings);
  const year = useMemo(() => nextTwelveMonths({
    today: snap.today,
    filings,
    insurance,
    meetings,
    duesStartYear: Number(snap.today.slice(0, 4)) + 1,
  }), [snap.today, filings, insurance, meetings]);

  return (
    <div className="flex flex-col gap-5">
      <TileRow>
        <Tile
          tone={col.behindUnits > 0 ? 'navy' : 'teal'}
          label="This month"
          meta={<button type="button" onClick={() => onGo('income')} className="underline-offset-2 hover:underline">Income ›</button>}
          value={cash.months}
          unit="months of expenses in cash"
          sub={`${fmt(snap.operatingCash)} operating · ${fmt(cash.monthlyOut)} a month out`}
        >
          <div className="mt-1 text-sm">
            <b className="font-semibold">{col.paidUnits} of {col.units} paid</b>
            <div className="text-xs opacity-80">{col.outstanding > 0 ? `${fmt(col.outstanding)} outstanding across ${col.behindUnits} unit${col.behindUnits === 1 ? '' : 's'}` : 'Nothing outstanding'}</div>
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 rounded-xl bg-white/[0.1] px-3 py-2 text-[13px]">
            {bl.toApprove.length > 0 ? <Action label={`${bl.toApprove.length} bills · ${fmt(bl.amount)} waiting`} button="Approve" dark onClick={() => onGo('expenses', 'bills')} /> : <Action label="No bills waiting" button="Expenses" dark onClick={() => onGo('expenses')} />}
          </div>
        </Tile>
        <Tile
          tone={bud.over.length > 0 ? 'red' : 'grey'}
          label="This year"
          meta={<button type="button" onClick={() => onGo('planning')} className="underline-offset-2 hover:underline">Planning ›</button>}
          value={bud.pct}
          unit="% of budget used"
          sub={`${bud.expectedPct}% expected by now · ${fmt(bud.spent)} of ${fmt(bud.total)}`}
          action={bud.over.length > 0
            ? <Action label={`${bud.over[0].name} · over by ${fmt(bud.over[0].overBy)}`} button="Review" dark onClick={() => onGo('planning', 'budget')} />
            : <Action label={`${bud.onTrack} of ${bud.lines} lines on track`} button="Budget" onClick={() => onGo('planning', 'budget')} />}
        />
        <Tile
          tone={res.pct < 50 ? 'red' : 'grey'}
          label="Ahead"
          meta={<button type="button" onClick={() => onGo('planning', 'reserves')} className="underline-offset-2 hover:underline">Reserve plan ›</button>}
          value={res.pct}
          unit="% funded"
          sub={res.next ? `${res.next.name} ${res.next.year} · ${fmt(res.next.cost)} · ${fmt(res.funded)} of ${fmt(res.needed)} set aside` : `${fmt(res.funded)} of ${fmt(res.needed)} set aside`}
          action={<Action label={res.monthly > 0 ? `${fmt(res.monthly)} a month · ${res.onSchedule ? 'on schedule' : `${fmt(res.recommendedMonthly)} recommended`}` : 'No monthly contribution set'} button="Lever" dark={res.pct < 50} onClick={() => onGo('planning', 'reserves')} />}
        />
      </TileRow>

      <Card aria-label="Done for you">
        <div className="flex items-center justify-between">
          <SectionLabel>Done for you this month</SectionLabel>
          <button type="button" onClick={() => onGo('settings', 'rules')} className="text-xs font-semibold text-ux2-teal hover:underline">Rules</button>
        </div>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 sm:flex-row sm:flex-wrap sm:gap-2">
          {done.map(d => (
            <li key={d.label}>
              <Chip tone={d.on ? 'sage' : 'ghost'}>{d.on ? '✓ ' : ''}{d.label} · {d.detail}</Chip>
            </li>
          ))}
        </ul>
      </Card>

      <Card aria-label="The next twelve months">
        <SectionLabel>The next twelve months</SectionLabel>
        {year.length === 0 ? (
          <p className="text-sm text-ux2-muted">Nothing dated for money in the next year.</p>
        ) : (
          <ul className="m-0 list-none divide-y divide-ux2-line p-0">
            {year.map((y, i) => (
              <li key={i} className="flex items-start gap-3 py-2.5 text-sm">
                <span className="w-14 shrink-0 font-semibold text-ux2-ink">{dayLabel(y.date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="text-ux2-ink">{y.title}</span>
                  {y.detail && <span className="text-ux2-muted"> · {y.detail}</span>}
                </span>
                <Chip tone={y.tag === 'Needs the vote' ? 'plum' : y.tag === 'Renewal' ? 'amber' : 'ghost'}>{y.tag}</Chip>
              </li>
            ))}
          </ul>
        )}
        <Inner className="text-xs text-ux2-muted">Each of these has a runbook behind it. The steps arrive as Home cards when they are due.</Inner>
      </Card>
    </div>
  );
}
