// supabase/functions/chargebee-trial-settings/index.ts
// Reads and sets the free trial length for the Admin Console.
//
// Chargebee is where a trial actually starts, so it is the source of truth:
// the trial length lives on each plan item price. This function reads those
// values for the console, and on save writes the new length to every plan
// item price and then to platform_settings.trial_days, which the signup page,
// the website and checkout read. Platform admins only.
//
// Turning the trial off is stored as trial_days = 0. Checkout enforces it by
// telling Chargebee to start the subscription with no trial, so the plan
// prices keep their last length for when the trial is switched back on.
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

const MAX_TRIAL_DAYS = 365;

// Same ids as chargebee-checkout: production uses "Compliance-Pro" for Self-Managed.
const SM_PREFIX = CHARGEBEE_SITE.includes("test") ? "Self-Managed" : "Compliance-Pro";

const PLAN_PRICES: { id: string; plan: string; interval: string }[] = [
  { id: `${SM_PREFIX}-USD-Monthly`, plan: "self_managed", interval: "monthly" },
  { id: `${SM_PREFIX}-USD-Yearly`, plan: "self_managed", interval: "annual" },
  { id: "Plus-Facilities-USD-Monthly", plan: "facilities", interval: "monthly" },
  { id: "Plus-Facilities-USD-Yearly", plan: "facilities", interval: "annual" },
];

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function chargebee(method: "GET" | "POST", path: string, params?: URLSearchParams) {
  const res = await fetch(`https://${CHARGEBEE_SITE}.chargebee.com/api/v2/${path}`, {
    method,
    headers: {
      Authorization: "Basic " + btoa(CHARGEBEE_API_KEY + ":"),
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" ? (params ?? new URLSearchParams()).toString() : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || data?.error_msg || JSON.stringify(data);
    throw new Error(`Chargebee ${path} failed (${res.status}): ${msg}`);
  }
  return data;
}

/** Trial length of an item price in days, or null when it is not a whole number of days. */
function trialDaysOf(price: Record<string, unknown>): number | null {
  const period = price.trial_period;
  if (period === undefined || period === null) return 0;
  if (typeof period !== "number") return null;
  const unit = (price.trial_period_unit as string) || "day";
  return unit === "day" ? period : null;
}

async function readPlanPrices() {
  return await Promise.all(PLAN_PRICES.map(async (p) => {
    try {
      const { item_price } = await chargebee("GET", `item_prices/${encodeURIComponent(p.id)}`);
      return {
        ...p,
        found: true,
        trialDays: trialDaysOf(item_price),
        trialPeriod: item_price.trial_period ?? null,
        trialPeriodUnit: item_price.trial_period_unit ?? null,
        status: item_price.status ?? null,
      };
    } catch (e) {
      return { ...p, found: false, trialDays: null, trialPeriod: null, trialPeriodUnit: null, status: null, error: String(e) };
    }
  }));
}

async function sbService(method: string, pathAndQuery: string, body?: unknown) {
  return await fetch(`${SB_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: SB_SERVICE_KEY,
      Authorization: `Bearer ${SB_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function storedTrialDays(): Promise<number | null> {
  const res = await sbService("GET", "platform_settings?id=eq.default&select=trial_days");
  if (!res.ok) return null;
  const rows = await res.json();
  return typeof rows?.[0]?.trial_days === "number" ? rows[0].trial_days : null;
}

function summarize(prices: Awaited<ReturnType<typeof readPlanPrices>>, stored: number | null) {
  const found = prices.filter((p) => p.found);
  const values = [...new Set(found.map((p) => p.trialDays))];
  // One number only when every plan price was read and they all agree on a day count.
  const chargebeeTrialDays =
    found.length === prices.length && values.length === 1 && values[0] !== null ? values[0] : null;
  const trialOff = stored === 0;
  return {
    site: CHARGEBEE_SITE,
    prices,
    chargebeeTrialDays,
    storedTrialDays: stored,
    // Off is enforced at checkout, not on the plan prices, so there is nothing to compare.
    trialOff,
    // What a new signup gets: no trial when off, otherwise what Chargebee holds.
    effectiveTrialDays: trialOff ? 0 : chargebeeTrialDays,
    inSync: trialOff || (chargebeeTrialDays !== null && chargebeeTrialDays === stored),
  };
}

/**
 * True when the caller presented a service role key for this project.
 * The key the Admin Console holds need not be the same string as the one in
 * this function's environment (a project can have several), so anything that
 * claims to be a service key is checked against an endpoint only a service
 * role can read, rather than compared to one known value.
 */
async function isServiceCaller(authHeader: string): Promise<boolean> {
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  if (SB_SERVICE_KEY && token === SB_SERVICE_KEY) return true;

  let claimsService = token.startsWith("sb_secret_");
  if (!claimsService) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      claimsService = payload?.role === "service_role";
    } catch {
      claimsService = false;
    }
  }
  if (!claimsService) return false;

  const res = await fetch(`${SB_URL}/auth/v1/admin/users?page=1&per_page=1`, {
    headers: { apikey: token, Authorization: `Bearer ${token}` },
  });
  await res.body?.cancel();
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    // ── Platform admins only ──
    // Two callers: a signed-in platform admin (the in-app console), or the
    // separate Admin Console app, which checks its own admins and then calls
    // server-to-server with this project's service role key.
    const auth = req.headers.get("Authorization") || "";
    const body = await req.json().catch(() => ({}));
    let actor: string;
    if (await isServiceCaller(auth)) {
      actor = typeof body?.actor === "string" && body.actor ? body.actor.slice(0, 200) : "Admin Console";
    } else {
      const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
        headers: { apikey: SB_ANON, Authorization: auth },
      });
      if (!userRes.ok) return jsonResponse({ error: "Not signed in" }, 401);
      const user = await userRes.json();
      if (!user?.id) return jsonResponse({ error: "Not signed in" }, 401);

      const adminRes = await sbService(
        "GET",
        `platform_admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`,
      );
      const admins = adminRes.ok ? await adminRes.json() : [];
      if (!Array.isArray(admins) || admins.length === 0) {
        return jsonResponse({ error: "Platform admins only" }, 403);
      }
      actor = user.email || user.id;
    }

    if (!CHARGEBEE_SITE || !CHARGEBEE_API_KEY) {
      return jsonResponse({ error: "Chargebee is not configured for this environment" }, 503);
    }

    const action = body?.action === "set" ? "set" : "get";

    if (action === "get") {
      return jsonResponse(summarize(await readPlanPrices(), await storedTrialDays()));
    }

    // ── Set ──
    const days = body?.days;
    if (!Number.isInteger(days) || days < 0 || days > MAX_TRIAL_DAYS) {
      return jsonResponse({ error: `days must be a whole number from 0 to ${MAX_TRIAL_DAYS}` }, 400);
    }

    // Chargebee first: if it refuses, the stored number must not move ahead of it.
    // Turning the trial off changes nothing in Chargebee (see the note at the top).
    const failures: string[] = [];
    for (const p of days === 0 ? [] : PLAN_PRICES) {
      const params = new URLSearchParams();
      params.append("trial_period", String(days));
      params.append("trial_period_unit", "day");
      try {
        await chargebee("POST", `item_prices/${encodeURIComponent(p.id)}`, params);
      } catch (e) {
        failures.push(`${p.id}: ${String(e)}`);
      }
    }

    // Read back what Chargebee now holds rather than trusting the writes.
    const prices = await readPlanPrices();
    const confirmed = days === 0 || prices.every((p) => p.found && p.trialDays === days);

    if (failures.length > 0 || !confirmed) {
      return jsonResponse({
        error: failures.length > 0
          ? `Chargebee did not accept the change for ${failures.length} of ${PLAN_PRICES.length} plan prices`
          : "Chargebee accepted the change but still reports a different trial length",
        failures,
        ...summarize(prices, await storedTrialDays()),
      }, 502);
    }

    const save = await sbService("PATCH", "platform_settings?id=eq.default", {
      trial_days: days,
      updated_at: new Date().toISOString(),
      updated_by: actor,
    });
    if (!save.ok) {
      return jsonResponse({
        error: `Chargebee is updated, but saving the setting failed (${save.status}): ${await save.text()}`,
        ...summarize(prices, await storedTrialDays()),
      }, 500);
    }

    await sbService("POST", "audit_log", {
      actor_name: actor,
      actor_role: "platform_admin",
      action: "platform.trial_days_updated",
      target: "Platform Settings",
      details: days === 0
        ? "Free trial turned off: new buildings are billed at signup"
        : `Free trial set to ${days} days in Chargebee (${CHARGEBEE_SITE}) and platform settings`,
    }).catch(() => undefined);

    return jsonResponse(summarize(prices, days));
  } catch (err) {
    console.error("chargebee-trial-settings error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
