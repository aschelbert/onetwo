// supabase/functions/staff-payment/index.ts
// Zero dependencies — raw fetch to Stripe API + Supabase REST API
// Actions: create_staff_account, check_staff_status, process_payment

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://app.getonetwo.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    // Authz: confirm caller is a board_member and get tenant_id
    const tu = await sbQuery("GET", "tenant_users", {
      "user_id": `eq.${user.id}`,
      "role": "eq.board_member",
      "select": "tenant_id",
    });
    if (!tu?.tenant_id) {
      return jsonResponse({ error: "Only board members can manage staff payments" }, 403);
    }

    const body = await req.json();
    const { action, staffName, returnUrl } = body;
    const effectiveReturnUrl = returnUrl || `${SITE_URL}/association-team?tab=payroll`;

    // ═══ ACTION: create_staff_account ═══
    // Creates a Stripe Connect Express account for a staff member + generates onboarding link
    if (action === "create_staff_account") {
      const acctParams = new URLSearchParams();
      acctParams.append("type", "express");
      if (staffName) {
        acctParams.append("business_profile[name]", staffName);
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
        console.error("Stripe staff account creation failed:", err);
        return jsonResponse({ error: "Failed to create Stripe account" }, 500);
      }

      const account = await acctRes.json();
      const stripeAccountId = account.id;

      // Create account link for onboarding
      const linkParams = new URLSearchParams();
      linkParams.append("account", stripeAccountId);
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
        console.error("Staff account link creation failed:", err);
        return jsonResponse({ error: "Failed to create onboarding link" }, 500);
      }

      const link = await linkRes.json();

      return jsonResponse({
        success: true,
        stripeAccountId,
        onboardingUrl: link.url,
      });
    }

    // ═══ ACTION: check_staff_status ═══
    // Checks if a staff member's Stripe Express account is ready for payouts
    if (action === "check_staff_status") {
      const { stripeAccountId } = body;
      if (!stripeAccountId) {
        return jsonResponse({ error: "stripeAccountId is required" }, 400);
      }

      const acctRes = await fetch(`https://api.stripe.com/v1/accounts/${stripeAccountId}`, {
        headers: { "Authorization": `Bearer ${STRIPE_KEY}` },
      });

      if (!acctRes.ok) {
        console.error("Stripe staff account lookup failed for:", stripeAccountId);
        return jsonResponse({ error: "Stripe account not found" }, 404);
      }

      const account = await acctRes.json();
      const payoutsEnabled = account.payouts_enabled || false;
      const detailsSubmitted = account.details_submitted || false;
      const onboardingComplete = payoutsEnabled && detailsSubmitted;

      // If not complete, generate a new onboarding link
      let onboardingUrl = null;
      if (!onboardingComplete) {
        const linkParams = new URLSearchParams();
        linkParams.append("account", stripeAccountId);
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
        onboardingComplete,
        payoutsEnabled,
        detailsSubmitted,
        onboardingUrl,
      });
    }

    // ═══ ACTION: process_payment ═══
    // Creates a Stripe Transfer to a staff member's connected account
    if (action === "process_payment") {
      const { stripeAccountId, amount, payRunId, periodStart, periodEnd } = body;
      if (!stripeAccountId || !amount) {
        return jsonResponse({ error: "stripeAccountId and amount are required" }, 400);
      }

      const cents = Math.round(amount * 100);

      const params = new URLSearchParams();
      params.append("destination", stripeAccountId);
      params.append("amount", String(cents));
      params.append("currency", "usd");
      if (payRunId) params.append("metadata[pay_run_id]", payRunId);
      if (staffName) params.append("metadata[staff_name]", staffName);
      if (periodStart) params.append("metadata[period_start]", periodStart);
      if (periodEnd) params.append("metadata[period_end]", periodEnd);

      const transferRes = await fetch("https://api.stripe.com/v1/transfers", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${STRIPE_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!transferRes.ok) {
        const err = await transferRes.text();
        console.error("Stripe transfer failed:", err);
        return jsonResponse({ error: "Failed to process transfer" }, 500);
      }

      const transfer = await transferRes.json();

      return jsonResponse({
        success: true,
        transferId: transfer.id,
      });
    }

    return jsonResponse({ error: "Invalid action. Use: create_staff_account, check_staff_status, process_payment" }, 400);

  } catch (err) {
    console.error("staff-payment error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
