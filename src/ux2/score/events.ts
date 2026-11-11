/**
 * Stewardship events — turn what the stores already record into scored
 * receipts for the viewer and for the building average.
 *
 * Board side:   Compliance = filings and dated obligations met on time
 *               Timeliness = owner requests answered inside the SLA window
 *               Oversight  = cases closed, open cases not past their due date
 *               Reach      = attendance at completed meetings
 *               Impact     = board decisions and owner votes cast
 * Owner side:   Timeliness = dues paid by the due day each month
 *               Compliance = invoices and special assessments paid by their due date
 *               Reach      = attendance at owner meetings
 *               Impact     = owner votes cast
 *
 * Scoring is client-side today, over the trailing twelve months. The
 * `stewardship_scores` table (migration 031) stores a monthly snapshot so
 * history survives seed changes; a scheduled job can take over the compute
 * later without changing this contract.
 */
import type { StoreSnapshot } from '../runbook/adapters';
import { ISO_DATE } from '../runbook/adapters';
import { addDays, daysBetween } from '../runbook/model';
import { average, computeScorecard, timelinessCredit, type Scorecard, type ScoreEvent } from './stewardship';

export const SCORE_WINDOW_DAYS = 365;
const REQUEST_SLA_DAYS = 14;

function inWindow(today: string, date: string | null | undefined, days = SCORE_WINDOW_DAYS): boolean {
  if (!date) return false;
  const d = date.slice(0, 10);
  if (!ISO_DATE.test(d)) return false;
  const delta = daysBetween(today, d);
  return delta <= 0 && delta >= -days;
}

function fmtLate(daysLate: number): string {
  if (daysLate <= 0) return 'on time';
  return `${daysLate} day${daysLate === 1 ? '' : 's'} late`;
}

/** Events for someone who sits on the board (or manages the building). */
export function boardEvents(s: StoreSnapshot, who: { name: string; officerTitle?: string }): ScoreEvent[] {
  const ev: ScoreEvent[] = [];
  const today = s.today;
  const mine = (role: string | undefined) => !who.officerTitle || !role || role === who.officerTitle;

  for (const f of s.filings) {
    if (!mine(f.responsible)) continue;
    if (f.status === 'filed' && f.filedDate && inWindow(today, f.filedDate)) {
      const late = daysBetween(f.dueDate, f.filedDate.slice(0, 10));
      const credit = timelinessCredit(late);
      ev.push({ id: `filing:${f.id}`, dimension: 'Compliance', date: f.filedDate.slice(0, 10), label: f.name, earned: credit, available: 1, reason: `Filed ${fmtLate(late)}` });
    } else if (f.status === 'pending' && inWindow(today, f.dueDate)) {
      ev.push({ id: `filing:${f.id}`, dimension: 'Compliance', date: f.dueDate, label: f.name, earned: 0, available: 1, reason: `Not filed · due ${f.dueDate}` });
    }
  }

  for (const item of s.obligations) {
    if (!ISO_DATE.test(item.due) || !mine(item.role) || item.autoPass) continue;
    if (!inWindow(today, item.due)) continue;
    const done = !!s.completions[item.id];
    ev.push({ id: `obligation:${item.id}`, dimension: 'Compliance', date: item.due, label: item.task, earned: done ? 1 : 0, available: 1, reason: done ? 'Completed' : `Not done · was due ${item.due}` });
  }

  for (const i of s.issues) {
    const submitted = i.submittedDate.slice(0, 10);
    if (!inWindow(today, submitted)) continue;
    const age = -daysBetween(today, submitted);
    if (i.status === 'SUBMITTED') {
      if (age > REQUEST_SLA_DAYS) ev.push({ id: `request:${i.id}`, dimension: 'Timeliness', date: addDays(submitted, REQUEST_SLA_DAYS), label: i.title, earned: 0, available: 1, reason: `No reply after ${age} days` });
      continue;
    }
    ev.push({ id: `request:${i.id}`, dimension: 'Timeliness', date: submitted, label: i.title, earned: 1, available: 1, reason: 'Answered inside the window' });
  }

  for (const c of s.cases) {
    if (c.status === 'closed' && inWindow(today, c.completedAt)) {
      ev.push({ id: `case:${c.id}`, dimension: 'Oversight', date: c.completedAt!.slice(0, 10), label: c.title, earned: 1, available: 1, reason: 'Action closed' });
    } else if (c.status === 'open' && c.dueDate && ISO_DATE.test(c.dueDate) && daysBetween(today, c.dueDate) < 0) {
      ev.push({ id: `case:${c.id}`, dimension: 'Oversight', date: c.dueDate, label: c.title, earned: 0, available: 1, reason: `Past its ${c.dueDate} target` });
    }
  }

  for (const m of s.meetings) {
    if (m.status !== 'COMPLETED' || !inWindow(today, m.date)) continue;
    const there = m.attendees.board.includes(who.name);
    ev.push({ id: `meeting:${m.id}`, dimension: 'Reach', date: m.date, label: m.title, earned: there ? 1 : 0, available: 1, reason: there ? 'Attended' : 'Not on the attendance list' });
  }

  for (const a of s.approvals) {
    const decided = a.decidedAt ? a.decidedAt.slice(0, 10) : undefined;
    if (a.status === 'pending' || !inWindow(today, decided)) continue;
    const voted = (a.votes || []).some(v => v.member === who.name);
    ev.push({ id: `decision:${a.id}`, dimension: 'Impact', date: decided!, label: a.title, earned: voted ? 1 : 0, available: 1, reason: voted ? 'Voted' : 'Did not vote' });
  }

  return ev;
}

/** Events for an owner, scored on the unit(s) they hold. */
export function ownerEvents(s: StoreSnapshot, who: { name: string; units: string[] }): ScoreEvent[] {
  const ev: ScoreEvent[] = [];
  const today = s.today;
  const dueDay = Math.min(Math.max(s.hoaDueDay || 1, 1), 28);

  for (const unit of s.units.filter(u => who.units.includes(u.number))) {
    if (unit.monthlyFee > 0) {
      // One Timeliness event per month in the window: was a dues payment recorded by the due day?
      const [y, m] = today.split('-').map(Number);
      for (let back = 0; back < 12; back++) {
        const total = m - 1 - back;
        const yy = y + Math.floor(total / 12);
        const mm = ((total % 12) + 12) % 12 + 1;
        const key = `${yy}-${String(mm).padStart(2, '0')}`;
        const due = `${key}-${String(dueDay).padStart(2, '0')}`;
        if (daysBetween(today, due) > 0) continue;
        const paid = unit.payments.filter(p => p.date.slice(0, 7) === key).sort((a, b) => a.date.localeCompare(b.date))[0];
        if (!paid) {
          const late = -daysBetween(today, due);
          if (late <= 7) continue; // give the grace window before it counts
          ev.push({ id: `dues:${unit.number}:${key}`, dimension: 'Timeliness', date: due, label: `Dues · ${key}`, earned: 0, available: 1, reason: 'No payment recorded' });
          continue;
        }
        const late = daysBetween(due, paid.date.slice(0, 10));
        ev.push({ id: `dues:${unit.number}:${key}`, dimension: 'Timeliness', date: paid.date.slice(0, 10), label: `Dues · ${key}`, earned: timelinessCredit(late), available: 1, reason: `Paid ${fmtLate(late)}` });
      }
    }
    for (const sa of unit.specialAssessments) {
      if (!inWindow(today, sa.date)) continue;
      if (sa.paid && sa.paidDate) {
        const late = daysBetween(sa.date, sa.paidDate.slice(0, 10));
        ev.push({ id: `sa:${sa.id}`, dimension: 'Compliance', date: sa.paidDate.slice(0, 10), label: sa.reason, earned: timelinessCredit(late), available: 1, reason: `Paid ${fmtLate(late)}` });
      } else if (daysBetween(today, sa.date) < -7) {
        ev.push({ id: `sa:${sa.id}`, dimension: 'Compliance', date: sa.date, label: sa.reason, earned: 0, available: 1, reason: 'Unpaid' });
      }
    }
  }

  for (const inv of s.unitInvoices) {
    if (!who.units.includes(inv.unitNumber) || inv.type === 'monthly' || inv.type === 'fee') continue;
    if (inv.status === 'paid' && inv.paidDate && inWindow(today, inv.paidDate)) {
      const late = daysBetween(inv.dueDate, inv.paidDate.slice(0, 10));
      ev.push({ id: `invoice:${inv.id}`, dimension: 'Compliance', date: inv.paidDate.slice(0, 10), label: inv.description, earned: timelinessCredit(late), available: 1, reason: `Paid ${fmtLate(late)}` });
    } else if (inv.status === 'overdue' && inWindow(today, inv.dueDate)) {
      ev.push({ id: `invoice:${inv.id}`, dimension: 'Compliance', date: inv.dueDate, label: inv.description, earned: 0, available: 1, reason: 'Overdue' });
    }
  }

  for (const m of s.meetings) {
    if (m.status !== 'COMPLETED' || !inWindow(today, m.date)) continue;
    if (m.type !== 'ANNUAL' && m.type !== 'SPECIAL') continue; // owners are only expected at owner meetings
    const there = m.attendees.owners.includes(who.name) || m.attendees.board.includes(who.name);
    ev.push({ id: `meeting:${m.id}`, dimension: 'Reach', date: m.date, label: m.title, earned: there ? 1 : 0, available: 1, reason: there ? 'Attended' : 'Not on the attendance list' });
  }

  for (const e of s.elections) {
    const closed = e.closedAt ? e.closedAt.slice(0, 10) : null;
    if ((e.status !== 'closed' && e.status !== 'certified') || !inWindow(today, closed)) continue;
    const voted = e.ballots.some(b => who.units.includes(b.unitNumber));
    ev.push({ id: `election:${e.id}`, dimension: 'Impact', date: closed!, label: e.title, earned: voted ? 1 : 0, available: 1, reason: voted ? 'Ballot cast' : 'No ballot from your unit' });
  }

  return ev;
}

export interface StewardshipView {
  you: Scorecard;
  events: ScoreEvent[];
  /** Average total across the comparison group, and per-dimension percentages. */
  building: { total: number; dims: number[] };
  /** Who the viewer is compared with. */
  group: 'board' | 'owners';
}

/** The viewer's scorecard plus the building average for their group. */
export function stewardshipFor(s: StoreSnapshot): StewardshipView {
  const v = s.viewer;
  const boardSide = v.role === 'BOARD_MEMBER' || v.role === 'PROPERTY_MANAGER' || v.role === 'PLATFORM_ADMIN';
  if (boardSide) {
    const events = boardEvents(s, { name: v.name, officerTitle: v.officerTitle });
    const peers = s.board.length > 0 ? s.board.map(b => computeScorecard(boardEvents(s, { name: b.name, officerTitle: b.role }))) : [computeScorecard(events)];
    return { you: computeScorecard(events), events, building: averages(peers), group: 'board' };
  }
  const events = ownerEvents(s, { name: v.name, units: v.linkedUnits });
  const peers = s.units.length > 0 ? s.units.map(u => computeScorecard(ownerEvents(s, { name: u.owner, units: [u.number] }))) : [computeScorecard(events)];
  return { you: computeScorecard(events), events, building: averages(peers), group: 'owners' };
}

function averages(cards: Scorecard[]): { total: number; dims: number[] } {
  return {
    total: average(cards.map(c => c.total)),
    dims: cards[0]?.dimensions.map((_, i) => average(cards.map(c => c.dimensions[i].pct))) ?? [],
  };
}
