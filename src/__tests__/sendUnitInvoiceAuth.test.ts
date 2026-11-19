import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

// The edge functions run on Deno. Here they are loaded with a stand-in Deno
// and a stand-in network, so the tests can see exactly which outside services
// a request reaches before it is refused.

const SB = 'https://sb.test';
const SERVICE_KEY = 'service-key';
const TENANT = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT = '22222222-2222-4222-8222-222222222222';
const env: Record<string, string> = {
  SUPABASE_URL: SB,
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  STRIPE_SECRET_KEY: 'sk_test_x',
  MAILJET_API_KEY: 'mj',
  MAILJET_SECRET_KEY: 'mj-secret',
};

type Handler = (req: Request) => Promise<Response>;
const handlers: Handler[] = [];
let sendInvoice: Handler;
let trialReminder: Handler;

/** What the stand-in database and auth server hold for the current test. */
let world: {
  users: Record<string, { id: string }>;
  memberships: Array<{ user_id: string; tenant_id: string; role: string; is_account_owner?: boolean; status?: string }>;
  stripeConnectId: string | null;
};
let calls: Array<{ url: string; method: string; body: string }>;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const headers = new Headers(init?.headers);
  calls.push({ url: url.toString(), method: init?.method || 'GET', body: String(init?.body ?? '') });
  const eq = (k: string) => (url.searchParams.get(k) || '').replace(/^eq\./, '');

  if (url.origin === SB && url.pathname === '/auth/v1/user') {
    const user = world.users[(headers.get('Authorization') || '').replace(/^Bearer /, '')];
    return user ? json(user) : json({ msg: 'invalid token' }, 401);
  }
  if (url.origin === SB && url.pathname === '/rest/v1/tenant_users') {
    return json(world.memberships.filter(m =>
      m.user_id === eq('user_id')
      && (!url.searchParams.has('tenant_id') || m.tenant_id === eq('tenant_id'))
      && (!url.searchParams.has('status') || (m.status ?? 'active') === eq('status'))));
  }
  if (url.origin === SB && url.pathname === '/rest/v1/tenants') return json({ name: 'Maple Court' });
  if (url.origin === SB && url.pathname === '/rest/v1/financial_settings') return json({ stripe_connect_id: world.stripeConnectId });
  if (url.origin === SB && url.pathname === '/rest/v1/unit_invoices') return new Response(null, { status: 204 });
  if (url.origin === SB && url.pathname === '/rest/v1/subscriptions') return json({}, 406);
  if (url.hostname === 'api.stripe.com') return json({ id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1' });
  if (url.hostname === 'api.mailjet.com') return json({ Messages: [] });
  throw new Error(`Unexpected request: ${url}`);
});

const reached = (host: string) => calls.filter(c => new URL(c.url).hostname === host);

const invoiceBody = (extra: Record<string, unknown> = {}) => ({
  invoiceId: '33333333-3333-4333-8333-333333333333',
  unitNumber: '4B',
  ownerName: 'Pat Owner',
  ownerEmail: 'pat@example.com',
  amount: 125,
  description: 'Late Fee: March',
  type: 'fee',
  buildingName: 'Some Other Building',
  tenantId: TENANT,
  ...extra,
});

const post = (handler: Handler, body: unknown, token?: string) =>
  handler(new Request('https://sb.test/functions/v1/fn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }));

beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (k: string) => env[k] }, serve: (h: Handler) => { handlers.push(h); } });
  vi.stubGlobal('fetch', fakeFetch);
  // Loaded by name so the app's type check does not try to compile Deno code.
  const load = async (name: string): Promise<Handler> => {
    await import(`../../supabase/functions/${name}/index.ts`);
    return handlers[handlers.length - 1];
  };
  sendInvoice = await load('send-unit-invoice');
  trialReminder = await load('trial-reminder');
});

afterAll(() => vi.unstubAllGlobals());

beforeEach(() => {
  calls = [];
  world = {
    users: { 'board-token': { id: 'u-board' }, 'resident-token': { id: 'u-resident' }, 'outsider-token': { id: 'u-outsider' } },
    memberships: [
      { user_id: 'u-board', tenant_id: TENANT, role: 'board_member' },
      { user_id: 'u-resident', tenant_id: TENANT, role: 'resident' },
      { user_id: 'u-outsider', tenant_id: OTHER_TENANT, role: 'board_member' },
    ],
    stripeConnectId: 'acct_1234567890',
  };
});

describe('send-unit-invoice: who may send', () => {
  const expectNothingSent = () => {
    expect(reached('api.stripe.com')).toHaveLength(0);
    expect(reached('api.mailjet.com')).toHaveLength(0);
    expect(calls.filter(c => c.method !== 'GET')).toHaveLength(0);
  };

  it('refuses a request with no sign-in, even an empty one, before anything else', async () => {
    const res = await post(sendInvoice, {});
    expect(res.status).toBe(401);
    expectNothingSent();
  });

  it('refuses the public anon key used as a bearer token', async () => {
    const res = await post(sendInvoice, invoiceBody(), 'anon-key');
    expect(res.status).toBe(401);
    expectNothingSent();
  });

  it('refuses a resident of the building', async () => {
    const res = await post(sendInvoice, invoiceBody(), 'resident-token');
    expect(res.status).toBe(403);
    expectNothingSent();
  });

  it('refuses a board member of a different building', async () => {
    const res = await post(sendInvoice, invoiceBody(), 'outsider-token');
    expect(res.status).toBe(403);
    expectNothingSent();
  });

  it('refuses a board member whose membership is no longer active', async () => {
    world.memberships[0].status = 'removed';
    const res = await post(sendInvoice, invoiceBody(), 'board-token');
    expect(res.status).toBe(403);
    expectNothingSent();
  });

  it('refuses a tenantId that is not an id', async () => {
    const res = await post(sendInvoice, invoiceBody({ tenantId: `${TENANT}&role=eq.board_member` }), 'board-token');
    expect(res.status).toBe(400);
    expectNothingSent();
  });

  it('refuses a Stripe account that is not the building\'s own', async () => {
    const res = await post(sendInvoice, invoiceBody({ stripeConnectId: 'acct_someoneelse99' }), 'board-token');
    expect(res.status).toBe(403);
    expectNothingSent();
  });

  it('sends for a board member, under the building\'s real name and account', async () => {
    const res = await post(sendInvoice, invoiceBody({ stripeConnectId: 'acct_1234567890', description: 'Fee <b>now</b>' }), 'board-token');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, emailSent: true, stripeSessionId: 'cs_test_1' });

    const [stripe] = reached('api.stripe.com');
    expect(new URLSearchParams(stripe.body).get('metadata[tenant_id]')).toBe(TENANT);

    const patch = calls.find(c => c.method === 'PATCH')!;
    expect(new URL(patch.url).searchParams.get('tenant_id')).toBe(`eq.${TENANT}`);

    const message = JSON.parse(reached('api.mailjet.com')[0].body).Messages[0];
    expect(message.To[0].Email).toBe('pat@example.com');
    expect(message.From.Name).toBe('Maple Court');
    expect(message.HTMLPart).not.toContain('Some Other Building');
    expect(message.HTMLPart).toContain('Fee &lt;b&gt;now&lt;/b&gt;');
  });

  it('lets property managers and the account owner send too', async () => {
    world.memberships[0].role = 'property_manager';
    expect((await post(sendInvoice, invoiceBody(), 'board-token')).status).toBe(200);
    world.memberships[0] = { user_id: 'u-board', tenant_id: TENANT, role: 'resident', is_account_owner: true };
    expect((await post(sendInvoice, invoiceBody(), 'board-token')).status).toBe(200);
  });

  it('with no tenantId, uses the caller\'s only building and refuses when there are several', async () => {
    expect((await post(sendInvoice, invoiceBody({ tenantId: undefined }), 'board-token')).status).toBe(200);
    world.memberships.push({ user_id: 'u-board', tenant_id: OTHER_TENANT, role: 'board_member' });
    expect((await post(sendInvoice, invoiceBody({ tenantId: undefined }), 'board-token')).status).toBe(403);
  });
});

describe('trial-reminder: server-to-server only', () => {
  it('refuses callers without the service role key before reading anything', async () => {
    for (const token of [undefined, 'anon-key', 'board-token']) {
      const res = await post(trialReminder, { tenant_id: TENANT }, token);
      expect(res.status).toBe(401);
    }
    expect(calls).toHaveLength(0);
  });

  it('lets the webhook through with the service role key', async () => {
    const res = await post(trialReminder, { tenant_id: TENANT }, SERVICE_KEY);
    expect(res.status).toBe(404); // past the gate: the stand-in database has no such subscription
    expect(calls.some(c => c.url.includes('/rest/v1/subscriptions'))).toBe(true);
  });
});
