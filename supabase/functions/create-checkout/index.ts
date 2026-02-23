// supabase/functions/create-checkout/index.ts
// Creates a Stripe Checkout Session and returns the URL.

import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-04-10" });

const TIER_PRICE_IDS: Record<string, string> = {
  essentials: Deno.env.get("STRIPE_PRICE_ESSENTIALS")!,
  compliance_pro: Deno.env.get("STRIPE_PRICE_COMPLIANCE_PRO")!,
  advanced_governance: Deno.env.get("STRIPE_PRICE_ADVANCED_GOVERNANCE")!,
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { tier, buildingName, address, totalUnits, yearBuilt, contactName, contactPhone, boardTitle } = body;

    if (!tier || !buildingName) {
      return new Response(JSON.stringify({ error: "tier and buildingName required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const priceId = TIER_PRICE_IDS[tier];
    if (!priceId) {
      return new Response(JSON.stringify({ error: `Invalid tier: ${tier}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 30,
        metadata: { onetwo_tier: tier, onetwo_building_name: buildingName },
      },
      customer_email: user.email,
      client_reference_id: user.id,
      metadata: {
        user_id: user.id,
        tier,
        building_name: buildingName,
        address_street: address?.street || "",
        address_city: address?.city || "",
        address_state: address?.state || "",
        address_zip: address?.zip || "",
        total_units: String(totalUnits || 0),
        year_built: yearBuilt || "",
        contact_name: contactName || "",
        contact_email: user.email || "",
        contact_phone: contactPhone || "",
        board_title: boardTitle || "President",
      },
      success_url: `${Deno.env.get("SITE_URL")}/login?provisioned=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${Deno.env.get("SITE_URL")}/login?canceled=1`,
    });

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("create-checkout error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

