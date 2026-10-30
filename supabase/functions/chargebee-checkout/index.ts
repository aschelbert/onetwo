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
// Production Chargebee has a typo in the custom field name; test site uses the correct spelling.
const CF_TENANT_ID = CHARGEBEE_SITE.includes("test") ? "cf_tenant_id" : "cf_tenent_id";

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

function setupPriceId(_plan: PlanId): string {
  return "Setup-Fee-USD";
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

      // Setup fee (addon with billing_cycles=1, charges once)
      if (setup) {
        p.append(`subscription_items[item_price_id][${itemIdx}]`, setupPriceId(plan));
        p.append(`subscription_items[quantity][${itemIdx}]`, "1");
        itemIdx++;
      }

      // Customer
      p.append("customer[id]", `cb_tenant_${tenantId}`);
      p.append("customer[email]", user.email || "");

      // Custom field: link to tenant
      p.append(`subscription[${CF_TENANT_ID}]`, tenantId);

      // Redirect
      p.append("redirect_url", `${returnBase}/subscription?billing=1`);
      p.append("cancel_url", `${returnBase}/subscription?canceled=1`);
    } else if (body.building) {
      // ═══ NEW BUILDING MODE ═══
      // Collect credit card via Chargebee hosted checkout page.
      // Building data is saved to pending_checkouts; the chargebee-webhook
      // handler provisions the tenant after checkout completes.
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

      // Fetch trial days for the hosted checkout page
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      const supabaseAdmin = createClient(SB_URL, SB_SERVICE_KEY);
      const { data: trialDaysVal } = await supabaseAdmin.rpc('get_trial_days');
      const trialDays = typeof trialDaysVal === 'number' && trialDaysVal >= 0 ? trialDaysVal : 21;

      // Create Chargebee customer first so we can link pending_checkouts
      const cp = new URLSearchParams();
      cp.append('id', `cb_${user.id}`);
      cp.append('email', user.email || '');
      cp.append('first_name', building.firstName || building.contactName || '');
      cp.append('last_name', building.lastName || '');
      const custResult = await chargebeeRequest('customers', cp);
      const customerId = custResult.customer.id;

      // Save building data for the webhook to provision after checkout
      await sbQuery("POST", "pending_checkouts", {}, {
        chargebee_customer_id: customerId,
        user_id: user.id,
        payload: {
          name: building.name,
          subdomain: building.subdomain || null,
          address: building.address || {},
          totalUnits: building.totalUnits || 0,
          contactName: building.contactName || '',
          contactEmail: user.email || '',
          boardTitle: building.boardTitle || 'President',
          plan,
          userId: user.id,
          // HO-18 extended fields
          role: building.role || 'board_member',
          roleKey: building.roleKey || null,
          firstName: building.firstName || null,
          lastName: building.lastName || null,
          marAddressId: building.marAddressId || null,
          ssl: building.ssl || null,
          ward: building.ward || null,
          addressFlag: building.addressFlag || null,
        },
      });

      // PM Seat addon
      if (pmSeat) {
        p.append(`subscription_items[item_price_id][${itemIdx}]`, pmSeatPriceId(interval));
        p.append(`subscription_items[quantity][${itemIdx}]`, "1");
        itemIdx++;
      }

      // Trial period shown on the hosted checkout page
      p.append("subscription[trial_period]", String(trialDays));
      p.append("subscription[trial_period_unit]", "day");

      // Customer (pre-created above)
      p.append("customer[id]", customerId);
      p.append("customer[email]", user.email || "");

      // Custom field: set to "pending" — the webhook will update after provisioning
      p.append(`subscription[${CF_TENANT_ID}]`, "pending");

      // Billing address for tax calculation
      if (building.address) {
        if (building.address.street) p.append("billing_address[line1]", building.address.street);
        if (building.address.city) p.append("billing_address[city]", building.address.city);
        if (building.address.state) p.append("billing_address[state_code]", building.address.state);
        if (building.address.zip) p.append("billing_address[zip]", building.address.zip);
        p.append("billing_address[country]", "US");
      }

      // Redirect URLs — ?provisioned=1 triggers the AuthPage polling flow
      // that waits for the webhook to provision the tenant, then auto-logs in
      p.append("redirect_url", `${returnBase}/login?provisioned=1`);
      p.append("cancel_url", `${returnBase}/login?checkout=canceled`);
    } else {
      return jsonResponse(
        { error: "Either building (new) or tenantId (existing) must be provided" },
        400,
      );
    }

    // ── Call Chargebee ──
    const result = await chargebeeRequest("hosted_pages/checkout_new_for_items", p);
    const hostedPage = result.hosted_page;

    return jsonResponse({ hosted_page: hostedPage, url: hostedPage.url, hostedPageId: hostedPage.id });
  } catch (err) {
    console.error("chargebee-checkout error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
