import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

// notify-signup is public: the demo form posts to it from a logged-out page.
// It is loaded here with a stand-in Deno and network to check that it caps
// how much it sends to the team inbox and escapes what the request supplies.

const SB = 'https://sb.test';
const env: Record<string, string> = {
  SUPABASE_URL: SB,
  SUPABASE_SERVICE_ROLE_KEY: 'service-key-0123456789abcdef',
  MAILJET_API_KEY: 'mj',
  MAILJET_SECRET_KEY: 'mj-secret',
  CONTACT_INBOX: 'team@inbox.test',
};

type Handler = (req: Request) => Promise<Response>;
let notify: Handler;

/** Rows the stand-in signup_notifications table holds. */
let rows: Array<{ type: string; ip_hash: string | null }>;
let mails: Array<{ To: Array<{ Email: string }>; Subject: string; HTMLPart: string; TextPart: string }>;

const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  if (url.origin === SB && url.pathname === '/rest/v1/signup_notifications') {
    if (init?.method === 'POST') {
      rows.push(JSON.parse(String(init.body)));
      return new Response(null, { status: 201 });
    }
    const ip = url.searchParams.get('ip_hash')?.replace(/^eq\./, '');
    const n = rows.filter(r => !ip || r.ip_hash === ip).length;
    return new Response(null, { status: 200, headers: { 'content-range': `*/${n}` } });
  }
  if (url.hostname === 'api.mailjet.com') {
    mails.push(JSON.parse(String(init?.body)).Messages[0]);
    return new Response('{}', { status: 200 });
  }
  throw new Error(`Unexpected request: ${url}`);
});

const demo = (extra: Record<string, unknown> = {}) => ({
  type: 'demo', name: 'Pat Lee', email: 'pat@example.com', condo_name: 'Maple Court', unit_count: 12,
  member_type: 'board_member', subscription_interest: 'compliance_pro', ...extra,
});

const post = (body: unknown, ip = '203.0.113.7') =>
  notify(new Request('https://sb.test/functions/v1/notify-signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  }));

beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (k: string) => env[k] }, serve: (h: Handler) => { notify = h; } });
  vi.stubGlobal('fetch', fakeFetch);
  // Loaded by name so the app's type check does not try to compile Deno code.
  const name = 'notify-signup';
  await import(`../../supabase/functions/${name}/index.ts`);
});

afterAll(() => vi.unstubAllGlobals());

beforeEach(() => { rows = []; mails = []; });

describe('notify-signup', () => {
  it('sends a demo signup to the team inbox only, and records it', async () => {
    const res = await post(demo());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });
    expect(mails).toHaveLength(1);
    expect(mails[0].To).toEqual([{ Email: 'team@inbox.test' }]);
    expect(mails[0].HTMLPart).toContain('Board Member');
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('demo');
    expect(rows[0].ip_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('escapes everything the request supplies', async () => {
    await post(demo({
      name: '<img src=x onerror=alert(1)>',
      email: 'a@b.co"><script>x</script>',
      condo_name: '<b>bold</b>',
      member_type: '<i>role</i>',
      subscription_interest: '<u>tier</u>',
    }));
    const html = mails[0].HTMLPart;
    for (const raw of ['<img', '<script', '<b>bold', '<i>role', '<u>tier', 'co">']) expect(html).not.toContain(raw);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('mailto:a@b.co&quot;&gt;');
  });

  it('escapes the building notification too', async () => {
    await post({ type: 'building', name: '<h1>Tower</h1>', email: 'o@example.com', plan: '<a href=x>plan</a>' });
    expect(mails[0].HTMLPart).not.toContain('<h1>');
    expect(mails[0].HTMLPart).not.toContain('<a href=x>');
    expect(mails[0].HTMLPart).toContain('&lt;h1&gt;Tower&lt;/h1&gt;');
  });

  it('keeps each field to one short line', async () => {
    await post(demo({ name: 'A'.repeat(5000), condo_name: 'line one\nline two' }));
    expect(mails[0].Subject.length).toBeLessThan(250);
    expect(mails[0].TextPart).toContain('Community: line one line two');
  });

  it('stops one caller after five in an hour, without mailing or recording more', async () => {
    for (let i = 0; i < 5; i++) expect((await post(demo())).status).toBe(200);
    const res = await post(demo());
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ sent: false, error: 'rate_limited' });
    expect(mails).toHaveLength(5);
    expect(rows).toHaveLength(5);
    // Someone else is still let through.
    expect((await post(demo(), '198.51.100.9')).status).toBe(200);
  });

  it('stops everyone after thirty in an hour, however many callers there are', async () => {
    for (let i = 0; i < 30; i++) expect((await post(demo(), `10.0.0.${i}`)).status).toBe(200);
    expect((await post(demo(), '10.0.1.1')).status).toBe(429);
    expect(mails).toHaveLength(30);
  });

  it('rejects an invalid request without counting it', async () => {
    expect((await post({ type: 'other' })).status).toBe(400);
    expect((await post({ type: 'demo', name: '', email: '' })).status).toBe(400);
    expect(rows).toHaveLength(0);
    expect(mails).toHaveLength(0);
  });
});
