// supabase/functions/checkout-intent/index.ts
// Creates, or brings up to date, the Chargebee payment intent behind the
// signup page's payment fields.
//
// The request names a plan, a billing period and add-ons by id. The amount is
// worked out here from the pricing module; nothing the browser says about
// money is used. During a trial nothing is due at signup, so the intent is
// for $0 and only verifies the payment method; with the trial turned off it
// is for the first billing period.
//
// Open to visitors who have no account yet (the payment fields are on the
// page before the account exists). It can only ever produce an intent for an
// amount in the price list, and an intent on its own charges nobody.

import { cors, jsonResponse } from "../_shared/supabaseRest.ts";
import { chargebee } from "../_shared/chargebee.ts";
import { CHARGEBEE_SITE } from "../_shared/chargebee.ts";
import { dueTodayCents, resolveCheckout, trialDaysFrom } from "../_shared/checkoutPricing.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

async function trialDays(): Promise<number> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/get_trial_days`, {
      method: "POST",
      headers: { apikey: SB_SERVICE_KEY, Authorization: `Bearer ${SB_SERVICE_KEY}`, "Content-Type": "application/json" },
      body: "{}",
    });
    return trialDaysFrom(res.ok ? await res.json() : null);
  } catch {
    return trialDaysFrom(null);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    // deno-lint-ignore no-explicit-any
    let body: any;
    try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid request." }, 400); }

    const resolved = resolveCheckout(body ?? {}, CHARGEBEE_SITE);
    if (!resolved.ok) return jsonResponse({ error: resolved.error }, 400);
    const { checkout } = resolved;

    const days = await trialDays();
    const amount = dueTodayCents(checkout.totalCents, days);

    // Bring the page's existing intent up to date when it has one that can
    // still be used; otherwise start a new one.
    const existingId = typeof body.paymentIntentId === "string" && /^[A-Za-z0-9_-]{1,150}$/.test(body.paymentIntentId)
      ? body.paymentIntentId
      : "";
    // deno-lint-ignore no-explicit-any
    let intent: any = null;
    if (existingId) {
      const found = await chargebee("GET", `payment_intents/${existingId}`);
      const current = found.ok ? found.data?.payment_intent : null;
      // Two minutes of life left at least, so it does not expire mid-payment
      const fresh = current?.status === "inited" && (current.expires_at ?? 0) * 1000 > Date.now() + 120_000;
      if (fresh && current.amount === amount && current.currency_code === "USD") {
        intent = current;
      } else if (fresh) {
        const updated = await chargebee(
          "POST",
          `payment_intents/${existingId}`,
          new URLSearchParams({ amount: String(amount), currency_code: "USD" }),
        );
        if (updated.ok) intent = updated.data?.payment_intent ?? null;
      }
    }
    if (!intent) {
      const created = await chargebee(
        "POST",
        "payment_intents",
        new URLSearchParams({ amount: String(amount), currency_code: "USD" }),
      );
      if (!created.ok) {
        console.error("checkout-intent: creating the payment intent failed:", created.status, created.message);
        return jsonResponse({ error: "We could not start the payment step. Please try again." }, 502);
      }
      intent = created.data.payment_intent;
    }

    return jsonResponse({
      paymentIntent: { id: intent.id, amount: intent.amount, status: intent.status, expiresAt: intent.expires_at ?? null },
      // The figures the page shows, as the server works them out
      trialDays: days,
      totalCents: checkout.totalCents,
      dueTodayCents: amount,
      lines: checkout.lines.map((l) => ({ id: l.id, kind: l.kind, amountCents: l.amountCents })),
    });
  } catch (err) {
    console.error("checkout-intent error:", err);
    return jsonResponse({ error: "We could not start the payment step. Please try again." }, 500);
  }
});
