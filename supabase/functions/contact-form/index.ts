// supabase/functions/contact-form/index.ts
// The "Contact" panel on getonetwo.com posts here. Two emails go out through
// Mailjet: the message to the team inbox, and a short confirmation to the
// sender.
//
// The team inbox is the CONTACT_INBOX secret. It lives only on the server: it
// is never in the page, the JS bundle, this file, or any response, so it can't
// be read from the browser or the dev console.
//
// Called without a Supabase JWT (verify_jwt = false in config.toml), so it
// defends itself: a honeypot field, a minimum fill time, length limits, and
// rate limits per IP and per sender address. The confirmation never repeats
// what the sender typed, so the form can't be used to mail arbitrary text to
// someone else's address.

const MJ_API_KEY = Deno.env.get("MAILJET_API_KEY") || "";
const MJ_SECRET_KEY = Deno.env.get("MAILJET_SECRET_KEY") || "";
const INBOX = Deno.env.get("CONTACT_INBOX") || "";
const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const IP_SALT = Deno.env.get("CONTACT_IP_SALT") || SB_SERVICE_KEY.slice(-16);

const PUBLIC_REPLY_TO = "hello@getonetwo.com";
const FROM = { Email: "noreply@getonetwo.com", Name: "ONE two" };

const TOPICS: Record<string, string> = {
  demo: "See a demo",
  pricing: "Pricing and plans",
  switch: "Leaving a manager",
  owner: "I am a unit owner",
  other: "Something else",
};

const MAX_MESSAGE = 4000;
const MIN_FILL_MS = 2500;
const PER_IP_PER_HOUR = 5;
const PER_EMAIL_PER_HOUR = 3;

const ALLOWED_ORIGIN = /^https:\/\/((www|app)\.)?getonetwo\.com$|^https:\/\/[a-z0-9-]+\.vercel\.app$|^http:\/\/localhost(:\d+)?$/;

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN.test(origin) ? origin : "https://getonetwo.com",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function reply(req: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsFor(req), "Content-Type": "application/json" } });
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const serviceHeaders = { apikey: SB_SERVICE_KEY, Authorization: `Bearer ${SB_SERVICE_KEY}` };

/** Rows in contact_messages matching `filter` from the last hour. */
async function recentCount(filter: Record<string, string>): Promise<number> {
  const url = new URL(`${SB_URL}/rest/v1/contact_messages`);
  url.searchParams.set("select", "id");
  url.searchParams.set("created_at", `gte.${new Date(Date.now() - 3600_000).toISOString()}`);
  for (const [k, v] of Object.entries(filter)) url.searchParams.set(k, v);
  const res = await fetch(url, { method: "HEAD", headers: { ...serviceHeaders, Prefer: "count=exact" } });
  const range = res.headers.get("content-range") || "*/0";
  return Number(range.split("/")[1]) || 0;
}

async function insertMessage(row: Record<string, unknown>): Promise<string | null> {
  const res = await fetch(`${SB_URL}/rest/v1/contact_messages`, {
    method: "POST",
    headers: { ...serviceHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    console.error("contact_messages insert failed:", res.status, (await res.text()).slice(0, 200));
    return null;
  }
  const [saved] = await res.json();
  return saved?.id ?? null;
}

async function markDelivered(id: string): Promise<void> {
  await fetch(`${SB_URL}/rest/v1/contact_messages?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...serviceHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ delivered: true }),
  });
}

function shell(inner: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;color:#0D1B2E">
  <div style="font-family:Georgia,serif;font-size:22px;font-weight:700;margin-bottom:24px">ONE <span style="font-weight:400">two</span></div>
  ${inner}
  <p style="color:#8fa0b3;font-size:12px;margin-top:32px">ONE two · Washington, DC · getonetwo.com</p>
</div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });
  if (req.method !== "POST") return reply(req, { ok: false, error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(req, { ok: false, error: "Send JSON." }, 400);
  }

  const email = String(body.email ?? "").trim().slice(0, 254);
  const topicKey = String(body.topic ?? "");
  const message = String(body.message ?? "").trim();
  const honeypot = String(body.website ?? "");
  const elapsed = Number(body.elapsed_ms ?? 0);

  // Bots: answer as if it worked, send nothing.
  if (honeypot || elapsed < MIN_FILL_MS) return reply(req, { ok: true });

  const fieldErrors: Record<string, string> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fieldErrors.email = "That email looks incomplete. Check the part after the @.";
  if (!TOPICS[topicKey]) fieldErrors.topic = "Pick a topic.";
  if (message.length < 2) fieldErrors.message = "Add a sentence so we know where to start.";
  if (message.length > MAX_MESSAGE) fieldErrors.message = `Keep it under ${MAX_MESSAGE} characters.`;
  if (Object.keys(fieldErrors).length) return reply(req, { ok: false, fieldErrors }, 422);

  if (!MJ_API_KEY || !MJ_SECRET_KEY || !INBOX || !SB_URL || !SB_SERVICE_KEY) {
    console.error("contact-form is not configured: needs MAILJET_API_KEY, MAILJET_SECRET_KEY, CONTACT_INBOX");
    return reply(req, { ok: false, error: "unavailable" }, 503);
  }

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const ipHash = ip ? await sha256(`${IP_SALT}:${ip}`) : null;

  const [byIp, byEmail] = await Promise.all([
    ipHash ? recentCount({ ip_hash: `eq.${ipHash}` }) : Promise.resolve(0),
    recentCount({ email: `ilike.${email.replace(/[%_*]/g, "")}` }),
  ]);
  if (byIp >= PER_IP_PER_HOUR || byEmail >= PER_EMAIL_PER_HOUR) {
    return reply(req, { ok: false, error: "rate_limited" }, 429);
  }

  const topic = TOPICS[topicKey];
  const id = await insertMessage({
    email,
    topic,
    message,
    ip_hash: ipHash,
    user_agent: (req.headers.get("user-agent") || "").slice(0, 300),
  });

  const internalHtml = shell(`
  <p style="font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#155E75;margin:0 0 12px">New contact message</p>
  <table style="width:100%;border-collapse:collapse;background:#f4f6f9;border-radius:12px">
    <tr><td style="padding:10px 14px;color:#4b5a6b;font-size:13px;width:90px">From</td><td style="padding:10px 14px;font-size:14px;font-weight:600">${esc(email)}</td></tr>
    <tr><td style="padding:10px 14px;color:#4b5a6b;font-size:13px">Topic</td><td style="padding:10px 14px;font-size:14px;font-weight:600">${esc(topic)}</td></tr>
  </table>
  <div style="white-space:pre-wrap;font-size:15px;line-height:1.6;margin-top:20px;padding:16px;border:1px solid #e3e8ee;border-radius:12px">${esc(message)}</div>
  <p style="font-size:12px;color:#4b5a6b;margin-top:16px">Hitting reply goes to the sender from whichever address you reply from. Reply as ${PUBLIC_REPLY_TO} to keep your own address private.</p>`);

  const confirmHtml = shell(`
  <h1 style="font-family:Georgia,serif;font-weight:600;font-size:26px;margin:0 0 12px">We got your message.</h1>
  <p style="font-size:15px;line-height:1.6;margin:0 0 12px">Thanks for writing to ONE two about <strong>${esc(topic.toLowerCase())}</strong>. A person will reply within one business day.</p>
  <p style="font-size:15px;line-height:1.6;margin:0">If you need to add anything, just reply to this email.</p>`);

  const auth = btoa(`${MJ_API_KEY}:${MJ_SECRET_KEY}`);
  const res = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      Messages: [
        {
          From: FROM,
          To: [{ Email: INBOX }],
          ReplyTo: { Email: email },
          Subject: `Contact: ${topic} (${email})`,
          TextPart: `New contact message\nFrom: ${email}\nTopic: ${topic}\n\n${message}`,
          HTMLPart: internalHtml,
        },
        {
          From: FROM,
          To: [{ Email: email }],
          ReplyTo: { Email: PUBLIC_REPLY_TO },
          Subject: "We got your message",
          TextPart: `Thanks for writing to ONE two about ${topic.toLowerCase()}. A person will reply within one business day.\n\nIf you need to add anything, just reply to this email.\n\nONE two · Washington, DC`,
          HTMLPart: confirmHtml,
        },
      ],
    }),
  });

  if (!res.ok) {
    console.error("Mailjet error:", res.status, (await res.text()).slice(0, 300));
    return reply(req, { ok: false, error: "send_failed" }, 502);
  }

  if (id) await markDelivered(id);
  return reply(req, { ok: true });
});
