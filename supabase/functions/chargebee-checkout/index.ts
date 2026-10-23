// supabase/functions/chargebee-checkout/index.ts
// Creates a Chargebee Hosted Page checkout session.
// Two modes: new building (onboarding) and existing tenant (upgrade from free/trial).
// Zero dependencies -- raw fetch to Chargebee API + Supabase REST/Auth.

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CHARGEBEE_SITE = Deno.env.get("CHARGEBEE_SITE") || "";
const CHARGEBEE_API_KEY = Deno.env.get("CHARGEBEE_API_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://app.getonetwo.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, baggage, sentry-trace",
};

// ── Chargebee item-price IDs ──
// Production site uses "Compliance-Pro" for self-managed; test site uses "Self-Managed"
const SM_PREFIX = CHARGEBEE_SITE.includes("test") ? "Self-Managed" : "Compliance-Pro";

type PlanId = "self_managed" | "facilities";
type Interval = "monthly" | "annual";

function planPriceId(plan: PlanId, interval: Interval): string {
  const map: Record<string, string> = {
    self_managed_monthly: `${SM_PREFIX}-USD-Monthly`,
    self_managed_annual: `${SM_PREFIX}-USD-Yearly`,
    facilities_monthly: "Plus-Facilities-USD-Monthly",
    facilities_annual: "Plus-Facilities-USD-Yearly",
  };
  return map[`${plan}_${interval}`];
}

function onCallPriceId(_plan: PlanId, interval: Interval): string {
  return interval === "annual" ? "On-Call-USD-Yearly" : "On-Call-USD-Monthly";
}

function pmSeatPriceId(interval: Interval): string {
  return interval === "annual" ? "PM-Seat-USD-Yearly" : "PM-Seat-USD-Monthly";
}

function setupPriceId(plan: PlanId): string {
  return plan === "facilities" ? "Setup-Fac-USD" : "Setup-SM-USD";
}

// ── Supabase helpers ──

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

async function chargebeeRequest(path: string, params: URLSearchParams) {
  const url = `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(CHARGEBEE_API_KEY + ":"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
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

    const body = await req.json();
    const {
      plan,
      interval,
      onCall,
      setup,
      pmSeat,
      origin,
    }: {
      plan: PlanId;
      interval: Interval;
      onCall?: boolean;
      setup?: boolean;
      pmSeat?: boolean;
      origin?: string;
    } = body;

    if (!plan || !interval) {
      return jsonResponse({ error: "plan and interval are required" }, 400);
    }
    if (plan !== "self_managed" && plan !== "facilities") {
      return jsonResponse({ error: "Invalid plan" }, 400);
    }
    if (interval !== "monthly" && interval !== "annual") {
      return jsonResponse({ error: "Invalid interval" }, 400);
    }

    const returnBase = origin || SITE_URL;

    // ── Build Chargebee checkout params ──
    const p = new URLSearchParams();
    let itemIdx = 0;

    // Plan price
    p.append(`subscription_items[item_price_id][${itemIdx}]`, planPriceId(plan, interval));
    p.append(`subscription_items[quantity][${itemIdx}]`, "1");
    itemIdx++;

    // On Call addon
    if (onCall) {
      p.append(`subscription_items[item_price_id][${itemIdx}]`, onCallPriceId(plan, interval));
      p.append(`subscription_items[quantity][${itemIdx}]`, "1");
      itemIdx++;
    }

    // ── Determine mode: new building vs existing tenant ──
    if (body.tenantId) {
      // ═══ EXISTING TENANT MODE ═══
      const tenantId: string = body.tenantId;
      const pmSeat: boolean = body.pmSeat || false;

      // Authz: caller must be board_member for this tenant
      const tu = await sbQuery("GET", "tenant_users", {
        user_id: `eq.${user.id}`,
        tenant_id: `eq.${tenantId}`,
        role: "eq.board_member",
        select: "tenant_id",
      });
      if (!tu?.tenant_id) {
        return jsonResponse(
          { error: "Only board members can create checkout sessions" },
          403,
        );
      }

      // Check tenant does not already have a chargebee subscription
      const sub = await sbQuery("GET", "subscriptions", {
        tenant_id: `eq.${tenantId}`,
        select: "chargebee_subscription_id",
      });
      if (sub?.chargebee_subscription_id) {
        return jsonResponse(
          { error: "Tenant already has an active Chargebee subscription" },
          409,
        );
      }

      // PM Seat addon
      if (pmSeat) {
        p.append(`subscription_items[item_price_id][${itemIdx}]`, pmSeatPriceId(interval));
        p.append(`subscription_items[quantity][${itemIdx}]`, "1");
        itemIdx++;
      }

      // Setup charge
      if (setup) {
        p.append("charges[item_price_id][0]", setupPriceId(plan));
        p.append("charges[quantity][0]", "1");
      }

      // Customer
      p.append("customer[id]", `cb_tenant_${tenantId}`);
      p.append("customer[email]", user.email || "");

      // Custom field: link to tenant
      p.append("subscription[cf_tenent_id]", tenantId);

      // Redirect
      p.append("redirect_url", `${returnBase}/subscription?billing=1`);
      p.append("cancel_url", `${returnBase}/subscription?canceled=1`);
    } else if (body.building) {
      // ═══ NEW BUILDING MODE ═══
      const building = body.building as {
        name: string;
        subdomain?: string;
        address?: { street?: string; city?: string; state?: string; zip?: string };
        totalUnits?: number;
        contactName?: string;
        boardTitle?: string;
        marAddressId?: string;
        ssl?: string;
        ward?: string;
        // HO-18: extended fields
        role?: string;
        roleKey?: string;
        firstName?: string;
        lastName?: string;
        addressFlag?: string;
      };

      if (!building.name) {
        return jsonResponse({ error: "building.name is required" }, 400);
      }

      // Shared: create supabaseAdmin and fetch trial days for both setup and no-setup paths
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      const supabaseAdmin = createClient(SB_URL, SB_SERVICE_KEY);
      const { data: trialDaysVal } = await supabaseAdmin.rpc('get_trial_days');
      const trialDays = typeof trialDaysVal === 'number' && trialDaysVal >= 0 ? trialDaysVal : 21;

      if (!setup) {
        // No setup = no card needed. Create customer + subscription via API, provision directly.
        const cp = new URLSearchParams();
        cp.append('id', `cb_${user.id}`);
        cp.append('email', user.email || '');
        cp.append('first_name', building.firstName || building.contactName || '');
      cp.append('last_name', building.lastName || '');
        const custResult = await chargebeeRequest('customers', cp);
        const customerId = custResult.customer.id;

        const sp = new URLSearchParams();
        let sIdx = 0;
        sp.append(`subscription_items[item_price_id][${sIdx}]`, planPriceId(plan, interval));
        sp.append(`subscription_items[quantity][${sIdx}]`, '1');
        sIdx++;
        if (onCall) {
          sp.append(`subscription_items[item_price_id][${sIdx}]`, onCallPriceId(plan, interval));
          sp.append(`subscription_items[quantity][${sIdx}]`, '1');
          sIdx++;
        }
        if (pmSeat) {
          sp.append(`subscription_items[item_price_id][${sIdx}]`, pmSeatPriceId(interval));
          sp.append(`subscription_items[quantity][${sIdx}]`, '1');
          sIdx++;
        }

        // Set trial period — no card is collected in this path
        sp.append('subscription[trial_period]', String(trialDays));
        sp.append('subscription[trial_period_unit]', 'day');

        // PC 2.0: subscription created under the customer resource
        const subResult = await chargebeeRequest(`customers/${customerId}/subscription_for_items`, sp);
        const cbSub = subResult.subscription;

        // Provision tenant directly
        const { data: provResult, error: provError } = await supabaseAdmin.rpc('provision_tenant', {
          p_name: building.name,
          p_address: building.address || {},
          p_total_units: building.totalUnits || 0,
          p_year_built: null,
          p_plan: plan,
          p_contact_name: building.contactName || '',
          p_contact_email: user.email || '',
          p_contact_phone: '',
          p_user_id: user.id,
          p_on_call: !!onCall,
          p_pm_seat: !!pmSeat,
          p_billing_interval: interval,
          p_chargebee_customer_id: customerId,
          p_chargebee_subscription_id: cbSub.id,
          p_board_title: building.boardTitle || 'President',
          p_subdomain: building.subdomain || null,
          // HO-18 extended fields
          p_role: building.role || 'board_member',
          p_role_key: building.roleKey || null,
          p_first_name: building.firstName || null,
          p_last_name: building.lastName || null,
          p_mar_address_id: building.marAddressId || null,
          p_ssl: building.ssl || null,
          p_ward: building.ward || null,
          p_address_flag: building.addressFlag || null,
        });

        if (provError) {
          return new Response(JSON.stringify({ error: provError.message }), { status: 500, headers: cors });
        }

        return new Response(JSON.stringify({ provisioned: true, tenantId: provResult.tenant_id, subdomain: provResult.subdomain }), { headers: cors });
      }

      // PM Seat addon
      if (pmSeat) {
        p.append(`subscription_items[item_price_id][${itemIdx}]`, pmSeatPriceId(interval));
        p.append(`subscription_items[quantity][${itemIdx}]`, "1");
        itemIdx++;
      }

      // Setup charge
      p.append("charges[item_price_id][0]", setupPriceId(plan));
      p.append("charges[quantity][0]", "1");

      // Customer
      p.append("customer[id]", `cb_${user.id}`);
      p.append("customer[email]", user.email || "");
      p.append("customer[first_name]", building.firstName || building.contactName || "");
      p.append("customer[last_name]", building.lastName || "");

      // Store pending building data in Supabase for the webhook to read
      const customerId = `cb_${user.id}`;
      const pendingData = {
        name: building.name,
        subdomain: building.subdomain || "",
        address: building.address || {},
        totalUnits: building.totalUnits || 0,
        contactName: building.contactName || "",
        contactEmail: user.email || "",
        boardTitle: building.boardTitle || "President",
        userId: user.id,
        plan,
        onCall: !!onCall,
        pmSeat: !!pmSeat,
        interval,
        marAddressId: building.marAddressId || "",
        ssl: building.ssl || "",
        ward: building.ward || "",
        role: building.role || "board_member",
        roleKey: building.roleKey || "",
        firstName: building.firstName || "",
        lastName: building.lastName || "",
        addressFlag: building.addressFlag || "",
      };
      await fetch(`${SB_URL}/rest/v1/pending_checkouts`, {
        method: "POST",
        headers: {
          apikey: SB_SERVICE_KEY,
          Authorization: `Bearer ${SB_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          chargebee_customer_id: customerId,
          user_id: user.id,
          payload: pendingData,
        }),
      });
      p.append("subscription[cf_tenent_id]", "pending");

      // Trial period — so Chargebee shows "X day free trial" on the hosted page
      p.append('subscription[trial_period]', String(trialDays));
      p.append('subscription[trial_period_unit]', 'day');

      // Billing address for tax calculation
      if (building.address) {
        p.append("billing_address[line1]", building.address.street || "");
        p.append("billing_address[city]", building.address.city || "");
        p.append("billing_address[state_code]", building.address.state || "DC");
        p.append("billing_address[zip]", building.address.zip || "");
        p.append("billing_address[country]", "US");
      }

      // Redirect -- include hosted page id so frontend can correlate
      p.append("redirect_url", `${returnBase}/login?provisioned=1&hp={hosted_page.id}`);
      p.append("cancel_url", `${returnBase}/login?canceled=1`);
    } else {
      return jsonResponse(
        { error: "Either building (new) or tenantId (existing) must be provided" },
        400,
      );
    }

    // ── Call Chargebee ──
    const result = await chargebeeRequest("hosted_pages/checkout_new_for_items", p);
    const hostedPage = result.hosted_page;

    return jsonResponse({ url: hostedPage.url, hostedPageId: hostedPage.id });
  } catch (err) {
    console.error("chargebee-checkout error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
