import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { buildingKey, reservedTenantId } from '../../supabase/functions/_shared/checkoutBuilding';

// The edge functions run on Deno. Here they are loaded with a stand-in Deno
// and a stand-in network that plays Supabase and Chargebee, so the tests can
// see exactly what each request asks Chargebee to do.

const SB = 'https://sb.test';
const CB = 'https://getonetwo-test.chargebee.com';
const env: Record<string, string> = {
  SUPABASE_URL: SB,
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  CHARGEBEE_SITE: 'getonetwo-test',
  CHARGEBEE_API_KEY: 'test_secret_key',
  CHARGEBEE_WEBHOOK_USER: 'onetwo',
  CHARGEBEE_WEBHOOK_PASS: 'hook-pass',
};

type Handler = (req: Request) => Promise<Response>;
const handlers: Handler[] = [];
let intentFn: Handler;
let completeFn: Handler;
let webhookFn: Handler;

interface Intent { id: string; status: string; amount: number; currency_code: string; expires_at: number }
interface Sub { id: string; status: string; customer_id: string; params: Record<string, string>; trial_end?: number }

let world: {
  trialDays: number;
  users: Record<string, { id: string; email: string }>;
  ownedBuildings: Array<{ user_id: string; tenants: { id: string; name: string; address: { street: string; zip: string } } }>;
  tenants: string[];
  pending: Array<{ id: string; chargebee_customer_id: string; user_id: string; payload: Record<string, unknown> }>;
  intents: Record<string, Intent>;
  customers: Record<string, Record<string, string>>;
  subs: Sub[];
  idempotent: Record<string, Sub>;
  /** Make the next subscription call fail with this Chargebee error. */
  failSubscription: { status: number; body: Record<string, unknown> } | null;
  events: Record<string, { status: string }>;
  subscriptionRows: Record<string, { tenant_id: string; status: string }>;
  rpc: Array<{ fn: string; args: Record<string, unknown> }>;
  writes: Array<{ method: string; path: string; query: string; body: unknown }>;
};
let cbCalls: Array<{ method: string; path: string; params: Record<string, string>; auth: string; idem: string | null }>;

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const now = () => Math.floor(Date.now() / 1000);

const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const method = init?.method || 'GET';
  const headers = new Headers(init?.headers);
  const eq = (k: string) => (url.searchParams.get(k) || '').replace(/^eq\./, '');

  // ── Chargebee ──
  if (url.origin === CB) {
    const path = url.pathname.replace('/api/v2/', '');
    const params = Object.fromEntries(method === 'GET' ? url.searchParams : new URLSearchParams(String(init?.body ?? '')));
    cbCalls.push({ method, path, params, auth: headers.get('Authorization') || '', idem: headers.get('chargebee-idempotency-key') });

    if (path === 'payment_intents' && method === 'POST') {
      const id = `pi_${Object.keys(world.intents).length + 1}`;
      world.intents[id] = { id, status: 'inited', amount: Number(params.amount), currency_code: params.currency_code, expires_at: now() + 1800 };
      return json({ payment_intent: world.intents[id] });
    }
    const pi = path.match(/^payment_intents\/([^/]+)$/);
    if (pi) {
      const intent = world.intents[pi[1]];
      if (!intent) return json({ message: 'not found' }, 404);
      if (method === 'POST') Object.assign(intent, { amount: Number(params.amount), currency_code: params.currency_code });
      return json({ payment_intent: intent });
    }
    if (path === 'customers' && method === 'POST') {
      if (world.customers[params.id]) return json({ message: `The value ${params.id} is already present.`, type: 'invalid_request' }, 400);
      world.customers[params.id] = params;
      return json({ customer: { id: params.id } });
    }
    const billing = path.match(/^customers\/([^/]+)\/update_billing_info$/);
    if (billing) { Object.assign(world.customers[billing[1]], params); return json({ customer: { id: billing[1] } }); }
    const cust = path.match(/^customers\/([^/]+)$/);
    if (cust && method === 'POST') { Object.assign(world.customers[cust[1]], params); return json({ customer: { id: cust[1] } }); }
    if (path === 'subscriptions' && method === 'GET') {
      return json({ list: world.subs.filter(s => s.customer_id === params['customer_id[is]']).map(subscription => ({ subscription })) });
    }
    const create = path.match(/^customers\/([^/]+)\/subscription_for_items$/);
    if (create) {
      const key = headers.get('chargebee-idempotency-key') || '';
      if (key && world.idempotent[key]) return json({ subscription: world.idempotent[key] }, 200, { 'chargebee-idempotency-replayed': 'true' });
      if (world.failSubscription) { const f = world.failSubscription; world.failSubscription = null; return json(f.body, f.status); }
      const intent = world.intents[params['payment_intent[id]']];
      if (!intent || intent.status !== 'authorized') return json({ message: 'Payment intent is not authorized', type: 'invalid_request' }, 400);
      intent.status = 'consumed';
      const sub: Sub = {
        id: `sub_${world.subs.length + 1}`, status: params.trial_end === '0' ? 'active' : 'in_trial',
        customer_id: create[1], params, trial_end: Number(params.trial_end) || undefined,
      };
      world.subs.push(sub);
      if (key) world.idempotent[key] = sub;
      return json({ subscription: sub });
    }
    throw new Error(`Unexpected Chargebee request: ${method} ${path}`);
  }

  // ── Supabase ──
  if (url.origin === SB) {
    const p = url.pathname;
    if (p === '/auth/v1/user') {
      const user = world.users[(headers.get('Authorization') || '').replace(/^Bearer /, '')];
      return user ? json(user) : json({ msg: 'invalid token' }, 401);
    }
    if (p === '/rest/v1/rpc/get_trial_days') return json(world.trialDays);
    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.replace('/rest/v1/rpc/', '');
      world.rpc.push({ fn, args: JSON.parse(String(init?.body ?? '{}')) });
      if (fn === 'provision_tenant') return json({ tenant_id: 'tenant-new', subdomain: 'example1700', plan: 'facilities', trial_ends_at: null });
      return json({ ok: true });
    }
    const table = p.replace('/rest/v1/', '');
    if (method !== 'GET') world.writes.push({ method, path: table, query: url.search, body: init?.body ? JSON.parse(String(init.body)) : null });

    if (table === 'tenant_users' && method === 'GET') return json(world.ownedBuildings.filter(o => o.user_id === eq('user_id')));
    if (table === 'tenants' && method === 'GET') return json(world.tenants.includes(eq('id')) ? [{ id: eq('id') }] : []);
    if (table === 'pending_checkouts') {
      if (method === 'DELETE') { world.pending = world.pending.filter(r => r.chargebee_customer_id !== eq('chargebee_customer_id')); return new Response(null, { status: 204 }); }
      if (method === 'POST') { world.pending.push({ id: `p${world.pending.length + 1}`, ...JSON.parse(String(init?.body)) }); return new Response(null, { status: 201 }); }
      const row = world.pending.find(r => r.chargebee_customer_id === eq('chargebee_customer_id'));
      return row ? json(row) : json({}, 406);
    }
    if (table === 'chargebee_webhook_events') {
      if (method === 'POST') {
        const body = JSON.parse(String(init?.body));
        if (world.events[body.event_id]) return json({ message: 'duplicate key' }, 409);
        world.events[body.event_id] = { status: body.status };
        return new Response(null, { status: 201 });
      }
      if (method === 'PATCH') {
        const body = JSON.parse(String(init?.body));
        if (body.status && world.events[eq('event_id')]) world.events[eq('event_id')].status = body.status;
        return new Response(null, { status: 204 });
      }
      if (method === 'DELETE') { delete world.events[eq('event_id')]; return new Response(null, { status: 204 }); }
      const ev = world.events[eq('event_id')];
      return ev ? json(ev) : json({}, 406);
    }
    if (table === 'subscriptions' && method === 'GET') {
      const row = world.subscriptionRows[eq('chargebee_subscription_id')];
      return row ? json(row) : json({}, 406);
    }
    if (p.startsWith('/functions/v1/')) return json({ ok: true });
    return method === 'GET' ? json({}, 406) : json([{}], 201);
  }
  throw new Error(`Unexpected request: ${url}`);
});

const post = (handler: Handler, body: unknown, token = 'anon-key') =>
  handler(new Request(`${SB}/functions/v1/fn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }));

beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (k: string) => env[k] }, serve: (h: Handler) => { handlers.push(h); } });
  vi.stubGlobal('fetch', fakeFetch);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // Loaded by name so the app's type check does not try to compile Deno code.
  const load = async (name: string): Promise<Handler> => {
    await import(`../../supabase/functions/${name}/index.ts`);
    return handlers[handlers.length - 1];
  };
  intentFn = await load('checkout-intent');
  completeFn = await load('checkout-complete');
  webhookFn = await load('chargebee-webhook');
});

afterAll(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

beforeEach(() => {
  cbCalls = [];
  world = {
    trialDays: 21,
    users: { 'dana-token': { id: 'user-dana', email: 'dana@example.com' } },
    ownedBuildings: [], tenants: [], pending: [], intents: {}, customers: {}, subs: [], idempotent: {},
    failSubscription: null, events: {}, subscriptionRows: {}, rpc: [], writes: [],
  };
});

const building = { name: '1700 Example St Condominium', address: { street: '1700 Example St NW', city: 'Washington', state: 'DC', zip: '20009' } };
const order = { plan: 'facilities', period: 'monthly', addons: ['on_call', 'pm_seat'] };
// Plus Facilities 279 + On Call 499 + PM Seat 79
const ORDER_CENTS = 85700;

// ═══════════════════════════════════════════════════════════════
describe('checkout-intent', () => {
  it('creates a $0 intent during a trial and reports the totals it worked out', async () => {
    const res = await post(intentFn, order);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ trialDays: 21, totalCents: ORDER_CENTS, dueTodayCents: 0 });
    expect(body.paymentIntent).toMatchObject({ id: 'pi_1', amount: 0, status: 'inited' });
    expect(cbCalls).toHaveLength(1);
    expect(cbCalls[0]).toMatchObject({ method: 'POST', path: 'payment_intents', params: { amount: '0', currency_code: 'USD' } });
  });

  it('keeps the API key on the server: sent to Chargebee, never returned', async () => {
    const res = await post(intentFn, order);
    expect(cbCalls[0].auth).toBe('Basic ' + btoa('test_secret_key:'));
    expect(JSON.stringify(await res.json())).not.toContain('test_secret_key');
  });

  it('with the trial turned off, the intent is for the first period', async () => {
    world.trialDays = 0;
    const body = await (await post(intentFn, { ...order, period: 'annual' })).json();
    expect(body.dueTodayCents).toBe(ORDER_CENTS * 10);
    expect(body.paymentIntent.amount).toBe(ORDER_CENTS * 10);
  });

  it('ignores an amount sent by the browser', async () => {
    world.trialDays = 0;
    const body = await (await post(intentFn, { ...order, amount: 1, dueTodayCents: 1, totalCents: 1 })).json();
    expect(body.paymentIntent.amount).toBe(ORDER_CENTS);
  });

  it.each([
    [{ plan: 'platinum', period: 'monthly', addons: [] }],
    [{ plan: 'facilities', period: 'daily', addons: [] }],
    [{ plan: 'facilities', period: 'monthly', addons: ['Setup-USD'] }],
  ])('refuses ids it does not know, without calling Chargebee: %j', async (bad) => {
    const res = await post(intentFn, bad);
    expect(res.status).toBe(400);
    expect(cbCalls).toHaveLength(0);
  });

  it('during a trial, changing the order leaves the intent untouched', async () => {
    const first = await (await post(intentFn, { plan: 'self_managed', period: 'monthly', addons: [] })).json();
    cbCalls = [];
    const second = await (await post(intentFn, { ...order, paymentIntentId: first.paymentIntent.id })).json();
    expect(second.paymentIntent.id).toBe(first.paymentIntent.id);
    expect(second.totalCents).toBe(ORDER_CENTS);
    // Looked up, but neither updated nor replaced
    expect(cbCalls.map(c => c.method)).toEqual(['GET']);
  });

  it('with no trial, changing the order updates the same intent to the new amount', async () => {
    world.trialDays = 0;
    const first = await (await post(intentFn, { plan: 'self_managed', period: 'monthly', addons: [] })).json();
    expect(first.paymentIntent.amount).toBe(17900);
    const second = await (await post(intentFn, { ...order, paymentIntentId: first.paymentIntent.id })).json();
    expect(second.paymentIntent).toMatchObject({ id: first.paymentIntent.id, amount: ORDER_CENTS });
    expect(world.intents[first.paymentIntent.id].amount).toBe(ORDER_CENTS);
    expect(Object.keys(world.intents)).toHaveLength(1);
  });

  it('replaces an intent that has expired or been used', async () => {
    const first = await (await post(intentFn, order)).json();
    world.intents[first.paymentIntent.id].expires_at = now() - 5;
    const second = await (await post(intentFn, { ...order, paymentIntentId: first.paymentIntent.id })).json();
    expect(second.paymentIntent.id).not.toBe(first.paymentIntent.id);

    world.intents[second.paymentIntent.id].status = 'consumed';
    const third = await (await post(intentFn, { ...order, paymentIntentId: second.paymentIntent.id })).json();
    expect(third.paymentIntent.id).not.toBe(second.paymentIntent.id);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('checkout-complete', () => {
  /** An intent the payment fields have authorised, for the amount due today. */
  const authorised = (amount = 0) => {
    const id = `pi_${Object.keys(world.intents).length + 1}`;
    world.intents[id] = { id, status: 'authorized', amount, currency_code: 'USD', expires_at: now() + 1800 };
    return id;
  };
  const request = (extra: Record<string, unknown> = {}) => ({
    ...order, building, firstName: 'Dana', lastName: 'Lee', paymentIntentId: authorised(), ...extra,
  });
  const customerId = async () => `cb_tenant_${await reservedTenantId('user-dana', buildingKey(building))}`;
  const created = () => cbCalls.filter(c => c.path.endsWith('/subscription_for_items'));

  it('requires a signed-in user', async () => {
    const res = await post(completeFn, request(), 'anon-key');
    expect(res.status).toBe(401);
    expect(cbCalls).toHaveLength(0);
  });

  it('creates the subscription with the right items, a 21-day trial and the intent', async () => {
    const body = request();
    const res = await post(completeFn, body, 'dana-token');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, subscriptionId: 'sub_1', status: 'in_trial' });

    const [call] = created();
    expect(call.path).toBe(`customers/${await customerId()}/subscription_for_items`);
    expect(call.params).toMatchObject({
      'subscription_items[item_price_id][0]': 'Plus-Facilities-USD-Monthly',
      'subscription_items[item_price_id][1]': 'On-Call-USD-Monthly',
      'subscription_items[item_price_id][2]': 'PM-Seat-USD-Monthly',
      'subscription_items[quantity][0]': '1',
      'payment_intent[id]': body.paymentIntentId,
      cf_tenant_id: 'pending',
    });
    const trialEnd = Number(call.params.trial_end);
    expect(Math.abs(trialEnd - (now() + 21 * 86400))).toBeLessThan(5);
    // No prices are sent: Chargebee bills from its own catalog
    expect(Object.keys(call.params).some(k => /price\]|amount/.test(k) && !k.includes('item_price_id'))).toBe(false);
    expect(call.idem).toBe(`checkout-${body.paymentIntentId}`);
  });

  it('gives Chargebee the name, email and billing address typed on the page, once', async () => {
    await post(completeFn, request(), 'dana-token');
    expect(world.customers[await customerId()]).toMatchObject({
      first_name: 'Dana', last_name: 'Lee', email: 'dana@example.com', company: '1700 Example St Condominium',
      'billing_address[first_name]': 'Dana',
      'billing_address[line1]': '1700 Example St NW',
      'billing_address[city]': 'Washington',
      'billing_address[state_code]': 'DC',
      'billing_address[zip]': '20009',
      'billing_address[country]': 'US',
    });
  });

  it('uses the account email, not one sent in the request', async () => {
    await post(completeFn, request({ email: 'attacker@example.com' }), 'dana-token');
    expect(world.customers[await customerId()].email).toBe('dana@example.com');
  });

  it('saves the building for the webhook to provision', async () => {
    await post(completeFn, request({ attribution: { utm_source: 'reddit', nonsense: 'x' } }), 'dana-token');
    expect(world.pending).toHaveLength(1);
    expect(world.pending[0]).toMatchObject({ chargebee_customer_id: await customerId(), user_id: 'user-dana' });
    expect(world.pending[0].payload).toMatchObject({
      name: '1700 Example St Condominium', address: building.address, plan: 'facilities', userId: 'user-dana',
      contactEmail: 'dana@example.com', firstName: 'Dana', lastName: 'Lee',
      // No board seat and no unit count are asked at signup any more
      seatUnconfirmed: true, totalUnits: 0,
      attribution: { utm_source: 'reddit' },
    });
    expect(world.pending[0].payload).not.toHaveProperty('boardTitle');
  });

  it('with the trial turned off, starts the subscription at once', async () => {
    world.trialDays = 0;
    const res = await post(completeFn, request({ paymentIntentId: authorised(ORDER_CENTS) }), 'dana-token');
    expect(await res.json()).toMatchObject({ ok: true, status: 'active' });
    expect(created()[0].params.trial_end).toBe('0');
  });

  it('a double submit creates exactly one subscription', async () => {
    const body = request();
    const [a, b] = await Promise.all([post(completeFn, body, 'dana-token'), post(completeFn, body, 'dana-token')]);
    expect((await a.json()).ok).toBe(true);
    expect((await b.json()).ok).toBe(true);
    expect(world.subs).toHaveLength(1);
    expect(Object.keys(world.customers)).toHaveLength(1);
    expect(world.pending).toHaveLength(1);
  });

  it('a retry after the first answer was lost finds the subscription and stops', async () => {
    const body = request();
    await post(completeFn, body, 'dana-token');
    cbCalls = [];
    const again = await post(completeFn, body, 'dana-token');
    expect(await again.json()).toMatchObject({ ok: true, already: true, subscriptionId: 'sub_1' });
    expect(created()).toHaveLength(0);
    expect(world.subs).toHaveLength(1);
  });

  it.each([
    ['a plan that does not exist', { plan: 'platinum' }],
    ['an add-on that does not exist', { addons: ['on_call', 'Setup-USD'] }],
    ['a Chargebee price id in place of an add-on', { addons: ['PM-Seat-USD-Monthly'] }],
    ['a missing street', { building: { ...building, address: { ...building.address, street: '' } } }],
    ['a bad ZIP', { building: { ...building, address: { ...building.address, zip: '2000' } } }],
    ['no last name', { lastName: '' }],
    ['no payment intent', { paymentIntentId: '' }],
  ])('refuses %s before touching Chargebee', async (_what, extra) => {
    const res = await post(completeFn, request(extra), 'dana-token');
    expect(res.status).toBe(400);
    expect(world.subs).toHaveLength(0);
    expect(Object.keys(world.customers)).toHaveLength(0);
  });

  it('refuses an intent that was never authorised', async () => {
    const id = authorised();
    world.intents[id].status = 'inited';
    const res = await post(completeFn, request({ paymentIntentId: id }), 'dana-token');
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('payment_intent_not_authorized');
    expect(world.subs).toHaveLength(0);
  });

  it('refuses an intent authorised for a different amount than the order', async () => {
    // Authorised for Self-Managed with no trial, then the order was swapped for a dearer one
    world.trialDays = 0;
    const res = await post(completeFn, request({ paymentIntentId: authorised(17900) }), 'dana-token');
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('payment_intent_amount');
    expect(world.subs).toHaveLength(0);
  });

  it('refuses a building the account already has', async () => {
    world.ownedBuildings = [{ user_id: 'user-dana', tenants: { id: 't-old', name: 'Old name', address: { street: '1700 example st nw', zip: '20009' } } }];
    const res = await post(completeFn, request(), 'dana-token');
    expect(res.status).toBe(409);
    expect((await res.json()).field).toBe('street');
    expect(world.subs).toHaveLength(0);
  });

  it('reports a declined payment as one the visitor can retry', async () => {
    world.trialDays = 0;
    world.failSubscription = { status: 400, body: { type: 'payment', api_error_code: 'payment_processing_failed', message: 'Insufficient funds.' } };
    const res = await post(completeFn, request({ paymentIntentId: authorised(ORDER_CENTS) }), 'dana-token');
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: 'payment_failed', error: 'Insufficient funds.' });
    expect(world.subs).toHaveLength(0);
  });

  it('a second attempt for the same building reuses its customer and updates its details', async () => {
    world.failSubscription = { status: 500, body: { message: 'boom' } };
    const first = await post(completeFn, request(), 'dana-token');
    expect(first.status).toBe(502);

    const res = await post(completeFn, request({ firstName: 'Dana', lastName: 'Lee-Ortiz' }), 'dana-token');
    expect((await res.json()).ok).toBe(true);
    expect(Object.keys(world.customers)).toHaveLength(1);
    expect(world.customers[await customerId()].last_name).toBe('Lee-Ortiz');
    expect(world.pending).toHaveLength(1);
    expect(world.subs).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('chargebee-webhook', () => {
  const hook = (event: Record<string, unknown>, auth = 'Basic ' + btoa('onetwo:hook-pass')) =>
    webhookFn(new Request(`${SB}/functions/v1/chargebee-webhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify(event),
    }));
  const items = [
    { item_price_id: 'Plus-Facilities-USD-Yearly' }, { item_price_id: 'On-Call-USD-Yearly' }, { item_price_id: 'PM-Seat-USD-Yearly' },
  ];
  const subscriptionEvent = (type: string, id = `ev_${type}`, extra: Record<string, unknown> = {}) => ({
    id, event_type: type, occurred_at: now(),
    content: {
      subscription: { id: 'sub_1', status: 'in_trial', trial_end: now() + 21 * 86400, subscription_items: items, cf_tenant_id: 'pending', ...extra },
      customer: { id: 'cb_tenant_abc', email: 'dana@example.com' },
    },
  });
  const rpc = (fn: string) => world.rpc.filter(r => r.fn === fn);

  it('refuses a caller without the webhook password', async () => {
    const res = await hook(subscriptionEvent('subscription_created'), 'Basic ' + btoa('onetwo:wrong'));
    expect(res.status).toBe(401);
    expect(world.rpc).toHaveLength(0);
    expect(Object.keys(world.events)).toHaveLength(0);
  });

  it('subscription_created provisions the building the checkout saved', async () => {
    world.pending = [{
      id: 'p1', chargebee_customer_id: 'cb_tenant_abc', user_id: 'user-dana',
      payload: { tenantId: 'abc', name: '1700 Example St Condominium', address: building.address, plan: 'facilities', userId: 'user-dana', contactEmail: 'dana@example.com', firstName: 'Dana', lastName: 'Lee', seatUnconfirmed: true, totalUnits: 0, adMeasurementOptOut: true },
    }];
    const res = await hook(subscriptionEvent('subscription_created'));
    expect(res.status).toBe(200);

    const [call] = rpc('provision_tenant');
    expect(call.args).toMatchObject({
      p_name: '1700 Example St Condominium', p_plan: 'facilities', p_user_id: 'user-dana', p_tenant_id: 'abc',
      p_on_call: true, p_pm_seat: true, p_billing_interval: 'annual',
      p_chargebee_customer_id: 'cb_tenant_abc', p_chargebee_subscription_id: 'sub_1', p_subdomain: null,
    });
    // The saved row is used once
    expect(world.pending).toHaveLength(0);
    expect(world.events.ev_subscription_created.status).toBe('success');
  });

  it('records the rate Chargebee bills, and leaves the board seat for the person to confirm', async () => {
    world.pending = [{
      id: 'p1', chargebee_customer_id: 'cb_tenant_abc', user_id: 'user-dana',
      payload: { tenantId: 'abc', name: 'B', address: {}, plan: 'facilities', userId: 'user-dana', contactEmail: 'dana@example.com', seatUnconfirmed: true, adMeasurementOptOut: true },
    }];
    await hook(subscriptionEvent('subscription_created'));
    const write = (path: string, method: string) => world.writes.find(w => w.path === path && w.method === method);
    // 279 + 499 + 79 a month, in cents
    expect(write('subscriptions', 'PATCH')?.body).toEqual({ monthly_rate: 85700 });
    expect(write('tenant_users', 'PATCH')).toMatchObject({ body: { board_title: null, role_key: null } });
    expect(write('tenant_users', 'PATCH')?.query).toContain('user_id=eq.user-dana');
    expect(write('board_members', 'DELETE')?.query).toContain('tenant_id=eq.tenant-new');
  });

  it('a signup from before this change keeps the seat it chose', async () => {
    world.pending = [{
      id: 'p1', chargebee_customer_id: 'cb_tenant_abc', user_id: 'user-dana',
      payload: { tenantId: 'abc', name: 'B', address: {}, plan: 'facilities', userId: 'user-dana', boardTitle: 'Treasurer', adMeasurementOptOut: true },
    }];
    await hook(subscriptionEvent('subscription_created'));
    expect(rpc('provision_tenant')[0].args.p_board_title).toBe('Treasurer');
    expect(world.writes.some(w => w.path === 'tenant_users')).toBe(false);
    expect(world.writes.some(w => w.path === 'board_members')).toBe(false);
  });

  it('is idempotent: the same event delivered twice provisions once', async () => {
    world.pending = [{
      id: 'p1', chargebee_customer_id: 'cb_tenant_abc', user_id: 'user-dana',
      payload: { tenantId: 'abc', name: 'B', address: {}, plan: 'facilities', userId: 'user-dana', adMeasurementOptOut: true },
    }];
    await hook(subscriptionEvent('subscription_created', 'ev_same'));
    const second = await hook(subscriptionEvent('subscription_created', 'ev_same'));
    expect(await second.json()).toMatchObject({ received: true, duplicate: true });
    expect(rpc('provision_tenant')).toHaveLength(1);
  });

  it('subscription_created with no saved building does nothing, and says so', async () => {
    const res = await hook(subscriptionEvent('subscription_created'));
    expect(res.status).toBe(200);
    expect(rpc('provision_tenant')).toHaveLength(0);
  });

  describe('events for a building that exists', () => {
    beforeEach(() => { world.subscriptionRows.sub_1 = { tenant_id: 'tenant-1', status: 'trialing' }; });
    const patched = (path: string) => world.writes.filter(w => w.method === 'PATCH' && w.path === path).map(w => w.body);

    it('subscription_activated marks the trial converted, at the billed rate', async () => {
      const res = await hook(subscriptionEvent('subscription_activated', 'ev_act', { status: 'active' }));
      expect(res.status).toBe(200);
      expect(patched('subscriptions').some(b => (b as { monthly_rate?: number }).monthly_rate === 85700)).toBe(true);
      expect(world.events.ev_act.status).toBe('success');
    });

    it('payment_failed marks the subscription past due', async () => {
      const res = await hook({
        id: 'ev_fail', event_type: 'payment_failed', occurred_at: now(),
        content: { subscription: { id: 'sub_1', status: 'active', subscription_items: items }, customer: { id: 'cb_tenant_abc' }, invoice: { id: 'inv_1', total: 85700, status: 'payment_due' }, transaction: { error_text: 'declined' } },
      });
      expect(res.status).toBe(200);
      expect(JSON.stringify(patched('subscriptions'))).toContain('past_due');
      expect(world.events.ev_fail.status).toBe('success');
    });

    it('subscription_cancelled at the end of a trial marks the trial expired', async () => {
      const res = await hook(subscriptionEvent('subscription_cancelled', 'ev_cancel', { status: 'cancelled', cancel_reason: 'no_card' }));
      expect(res.status).toBe(200);
      expect(rpc('mark_trial_expired')).toEqual([{ fn: 'mark_trial_expired', args: { p_subscription_id: 'sub_1' } }]);
    });

    it('subscription_cancelled by a paying building cancels it', async () => {
      world.subscriptionRows.sub_1 = { tenant_id: 'tenant-1', status: 'active' };
      await hook(subscriptionEvent('subscription_cancelled', 'ev_cancel2', { status: 'cancelled', trial_end: undefined }));
      expect(rpc('mark_trial_expired')).toHaveLength(0);
      expect(JSON.stringify(patched('subscriptions'))).toContain('cancel');
    });

    it('subscription_trial_end_reminder is logged against the building', async () => {
      const res = await hook(subscriptionEvent('subscription_trial_end_reminder', 'ev_remind'));
      expect(res.status).toBe(200);
      expect(world.writes.some(w => w.path === 'audit_log' && w.method === 'POST')).toBe(true);
      expect(world.events.ev_remind.status).toBe('success');
    });
  });
});
