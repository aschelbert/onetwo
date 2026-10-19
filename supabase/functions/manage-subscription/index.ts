// supabase/functions/manage-subscription/index.ts
// Chargebee subscription management actions for board members.
// Actions: change-plan, set-on-call, set-pm-seat, buy-setup, set-interval, cancel, reactivate
// Zero dependencies -- raw fetch to Chargebee API + Supabase REST/Auth.

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CHARGEBEE_SITE = Deno.env.get("CHARGEBEE_SITE") || "";
const CHARGEBEE_API_KEY = Deno.env.get("CHARGEBEE_API_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, baggage, sentry-trace",
};

// ── Types ──

type PlanId = "self_managed" | "facilities";
type Interval = "monthly" | "annual";

// ── Chargebee item-price ID helpers ──

function planPriceId(plan: PlanId, interval: Interval): string {
  const map: Record<string, string> = {
    self_managed_monthly: "Self-Managed-USD-Monthly",
    self_managed_annual: "Self-Managed-USD-Annual",
    facilities_monthly: "Facilities-USD-Monthly",
    facilities_annual: "Facilities-USD-Annual",
  };
  return map[`${plan}_${interval}`];
}

function onCallPriceId(plan: PlanId, interval: Interval): string {
  const map: Record<string, string> = {
    self_managed_monthly: "OnCall-SM-USD-Monthly",
    self_managed_annual: "OnCall-SM-USD-Annual",
    facilities_monthly: "OnCall-Fac-USD-Monthly",
    facilities_annual: "OnCall-Fac-USD-Annual",
  };
  return map[`${plan}_${interval}`];
}

function pmSeatPriceId(interval: Interval): string {
  return interval === "annual" ? "PM-Seat-USD-Annual" : "PM-Seat-USD-Monthly";
}

function setupPriceId(plan: PlanId): string {
  return plan === "facilities" ? "Setup-Fac-USD" : "Setup-SM-USD";
}

// ── Pricing (cents) ──

const PLAN_MONTHLY: Record<PlanId, number> = { self_managed: 17900, facilities: 27900 };
const ON_CALL_MONTHLY: Record<PlanId, number> = { self_managed: 24900, facilities: 49900 };
const PM_SEAT_MONTHLY = 7900;

function computeMonthlyRate(plan: PlanId, onCall: boolean, pmSeat: boolean): number {
  let rate = PLAN_MONTHLY[plan];
  if (onCall) rate += ON_CALL_MONTHLY[plan];
  if (pmSeat) rate += PM_SEAT_MONTHLY;
  return rate;
}

// ── Supabase REST helper ──

async function sbQuery(
  method: string,
  table: string,
  params?: Record<string, string>,
  // deno-lint-ignore no-explicit-any
  body?: any,
) {
  const url = new URL(`${SB_URL}/rest/v1/${table}`);
  if (params)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = {
    apikey: SB_SERVICE_KEY,
    Authorization: `Bearer ${SB_SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: method === "POST" ? "return=representation" : "return=minimal",
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

// ── Chargebee API helper ──

async function chargebeeRequest(
  method: string,
  path: string,
  params?: URLSearchParams,
) {
  const url = `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: "Basic " + btoa(CHARGEBEE_API_KEY + ":"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params?.toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.message || data?.error_msg || JSON.stringify(data);
    throw new Error(`Chargebee ${path} failed (${res.status}): ${msg}`);
  }
  return data;
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
      headers: { Authorization: auth, apikey: SB_ANON },
    });
    if (!userRes.ok) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const user = await userRes.json();

    // ── Authz: confirm caller is board_member and get tenant_id ──
    const tu = await sbQuery("GET", "tenant_users", {
      user_id: `eq.${user.id}`,
      role: "eq.board_member",
      select: "tenant_id",
    });
    if (!tu?.tenant_id) {
      return jsonResponse(
        { error: "Only board members can manage subscriptions" },
        403,
      );
    }
    const tenantId: string = tu.tenant_id;

    // ── Get subscription ──
    const sub = await sbQuery("GET", "subscriptions", {
      tenant_id: `eq.${tenantId}`,
      select: "chargebee_subscription_id,tier,addon_on_call,pm_addon,billing_interval,monthly_rate",
    });
    if (!sub?.chargebee_subscription_id) {
      return jsonResponse(
        { error: "No Chargebee subscription found for this tenant" },
        409,
      );
    }

    const cbSubId: string = sub.chargebee_subscription_id;
    const currentPlan: PlanId = sub.tier as PlanId;
    const currentInterval: Interval = (sub.billing_interval || "monthly") as Interval;
    const currentOnCall: boolean = sub.addon_on_call || false;
    const currentPmSeat: boolean = sub.pm_addon || false;

    const body = await req.json();
    const action: string = body.action;

    // ═══════════════════════════════════════
    // ACTION: change-plan
    // ═══════════════════════════════════════
    if (action === "change-plan") {
      const newPlan: PlanId = body.plan;
      if (!newPlan || (newPlan !== "self_managed" && newPlan !== "facilities")) {
        return jsonResponse({ error: "Invalid plan" }, 400);
      }
      if (newPlan === currentPlan) {
        return jsonResponse({ error: "Already on this plan" }, 400);
      }

      const p = new URLSearchParams();
      p.append("prorate", "true");

      let idx = 0;

      // New plan price
      p.append(`subscription_items[item_price_id][${idx}]`, planPriceId(newPlan, currentInterval));
      p.append(`subscription_items[quantity][${idx}]`, "1");
      idx++;

      // Swap On Call addon to match new plan tier (if active)
      if (currentOnCall) {
        p.append(`subscription_items[item_price_id][${idx}]`, onCallPriceId(newPlan, currentInterval));
        p.append(`subscription_items[quantity][${idx}]`, "1");
        idx++;
      }

      // Keep PM Seat (plan-independent)
      if (currentPmSeat) {
        p.append(`subscription_items[item_price_id][${idx}]`, pmSeatPriceId(currentInterval));
        p.append(`subscription_items[quantity][${idx}]`, "1");
        idx++;
      }

      // Replace all items
      p.append("replace_items_list", "true");

      await chargebeeRequest("POST", `subscriptions/${cbSubId}/update_for_items`, p);

      // Update local DB
      const newRate = computeMonthlyRate(newPlan, currentOnCall, currentPmSeat);
      await sbQuery("PATCH", `subscriptions?tenant_id=eq.${tenantId}`, {}, {
        tier: newPlan,
        monthly_rate: newRate,
      });
      await sbQuery("PATCH", `tenant_features?tenant_id=eq.${tenantId}`, {}, {
        facilities: newPlan === "facilities",
      });

      // Audit
      await sbQuery("POST", "audit_log", {}, {
        tenant_id: tenantId,
        actor_name: user.email || "Board Member",
        actor_role: "board_member",
        action: "subscription.plan_changed",
        target: cbSubId,
        details: `Changed plan from ${currentPlan} to ${newPlan}`,
      });

      return jsonResponse({ success: true, plan: newPlan, monthlyRate: newRate });
    }

    // ═══════════════════════════════════════
    // ACTION: set-on-call
    // ═══════════════════════════════════════
    if (action === "set-on-call") {
      const enable: boolean = body.enable !== false; // default true

      if (enable === currentOnCall) {
        return jsonResponse({
          error: `On Call is already ${enable ? "enabled" : "disabled"}`,
        }, 400);
      }

      const p = new URLSearchParams();
      p.append("prorate", "true");

      let idx = 0;

      // Always include the plan
      p.append(`subscription_items[item_price_id][${idx}]`, planPriceId(currentPlan, currentInterval));
      p.append(`subscription_items[quantity][${idx}]`, "1");
      idx++;

      // Add or omit On Call
      if (enable) {
        p.append(`subscription_items[item_price_id][${idx}]`, onCallPriceId(currentPlan, currentInterval));
        p.append(`subscription_items[quantity][${idx}]`, "1");
        idx++;
      }

      // Keep PM Seat if active
      if (currentPmSeat) {
        p.append(`subscription_items[item_price_id][${idx}]`, pmSeatPriceId(currentInterval));
        p.append(`subscription_items[quantity][${idx}]`, "1");
        idx++;
      }

      p.append("replace_items_list", "true");

      await chargebeeRequest("POST", `subscriptions/${cbSubId}/update_for_items`, p);

      // Update local DB
      const newRate = computeMonthlyRate(currentPlan, enable, currentPmSeat);
      await sbQuery("PATCH", `subscriptions?tenant_id=eq.${tenantId}`, {}, {
        addon_on_call: enable,
        monthly_rate: newRate,
      });
      await sbQuery("PATCH", `tenant_features?tenant_id=eq.${tenantId}`, {}, {
        on_call: enable,
      });

      // Audit
      await sbQuery("POST", "audit_log", {}, {
        tenant_id: tenantId,
        actor_name: user.email || "Board Member",
        actor_role: "board_member",
        action: enable ? "subscription.on_call_added" : "subscription.on_call_removed",
        target: cbSubId,
        details: `On Call ${enable ? "enabled" : "disabled"}`,
      });

      return jsonResponse({ success: true, onCall: enable, monthlyRate: newRate });
    }

    // ═══════════════════════════════════════
    // ACTION: set-pm-seat
    // ═══════════════════════════════════════
    if (action === "set-pm-seat") {
      const enable: boolean = body.enable !== false;

      if (enable === currentPmSeat) {
        return jsonResponse({
          error: `PM Seat is already ${enable ? "enabled" : "disabled"}`,
        }, 400);
      }

      const p = new URLSearchParams();
      p.append("prorate", "true");

      let idx = 0;

      // Always include the plan
      p.append(`subscription_items[item_price_id][${idx}]`, planPriceId(currentPlan, currentInterval));
      p.append(`subscription_items[quantity][${idx}]`, "1");
      idx++;

      // Keep On Call if active
      if (currentOnCall) {
        p.append(`subscription_items[item_price_id][${idx}]`, onCallPriceId(currentPlan, currentInterval));
        p.append(`subscription_items[quantity][${idx}]`, "1");
        idx++;
      }

      // Add or omit PM Seat
      if (enable) {
        p.append(`subscription_items[item_price_id][${idx}]`, pmSeatPriceId(currentInterval));
        p.append(`subscription_items[quantity][${idx}]`, "1");
        idx++;
      }

      p.append("replace_items_list", "true");

      await chargebeeRequest("POST", `subscriptions/${cbSubId}/update_for_items`, p);

      // Update local DB
      const newRate = computeMonthlyRate(currentPlan, currentOnCall, enable);
      await sbQuery("PATCH", `subscriptions?tenant_id=eq.${tenantId}`, {}, {
        pm_addon: enable,
        monthly_rate: newRate,
      });

      // Audit
      await sbQuery("POST", "audit_log", {}, {
        tenant_id: tenantId,
        actor_name: user.email || "Board Member",
        actor_role: "board_member",
        action: enable ? "subscription.pm_seat_added" : "subscription.pm_seat_removed",
        target: cbSubId,
        details: `PM Seat ${enable ? "enabled" : "disabled"}`,
      });

      return jsonResponse({ success: true, pmSeat: enable, monthlyRate: newRate });
    }

    // ═══════════════════════════════════════
    // ACTION: buy-setup
    // ═══════════════════════════════════════
    if (action === "buy-setup") {
      // Read current plan from DB to determine setup price
      const sPriceId = setupPriceId(currentPlan);

      // Get chargebee customer id
      const tenant = await sbQuery("GET", "tenants", {
        id: `eq.${tenantId}`,
        select: "chargebee_customer_id",
      });
      if (!tenant?.chargebee_customer_id) {
        return jsonResponse({ error: "No Chargebee customer found" }, 404);
      }

      // Check if customer has a payment method
      const custData = await chargebeeRequest('GET', `customers/${tenant.chargebee_customer_id}`);
      if (!custData?.customer?.payment_method?.status || custData.customer.payment_method.status !== 'valid') {
        return new Response(JSON.stringify({ needsCard: true }), { status: 402, headers: cors });
      }

      const p = new URLSearchParams();
      p.append("customer_id", tenant.chargebee_customer_id);
      p.append("charge_items[item_price_id][0]", sPriceId);
      p.append("charge_items[quantity][0]", "1");

      const result = await chargebeeRequest(
        "POST",
        "invoices/create_for_charge_items_and_charges",
        p,
      );

      const inv = result.invoice;

      // Audit
      await sbQuery("POST", "audit_log", {}, {
        tenant_id: tenantId,
        actor_name: user.email || "Board Member",
        actor_role: "board_member",
        action: "subscription.setup_purchased",
        target: inv?.id || cbSubId,
        details: `Setup charge invoice created: ${sPriceId}`,
      });

      return jsonResponse({ success: true, invoiceId: inv?.id });
    }

    // ═══════════════════════════════════════
    // ACTION: cancel
    // ═══════════════════════════════════════
    if (action === "cancel") {
      const p = new URLSearchParams();
      p.append("end_of_term", "true");

      await chargebeeRequest("POST", `subscriptions/${cbSubId}/cancel_for_items`, p);

      await sbQuery("PATCH", `subscriptions?tenant_id=eq.${tenantId}`, {}, {
        cancel_at_period_end: true,
      });

      // Audit
      await sbQuery("POST", "audit_log", {}, {
        tenant_id: tenantId,
        actor_name: user.email || "Board Member",
        actor_role: "board_member",
        action: "subscription.cancel_scheduled",
        target: cbSubId,
        details: "Scheduled subscription cancellation at period end",
      });

      return jsonResponse({ success: true });
    }

    // ═══════════════════════════════════════
    // ACTION: reactivate
    // ═══════════════════════════════════════
    if (action === "reactivate") {
      await chargebeeRequest("POST", `subscriptions/${cbSubId}/reactivate`, new URLSearchParams());

      await sbQuery("PATCH", `subscriptions?tenant_id=eq.${tenantId}`, {}, {
        cancel_at_period_end: false,
        status: "active",
        chargebee_status: "active",
      });

      // Audit
      await sbQuery("POST", "audit_log", {}, {
        tenant_id: tenantId,
        actor_name: user.email || "Board Member",
        actor_role: "board_member",
        action: "subscription.reactivated",
        target: cbSubId,
        details: "Subscription reactivated",
      });

      return jsonResponse({ success: true });
    }

    // ═══════════════════════════════════════
    // ACTION: set-interval
    // ═══════════════════════════════════════
    if (action === "set-interval") {
      const newInterval: Interval = body.interval;
      if (newInterval !== "monthly" && newInterval !== "annual") {
        return jsonResponse({ error: "Invalid interval. Use: monthly, annual" }, 400);
      }
      if (newInterval === currentInterval) {
        return jsonResponse({ error: "Already on this interval" }, 400);
      }

      const p = new URLSearchParams();
      p.append("prorate", "true");

      let idx = 0;

      // Plan price with new interval
      p.append(`subscription_items[item_price_id][${idx}]`, planPriceId(currentPlan, newInterval));
      p.append(`subscription_items[quantity][${idx}]`, "1");
      idx++;

      // On Call addon with new interval (if active)
      if (currentOnCall) {
        p.append(`subscription_items[item_price_id][${idx}]`, onCallPriceId(currentPlan, newInterval));
        p.append(`subscription_items[quantity][${idx}]`, "1");
        idx++;
      }

      // PM Seat with new interval (if active)
      if (currentPmSeat) {
        p.append(`subscription_items[item_price_id][${idx}]`, pmSeatPriceId(newInterval));
        p.append(`subscription_items[quantity][${idx}]`, "1");
        idx++;
      }

      p.append("replace_items_list", "true");

      await chargebeeRequest("POST", `subscriptions/${cbSubId}/update_for_items`, p);

      // Update local DB
      await sbQuery("PATCH", `subscriptions?tenant_id=eq.${tenantId}`, {}, {
        billing_interval: newInterval,
      });

      // Audit
      await sbQuery("POST", "audit_log", {}, {
        tenant_id: tenantId,
        actor_name: user.email || "Board Member",
        actor_role: "board_member",
        action: "subscription.interval_changed",
        target: cbSubId,
        details: `Changed billing interval from ${currentInterval} to ${newInterval}`,
      });

      return jsonResponse({ success: true, interval: newInterval });
    }

    return jsonResponse(
      { error: "Invalid action. Use: change-plan, set-on-call, set-pm-seat, buy-setup, set-interval, cancel, reactivate" },
      400,
    );
  } catch (err) {
    console.error("manage-subscription error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
