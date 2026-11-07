import { useMemo } from 'react';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { fmt, cn } from '@/lib/formatters';
import { Card, Chip, Inner, Tile, TileRow, Ring } from '../../components';
import { dayLabel } from '../../home/calendar';
import { daysBetween } from '../../runbook/model';
import { ISO_DATE } from '../../runbook/adapters';
import { bills, budgetSummary, collected, doneForYou, monthsOfCash, reserveSummary, type FundsSnapshot } from '../metrics';
import type { FundsTab } from '../FundsPage';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

/** The three small figures inside a tile (Collected · Card or bank · By check on the board). */
function MiniBoxes({ items, dark }: { items: { label: string; value: string }[]; dark?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(i => (
        <div key={i.label} className={cn('rounded-xl px-3 py-2', dark ? 'bg-white/[0.1]' : 'border border-ux2-line bg-white')}>
          <div className={cn('text-[11px]', dark ? 'text-white/[0.66]' : 'text-ux2-muted')}>{i.label}</div>
          <div className="text-[15px] font-semibold">{i.value}</div>
        </div>
      ))}
    </div>
  );
}

/** Twelve bars for the year's spend, the current month marked, months to come faint. */
function SpendBars({ byMonth, today, overThisMonth }: { byMonth: number[]; today: string; overThisMonth: boolean }) {
  const month = Number(today.slice(5, 7));
  const max = Math.max(1, ...byMonth);
  return (
    <div className="flex flex-col gap-1" aria-label="Spend by month">
      <div className="flex h-16 items-end gap-1">
        {byMonth.map((v, i) => {
          const m = i + 1;
          const future = m > month;
          const current = m === month;
          const h = future ? 55 : Math.max(8, Math.round((v / max) * 100));
          return <div key={i} className={cn('flex-1 rounded-[3px]', future ? 'bg-ux2-line' : current && overThisMonth ? 'bg-ux2-red' : 'bg-ux2-teal')} style={{ height: `${h}%` }} title={`${MONTHS[i]} · ${fmt(v)}`} />;
        })}
      </div>
      <div className="flex justify-between text-[10px] text-ux2-muted"><span>Jan</span><span className={overThisMonth ? 'font-semibold text-ux2-red-ink' : ''}>{MONTHS[month - 1]}</span><span>Dec</span></div>
    </div>
  );
}

/** The reserve timeline: now, then the next replacements by year. */
function ReserveTimeline({ items }: { items: { label: string; sub?: string; now?: boolean }[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative flex items-center">
        <div className="absolute left-1 right-1 top-1/2 h-px bg-ux2-line-strong" />
        <div className="relative flex w-full justify-between">
          {items.map((it, i) => <span key={i} className={cn('h-2 w-2 rounded-full ring-2 ring-white', it.now || i === 1 ? 'bg-ux2-navy' : 'bg-ux2-line-strong')} />)}
        </div>
      </div>
      <div className="flex justify-between gap-1 text-[10px] text-ux2-muted">
        {items.map((it, i) => <span key={i} className={cn('min-w-0 truncate', i === items.length - 1 ? 'text-right' : i === 0 ? '' : 'text-center')}>{it.label}{it.sub ? ` · ${it.sub}` : ''}</span>)}
      </div>
    </div>
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
  const thisYear = Number(snap.today.slice(0, 4));

  const filings = useComplianceStore(s => s.filings);
  const insurance = useBuildingStore(s => s.insurance);
  const meetings = useMeetingsStore(s => s.meetings);
  const year = useMemo(() => nextTwelveMonths({
    today: snap.today,
    filings,
    insurance,
    meetings,
    duesStartYear: thisYear + 1,
  }), [snap.today, filings, insurance, meetings, thisYear]);

  const upcomingReserves = useMemo(() => [...snap.reserves]
    .filter(r => !r.isContingency)
    .sort((a, b) => a.yearsRemaining - b.yearsRemaining)
    .slice(0, 3)
    .map(r => ({ label: r.name.split(' ')[0], sub: `${thisYear + Math.max(0, Math.round(r.yearsRemaining))}${r.estimatedCost ? ` · ${fmt(r.estimatedCost).replace(/,000$/, 'k')}` : ''}` })), [snap.reserves, thisYear]);

  const overNow = bud.over.length > 0;
  const paidPct = col.units ? Math.round((col.paidUnits / col.units) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <TileRow>
        <Tile
          tone="navy"
          label="This month"
          meta={<button type="button" onClick={() => onGo('income')} className="underline-offset-2 hover:underline">Income ›</button>}
          value={cash.months}
          unit="months of expenses in cash"
          sub={`${fmt(snap.operatingCash)} operating · ${fmt(cash.monthlyOut)} a month out`}
        >
          <div className="flex items-center gap-3 text-xs">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.15]"><div className="h-full rounded-full bg-ux2-cyan" style={{ width: `${paidPct}%` }} /></div>
            <b className="shrink-0 font-semibold text-white">{col.paidUnits} of {col.units} paid</b>
          </div>
          <div className="-mt-1 text-xs text-white/[0.66]">{col.outstanding > 0 ? `${fmt(col.outstanding)} outstanding across ${col.behindUnits} unit${col.behindUnits === 1 ? '' : 's'}` : 'Nothing outstanding'}</div>
          <MiniBoxes dark items={[{ label: 'Collected', value: fmt(col.amount) }, { label: 'Card or bank', value: `${col.online} unit${col.online === 1 ? '' : 's'}` }, { label: 'By check', value: `${col.check} unit${col.check === 1 ? '' : 's'}` }]} />
          <div className="mt-auto flex min-h-[44px] items-center justify-between gap-2 rounded-xl bg-white/[0.1] px-2.5 py-2 pl-3 text-[13px]">
            {bl.toApprove.length > 0
              ? <Action label={`${bl.toApprove.length} bill${bl.toApprove.length === 1 ? '' : 's'} · ${fmt(bl.amount)} waiting`} button="Approve" dark onClick={() => onGo('expenses', 'bills')} />
              : <Action label="No bills waiting" button="Expenses" dark onClick={() => onGo('expenses')} />}
          </div>
        </Tile>
        <Tile
          tone="grey"
          label="This year"
          meta={<button type="button" onClick={() => onGo('planning')} className="underline-offset-2 hover:underline">Planning ›</button>}
          value={`${bud.pct}%`}
          unit="of budget used"
          sub={`${bud.expectedPct}% expected by now · ${fmt(bud.spent)} of ${fmt(bud.total)}`}
          action={overNow
            ? <Action label={`${bud.over[0].name} · the one line over, by ${fmt(bud.over[0].overBy)}`} button="Review" onClick={() => onGo('planning', 'budget')} />
            : <Action label={`${bud.onTrack} of ${bud.lines} lines on track`} button="Budget" onClick={() => onGo('planning', 'budget')} />}
        >
          <SpendBars byMonth={snap.spendByMonth ?? Array(12).fill(0)} today={snap.today} overThisMonth={overNow} />
        </Tile>
        <Tile
          tone="grey"
          label="Ahead"
          meta={<button type="button" onClick={() => onGo('planning', 'reserves')} className="underline-offset-2 hover:underline">Reserve plan ›</button>}
          action={<Action label={res.next ? `${res.next.name} · ${fmt(res.next.cost)}${res.monthly > 0 ? ` · ${fmt(res.monthly)} a month` : ''}` : 'Set the monthly contribution'} button="Lever" onClick={() => onGo('planning', 'reserves')} />}
        >
          <div className="flex items-center gap-3">
            <Ring pct={res.pct} light />
            <div className="min-w-0">
              <div className="text-[40px] font-semibold leading-none tracking-[-0.04em]">{res.next ? res.next.year : `${res.pct}%`}<small className="ml-1.5 text-sm font-medium tracking-normal text-ux2-muted">{res.next ? 'next big repair' : 'funded'}</small></div>
              <div className="mt-1 text-xs text-ux2-muted">{fmt(res.funded)} of {fmt(res.needed)} funded{res.monthly > 0 ? ` · ${res.onSchedule ? 'on schedule' : `${fmt(res.recommendedMonthly)} a month recommended`}` : ' · no monthly contribution set'}</div>
            </div>
          </div>
          {upcomingReserves.length > 0 && <ReserveTimeline items={[{ label: `${thisYear} · now`, now: true }, ...upcomingReserves]} />}
        </Tile>
      </TileRow>

      <div className="flex flex-wrap items-center gap-2" aria-label="Done for you">
        <span className="text-sm font-semibold text-ux2-ink">Done for you this month</span>
        {done.map(d => (
          <Chip key={d.label} tone={d.on ? 'sage' : 'ghost'} className="max-w-full !whitespace-normal !leading-snug">{d.on ? '✓ ' : ''}{d.label} · {d.detail}</Chip>
        ))}
        <span className="ml-auto flex gap-3 text-xs font-semibold text-ux2-teal">
          <button type="button" onClick={() => onGo('statements')} className="hover:underline">Review</button>
          <button type="button" onClick={() => onGo('settings', 'rules')} className="hover:underline">Rules</button>
        </span>
      </div>

      <Card aria-label="The next twelve months">
        <h2 className="m-0 text-lg font-medium text-ux2-ink">The next twelve months</h2>
        {year.length === 0 ? (
          <p className="text-sm text-ux2-muted">Nothing dated for money in the next year.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
            {year.map((y, i) => (
              <Inner key={i} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <b className="font-semibold text-ux2-ink">{dayLabel(y.date)}</b>
                  <span className="text-ux2-ink"> · {y.title}</span>
                  {y.detail && <span className="text-ux2-muted"> · {y.detail}</span>}
                </span>
                <Chip tone={y.tag === 'Needs the vote' ? 'plum' : y.tag === 'Renewal' ? 'amber' : y.tag === 'Runbook' ? 'cyan' : 'ghost'}>{y.tag}</Chip>
              </Inner>
            ))}
          </div>
        )}
        <div className="text-xs text-ux2-muted">Each of these has a runbook behind it. The steps arrive as Home cards when they are due; nothing here needs you today.</div>
      </Card>
    </div>
  );
}
