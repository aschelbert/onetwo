// supabase/functions/checkout-complete/index.ts
// The last step of the one-page signup: the payment method has been
// authorised in the page's payment fields, and this starts the subscription.
//
// What it does, in order:
//   1. Works the order out again from the ids sent (plan, period, add-ons)
//      and checks the building. Nothing the browser says about money is used.
//   2. Checks the payment intent is authorised, and for the amount due today.
//   3. Creates the building's Chargebee customer with the name and email from
//      the account and the address from step 4 as its billing address.
//   4. Saves the building for the webhook to provision, as the hosted
//      checkout did, then creates the subscription with its trial.
//
// Safe to call twice. The same person and building always arrive at the same
// customer, the Chargebee call carries an idempotency key made from the
// payment intent, and an intent can only ever be used once; a repeat finds
// the subscription already there and answers that it is done.

import { authUser, cors, jsonResponse } from "../_shared/supabaseRest.ts";
import { CF_TENANT_ID, CHARGEBEE_SITE, chargebee } from "../_shared/chargebee.ts";
import { dueTodayCents, resolveCheckout, trialDaysFrom } from "../_shared/checkoutPricing.ts";
import {
  buildingKey, checkBuilding, cleanAttribution, reservedTenantId, signupPageUrl,
} from "../_shared/checkoutBuilding.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const service = { apikey: SB_SERVICE_KEY, Authorization: `Bearer ${SB_SERVICE_KEY}` };

async function trialDays(): Promise<number> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/get_trial_days`, {
      method: "POST",
      headers: { ...service, "Content-Type": "application/json" },
      body: "{}",
    });
    return trialDaysFrom(res.ok ? await res.json() : null);
  } catch {
    return trialDaysFrom(null);
  }
}

/** A subscription this customer already holds, if the checkout has in fact been completed. */
async function liveSubscription(customerId: string): Promise<{ id: string; status: string } | null> {
  const found = await chargebee(
    "GET",
    "subscriptions",
    new URLSearchParams({ "customer_id[is]": customerId, limit: "5" }),
  );
  if (!found.ok) return null;
  // deno-lint-ignore no-explicit-any
  const live = (found.data?.list ?? []).map((r: any) => r.subscription)
    // deno-lint-ignore no-explicit-any
    .find((s: any) => s && s.status !== "cancelled");
  return live ? { id: live.id, status: live.status } : null;
}

const name = (v: unknown): string => (typeof v === "string" ? v.trim().slice(0, 150) : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const user = await authUser(req);
    if (!user?.id || !user.email) return jsonResponse({ error: "Please sign in again." }, 401);

    // deno-lint-ignore no-explicit-any
    let body: any;
    try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid request." }, 400); }
    body = body ?? {};

    // ── 1. The order and the building, from ids and form fields only ──
    const resolved = resolveCheckout(body, CHARGEBEE_SITE);
    if (!resolved.ok) return jsonResponse({ error: resolved.error }, 400);
    const { checkout } = resolved;

    const checked = checkBuilding(body.building);
    if (!checked.ok) return jsonResponse({ error: checked.error, field: checked.field }, 400);
    const { building } = checked;

    const firstName = name(body.firstName);
    const lastName = name(body.lastName);
    if (!firstName || !lastName) return jsonResponse({ error: "Enter your first and last name.", field: "name" }, 400);

    const paymentIntentId = typeof body.paymentIntentId === "string" && /^[A-Za-z0-9_-]{1,150}$/.test(body.paymentIntentId)
      ? body.paymentIntentId
      : "";
    if (!paymentIntentId) return jsonResponse({ error: "The payment step was not completed." }, 400);

    // An account can own several buildings, but not the same one twice.
    const key = buildingKey(building);
    const ownedRes = await fetch(
      `${SB_URL}/rest/v1/tenant_users?user_id=eq.${user.id}&select=tenants(id,name,address)`,
      { headers: service },
    );
    const owned = ownedRes.ok
      ? (await ownedRes.json()) as { tenants?: { id?: string; name?: string; address?: { street?: string; zip?: string } } | null }[]
      : [];

    // The same person and building always get the same reserved id, so a
    // retry or a double click lands on the same Chargebee customer.
    const tenantId = await reservedTenantId(user.id, key);
    const customerId = `cb_tenant_${tenantId}`;

    // Already done? (A repeat of a request whose answer was lost, or a double click.)
    const before = await liveSubscription(customerId);
    if (before) {
      return jsonResponse({ ok: true, already: true, subscriptionId: before.id, status: before.status, tenantId });
    }

    if (owned.some((o) => o.tenants && buildingKey(o.tenants) === key)) {
      return jsonResponse({
        error: "Your account already has this building. To add another, enter its own name and street address.",
        field: "street",
      }, 409);
    }

    // The reserved id is already a building (one this person has since left,
    // say). Provisioning onto it would hand them that building.
    const takenRes = await fetch(`${SB_URL}/rest/v1/tenants?id=eq.${tenantId}&select=id`, { headers: service });
    if (takenRes.ok && ((await takenRes.json()) as unknown[]).length > 0) {
      return jsonResponse({
        error: "This building is already set up on ONE two. Sign in to open it, or contact us if that is unexpected.",
        field: "street",
      }, 409);
    }

    // ── 2. The payment intent: authorised, and for what is due today ──
    const days = await trialDays();
    const dueToday = dueTodayCents(checkout.totalCents, days);

    const intentRes = await chargebee("GET", `payment_intents/${paymentIntentId}`);
    const intent = intentRes.ok ? intentRes.data?.payment_intent : null;
    if (!intent) return jsonResponse({ error: "The payment step was not completed.", code: "payment_intent_missing" }, 400);
    if (intent.status !== "authorized") {
      return jsonResponse({
        error: "Your payment details were not confirmed. Please enter them again.",
        code: "payment_intent_not_authorized",
      }, 409);
    }
    if (intent.amount !== dueToday || intent.currency_code !== "USD") {
      // The order changed after the payment method was authorised
      return jsonResponse({
        error: "Your plan changed after payment was confirmed. Please confirm your payment details again.",
        code: "payment_intent_amount",
      }, 409);
    }

    // ── 3. The building's Chargebee customer, with the billing address ──
    const who = new URLSearchParams({
      first_name: firstName,
      last_name: lastName,
      email: user.email,
      company: building.name,
    });
    const billing = new URLSearchParams({
      "billing_address[first_name]": firstName,
      "billing_address[last_name]": lastName,
      "billing_address[email]": user.email,
      "billing_address[company]": building.name,
      "billing_address[line1]": building.address.street,
      "billing_address[city]": building.address.city,
      "billing_address[state_code]": building.address.state,
      "billing_address[zip]": building.address.zip,
      "billing_address[country]": "US",
    });
    const createParams = new URLSearchParams([...who, ...billing]);
    createParams.set("id", customerId);
    const createdCustomer = await chargebee("POST", "customers", createParams);
    if (!createdCustomer.ok) {
      if (!/already present|already exists/i.test(createdCustomer.message)) {
        console.error("checkout-complete: creating the customer failed:", createdCustomer.status, createdCustomer.message);
        return jsonResponse({ error: "We could not set up billing. Please try again." }, 502);
      }
      // Left by an earlier attempt: bring it up to date with this form
      const updated = await chargebee("POST", `customers/${customerId}`, who);
      const billed = await chargebee("POST", `customers/${customerId}/update_billing_info`, billing);
      if (!updated.ok || !billed.ok) {
        console.error("checkout-complete: updating the customer failed:", updated.message || billed.message);
        return jsonResponse({ error: "We could not set up billing. Please try again." }, 502);
      }
    }

    // ── 4. Save the building for the webhook, then start the subscription ──
    await fetch(
      `${SB_URL}/rest/v1/pending_checkouts?chargebee_customer_id=eq.${encodeURIComponent(customerId)}`,
      { method: "DELETE", headers: service },
    );
    const pendingRes = await fetch(`${SB_URL}/rest/v1/pending_checkouts`, {
      method: "POST",
      headers: { ...service, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        chargebee_customer_id: customerId,
        user_id: user.id,
        payload: {
          tenantId,
          buildingKey: key,
          name: building.name,
          subdomain: null, // provision_tenant picks one from the name
          address: building.address,
          totalUnits: 0, // added in Setup, no longer asked at signup
          contactName: `${firstName} ${lastName}`,
          contactEmail: user.email,
          plan: checkout.plan,
          userId: user.id,
          role: "board_member",
          // Which board seat they hold is confirmed in the app, not here
          seatUnconfirmed: true,
          firstName,
          lastName,
          conversionEventId: typeof body.conversionEventId === "string" ? body.conversionEventId.slice(0, 128) : null,
          adMeasurementOptOut: body.adMeasurementOptOut === true,
          signupUrl: signupPageUrl(body.origin),
          adClickRef: typeof body.adClickRef === "string" && body.adClickRef.trim()
            ? body.adClickRef.trim().slice(0, 512)
            : null,
          attribution: cleanAttribution(body.attribution),
        },
      }),
    });
    if (!pendingRes.ok) {
      // Without this row the webhook cannot provision the building, so stop
      // before the subscription exists rather than after.
      console.error("checkout-complete: saving the pending checkout failed:", pendingRes.status, await pendingRes.text());
      return jsonResponse({ error: "We could not save your building. Please try again." }, 500);
    }

    const sub = new URLSearchParams();
    checkout.lines.forEach((line, i) => {
      sub.append(`subscription_items[item_price_id][${i}]`, line.itemPriceId);
      sub.append(`subscription_items[quantity][${i}]`, "1");
    });
    sub.append("payment_intent[id]", paymentIntentId);
    // 0 means no trial, whatever trial the plan price carries
    sub.append("trial_end", days > 0 ? String(Math.floor(Date.now() / 1000) + days * 86400) : "0");
    // The webhook provisions the building and fills this in
    sub.append(CF_TENANT_ID, "pending");

    const created = await chargebee(
      "POST",
      `customers/${customerId}/subscription_for_items`,
      sub,
      `checkout-${paymentIntentId}`,
    );
    if (created.ok) {
      const s = created.data.subscription;
      return jsonResponse({ ok: true, subscriptionId: s.id, status: s.status, tenantId, trialEnd: s.trial_end ?? null });
    }

    // Refused. If another copy of this request got there first, it is done.
    const after = await liveSubscription(customerId);
    if (after) {
      return jsonResponse({ ok: true, already: true, subscriptionId: after.id, status: after.status, tenantId });
    }
    if (created.status === 409) {
      // The same request is still being processed by Chargebee
      return jsonResponse({ error: "Still finishing your signup. One moment.", code: "in_progress" }, 409);
    }
    console.error("checkout-complete: creating the subscription failed:", created.status, created.message);
    const type = created.data?.type;
    if (type === "payment") {
      return jsonResponse({
        error: created.message || "Your payment method was declined. Please try another.",
        code: "payment_failed",
      }, 402);
    }
    return jsonResponse({ error: "We could not start your subscription. Please try again." }, 502);
  } catch (err) {
    console.error("checkout-complete error:", err);
    return jsonResponse({ error: "We could not start your subscription. Please try again." }, 500);
  }
});
