/**
 * The calendar (pure). One merged, forward-looking list of everything in the
 * building that has a date: meetings, votes closing, filings and runbook
 * steps, vendor visits from the maintenance schedule, amenity reservations,
 * move-ins, insurance expiries, dues days and late-fee days. Nothing is
 * entered twice; each module owns its dates, this view only reads them.
 *
 * Owners see what is for everyone (`audience: 'all'`); the board also sees
 * its own deadlines. `mine` marks what is the viewer's own: a step assigned
 * to them, their unit's reservation, their dues.
 */
import type { Role } from '@/types/auth';
import type { Unit } from '@/types/financial';
import type { Meeting } from '@/store/useMeetingsStore';
import type { Election } from '@/store/useElectionStore';
import type { RegulatoryFiling } from '@/store/useComplianceStore';
import type { InsurancePolicy, MaintenanceSchedule } from '@/store/useBuildingStore';
import type { Reservation } from '@/store/useAmenitiesStore';
import type { ChipTone } from '../components';
import type { RunbookCard } from '../runbook/model';
import { monthLabel } from './calendar';

export type AgendaKind = 'meeting' | 'vote' | 'deadline' | 'vendor' | 'amenity' | 'dues' | 'move';
export type AgendaFilter = 'all' | 'mine' | AgendaKind;

export interface AgendaItem {
  id: string;
  /** ISO date. */
  date: string;
  /** Free text time, when the source has one ("7:00 PM", "9am to 1pm"). */
  time?: string;
  title: string;
  detail: string;
  kind: AgendaKind;
  audience: 'all' | 'board';
  mine: boolean;
  path: string;
  action?: string;
}

export interface AgendaViewer { id: string; name: string; role: Role; linkedUnits: string[] }

export interface AgendaSources {
  today: string;
  /** How many months ahead to include, counting this one. */
  months?: number;
  viewer: AgendaViewer;
  meetings: Meeting[];
  elections: Election[];
  filings: RegulatoryFiling[];
  /** Runbook cards with a due date; meeting, vote, filing, insurance, maintenance and payment cards are skipped because their source is listed directly. */
  cards: RunbookCard[];
  reservations: Reservation[];
  units: Unit[];
  insurance: InsurancePolicy[];
  maintenance: MaintenanceSchedule[];
  hoaDueDay: number;
  lateFee: { enabled: boolean; graceDays: number; amount: number };
}

export const KIND_META: Record<AgendaKind, { label: string; tone: ChipTone }> = {
  meeting: { label: 'Meeting', tone: 'navy' },
  vote: { label: 'Vote', tone: 'plum' },
  deadline: { label: 'Deadline', tone: 'cyan' },
  vendor: { label: 'Vendor', tone: 'amber' },
  amenity: { label: 'Amenity', tone: 'sage' },
  dues: { label: 'Dues', tone: 'teal' },
  move: { label: 'Move', tone: 'ghost' },
};

export const FILTERS: { id: AgendaFilter; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'mine', label: 'Mine' },
  { id: 'meeting', label: 'Meetings' },
  { id: 'vote', label: 'Votes' },
  { id: 'deadline', label: 'Deadlines and filings' },
  { id: 'vendor', label: 'Vendors and maintenance' },
  { id: 'amenity', label: 'Amenities' },
];

const ISO = /^\d{4}-\d{2}-\d{2}/;
const CARD_KINDS_LISTED_DIRECTLY = new Set(['meeting', 'vote', 'filing', 'insurance', 'maintenance', 'payment', 'setup']);

function iso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** The ISO date `n` days after `date`. */
function plusDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return iso(new Date(Date.UTC(y, m - 1, d + n)));
}

/** First day of the month `offset` months after the month of `date`. */
function monthStart(date: string, offset: number): string {
  const [y, m] = date.split('-').map(Number);
  return iso(new Date(Date.UTC(y, m - 1 + offset, 1)));
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "Tue" for an ISO date, independent of the viewer's timezone. */
export function weekdayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function buildAgenda(src: AgendaSources): AgendaItem[] {
  const months = src.months ?? 4;
  const from = src.today;
  const to = monthStart(src.today, months); // exclusive
  const inRange = (d: string | null | undefined): d is string => !!d && ISO.test(d) && d.slice(0, 10) >= from && d.slice(0, 10) < to;
  const owner = src.viewer.role === 'RESIDENT';
  const out: AgendaItem[] = [];

  for (const m of src.meetings) {
    if (m.status === 'COMPLETED' || m.status === 'CANCELLED' || !inRange(m.date)) continue;
    const agendaCount = Array.isArray(m.agenda) ? m.agenda.length : 0;
    out.push({
      id: `meeting:${m.id}`, date: m.date.slice(0, 10), time: m.time || undefined, title: m.title,
      detail: [m.location, agendaCount ? `${agendaCount} agenda item${agendaCount === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · '),
      kind: 'meeting', audience: 'all', mine: false, path: `/community?tab=meetings&meeting=${m.id}`, action: 'RSVP',
    });
  }

  for (const e of src.elections) {
    if (e.status !== 'open' || !inRange(e.scheduledCloseDate)) continue;
    out.push({
      id: `vote:${e.id}`, date: e.scheduledCloseDate!.slice(0, 10), title: `Vote closes · ${e.title}`,
      detail: `${e.ballots.length} voted${e.quorumRequired ? ` · quorum ${e.quorumRequired}` : ''}`,
      kind: 'vote', audience: 'all', mine: false, path: `/community?tab=votes&vote=${e.id}`, action: 'Vote',
    });
  }

  for (const f of src.filings) {
    if (f.status !== 'pending' || !inRange(f.dueDate)) continue;
    out.push({
      id: `filing:${f.id}`, date: f.dueDate.slice(0, 10), title: f.name, detail: `Filing · ${f.responsible || 'the board'}`,
      kind: 'deadline', audience: 'board', mine: false, path: '/building?tab=obligations&section=calendar', action: 'File',
    });
  }

  for (const c of src.cards) {
    if (!c.due || CARD_KINDS_LISTED_DIRECTLY.has(c.kind) || !inRange(c.due)) continue;
    const forOwners = c.roles.length > 0 && c.roles.every(r => r === 'RESIDENT');
    out.push({
      id: `card:${c.id}`, date: c.due.slice(0, 10), title: c.title, detail: c.why ?? '',
      kind: 'deadline', audience: forOwners ? 'all' : 'board', mine: !!c.assigneeId && c.assigneeId === src.viewer.id,
      path: c.action.path, action: c.action.label,
    });
  }

  for (const p of src.insurance) {
    if (!inRange(p.expires)) continue;
    out.push({
      id: `insurance:${p.id}`, date: p.expires.slice(0, 10), title: `${p.type} policy expires`, detail: `${p.carrier} · bind the renewal before this day`,
      kind: 'deadline', audience: 'board', mine: false, path: '/building?tab=overview&section=insurance', action: 'Renew',
    });
  }

  for (const s of src.maintenance) {
    if (s.status === 'completed' || !inRange(s.nextDue)) continue;
    out.push({
      id: `maintenance:${s.id}`, date: s.nextDue.slice(0, 10), title: s.task, detail: [s.vendor, s.frequency].filter(Boolean).join(' · '),
      kind: 'vendor', audience: 'all', mine: false, path: '/building?tab=overview&section=assets',
    });
  }

  for (const r of src.reservations) {
    if ((r.status !== 'active' && r.status !== 'pending_approval') || !inRange(r.date)) continue;
    out.push({
      id: `reservation:${r.id}`, date: r.date.slice(0, 10), time: [r.startTime, r.endTime].filter(Boolean).join(' to ') || undefined,
      title: `${r.amenityName} reserved`, detail: `Unit ${r.reservedByUnit}${r.status === 'pending_approval' ? ' · awaiting approval' : ''}`,
      kind: 'amenity', audience: 'all', mine: src.viewer.linkedUnits.includes(r.reservedByUnit), path: '/community?tab=amenities',
    });
  }

  for (const u of src.units) {
    if (!inRange(u.moveIn)) continue;
    out.push({
      id: `move:${u.number}`, date: u.moveIn!.slice(0, 10), title: `Move-in, Unit ${u.number}`, detail: u.owner || '',
      kind: 'move', audience: 'board', mine: false, path: '/building?tab=directory',
    });
  }

  for (let i = 0; i < months; i++) {
    const [y, m] = monthStart(src.today, i).split('-').map(Number);
    const dueDay = Math.min(Math.max(1, src.hoaDueDay || 1), daysInMonth(y, m));
    const due = `${y}-${String(m).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
    if (inRange(due)) {
      out.push({
        id: `dues:${due}`, date: due, title: 'Dues due', detail: `${src.units.length} unit${src.units.length === 1 ? '' : 's'}`,
        kind: 'dues', audience: 'all', mine: owner, path: owner ? '/my-unit/pay' : '/funds?tab=income', action: owner ? 'Pay' : undefined,
      });
    }
    if (src.lateFee.enabled) {
      const late = plusDays(due, Math.max(0, src.lateFee.graceDays));
      if (inRange(late)) {
        out.push({
          id: `latefee:${late}`, date: late, title: 'Late fees assessed', detail: `$${src.lateFee.amount} on unpaid dues · automatic`,
          kind: 'dues', audience: 'board', mine: false, path: '/funds?tab=settings&section=rules',
        });
      }
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title));
}

/** Owners see only what is for everyone; the filter then narrows by kind or to the viewer's own. */
export function filterAgenda(items: AgendaItem[], filter: AgendaFilter, forOwner: boolean): AgendaItem[] {
  const visible = forOwner ? items.filter(i => i.audience === 'all') : items;
  if (filter === 'all') return visible;
  if (filter === 'mine') return visible.filter(i => i.mine);
  return visible.filter(i => i.kind === filter);
}

export interface AgendaDay { date: string; day: number; weekday: string; isToday: boolean; items: AgendaItem[] }
export interface AgendaMonth { key: string; label: string; count: number; days: AgendaDay[] }

/** Months from today's, each with its dated days; today is always listed, even empty, so "nothing today" can be said. */
export function groupAgenda(items: AgendaItem[], today: string, months = 4): AgendaMonth[] {
  const out: AgendaMonth[] = [];
  for (let i = 0; i < months; i++) {
    const key = monthStart(today, i).slice(0, 7);
    const mine = items.filter(it => it.date.slice(0, 7) === key);
    const byDay = new Map<string, AgendaItem[]>();
    if (i === 0) byDay.set(today, []);
    for (const it of mine) byDay.set(it.date, [...(byDay.get(it.date) ?? []), it]);
    const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => ({
      date, day: Number(date.slice(8, 10)), weekday: weekdayLabel(date), isToday: date === today, items: list,
    }));
    out.push({ key, label: monthLabel(key), count: mine.length, days });
  }
  return out;
}
