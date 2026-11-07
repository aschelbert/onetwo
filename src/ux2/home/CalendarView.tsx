/**
 * Calendar — the merged, month-by-month view of everything dated, from the
 * design's Calendar board: a carousel of month columns (three across on a
 * desktop, one on a phone) flipped with the arrows, filters above, a legend,
 * each day's items with a dot for the kind, a chip for who sees it, and a
 * dark outline on what is yours. Home shows it full width behind the
 * Feed | Calendar toggle; Community shows the same list for owners. Reads
 * each module's store directly and hands the dates to `buildAgenda`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAmenitiesStore } from '@/store/useAmenitiesStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useElectionStore } from '@/store/useElectionStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { cn } from '@/lib/formatters';
import { Button, Chip, PillTabs, SectionLabel } from '../components';
import { useViewer } from '../runbook/adapters';
import type { RunbookCard } from '../runbook/model';
import { buildAgenda, filterAgenda, groupAgenda, FILTERS, KIND_META, type AgendaFilter, type AgendaItem, type AgendaMonth } from './agenda';
import { monthLabel } from './calendar';

const GAP = 12;

const DOT: Record<AgendaItem['kind'], string> = {
  meeting: 'bg-ux2-navy', vote: 'bg-ux2-plum', deadline: 'bg-ux2-teal', vendor: 'bg-ux2-amber', amenity: 'bg-ux2-sage', dues: 'bg-ux2-teal', move: 'bg-ux2-dim',
};

function useVisibleColumns(ref: React.RefObject<HTMLDivElement | null>): { width: number; visible: number } {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return { width, visible: width >= 980 ? 3 : width >= 620 ? 2 : 1 };
}

function MonthColumn({ month, forOwner, onOpen, next, style }: { month: AgendaMonth; forOwner: boolean; onOpen: (path: string) => void; next?: AgendaItem; style: React.CSSProperties }) {
  return (
    <section aria-label={month.label} data-month={month.key} style={style} className="flex shrink-0 flex-col gap-2 rounded-[22px] border border-ux2-line bg-ux2-surface px-4 py-4">
      <h2 className="m-0 flex items-baseline justify-between font-display text-[19px] font-semibold text-ux2-ink">
        {month.label}
        <span className="text-xs font-normal text-ux2-muted">{month.count} item{month.count === 1 ? '' : 's'}</span>
      </h2>
      {month.days.length === 0 && <div className="rounded-[14px] border border-ux2-line bg-white px-3 py-3 text-sm text-ux2-muted">Nothing scheduled in {month.label}.</div>}
      {month.days.map(d => (
        <div key={d.date} data-day={d.date} className="flex flex-col gap-1.5">
          {d.items.length === 0 ? (
            <div className="flex items-start gap-2.5 rounded-[14px] border border-ux2-line bg-white px-3 py-2.5">
              <span className="w-9 shrink-0 text-center"><b className="grid h-6 w-6 place-items-center rounded-full bg-ux2-navy text-[12px] text-white">{d.day}</b><span className="text-[10px] text-ux2-muted">{d.weekday}</span></span>
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ux2-teal" />
              <span className="min-w-0"><span className="block text-sm font-semibold text-ux2-ink">Nothing scheduled today</span><span className="block text-xs text-ux2-muted">{next ? `Next: ${next.title.toLowerCase()} on ${monthLabel(next.date.slice(0, 7)).split(' ')[0]} ${Number(next.date.slice(8, 10))}` : 'Nothing dated ahead'}</span></span>
            </div>
          ) : d.items.map((it, idx) => (
            <button key={it.id} type="button" data-agenda={it.id} onClick={() => onOpen(it.path)} className={cn('flex w-full items-start gap-2.5 rounded-[14px] border bg-white px-3 py-2.5 text-left hover:bg-ux2-teal-tint', it.mine ? 'border-[1.5px] border-ux2-navy' : 'border-ux2-line')}>
              <span className="w-9 shrink-0 text-center">
                {idx === 0 && (d.isToday
                  ? <b className="grid h-6 w-6 place-items-center rounded-full bg-ux2-navy text-[12px] text-white">{d.day}</b>
                  : <b className="block text-[15px] leading-tight text-ux2-ink">{d.day}</b>)}
                {idx === 0 && <span className="block text-[10px] text-ux2-muted">{d.weekday}</span>}
              </span>
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', DOT[it.kind])} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ux2-ink">{it.title}{it.time ? <span className="font-normal text-ux2-muted"> · {it.time}</span> : null}</span>
                {it.detail && <span className="block text-xs text-ux2-muted">{it.detail}</span>}
              </span>
              <span className="shrink-0">
                {it.action
                  ? <Chip tone="navy">{it.action}</Chip>
                  : forOwner ? null : it.audience === 'board'
                    ? <span className="inline-flex rounded-full border-[1.5px] border-dashed border-ux2-dim px-[11px] py-[6px] text-xs font-semibold leading-none text-ux2-dim">Board</span>
                    : <Chip tone="sage">All</Chip>}
              </span>
            </button>
          ))}
        </div>
      ))}
    </section>
  );
}

export default function CalendarView({ cards, today, forOwner, months = 6 }: { cards: RunbookCard[]; today: string; forOwner: boolean; months?: number }) {
  const navigate = useNavigate();
  const viewer = useViewer();
  const meetings = useMeetingsStore(s => s.meetings);
  const elections = useElectionStore(s => s.elections);
  const filings = useComplianceStore(s => s.filings);
  const reservations = useAmenitiesStore(s => s.reservations);
  const units = useFinancialStore(s => s.units);
  const hoaDueDay = useFinancialStore(s => s.hoaDueDay);
  const lateFeeEnabled = useFinancialStore(s => s.lateFeeEnabled);
  const lateFeeGraceDays = useFinancialStore(s => s.lateFeeGraceDays);
  const lateFeeAmount = useFinancialStore(s => s.lateFeeAmount);
  const insurance = useBuildingStore(s => s.insurance);
  const maintenance = useBuildingStore(s => s.maintenanceSchedules);
  const [filter, setFilter] = useState<AgendaFilter>('all');
  const [i, setI] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const { width, visible } = useVisibleColumns(track);

  const items = useMemo(() => buildAgenda({
    today, months, viewer: { id: viewer.id, name: viewer.name, role: viewer.role, linkedUnits: viewer.linkedUnits },
    meetings, elections, filings, cards, reservations, units, insurance, maintenance, hoaDueDay,
    lateFee: { enabled: lateFeeEnabled, graceDays: lateFeeGraceDays, amount: lateFeeAmount },
  }), [today, months, viewer, meetings, elections, filings, cards, reservations, units, insurance, maintenance, hoaDueDay, lateFeeEnabled, lateFeeGraceDays, lateFeeAmount]);
  const shown = useMemo(() => filterAgenda(items, filter, forOwner), [items, filter, forOwner]);
  const mineCount = useMemo(() => filterAgenda(items, 'mine', forOwner).length, [items, forOwner]);
  const groups = useMemo(() => groupAgenda(shown, today, months), [shown, today, months]);
  const next = useMemo(() => shown.find(it => it.date > today), [shown, today]);

  const maxI = Math.max(0, groups.length - visible);
  const at = Math.min(i, maxI);
  const colWidth = width ? (width - GAP * (visible - 1)) / visible : 0;
  const first = groups[at]; const last = groups[Math.min(at + visible - 1, groups.length - 1)];
  const range = first === last ? first.label : `${first.label} – ${last.label}`;

  return (
    <div data-widget="calendar" aria-label="Calendar" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PillTabs size="filter" aria-label="Calendar filters" value={filter} onChange={setFilter} tabs={FILTERS.filter(f => !forOwner || f.id !== 'deadline').map(f => ({ id: f.id, label: f.label, badge: f.id === 'mine' ? mineCount || undefined : undefined }))} />
        {!forOwner && <Button onClick={() => navigate('/community?tab=meetings')}>Schedule a meeting</Button>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SectionLabel className="normal-case tracking-normal text-sm font-semibold text-ux2-ink">{range}</SectionLabel>
          <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-ux2-muted">
            {(Object.keys(KIND_META) as AgendaItem['kind'][]).filter(k => k !== 'move').map(k => <Chip key={k} tone={KIND_META[k].tone}>{KIND_META[k].label}</Chip>)}
            {!forOwner && <span className="inline-flex rounded-full border-[1.5px] border-dashed border-ux2-dim bg-white px-[11px] py-[6px] text-xs font-semibold leading-none text-ux2-dim">Board only</span>}
            <span>· dark outline = yours</span>
          </span>
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label="Earlier months" disabled={at === 0} onClick={() => setI(x => Math.max(0, x - 1))} className="grid h-11 w-11 place-items-center rounded-full border border-ux2-line bg-ux2-surface text-ux2-ink disabled:opacity-40">‹</button>
          <button type="button" aria-label="Later months" disabled={at >= maxI} onClick={() => setI(x => Math.min(maxI, x + 1))} className="grid h-11 w-11 place-items-center rounded-full border border-ux2-line bg-ux2-surface text-ux2-ink disabled:opacity-40">›</button>
        </div>
      </div>
      <div ref={track} className="-mx-1 overflow-hidden px-1">
        <div className="flex items-start transition-transform duration-300 ease-out" style={{ gap: GAP, transform: `translateX(${-at * (colWidth + GAP)}px)` }}>
          {groups.map(g => (
            <MonthColumn key={g.key} month={g} forOwner={forOwner} onOpen={navigate} next={g.key === today.slice(0, 7) ? next : undefined} style={{ width: colWidth || '100%' }} />
          ))}
        </div>
      </div>
      <p className="m-0 text-xs text-ux2-muted">Meetings, votes, filings and runbook steps, vendor visits, reservations, move-ins, insurance renewals and dues days, each from the module that owns it. Nothing is entered twice.</p>
    </div>
  );
}
