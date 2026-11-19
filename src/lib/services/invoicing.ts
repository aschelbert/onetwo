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

/** Who an invoice email goes to: a unit's owner, or the vendor or outside party the invoice bills. */
export interface InvoiceRecipient { name: string; email: string; unit?: string }

/**
 * Emails an invoice to the unit's owner, or to the vendor or outside party it
 * bills. The email names the building, who is billed, the invoice number,
 * what the charge is for, the amount and the due date; when online payments
 * are set up it also carries a Pay button (a Stripe Checkout link, saved on
 * the invoice), which needs no login. Nothing else is attached.
 */
export async function sendInvoiceEmail(
  invoice: UnitInvoice,
  recipient: InvoiceRecipient,
  stripeConnectId: string | null,
  tenantId: string | null,
): Promise<InvoiceEmailResult> {
  const to = (recipient.email || '').trim();
  if (!to) return { sent: false, to, payLink: false, reason: recipient.unit ? `Unit ${recipient.unit} has no email on file (Building › Directory)` : `There is no email address for ${recipient.name || 'this payer'}` };
  if (!supabase) return { sent: false, to, payLink: false, reason: 'Email is not available offline' };
  try {
    const { data, error } = await supabase.functions.invoke('send-unit-invoice', {
      body: {
        invoiceId: invoice.id,
        unitNumber: invoice.unitNumber,
        ownerName: recipient.name,
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
  await sendInvoiceEmail(invoice, { name: unit.owner, email: unit.email, unit: unit.number }, stripeConnectId, tenantId);
}
