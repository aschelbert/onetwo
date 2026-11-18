// supabase/functions/send-marketing-confirmations/index.ts
// Sends the "please confirm" email for product-email opt-ins (double opt-in,
// migration 20261118140000). Ticking "Email me ONE two product news" only
// queues a confirmation; the address is subscribed once someone presses
// Confirm on the page this email links to.
//
// Callers: pg_cron every minute, only when something is queued, with the
// secret from Vault in an x-cron-secret header (read back through the
// service-role-only RPC marketing_confirm_cron_secret); or the service role
// (Authorization: Bearer <service key>) by hand. Deploy with JWT verification
// off: the cron call carries no JWT.
//
// This is not a product email: it goes out because someone asked for one,
// carries no news, and only asks for the click that proves the inbox's owner
// agreed. Nothing more is sent to the address unless they confirm.

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MJ_API_KEY = Deno.env.get("MAILJET_API_KEY") || "";
const MJ_SECRET_KEY = Deno.env.get("MAILJET_SECRET_KEY") || "";
const SITE_URL = (Deno.env.get("SITE_URL") || "https://app.getonetwo.com").replace(/\/+$/, "");

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
async function rpc(fn: string, args: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SB_SERVICE_KEY,
      Authorization: `Bearer ${SB_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`RPC ${fn} failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authorized(req: Request): Promise<boolean> {
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (SB_SERVICE_KEY && sameSecret(bearer, SB_SERVICE_KEY)) return true;
  const given = req.headers.get("x-cron-secret") || "";
  if (!given) return false;
  try {
    const expected = await rpc("marketing_confirm_cron_secret");
    return typeof expected === "string" && sameSecret(given, expected);
  } catch (err) {
    console.error("Could not read the cron secret:", err);
    return false;
  }
}

function message(email: string, token: string) {
  const url = `${SITE_URL}/confirm-email?t=${token}`;
  const text =
    `Please confirm you want ONE two product emails\n\n` +
    `Someone, hopefully you, asked for ONE two product news, tips and offers to be sent to this address. ` +
    `To start getting them, confirm here:\n\n${url}\n\n` +
    `If you didn't ask, ignore this email. You won't get product emails, and we won't ask again for at least a day.\n\n` +
    `The link works for 7 days. Emails about your account and building, such as invoices, notices and password resets, are not affected.\n`;
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0D1B2E;max-width:520px">` +
    `<p style="font-size:18px;font-weight:bold;margin:0 0 12px">Please confirm you want ONE two product emails</p>` +
    `<p>Someone, hopefully you, asked for ONE two product news, tips and offers to be sent to this address. To start getting them, confirm here:</p>` +
    `<p style="margin:24px 0"><a href="${url}" style="background:#0D1B2E;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Confirm product emails</a></p>` +
    `<p>If you didn't ask, ignore this email. You won't get product emails, and we won't ask again for at least a day.</p>` +
    `<p style="font-size:12px;color:#5F6C7B">The link works for 7 days. Emails about your account and building, such as invoices, notices and password resets, are not affected.</p>` +
    `</div>`;
  return {
    From: { Email: "noreply@getonetwo.com", Name: "ONE two" },
    To: [{ Email: email }],
    Subject: "Confirm ONE two product emails",
    TextPart: text,
    HTMLPart: html,
  };
}

/** "sent"; "retry" for an outage (5xx, 429, network); "rejected" when Mailjet refuses this message for good (e.g. an invalid address). */
async function send(email: string, token: string): Promise<"sent" | "retry" | "rejected"> {
  const auth = btoa(`${MJ_API_KEY}:${MJ_SECRET_KEY}`);
  const res = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ Messages: [message(email, token)] }),
  });
  if (res.ok) return "sent";
  console.error("Mailjet error:", res.status, (await res.text()).slice(0, 300));
  return res.status >= 500 || res.status === 429 ? "retry" : "rejected";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(await authorized(req))) return json({ error: "Unauthorized" }, 401);
  if (!MJ_API_KEY || !MJ_SECRET_KEY) return json({ error: "Mailjet is not configured" }, 500);

  let batch: { token: string; email: string }[];
  try {
    batch = (await rpc("claim_marketing_confirmations", { p_limit: 50 })) || [];
  } catch (err) {
    console.error(err);
    return json({ error: "Could not read the queue" }, 500);
  }

  let sent = 0;
  let retry = 0;
  let rejected = 0;
  for (const c of batch) {
    let outcome: "sent" | "retry" | "rejected" = "retry";
    try { outcome = await send(c.email, c.token); } catch (err) { console.error("send failed:", err); }
    if (outcome === "sent") { sent++; continue; }
    if (outcome === "rejected") { rejected++; continue; } // stays claimed: never retried
    retry++;
    // An outage: put it back so the next run tries again
    try { await rpc("release_marketing_confirmation", { p_token: c.token }); } catch (err) { console.error(err); }
  }
  return json({ claimed: batch.length, sent, retry, rejected });
});
