// supabase/functions/connect-stripe-account/index.ts
// Zero dependencies — raw fetch to Stripe API + Supabase REST API
// Actions: create, check_status (plus owner-side checkout, autopay and portal actions)
// Verification itself (marking the building complete, emailing the board, the owners' announcement)
// lives in _shared/stripeAccount.ts, shared with stripe-webhook and the daily stripe-account-status job.

import { STRIPE_SETTINGS_SELECT, accountState, confirmIfVerified } from "../_shared/stripeAccount.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://app.getonetwo.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, baggage, sentry-trace",
};

async function sbQuery(method: string, table: string, params?: Record<string, string>, body?: unknown) {
  const url = new URL(`${SB_URL}/rest/v1/${table}`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = {
    "apikey": SB_SERVICE_KEY,
    "Authorization": `Bearer ${SB_SERVICE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": method === "POST" ? "return=representation" : "return=minimal",
  };
  if (method === "GET") headers["Accept"] = "application/vnd.pgrst.object+json";
  const res = await fetch(url.toString(), { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (method === "GET" || headers["Prefer"] === "return=representation") {
    return res.ok ? await res.json() : null;
  }
  return res.ok;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // Auth: verify user via Supabase Auth API
    const auth = req.headers.get("Authorization") || "";
    const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { "Authorization": auth, "apikey": SB_ANON },
    });
    if (!userRes.ok) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const user = await userRes.json();

    // Authz: any member of the building may pay (checkout, autopay, billing portal);
    // only a board member may create or inspect the building's Stripe account.
    const tu = await sbQuery("GET", "tenant_users", {
      "user_id": `eq.${user.id}`,
      "select": "tenant_id,role",
      "limit": "1",
    });
    if (!tu?.tenant_id) {
      return jsonResponse({ error: "You are not a member of a building" }, 403);
    }
    const tenantId = tu.tenant_id;

    const body = await req.json();
    const { action, buildingName, returnUrl, amount, description, unitNumber, stripeConnectId: bodyConnectId, customerId } = body;
    if ((action === "create" || action === "check_status") && tu.role !== "board_member") {
      return jsonResponse({ error: "Only board members can manage Stripe Connect" }, 403);
    }
    const effectiveReturnUrl = returnUrl || `${SITE_URL}/building?tab=payments`;

    // ═══ ACTION: create ═══
    if (action === "create") {
      // Create a Standard Stripe Connect account
      const acctParams = new URLSearchParams();
      acctParams.append("type", "standard");
      if (buildingName) {
        acctParams.append("business_profile[name]", buildingName);
      }

      const acctRes = await fetch("https://api.stripe.com/v1/accounts", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${STRIPE_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: acctParams.toString(),
      });

      if (!acctRes.ok) {
        const err = await acctRes.text();
        console.error("Stripe account creation failed:", err);
        return jsonResponse({ error: "Failed to create Stripe account" }, 500);
      }

      const account = await acctRes.json();
      const stripeConnectId = account.id;

      // Save stripe_connect_id to financial_settings, and who connected it (they get the email when Stripe verifies)
      await sbQuery("PATCH", `financial_settings?tenant_id=eq.${tenantId}`, {}, {
        stripe_connect_id: stripeConnectId,
        stripe_onboarding_complete: false,
        stripe_connected_by: user.id,
        stripe_verified_at: null,
      });

      // Create account link for onboarding
      const linkParams = new URLSearchParams();
      linkParams.append("account", stripeConnectId);
      linkParams.append("refresh_url", effectiveReturnUrl);
      linkParams.append("return_url", effectiveReturnUrl);
      linkParams.append("type", "account_onboarding");

      const linkRes = await fetch("https://api.stripe.com/v1/account_links", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${STRIPE_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: linkParams.toString(),
      });

      if (!linkRes.ok) {
        const err = await linkRes.text();
        console.error("Account link creation failed:", err);
        return jsonResponse({ error: "Failed to create onboarding link" }, 500);
      }

      const link = await linkRes.json();

      return jsonResponse({
        success: true,
        stripeConnectId,
        onboardingUrl: link.url,
      });
    }

    // ═══ ACTION: check_status ═══
    if (action === "check_status") {
      // Get existing stripe_connect_id from financial_settings
      const settings = await sbQuery("GET", "financial_settings", {
        "tenant_id": `eq.${tenantId}`,
        "select": STRIPE_SETTINGS_SELECT,
      });

      if (!settings?.stripe_connect_id) {
        return jsonResponse({ error: "No Stripe Connect account found" }, 404);
      }

      const stripeConnectId = settings.stripe_connect_id;

      // Check account status on Stripe
      const acctRes = await fetch(`https://api.stripe.com/v1/accounts/${stripeConnectId}`, {
        headers: { "Authorization": `Bearer ${STRIPE_KEY}` },
      });

      if (!acctRes.ok) {
        // Invalid or non-existent Stripe account — clear the stale ID from the database
        console.error("Stripe account lookup failed for:", stripeConnectId, "status:", acctRes.status);
        await sbQuery("PATCH", `financial_settings?tenant_id=eq.${tenantId}`, {}, {
          stripe_connect_id: null,
          stripe_onboarding_complete: false,
        });
        return jsonResponse({ error: "Stripe account not found. Please reconnect.", invalidAccount: true }, 404);
      }

      const account = await acctRes.json();
      const { chargesEnabled, detailsSubmitted } = accountState(account);
      // Records the check; the first time Stripe reports verified, marks the building complete and tells the board.
      const { onboardingComplete } = await confirmIfVerified(settings, account);

      // If not complete, generate a new account link
      let onboardingUrl = null;
      if (!onboardingComplete) {
        const linkParams = new URLSearchParams();
        linkParams.append("account", stripeConnectId);
        linkParams.append("refresh_url", effectiveReturnUrl);
        linkParams.append("return_url", effectiveReturnUrl);
        linkParams.append("type", "account_onboarding");

        const linkRes = await fetch("https://api.stripe.com/v1/account_links", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${STRIPE_KEY}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: linkParams.toString(),
        });

        if (linkRes.ok) {
          const link = await linkRes.json();
          onboardingUrl = link.url;
        }
      }

      return jsonResponse({
        success: true,
        stripeConnectId,
        chargesEnabled,
        detailsSubmitted,
        onboardingComplete,
        onboardingUrl,
      });
    }

    // ═══ ACTION: create_checkout ═══
    // Creates a Stripe Checkout session for a one-time unit payment on the connected account
    if (action === "create_checkout") {
      const settings = await sbQuery("GET", "financial_settings", {
        "tenant_id": `eq.${tenantId}`,
        "select": "stripe_connect_id",
      });
      const acctId = bodyConnectId || settings?.stripe_connect_id;
      if (!acctId) {
        return jsonResponse({ error: "No Stripe Connect account found" }, 404);
      }

      const params = new URLSearchParams();
      params.append("mode", "payment");
      params.append("success_url", `${effectiveReturnUrl}?payment=success`);
      params.append("cancel_url", `${effectiveReturnUrl}?payment=cancelled`);
      params.append("line_items[0][price_data][currency]", "usd");
      params.append("line_items[0][price_data][unit_amount]", String(Math.round((amount || 0) * 100)));
      params.append("line_items[0][price_data][product_data][name]", description || "HOA Payment");
      params.append("line_items[0][quantity]", "1");
      params.append("payment_intent_data[application_fee_amount]", String(Math.round((amount || 0) * 100 * 0.029)));
      // The webhook posts the payment to the unit's ledger from these.
      if (unitNumber) params.append("metadata[unit_number]", unitNumber);
      params.append("metadata[tenant_id]", tenantId);

      const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${STRIPE_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Stripe-Account": acctId,
        },
        body: params.toString(),
      });

      if (!stripeRes.ok) {
        const err = await stripeRes.text();
        console.error("Checkout session creation failed:", err);
        return jsonResponse({ error: "Failed to create checkout session" }, 500);
      }

      const session = await stripeRes.json();
      return jsonResponse({ success: true, checkoutUrl: session.url, sessionId: session.id });
    }

    // ═══ ACTION: create_subscription ═══
    // Creates a Stripe Checkout session in subscription mode for recurring HOA payments
    if (action === "create_subscription") {
      const settings = await sbQuery("GET", "financial_settings", {
        "tenant_id": `eq.${tenantId}`,
        "select": "stripe_connect_id",
      });
      const acctId = bodyConnectId || settings?.stripe_connect_id;
      if (!acctId) {
        return jsonResponse({ error: "No Stripe Connect account found" }, 404);
      }

      const params = new URLSearchParams();
      params.append("mode", "subscription");
      params.append("success_url", `${effectiveReturnUrl}?subscription=success`);
      params.append("cancel_url", `${effectiveReturnUrl}?subscription=cancelled`);
      params.append("line_items[0][price_data][currency]", "usd");
      params.append("line_items[0][price_data][unit_amount]", String(Math.round((amount || 0) * 100)));
      params.append("line_items[0][price_data][product_data][name]", "Monthly HOA Fee");
      params.append("line_items[0][price_data][recurring][interval]", "month");
      params.append("line_items[0][quantity]", "1");
      params.append("subscription_data[application_fee_percent]", "2.9");
      // On the session and on the subscription itself, so every month's invoice.paid names the unit.
      if (unitNumber) params.append("metadata[unit_number]", unitNumber);
      params.append("metadata[tenant_id]", tenantId);
      if (unitNumber) params.append("subscription_data[metadata][unit_number]", unitNumber);
      params.append("subscription_data[metadata][tenant_id]", tenantId);

      const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${STRIPE_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Stripe-Account": acctId,
        },
        body: params.toString(),
      });

      if (!stripeRes.ok) {
        const err = await stripeRes.text();
        console.error("Subscription session creation failed:", err);
        return jsonResponse({ error: "Failed to create subscription checkout" }, 500);
      }

      const session = await stripeRes.json();
      return jsonResponse({ success: true, checkoutUrl: session.url, sessionId: session.id });
    }

    // ═══ ACTION: create_billing_portal ═══
    // Creates a Stripe Billing Portal session for residents to manage payment methods
    if (action === "create_billing_portal") {
      const settings = await sbQuery("GET", "financial_settings", {
        "tenant_id": `eq.${tenantId}`,
        "select": "stripe_connect_id",
      });
      const acctId = bodyConnectId || settings?.stripe_connect_id;
      if (!acctId) {
        return jsonResponse({ error: "No Stripe Connect account found" }, 404);
      }

      if (!customerId) {
        return jsonResponse({ error: "Customer ID required for billing portal" }, 400);
      }

      const params = new URLSearchParams();
      params.append("customer", customerId);
      params.append("return_url", effectiveReturnUrl);

      const stripeRes = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${STRIPE_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Stripe-Account": acctId,
        },
        body: params.toString(),
      });

      if (!stripeRes.ok) {
        const err = await stripeRes.text();
        console.error("Billing portal creation failed:", err);
        return jsonResponse({ error: "Failed to create billing portal session" }, 500);
      }

      const portal = await stripeRes.json();
      return jsonResponse({ success: true, portalUrl: portal.url });
    }

    return jsonResponse({ error: "Invalid action. Use: create, check_status, create_checkout, create_subscription, create_billing_portal" }, 400);

  } catch (err) {
    console.error("connect-stripe-account error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
