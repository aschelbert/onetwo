import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Unit, UnitInvoice } from '@/types/financial';

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { emailUnitInvoice, savedInvoiceId, trackInvoiceSave } from '@/lib/services/invoicing';

const TENANT = '11111111-1111-4111-8111-111111111111';
const invoice = (over: Partial<UnitInvoice> = {}) => ({ id: 'INV-U-local', unitNumber: '1', type: 'fee', amount: 900, description: 'Repair charge', status: 'sent', ...over }) as UnitInvoice;
const unit = (over: Partial<Unit> = {}) => ({ number: '1', owner: 'Pat Owner', email: 'pat@example.com', ...over }) as Unit;

beforeEach(() => { invoke.mockReset(); });

describe('emailUnitInvoice', () => {
  it('waits for the saved id and sends that, not the local one', async () => {
    let saved: (id: string) => void = () => {};
    trackInvoiceSave('INV-U-wait', new Promise<string | null>(r => { saved = r; }));
    invoke.mockResolvedValue({ data: { success: true, emailSent: true, paymentUrl: 'https://pay' }, error: null });

    const pending = emailUnitInvoice(invoice({ id: 'INV-U-wait' }), unit(), 'acct_123', TENANT);
    await Promise.resolve();
    expect(invoke).not.toHaveBeenCalled();

    saved('db-uuid-1');
    expect(await pending).toEqual({ sent: true, payLink: true });
    expect(invoke).toHaveBeenCalledTimes(1);
    const [name, opts] = invoke.mock.calls[0];
    expect(name).toBe('send-unit-invoice');
    expect(opts.body).toMatchObject({ invoiceId: 'db-uuid-1', tenantId: TENANT, stripeConnectId: 'acct_123', ownerEmail: 'pat@example.com', amount: 900, type: 'fee' });
  });

  it('does not email an invoice that failed to save', async () => {
    trackInvoiceSave('INV-U-failed', Promise.resolve(null));
    const r = await emailUnitInvoice(invoice({ id: 'INV-U-failed' }), unit(), null, TENANT);
    expect(r.sent).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('says so when the unit has no email address, without calling the function', async () => {
    const r = await emailUnitInvoice(invoice(), unit({ email: '' }), null, TENANT);
    expect(r).toMatchObject({ sent: false, error: 'No email address on file for Unit 1.' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("passes on the function's own reason when it refuses", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: 'Only board members and property managers can send unit invoices' }) } } });
    const r = await emailUnitInvoice(invoice(), unit(), null, TENANT);
    expect(r).toEqual({ sent: false, payLink: false, error: 'Only board members and property managers can send unit invoices' });
  });

  it('reports an email sent without a payment link', async () => {
    invoke.mockResolvedValue({ data: { success: true, emailSent: true, paymentUrl: '' }, error: null });
    expect(await emailUnitInvoice(invoice(), unit(), null, TENANT)).toEqual({ sent: true, payLink: false });
  });

  it('reports an email the provider did not accept', async () => {
    invoke.mockResolvedValue({ data: { success: true, emailSent: false }, error: null });
    expect((await emailUnitInvoice(invoice(), unit(), null, TENANT)).sent).toBe(false);
  });
});

describe('savedInvoiceId', () => {
  it('returns an id nothing is saving as it is', async () => {
    expect(await savedInvoiceId('already-saved')).toBe('already-saved');
  });
});
