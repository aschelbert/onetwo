import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

// The webhook runs on Deno. It is loaded here with a stand-in Deno and network.
// The event is unsigned, so the webhook confirms it by fetching it from Stripe,
// which the stand-in network answers.

const SB = 'https://sb.test';
const TENANT = '11111111-1111-4111-8111-111111111111';
const env: Record<string, string> = { SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: 'service-key', STRIPE_SECRET_KEY: 'sk_test_x' };

type Handler = (req: Request) => Promise<Response>;
let webhook: Handler;
let rpcs: Array<{ fn: string; args: Record<string, unknown> }>;
let reconcileResult: unknown;
let event: unknown;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  if (url.hostname === 'api.stripe.com' && url.pathname.startsWith('/v1/events/')) return json(event);
  if (url.origin === SB && url.pathname.startsWith('/rest/v1/rpc/')) {
    const fn = url.pathname.split('/').pop()!;
    rpcs.push({ fn, args: JSON.parse(String(init?.body)) });
    return json(fn === 'reconcile_unit_payment' ? reconcileResult : { applied: [], toCredit: 125, total: 125 });
  }
  throw new Error(`Unexpected request: ${url}`);
});

const checkout = (over: Record<string, unknown> = {}) => ({
  id: 'evt_1',
  type: 'checkout.session.completed',
  data: { object: {
    id: 'cs_old_1', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_1', amount_total: 12500,
    metadata: { invoice_id: '33333333-3333-4333-8333-333333333333', unit_number: '4B', tenant_id: TENANT, type: 'fee' },
    ...over,
  } },
});

const deliver = () => webhook(new Request('https://sb.test/functions/v1/stripe-webhook', {
  method: 'POST', headers: { 'stripe-signature': 't=1,v1=bad' }, body: JSON.stringify({ id: 'evt_1' }),
}));

beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (k: string) => env[k] }, serve: (h: Handler) => { webhook = h; } });
  vi.stubGlobal('fetch', fakeFetch);
  const name = 'stripe-webhook';
  await import(`../../supabase/functions/${name}/index.ts`);
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => { rpcs = []; event = checkout(); });

describe('stripe-webhook: an invoice payment that matches no invoice', () => {
  it('posts nothing extra when the invoice took the payment', async () => {
    reconcileResult = { invoice_id: 'x', amount: 125, gl_entry_id: 'GL1' };
    expect((await deliver()).status).toBe(200);
    expect(rpcs.map(r => r.fn)).toEqual(['reconcile_unit_payment']);
  });

  it('posts a payment from an older link to the unit, keyed on the session', async () => {
    reconcileResult = { error: 'no invoice for this checkout session', session: 'cs_old_1' };
    await deliver();
    expect(rpcs.map(r => r.fn)).toEqual(['reconcile_unit_payment', 'record_unit_payment']);
    expect(rpcs[1].args).toEqual({ p_tenant_id: TENANT, p_unit_number: '4B', p_amount: 125, p_method: 'stripe', p_reference: 'stripe:cs_old_1' });
  });

  it('posts a payment on an invoice that was already settled to the unit', async () => {
    reconcileResult = { already: true, status: 'paid', invoice_id: 'x' };
    await deliver();
    expect(rpcs.map(r => r.fn)).toEqual(['reconcile_unit_payment', 'record_unit_payment']);
  });

  it('does not post a checkout that was not paid', async () => {
    reconcileResult = { error: 'no invoice for this checkout session' };
    event = checkout({ payment_status: 'unpaid' });
    await deliver();
    expect(rpcs.map(r => r.fn)).toEqual(['reconcile_unit_payment']);
  });
});
