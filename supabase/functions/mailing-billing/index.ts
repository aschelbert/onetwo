// supabase/functions/mailing-billing/index.ts
// Manages mailing payment methods: setup-intent, save-payment-method, detach-method
// Zero dependencies — raw fetch to Stripe API + Supabase REST API

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";

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

async function stripeRequest(path: string, params: URLSearchParams, method = "POST") {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${STRIPE_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method !== "GET" ? params.toString() : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(`Stripe ${path} failed:`, JSON.stringify(json));
    return { ok: false as const, error: json };
  }
  return { ok: true as const, data: json };
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
      return jsonResponse({ error: "Only board members can manage mailing billing" }, 403);
    }
    const tenantId = tu.tenant_id;

    const body = await req.json();
    const { action } = body;

    // ═══ ACTION: setup-intent ═══
    // Get or create a Stripe Customer, then create a SetupIntent for off_session usage
    if (action === "setup-intent") {
      const settings = await sbQuery("GET", "financial_settings", {
        "tenant_id": `eq.${tenantId}`,
        "select": "mailing_stripe_customer_id",
      });

      let customerId = settings?.mailing_stripe_customer_id;

      // Create Stripe Customer if none exists
      if (!customerId) {
        const custParams = new URLSearchParams();
        custParams.append("metadata[tenant_id]", tenantId);
        custParams.append("metadata[purpose]", "mailing_billing");

        const custResult = await stripeRequest("/customers", custParams);
        if (!custResult.ok) {
          return jsonResponse({ error: "Failed to create Stripe customer" }, 500);
        }
        customerId = custResult.data.id;

        // Save customer ID
        await sbQuery("PATCH", `financial_settings?tenant_id=eq.${tenantId}`, {}, {
          mailing_stripe_customer_id: customerId,
        });
      }

      // Create SetupIntent
      const siParams = new URLSearchParams();
      siParams.append("customer", customerId);
      siParams.append("usage", "off_session");
      siParams.append("payment_method_types[0]", "card");

      const siResult = await stripeRequest("/setup_intents", siParams);
      if (!siResult.ok) {
        return jsonResponse({ error: "Failed to create SetupIntent" }, 500);
      }

      return jsonResponse({
        clientSecret: siResult.data.client_secret,
        customerId,
      });
    }

    // ═══ ACTION: save-payment-method ═══
    // After client-side confirmCardSetup succeeds, save card details + set as default
    if (action === "save-payment-method") {
      const { paymentMethodId, customerId } = body;
      if (!paymentMethodId || !customerId) {
        return jsonResponse({ error: "paymentMethodId and customerId are required" }, 400);
      }

      // Retrieve payment method details from Stripe
      const pmRes = await fetch(`https://api.stripe.com/v1/payment_methods/${paymentMethodId}`, {
        headers: { "Authorization": `Bearer ${STRIPE_KEY}` },
      });
      if (!pmRes.ok) {
        return jsonResponse({ error: "Failed to retrieve payment method" }, 500);
      }
      const pm = await pmRes.json();

      const cardLast4 = pm.card?.last4 || "";
      const cardBrand = pm.card?.brand || "";
      // Capitalize brand: "visa" → "Visa"
      const brandDisplay = cardBrand.charAt(0).toUpperCase() + cardBrand.slice(1);

      // Set as default payment method on the customer
      const defaultParams = new URLSearchParams();
      defaultParams.append("invoice_settings[default_payment_method]", paymentMethodId);

      await stripeRequest(`/customers/${customerId}`, defaultParams);

      // Save to financial_settings
      await sbQuery("PATCH", `financial_settings?tenant_id=eq.${tenantId}`, {}, {
        mailing_stripe_payment_method: paymentMethodId,
        mailing_card_last4: cardLast4,
        mailing_card_brand: brandDisplay,
      });

      return jsonResponse({
        success: true,
        cardLast4,
        cardBrand: brandDisplay,
        paymentMethodId,
      });
    }

    // ═══ ACTION: detach-method ═══
    // Detach payment method from customer and clear mailing billing columns
    if (action === "detach-method") {
      const settings = await sbQuery("GET", "financial_settings", {
        "tenant_id": `eq.${tenantId}`,
        "select": "mailing_stripe_payment_method,mailing_stripe_customer_id",
      });

      if (settings?.mailing_stripe_payment_method) {
        // Detach from Stripe
        await stripeRequest(
          `/payment_methods/${settings.mailing_stripe_payment_method}/detach`,
          new URLSearchParams(),
        );
      }

      // Clear columns in DB
      await sbQuery("PATCH", `financial_settings?tenant_id=eq.${tenantId}`, {}, {
        mailing_stripe_payment_method: null,
        mailing_card_last4: null,
        mailing_card_brand: null,
      });

      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Invalid action. Use: setup-intent, save-payment-method, detach-method" }, 400);

  } catch (err) {
    console.error("mailing-billing error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
