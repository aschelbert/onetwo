/**
 * The billing cycle, as pure decisions: which month needs its dues billed,
 * which dues invoices have gone past the grace period without a late fee,
 * and the names and dates the invoices carry. The store runs these; this
 * file only decides. Everything is keyed by unit and month so a run that
 * happens twice bills once.
 */
import type { UnitInvoice } from '@/types/financial';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 'YYYY-MM' of a date. */
export const periodKey = (date: string) => date.slice(0, 7);

/** 'Dues · November 2026': the description every dues invoice for a month carries, so the month is found by it. */
export function duesDescription(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return `Dues · ${MONTHS[m - 1]} ${y}`;
}

/** The first day of the month: the billing date. */
export const billingDate = (period: string) => `${period}-01`;

/** Dues are due on the building's due day (1 to 28) of the month. */
export const duesDueDate = (period: string, hoaDueDay: number) => `${period}-${String(Math.min(Math.max(1, hoaDueDay || 1), 28)).padStart(2, '0')}`;

export const isDuesInvoice = (i: UnitInvoice) => i.type === 'monthly' && i.description.startsWith('Dues · ');
export const isDuesInvoiceFor = (i: UnitInvoice, period: string) => isDuesInvoice(i) && i.description === duesDescription(period);

/** The month to bill now, or null: billing is on and this month has not been billed yet. */
export function billingDue(today: string, autoBillingEnabled: boolean, lastBillingRun: string | null): string | null {
  if (!autoBillingEnabled) return null;
  const period = periodKey(today);
  if (lastBillingRun && periodKey(lastBillingRun) >= period) return null;
  return period;
}

export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/**
 * Dues invoices still open past their due date plus the grace period, with
 * no late fee charged for them yet (a fee names its dues invoice).
 */
export function lateFeesDue(today: string, invoices: UnitInvoice[], graceDays: number): UnitInvoice[] {
  const charged = new Set(invoices.filter(i => i.type === 'fee' && i.status !== 'void' && i.forInvoiceId).map(i => i.forInvoiceId as string));
  return invoices.filter(i => isDuesInvoice(i) && (i.status === 'sent' || i.status === 'overdue') && (i.amount - (i.paidAmount ?? 0)) > 0.005 && today > addDays(i.dueDate, Math.max(0, graceDays || 0)) && !charged.has(i.id));
}

/** The memo on a month's reserve transfer, so it posts once. */
export const reserveTransferMemo = (period: string) => `Reserve transfer · ${duesDescription(period).slice(7)}`;

export interface BillingRunSummary {
  period: string;
  /** Units billed this run. */
  billed: number;
  amount: number;
  /** Units that already had this month's dues invoice. */
  alreadyBilled: number;
  /** Units with no monthly amount set. */
  noAmount: number;
  /** The reserve transfer posted this run, if any. */
  reserveTransfer: number;
  lateFees: number;
}
