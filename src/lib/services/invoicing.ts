import { supabase } from '@/lib/supabase';
import type { UnitInvoice, Unit } from '@/types/financial';

/**
 * Sends a unit invoice to Stripe (creates Checkout session) and emails the payment link.
 * Uses supabase.functions.invoke() which auto-handles auth via the existing session.
 */
// An invoice is created with a local id and gets its database id once the
// insert returns. The function that emails it needs the database id: that is
// what the payment link is saved against and what the payment is matched to.
const saves = new Map<string, Promise<string | null>>();

/** Called by the store when it starts saving a new invoice. Resolves to the saved id, or null if the save failed. */
export function trackInvoiceSave(localId: string, saved: Promise<string | null>): void {
  saves.set(localId, saved);
  saved.finally(() => setTimeout(() => saves.delete(localId), 60_000)).catch(() => {});
}

/** The id the invoice has in the database: waits for a save in flight, otherwise the id it already has. */
export async function savedInvoiceId(id: string): Promise<string | null> {
  const pending = saves.get(id);
  if (!pending) return id;
  try { return await pending; } catch { return null; }
}

export interface InvoiceEmailResult {
  sent: boolean;
  /** True when the email carries an online payment link. */
  payLink: boolean;
  error?: string;
}

/**
 * Emails one invoice to the unit's owner with a payment link, and reports what happened.
 * Used where a person creates a charge by hand and needs to know whether the owner was told.
 */
export async function emailUnitInvoice(
  invoice: UnitInvoice,
  unit: Unit | undefined,
  stripeConnectId: string | null,
  tenantId: string | null,
): Promise<InvoiceEmailResult> {
  if (!supabase) return { sent: false, payLink: false, error: 'Email is not set up in this environment.' };
  if (!unit?.email) return { sent: false, payLink: false, error: `No email address on file for Unit ${invoice.unitNumber}.` };
  if (!tenantId) return { sent: false, payLink: false, error: 'No building is selected.' };

  const invoiceId = await savedInvoiceId(invoice.id);
  if (!invoiceId) return { sent: false, payLink: false, error: 'The invoice could not be saved, so it was not emailed.' };

  try {
    const { data, error } = await supabase.functions.invoke('send-unit-invoice', {
      body: {
        invoiceId,
        unitNumber: invoice.unitNumber,
        ownerName: unit.owner,
        ownerEmail: unit.email,
        amount: invoice.amount,
        description: invoice.description,
        type: invoice.type,
        stripeConnectId,
        tenantId,
      },
    });
    if (error) {
      // The function's own explanation is in the response body, when there is one.
      let detail = '';
      try { detail = (await (error as { context?: Response }).context?.json())?.error ?? ''; } catch { /* no body */ }
      return { sent: false, payLink: false, error: detail || error.message || 'The email could not be sent.' };
    }
    if (data?.success && data.emailSent) return { sent: true, payLink: !!data.paymentUrl };
    if (data?.emailOptedOut) return { sent: false, payLink: false, error: `Unit ${invoice.unitNumber}'s owner has email turned off, so the invoice was not emailed. They can turn it back on from their Account page, or the board can from Users.` };
    return { sent: false, payLink: false, error: data?.error || 'The email was not accepted for delivery.' };
  } catch (err) {
    return { sent: false, payLink: false, error: String(err) };
  }
}

export async function sendInvoiceToStripe(
  invoice: UnitInvoice,
  unit: Unit,
  buildingName: string,
  stripeConnectId: string | null,
  tenantId: string,
): Promise<void> {
  if (!supabase) return;

  try {
    const invoiceId = await savedInvoiceId(invoice.id);
    if (!invoiceId) return;
    const { error } = await supabase.functions.invoke('send-unit-invoice', {
      body: {
        invoiceId,
        unitNumber: invoice.unitNumber,
        ownerName: unit.owner,
        ownerEmail: unit.email,
        amount: invoice.amount,
        description: invoice.description,
        type: invoice.type,
        buildingName,
        stripeConnectId,
        tenantId,
      },
    });
    if (error) {
      console.error('sendInvoiceToStripe error:', error);
    }
  } catch (err) {
    console.error('sendInvoiceToStripe error:', err);
  }
}
