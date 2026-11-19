import { supabase } from '@/lib/supabase';
import type { UnitInvoice, Unit } from '@/types/financial';

export interface InvoiceEmailResult {
  /** The email went out. */
  sent: boolean;
  to: string;
  /** The email carries a Pay button (a Stripe payment link was created). */
  payLink: boolean;
  /** The Stripe payment link, when one was created. */
  paymentUrl?: string;
  /** Why nothing was sent, in words a board member can act on. */
  reason?: string;
}

/**
 * Emails a unit invoice to the unit's owner. The email names the building,
 * the unit, the invoice number, what the charge is for, the amount and the
 * due date; when online payments are set up it also carries a Pay button (a
 * Stripe Checkout link, saved on the invoice). Nothing else is attached.
 */
export async function sendInvoiceEmail(
  invoice: UnitInvoice,
  unit: Unit,
  stripeConnectId: string | null,
  tenantId: string | null,
): Promise<InvoiceEmailResult> {
  const to = (unit.email || '').trim();
  if (!to) return { sent: false, to, payLink: false, reason: `Unit ${unit.number} has no email on file (Building › Directory)` };
  if (!supabase) return { sent: false, to, payLink: false, reason: 'Email is not available offline' };
  try {
    const { data, error } = await supabase.functions.invoke('send-unit-invoice', {
      body: {
        invoiceId: invoice.id,
        unitNumber: invoice.unitNumber,
        ownerName: unit.owner,
        ownerEmail: to,
        amount: Math.max(0, Math.round((invoice.amount - (invoice.paidAmount ?? 0)) * 100) / 100) || invoice.amount,
        description: invoice.description,
        type: invoice.type,
        dueDate: invoice.dueDate,
        stripeConnectId,
        tenantId,
      },
    });
    if (error) {
      console.error('sendInvoiceEmail error:', error);
      return { sent: false, to, payLink: false, reason: 'The email could not be sent' };
    }
    return { sent: !!data?.emailSent, to, payLink: !!data?.paymentUrl, paymentUrl: data?.paymentUrl || undefined, reason: data?.emailSent ? undefined : 'The email could not be sent' };
  } catch (err) {
    console.error('sendInvoiceEmail error:', err);
    return { sent: false, to, payLink: false, reason: 'The email could not be sent' };
  }
}

/** Kept for the amenity bookings, which send their invoice as they create it. */
export async function sendInvoiceToStripe(
  invoice: UnitInvoice,
  unit: Unit,
  _buildingName: string,
  stripeConnectId: string | null,
  tenantId: string,
): Promise<void> {
  await sendInvoiceEmail(invoice, unit, stripeConnectId, tenantId);
}
