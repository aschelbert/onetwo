// supabase/functions/provision-tenant/index.ts
// Direct provisioning endpoint — used by admin console for manual onboarding
// (Stripe webhook path calls the DB function directly; this is the HTTP wrapper)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify caller is a platform admin
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

    // Check admin status
    const { data: admin } = await supabase
      .from("platform_admins")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!admin || !["super_admin", "support"].includes(admin.role)) {
      return new Response(JSON.stringify({ error: "Forbidden — admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // Use service role to bypass RLS for provisioning
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabaseAdmin.rpc("provision_tenant", {
      p_name: body.name,
      p_address: JSON.stringify(body.address || {}),
      p_total_units: body.totalUnits || 0,
      p_year_built: body.yearBuilt || null,
      p_tier: body.tier || "essentials",
      p_contact_name: body.contactName || "",
      p_contact_email: body.contactEmail || "",
      p_contact_phone: body.contactPhone || "",
      p_user_id: body.userId || user.id,
      p_stripe_customer_id: body.stripeCustomerId || null,
      p_stripe_subscription_id: body.stripeSubscriptionId || null,
      p_board_title: body.boardTitle || "President",
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("provision-tenant error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

