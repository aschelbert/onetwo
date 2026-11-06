/**
 * Me metrics — the numbers on My Account, My Unit(s) and the stewardship
 * receipts. Pure functions; the production Account, My Unit, User
 * Management, Subscription and Help pages keep owning every mutation.
 */
import type { Unit, UnitInvoice } from '@/types/financial';
import type { LegalDocument } from '@/store/useBuildingStore';
import { daysBetween } from '../runbook/model';
import { ISO_DATE } from '../runbook/adapters';
import { DIMENSIONS, WEIGHTS, type Dimension, type ScoreEvent, type Scorecard } from '../score/stewardship';

export interface MeSnapshot {
  today: string;
  viewer: { id: string; name: string; email: string; role: string; linkedUnits: string[]; officerTitle?: string; isBoard: boolean };
  units: Unit[];
  unitInvoices: UnitInvoice[];
  hoaDueDay: number;
  legalDocuments: LegalDocument[];
}

// ── Units ────────────────────────────────────────────────────────────────────

export interface UnitSummary {
  unit: Unit;
  balance: number;
  fees: number;
  assessments: number;
  owed: number;
  openInvoices: UnitInvoice[];
  nextDue: string;
  /** Dues months paid this year, and how many were on or before the due day. */
  paidThisYear: { months: number; onTime: number; amount: number };
  movedIn?: string;
}

export function unitSummaries(s: MeSnapshot): UnitSummary[] {
  const year = s.today.slice(0, 4);
  const dueDay = Math.min(Math.max(s.hoaDueDay || 1, 1), 28);
  return s.units.filter(u => s.viewer.linkedUnits.includes(u.number)).map(unit => {
    const fees = unit.lateFees.filter(f => !f.waived).reduce((t, f) => t + f.amount, 0);
    const assessments = unit.specialAssessments.filter(a => !a.paid).reduce((t, a) => t + a.amount, 0);
    const openInvoices = s.unitInvoices.filter(i => i.unitNumber === unit.number && (i.status === 'sent' || i.status === 'overdue')).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const [y, m, d] = s.today.split('-').map(Number);
    const nextDue = d <= dueDay ? `${y}-${String(m).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}` : `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
    const pays = unit.payments.filter(p => p.date.startsWith(year));
    const months = new Set(pays.map(p => p.date.slice(0, 7)));
    let onTime = 0;
    for (const key of months) {
      const first = pays.filter(p => p.date.slice(0, 7) === key).sort((a, b) => a.date.localeCompare(b.date))[0];
      if (first && Number(first.date.slice(8, 10)) <= dueDay) onTime++;
    }
    return {
      unit,
      balance: Math.max(0, unit.balance),
      fees,
      assessments,
      owed: Math.max(0, unit.balance) + fees,
      openInvoices,
      nextDue,
      paidThisYear: { months: months.size, onTime, amount: pays.reduce((t, p) => t + p.amount, 0) },
      movedIn: unit.moveIn ?? undefined,
    };
  });
}

// ── Resale readiness ─────────────────────────────────────────────────────────

export interface PacketItem {
  label: string;
  present: boolean;
  detail?: string;
}

/** The seven items a resale packet needs, judged from the documents on file. */
export function resalePacket(docs: LegalDocument[]): { items: PacketItem[]; ready: number; total: number } {
  const find = (re: RegExp) => docs.find(d => re.test(d.name));
  const item = (label: string, re: RegExp): PacketItem => {
    const d = find(re);
    return { label, present: !!d, detail: d ? `${d.version ? `${d.version} · ` : ''}${d.status === 'current' ? 'on file' : 'review due'}` : 'Missing' };
  };
  const items: PacketItem[] = [
    item('Bylaws', /bylaw/i),
    item('CC&Rs / declaration', /cc&r|declaration|covenant/i),
    item('Rules', /rule/i),
    item('Policies', /polic/i),
    item('Budget', /budget/i),
    item('Reserve study', /reserve/i),
    { label: 'Unit certificate', present: true, detail: 'Issued on request' },
  ];
  return { items, ready: items.filter(i => i.present).length, total: items.length };
}

// ── Statements and receipts ──────────────────────────────────────────────────

export interface ReceiptRow {
  id: string;
  date: string;
  unit: string;
  label: string;
  amount: number;
  method: string;
  status: 'paid' | 'open' | 'overdue';
  year: string;
}

export function receiptRows(s: MeSnapshot): ReceiptRow[] {
  const out: ReceiptRow[] = [];
  for (const u of s.units.filter(x => s.viewer.linkedUnits.includes(x.number))) {
    for (const [i, p] of u.payments.entries()) {
      out.push({ id: `pay:${u.number}:${i}`, date: p.date.slice(0, 10), unit: u.number, label: p.note || 'Dues', amount: p.amount, method: p.method || '—', status: 'paid', year: p.date.slice(0, 4) });
    }
  }
  for (const inv of s.unitInvoices.filter(i => s.viewer.linkedUnits.includes(i.unitNumber) && i.status !== 'void')) {
    const date = inv.status === 'paid' && inv.paidDate ? inv.paidDate.slice(0, 10) : inv.dueDate;
    out.push({ id: `inv:${inv.id}`, date, unit: inv.unitNumber, label: inv.description, amount: inv.amount, method: inv.paymentMethod || (inv.status === 'paid' ? '—' : 'due'), status: inv.status === 'paid' ? 'paid' : inv.status === 'overdue' ? 'overdue' : 'open', year: date.slice(0, 4) });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ── Stewardship receipts ─────────────────────────────────────────────────────

export interface DimensionLine {
  dimension: Dimension;
  pct: number;
  points: number;
  weight: number;
  /** "11 of 12" style summary of the events behind it. */
  earned: number;
  available: number;
  buildingPct?: number;
}

export function dimensionLines(card: Scorecard, buildingDims?: number[]): DimensionLine[] {
  return card.dimensions.map((d, i) => ({ dimension: d.dimension, pct: d.pct, points: d.points, weight: WEIGHTS[d.dimension], earned: Math.round(d.earned * 10) / 10, available: d.available, buildingPct: buildingDims?.[i] }));
}

/** The most recent scored events, newest first, with their receipt line. */
export function recentReceipts(events: ScoreEvent[], today: string, limit = 3): (ScoreEvent & { daysAgo: number; points: number })[] {
  return [...events]
    .filter(e => ISO_DATE.test(e.date))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map(e => ({ ...e, daysAgo: -daysBetween(today, e.date), points: Math.round((e.earned / Math.max(1, e.available)) * (WEIGHTS[e.dimension] / 10) * 10) / 10 }));
}

export function lowestDimension(card: Scorecard): Dimension {
  return [...card.dimensions].sort((a, b) => a.pct - b.pct)[0]?.dimension ?? DIMENSIONS[0];
}
