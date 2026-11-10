// supabase/functions/stripe-account-status/index.ts
// The daily Stripe check. For every building whose Stripe Connect account is
// still awaiting verification, asks Stripe where it stands; the first time an
// account is verified, the building is marked complete, the board is emailed
// and the owners' announcement is posted (see _shared/stripeAccount.ts).
// Scheduled by pg_cron (migration 050) at 06:45 UTC; can also be called for
// one building with { "tenantId": "…" }.
//
// Callers: the service role (Authorization: Bearer <service key>, which is
// what the cron job sends) or a CRON_SECRET header for an outside scheduler.

import { STRIPE_SETTINGS_SELECT, confirmIfVerified, type StripeSettings } from "../_shared/stripeAccount.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

function authorized(req: Request): boolean {
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (SB_SERVICE_KEY && bearer === SB_SERVICE_KEY) return true;
  const secret = req.headers.get("x-cron-secret") || "";
  return !!CRON_SECRET && secret === CRON_SECRET;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!authorized(req)) return json({ error: "Unauthorized" }, 401);

  let tenantId: string | null = null;
  try { const body = await req.json(); tenantId = typeof body?.tenantId === "string" ? body.tenantId : null; } catch { /* no body: sweep */ }

  // Accounts that exist but Stripe has not confirmed yet.
  const filter = tenantId
    ? `tenant_id=eq.${tenantId}&stripe_connect_id=not.is.null`
    : `stripe_connect_id=not.is.null&stripe_onboarding_complete=eq.false`;
  const res = await fetch(`${SB_URL}/rest/v1/financial_settings?${filter}&select=${STRIPE_SETTINGS_SELECT}&order=tenant_id`, {
    headers: { "apikey": SB_SERVICE_KEY, "Authorization": `Bearer ${SB_SERVICE_KEY}`, "Accept": "application/json" },
  });
  if (!res.ok) return json({ error: `Could not read financial settings (${res.status})` }, 500);
  const pending: StripeSettings[] = await res.json();

  const results: Record<string, unknown>[] = [];
  let verified = 0;
  for (const s of pending) {
    try {
      const r = await confirmIfVerified(s);
      if (r.justVerified) verified++;
      results.push({ tenant: s.tenant_id, account: s.stripe_connect_id, complete: r.onboardingComplete, justVerified: r.justVerified, emailed: r.emailed, requirementsDue: r.requirementsDue });
    } catch (err) {
      // A missing account or a Stripe outage is reported, never acted on here: the board's Check now clears a stale id with the person watching.
      console.error(`Stripe status check failed for ${s.tenant_id}:`, err);
      results.push({ tenant: s.tenant_id, account: s.stripe_connect_id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  console.log(`Stripe status sweep: ${pending.length} pending, ${verified} newly verified`);
  return json({ checked: pending.length, verified, results });
});
