/**
 * Charging a unit, one way: a fee, a special assessment, an amenity charge or
 * dues, on one unit or split across every unit, always with a due date. The
 * unit ledger's row menu and the invoice register both come through here, so
 * a charge made from either is the same invoice in the same places.
 */
import { useFinancialStore, whenInvoiceSaved } from '@/store/useFinancialStore';
import { sendInvoiceEmail, type InvoiceEmailResult } from '@/lib/services/invoicing';
import type { Fund, UnitInvoice } from '@/types/financial';

export type ChargeType = UnitInvoice['type'];
export const CHARGE_LABEL: Record<ChargeType, string> = { fee: 'Fee', special_assessment: 'Special assessment', amenity_fee: 'Amenity fee', monthly: 'Dues' };

export interface ChargeInput {
  parts: { unit: string; amount: number }[];
  type: ChargeType;
  /** Which fund a special assessment belongs to. */
  fund: Fund;
  description: string;
  /** Required: a charge with no date to pay by cannot be tracked, or told apart from one that is late. */
  dueDate: string;
}

/** One invoice per unit named, each in the unit's ledger and the invoice register. */
export function createCharges(input: ChargeInput): UnitInvoice[] {
  if (!input.dueDate) return [];
  const made: UnitInvoice[] = [];
  for (const p of input.parts) {
    if (!(p.amount > 0)) continue;
    const fin = useFinancialStore.getState();
    if (input.type === 'special_assessment') made.push(fin.addSpecialAssessment(p.unit, p.amount, input.description, { dueDate: input.dueDate, fund: input.fund }));
    else if (input.type === 'fee') made.push(fin.imposeLateFee(p.unit, p.amount, input.description, { dueDate: input.dueDate }));
    else made.push(fin.createUnitInvoice(p.unit, input.type, p.amount, input.description, undefined, input.dueDate));
  }
  return made;
}

/** Email an invoice to its unit's owner, once the invoice has its permanent id. */
export async function emailInvoice(invoiceId: string): Promise<InvoiceEmailResult & { unit: string }> {
  const id = await whenInvoiceSaved(invoiceId);
  const fin = useFinancialStore.getState();
  const inv = fin.unitInvoices.find(i => i.id === id);
  const unit = inv && fin.units.find(u => u.number === inv.unitNumber);
  if (!inv || !unit) return { sent: false, to: '', payLink: false, unit: inv?.unitNumber ?? '', reason: 'That invoice is no longer here' };
  const r = await sendInvoiceEmail(inv, unit, fin.stripeConnectId, fin.tenantId);
  if (r.paymentUrl) useFinancialStore.setState(s => ({ unitInvoices: s.unitInvoices.map(i => (i.id === id ? { ...i, stripePaymentLink: r.paymentUrl! } : i)) }));
  return { ...r, unit: unit.number };
}

/** Email several invoices, one after another, and say in a line how it went. */
export async function emailInvoices(ids: string[]): Promise<string> {
  const results: Awaited<ReturnType<typeof emailInvoice>>[] = [];
  for (const id of ids) results.push(await emailInvoice(id));
  const sent = results.filter(r => r.sent);
  const failed = results.filter(r => !r.sent);
  const why = failed.length ? ` · not sent: ${[...new Set(failed.map(f => f.reason))].slice(0, 2).join('; ')}` : '';
  if (ids.length === 1) return sent.length ? `Emailed to ${sent[0].to}${sent[0].payLink ? ', with a Pay button' : ''}.` : `Not emailed: ${failed[0].reason}.`;
  return `Emailed ${sent.length} of ${ids.length}${why}.`;
}
