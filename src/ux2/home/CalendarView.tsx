/**
 * Calendar — the merged, month-by-month view of everything dated, from the
 * design's Calendar board. Home shows it behind the Feed | Calendar toggle;
 * Community shows the same list for owners. Reads each module's store
 * directly and hands the dates to `buildAgenda`.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAmenitiesStore } from '@/store/useAmenitiesStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useElectionStore } from '@/store/useElectionStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { cn } from '@/lib/formatters';
import { Button, Card, Chip, Inner, PillTabs, SectionLabel } from '../components';
import { useViewer } from '../runbook/adapters';
import type { RunbookCard } from '../runbook/model';
import { buildAgenda, filterAgenda, groupAgenda, FILTERS, KIND_META, type AgendaFilter } from './agenda';

export default function CalendarView({ cards, today, forOwner, months = 4 }: { cards: RunbookCard[]; today: string; forOwner: boolean; months?: number }) {
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

  const items = useMemo(() => buildAgenda({
    today, months, viewer: { id: viewer.id, name: viewer.name, role: viewer.role, linkedUnits: viewer.linkedUnits },
    meetings, elections, filings, cards, reservations, units, insurance, maintenance, hoaDueDay,
    lateFee: { enabled: lateFeeEnabled, graceDays: lateFeeGraceDays, amount: lateFeeAmount },
  }), [today, months, viewer, meetings, elections, filings, cards, reservations, units, insurance, maintenance, hoaDueDay, lateFeeEnabled, lateFeeGraceDays, lateFeeAmount]);
  const visible = useMemo(() => filterAgenda(items, filter, forOwner), [items, filter, forOwner]);
  const mineCount = useMemo(() => filterAgenda(items, 'mine', forOwner).length, [items, forOwner]);
  const groups = useMemo(() => groupAgenda(visible, today, months), [visible, today, months]);
  const month = groups[Math.min(i, groups.length - 1)];
  const next = useMemo(() => visible.find(it => it.date > today), [visible, today]);

  return (
    <Card aria-label="Calendar" data-widget="calendar">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>Calendar · {forOwner ? 'what is on for the building' : 'everything with a date, one list'}</SectionLabel>
        {!forOwner && <Button size="sm" variant="ghost" onClick={() => navigate('/community?tab=meetings')}>Schedule a meeting</Button>}
      </div>
      <PillTabs size="filter" aria-label="Calendar filters" value={filter} onChange={setFilter} tabs={FILTERS.filter(f => !forOwner || f.id !== 'deadline').map(f => ({ id: f.id, label: f.label, badge: f.id === 'mine' ? mineCount || undefined : undefined }))} />
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ux2-muted">
        {(Object.keys(KIND_META) as (keyof typeof KIND_META)[]).map(k => <Chip key={k} tone={KIND_META[k].tone}>{KIND_META[k].label}</Chip>)}
        {!forOwner && <span className="ml-1">· Board = the board only sees it</span>}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-[15px] font-semibold text-ux2-ink">{month.label} <span className="text-ux2-muted">· {month.count} item{month.count === 1 ? '' : 's'}</span></div>
        <div className="flex gap-1">
          <button type="button" aria-label="Earlier month" disabled={i === 0} onClick={() => setI(x => Math.max(0, x - 1))} className="h-8 w-8 rounded-full border border-ux2-line bg-white disabled:opacity-40">‹</button>
          <button type="button" aria-label="Later month" disabled={i >= groups.length - 1} onClick={() => setI(x => Math.min(groups.length - 1, x + 1))} className="h-8 w-8 rounded-full border border-ux2-line bg-white disabled:opacity-40">›</button>
        </div>
      </div>

      {month.days.length === 0 ? (
        <Inner className="text-sm text-ux2-muted">Nothing scheduled in {month.label}.</Inner>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" data-month={month.key}>
          {month.days.map(d => (
            <li key={d.date} data-day={d.date} className={cn('flex gap-3 rounded-[14px] border px-3 py-2.5', d.isToday ? 'border-ux2-teal bg-ux2-teal-tint' : 'border-ux2-line bg-white')}>
              <div className="w-10 shrink-0 text-center">
                <div className={cn('font-display text-[22px] font-semibold leading-none', d.isToday ? 'text-ux2-teal' : 'text-ux2-ink')}>{d.day}</div>
                <div className="text-[11px] text-ux2-muted">{d.weekday}</div>
              </div>
              <div className="min-w-0 flex-1">
                {d.items.length === 0 ? (
                  <div className="text-sm text-ux2-muted">Nothing scheduled today{next ? ` · next: ${next.title.toLowerCase()} on ${next.date.slice(5).replace('-', '/')}` : ''}</div>
                ) : d.items.map(it => (
                  <div key={it.id} data-agenda={it.id} className="flex items-start justify-between gap-3 py-1 [&+&]:border-t [&+&]:border-ux2-line">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn('text-sm font-semibold', it.mine ? 'text-ux2-navy' : 'text-ux2-ink')}>{it.title}</span>
                        {it.time && <span className="text-xs text-ux2-muted">{it.time}</span>}
                      </div>
                      <div className="text-xs text-ux2-muted">{it.detail}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Chip tone={KIND_META[it.kind].tone}>{KIND_META[it.kind].label}</Chip>
                      {!forOwner && <Chip tone={it.audience === 'board' ? 'navy' : 'ghost'}>{it.audience === 'board' ? 'Board' : 'All'}</Chip>}
                      <Button size="sm" variant={it.action ? 'primary' : 'ghost'} onClick={() => navigate(it.path)}>{it.action ?? 'Open'}</Button>
                    </div>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Inner className="text-xs text-ux2-muted">Meetings, votes, filings and runbook steps, vendor visits, reservations, move-ins, insurance renewals and dues days, each from the module that owns it. Nothing is entered twice.</Inner>
    </Card>
  );
}
