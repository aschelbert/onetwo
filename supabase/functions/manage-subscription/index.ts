// supabase/functions/manage-subscription/index.ts
// Zero dependencies — raw fetch to Stripe API + Supabase REST API
// Actions: change-tier, cancel, reactivate

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const GOVOPS_URL = Deno.env.get("GOVOPS_SUPABASE_URL") || "";
const GOVOPS_SERVICE_KEY = Deno.env.get("GOVOPS_SUPABASE_SERVICE_ROLE_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tier feature defaults — mirrors the SQL tier_feature_defaults function
const TIER_FEATURES: Record<string, Record<string, boolean>> = {
  compliance_pro: {
    dashboard: true, boardroom: true, financial: true, building: true,
    issues: true, property_log: true, archives: true,
    community: false, voting: false, assessments: false,
    pm_tools: false, work_orders: false, distributions: false,
  },
  community_plus: {
    dashboard: true, boardroom: true, financial: true, building: true,
    issues: true, property_log: true, archives: true,
    community: true, voting: true, assessments: true,
    pm_tools: false, work_orders: false, distributions: false,
  },
  management_suite: {
    dashboard: true, boardroom: true, financial: true, building: true,
    issues: true, property_log: true, archives: true,
    community: true, voting: true, assessments: true,
    pm_tools: true, work_orders: true, distributions: true,
  },
};

// Price ID → tier mapping
const PRICE_TO_TIER: Record<string, string> = {
  "price_1T3qQD2eQBbijDsqxvNiEs8U": "compliance_pro",
  "price_1T3qQD2eQBbijDsqbcwCMX7v": "compliance_pro",
  "price_1T36YO2eQBbijDsqkULOdtRi": "community_plus",
  "price_1T3qQg2eQBbijDsqHaOVBbtA": "community_plus",
  "price_1T3qRQ2eQBbijDsq7PP4vlxh": "management_suite",
  "price_1T3qSR2eQBbijDsqzVEUuZD4": "management_suite",
};

const TIER_PRICES: Record<string, { monthly: string; annual: string }> = {
  compliance_pro: { monthly: "price_1T3qQD2eQBbijDsqxvNiEs8U", annual: "price_1T3qQD2eQBbijDsqbcwCMX7v" },
  community_plus: { monthly: "price_1T36YO2eQBbijDsqkULOdtRi", annual: "price_1T3qQg2eQBbijDsqHaOVBbtA" },
  management_suite: { monthly: "price_1T3qRQ2eQBbijDsq7PP4vlxh", annual: "price_1T3qSR2eQBbijDsqzVEUuZD4" },
};

const TIER_MONTHLY_RATES: Record<string, number> = {
  compliance_pro: 179,
  community_plus: 279,
  management_suite: 399,
};

const TIER_SUBSCRIPTION_SLUGS: Record<string, string> = {
  compliance_pro: "compliance-pro",
  community_plus: "community-plus",
  management_suite: "management-suite",
};

// Supabase REST helper (service role bypasses RLS)
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
  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (method === "GET" || headers["Prefer"] === "return=representation") {
    return res.ok ? await res.json() : null;
  }
  return res.ok;
}

// Stripe API helper
async function stripeRequest(method: string, path: string, body?: URLSearchParams) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${STRIPE_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body?.toString(),
  });
  return await res.json();
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
    // ── Auth: verify user via Supabase Auth API ──
    const auth = req.headers.get("Authorization") || "";
    const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { "Authorization": auth, "apikey": SB_ANON },
    });
    if (!userRes.ok) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const user = await userRes.json();

    // ── Authz: confirm caller is a board_member and get tenant_id ──
    const tu = await sbQuery("GET", "tenant_users", {
      "user_id": `eq.${user.id}`,
      "role": "eq.board_member",
      "select": "tenant_id",
    });
    if (!tu?.tenant_id) {
      return jsonResponse({ error: "Only board members can manage subscriptions" }, 403);
    }
    const tenantId = tu.tenant_id;

    // Get tenant's Stripe subscription ID
    const tenant = await sbQuery("GET", "tenants", {
      "id": `eq.${tenantId}`,
      "select": "stripe_subscription_id,name",
    });
    if (!tenant?.stripe_subscription_id) {
      return jsonResponse({ error: "No active Stripe subscription found" }, 404);
    }
    const stripeSubId = tenant.stripe_subscription_id;

    // Parse request body
    const { action, newTier } = await req.json();

    // ═══════════════════════════════════════
    // ACTION: change-tier
    // ═══════════════════════════════════════
    if (action === "change-tier") {
      if (!newTier || !TIER_PRICES[newTier]) {
        return jsonResponse({ error: "Invalid tier" }, 400);
      }

      // Get current Stripe subscription to find item ID and billing interval
      const stripeSub = await stripeRequest("GET", `subscriptions/${stripeSubId}`);
      if (stripeSub.error) {
        return jsonResponse({ error: stripeSub.error.message }, 500);
      }

      const currentItem = stripeSub.items?.data?.[0];
      if (!currentItem) {
        return jsonResponse({ error: "No subscription item found" }, 500);
      }

      // Determine billing interval from current price
      const currentPriceId = currentItem.price?.id;
      const currentInterval = currentItem.price?.recurring?.interval;
      const isAnnual = currentInterval === "year";

      // Pick the new price ID matching the current billing interval
      const newPriceId = isAnnual ? TIER_PRICES[newTier].annual : TIER_PRICES[newTier].monthly;

      // Update Stripe subscription — no proration
      const params = new URLSearchParams();
      params.append("items[0][id]", currentItem.id);
      params.append("items[0][price]", newPriceId);
      params.append("proration_behavior", "none");

      const updated = await stripeRequest("POST", `subscriptions/${stripeSubId}`, params);
      if (updated.error) {
        return jsonResponse({ error: updated.error.message }, 500);
      }

      // Update local subscriptions table
      const monthlyRate = TIER_MONTHLY_RATES[newTier];
      await sbQuery("PATCH", `subscriptions?tenant_id=eq.${tenantId}`, {}, {
        tier: newTier,
        monthly_rate: monthlyRate,
      });

      // Update tenant_features with new tier defaults
      const features = TIER_FEATURES[newTier];
      if (features) {
        await sbQuery("PATCH", `tenant_features?tenant_id=eq.${tenantId}`, {}, features);
      }

      // Sync to govops
      if (GOVOPS_URL && GOVOPS_SERVICE_KEY) {
        await fetch(`${GOVOPS_URL}/rest/v1/tenancies?id=eq.${tenantId}`, {
          method: "PATCH",
          headers: {
            "apikey": GOVOPS_SERVICE_KEY,
            "Authorization": `Bearer ${GOVOPS_SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ subscription_id: TIER_SUBSCRIPTION_SLUGS[newTier] }),
        }).catch(e => console.error("Govops sync (tier change):", e));
      }

      // Audit log
      await sbQuery("POST", "audit_log", {}, {
        tenant_id: tenantId,
        actor_name: user.email || "Board Member",
        actor_role: "board_member",
        action: "subscription.tier_changed",
        target: stripeSubId,
        details: `Changed subscription tier to ${newTier}`,
      });

      return jsonResponse({ success: true, tier: newTier });
    }

    // ═══════════════════════════════════════
    // ACTION: cancel
    // ═══════════════════════════════════════
    if (action === "cancel") {
      const params = new URLSearchParams();
      params.append("cancel_at_period_end", "true");

      const updated = await stripeRequest("POST", `subscriptions/${stripeSubId}`, params);
      if (updated.error) {
        return jsonResponse({ error: updated.error.message }, 500);
      }

      // Update local cancel_at_period_end flag
      await sbQuery("PATCH", `subscriptions?tenant_id=eq.${tenantId}`, {}, {
        cancel_at_period_end: true,
      });

      // Audit log
      await sbQuery("POST", "audit_log", {}, {
        tenant_id: tenantId,
        actor_name: user.email || "Board Member",
        actor_role: "board_member",
        action: "subscription.cancel_scheduled",
        target: stripeSubId,
        details: `Scheduled subscription cancellation at period end`,
      });

      const periodEnd = updated.current_period_end
        ? new Date(updated.current_period_end * 1000).toISOString()
        : null;

      return jsonResponse({ success: true, periodEnd });
    }

    // ═══════════════════════════════════════
    // ACTION: reactivate
    // ═══════════════════════════════════════
    if (action === "reactivate") {
      const params = new URLSearchParams();
      params.append("cancel_at_period_end", "false");

      const updated = await stripeRequest("POST", `subscriptions/${stripeSubId}`, params);
      if (updated.error) {
        return jsonResponse({ error: updated.error.message }, 500);
      }

      // Clear local cancel_at_period_end flag
      await sbQuery("PATCH", `subscriptions?tenant_id=eq.${tenantId}`, {}, {
        cancel_at_period_end: false,
      });

      // Audit log
      await sbQuery("POST", "audit_log", {}, {
        tenant_id: tenantId,
        actor_name: user.email || "Board Member",
        actor_role: "board_member",
        action: "subscription.reactivated",
        target: stripeSubId,
        details: "Cancelled pending cancellation — subscription reactivated",
      });

      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Invalid action. Use: change-tier, cancel, reactivate" }, 400);

  } catch (err) {
    console.error("manage-subscription error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
