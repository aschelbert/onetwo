// supabase/functions/brevo-webhook/index.ts
// Brevo tells us here when it stops, or resumes, delivering to an address.
//
// Brevo puts an address on its blocked list when the person presses the
// Unsubscribe it adds to every email, when the mailbox bounces for good, or
// when they report us as spam. From then on it accepts our emails for that
// address and drops them. This keeps email_suppressions in step with that
// list, so sendEmail() can skip those addresses and the app can show who is
// not being reached.
//
// Set up in Brevo (Transactional > Settings > Webhook, or POST /v3/webhooks)
// with the events unsubscribed, hardBounce, spam, invalid, blocked and
// delivered, and bearer authentication carrying the BREVO_WEBHOOK_TOKEN
// secret. Deploy with JWT verification off: Brevo's call carries no JWT.

import { restWrite } from "../_shared/supabaseRest.ts";

const TOKEN = Deno.env.get("BREVO_WEBHOOK_TOKEN") || "";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/** Brevo's event name to the reason we store. */
const REASONS: Record<string, string> = {
  unsubscribed: "unsubscribed",
  hard_bounce: "hard_bounce",
  invalid_email: "invalid",
  spam: "spam",
  blocked: "blocked",
};

function sameToken(given: string): boolean {
  if (!TOKEN || given.length !== TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < TOKEN.length; i++) diff |= given.charCodeAt(i) ^ TOKEN.charCodeAt(i);
  return diff === 0;
}

/** When the event happened. Brevo sends seconds since 1970 (GMT) in ts_event. */
function eventTime(e: Record<string, unknown>): string {
  const seconds = Number(e.ts_event);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
}

async function record(e: Record<string, unknown>): Promise<boolean> {
  const email = typeof e.email === "string" ? e.email.trim().toLowerCase() : "";
  const event = typeof e.event === "string" ? e.event : "";
  if (!email || !email.includes("@")) return true; // nothing to act on

  if (event === "delivered") {
    // Mail is getting through, so the address is off Brevo's list (someone
    // restored it there). Only clears a row older than this delivery.
    return await restWrite("DELETE", `email_suppressions?email=eq.${encodeURIComponent(email)}&suppressed_at=lt.${encodeURIComponent(eventTime(e))}`);
  }

  const reason = REASONS[event];
  if (!reason) return true; // an event we don't keep

  // "blocked" only says a send was refused. Keep the real reason if we have it.
  const prefer = reason === "blocked" ? "resolution=ignore-duplicates,return=minimal" : "resolution=merge-duplicates,return=minimal";
  return await restWrite("POST", "email_suppressions?on_conflict=email", { email, reason, suppressed_at: eventTime(e) }, prefer);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const given = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!sameToken(given)) return json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  // One event, or several when the webhook is set to send them in batches
  const events = (Array.isArray(body) ? body : [body]).filter((e) => e && typeof e === "object") as Record<string, unknown>[];

  let failed = 0;
  for (const e of events) if (!(await record(e))) failed++;
  // A 5xx makes Brevo deliver the batch again later
  return failed ? json({ error: "Could not record every event" }, 500) : json({ received: events.length });
});
