// supabase/functions/create-checkout/index.ts
// Zero dependencies — uses raw fetch to Stripe API and Supabase Auth API

const TIER_PRICES: Record<string, string> = {
  essentials: Deno.env.get("STRIPE_PRICE_ESSENTIALS") || "",
  compliance_pro: Deno.env.get("STRIPE_PRICE_COMPLIANCE_PRO") || "",
  advanced_governance: Deno.env.get("STRIPE_PRICE_ADVANCED_GOVERNANCE") || "",
};

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://app.getonetwo.com";
const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // Verify user
    const auth = req.headers.get("Authorization") || "";
    const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { "Authorization": auth, "apikey": SB_ANON },
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const user = await userRes.json();

    // Parse request
    const { tier, buildingName, subdomain, address, totalUnits, yearBuilt, contactName, contactPhone, boardTitle } = await req.json();
    if (!tier || !buildingName) {
      return new Response(JSON.stringify({ error: "tier and buildingName required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const priceId = TIER_PRICES[tier];
    if (!priceId) {
      return new Response(JSON.stringify({ error: "Invalid tier" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Build Stripe form body
    const p = new URLSearchParams();
    p.append("mode", "subscription");
    p.append("payment_method_types[0]", "card");
    p.append("line_items[0][price]", priceId);
    p.append("line_items[0][quantity]", "1");
    p.append("subscription_data[trial_period_days]", "30");
    p.append("customer_email", user.email || "");
    p.append("client_reference_id", user.id);
    p.append("success_url", `${SITE_URL}/login?provisioned=1&session_id={CHECKOUT_SESSION_ID}`);
    p.append("cancel_url", `${SITE_URL}/login?canceled=1`);
    // Metadata
    const meta: Record<string, string> = {
      user_id: user.id, tier, building_name: buildingName, subdomain: subdomain || "",
      address_street: address?.street || "", address_city: address?.city || "",
      address_state: address?.state || "", address_zip: address?.zip || "",
      total_units: String(totalUnits || 0), year_built: yearBuilt || "",
      contact_name: contactName || "", contact_email: user.email || "",
      contact_phone: contactPhone || "", board_title: boardTitle || "President",
    };
    for (const [k, v] of Object.entries(meta)) {
      p.append(`metadata[${k}]`, v);
    }
    p.append("subscription_data[metadata][onetwo_tier]", tier);
    p.append("subscription_data[metadata][onetwo_building_name]", buildingName);

    // Call Stripe
    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: p.toString(),
    });
    const session = await stripeRes.json();

    if (session.error) {
      return new Response(JSON.stringify({ error: session.error.message }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

