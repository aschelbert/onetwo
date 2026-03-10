import { supabase } from '@/lib/supabase';
import type { UnitInvoice, Unit } from '@/types/financial';

/**
 * Sends a unit invoice to Stripe (creates Checkout session) and emails the payment link.
 * Uses supabase.functions.invoke() which auto-handles auth via the existing session.
 */
export async function sendInvoiceToStripe(
  invoice: UnitInvoice,
  unit: Unit,
  buildingName: string,
  stripeConnectId: string | null,
  tenantId: string,
): Promise<void> {
  if (!supabase) return;

  try {
    const { error } = await supabase.functions.invoke('send-unit-invoice', {
      body: {
        invoiceId: invoice.id,
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
