// supabase/functions/send-mail/index.ts
// Charge via Stripe → submit to LetterStream (simulated) → auto-refund on failure
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

// ─── Pricing (cents) — mirrors src/types/mail.ts ───────────────
const PRICING: Record<string, number> = {
  "first-class": 123,
  "certified": 834,
  "certified-return-receipt": 1116,
  "certified-electronic-return-receipt": 1116,
  additionalPage: 12,
  returnEnvelope: 15,
};

function calculateCostCents(
  deliveryMethod: string,
  pageCount: number,
  includeReturnEnvelope: boolean,
): number {
  const base = PRICING[deliveryMethod] || 0;
  const pages = Math.max(0, pageCount - 1) * PRICING.additionalPage;
  const envelope = includeReturnEnvelope ? PRICING.returnEnvelope : 0;
  return base + pages + envelope;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // ── 1. Auth check ──────────────────────────────────────
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
      return jsonResponse({ error: "Only board members can send mail" }, 403);
    }
    const tenantId = tu.tenant_id;

    const body = await req.json();
    const {
      recipientName,
      recipientAddress,
      senderName,
      senderAddress,
      deliveryMethod,
      templateId,
      mergeVariables,
      pageCount,
      includeReturnEnvelope,
    } = body;

    // Validate required fields
    if (!recipientName || !recipientAddress || !deliveryMethod || !templateId) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    // ── 2. Look up mailing billing settings ────────────────
    const settings = await sbQuery("GET", "financial_settings", {
      "tenant_id": `eq.${tenantId}`,
      "select": "mailing_stripe_customer_id,mailing_stripe_payment_method",
    });

    const customerId = settings?.mailing_stripe_customer_id;
    const paymentMethodId = settings?.mailing_stripe_payment_method;

    if (!customerId || !paymentMethodId) {
      return jsonResponse({
        error: "No payment method on file. Add one in Settings → Mailing.",
      }, 400);
    }

    // ── 3. Stripe charge ───────────────────────────────────
    const totalCents = calculateCostCents(deliveryMethod, pageCount || 1, !!includeReturnEnvelope);

    const piParams = new URLSearchParams();
    piParams.append("amount", String(totalCents));
    piParams.append("currency", "usd");
    piParams.append("customer", customerId);
    piParams.append("payment_method", paymentMethodId);
    piParams.append("off_session", "true");
    piParams.append("confirm", "true");
    piParams.append("description", `Mailing: ${deliveryMethod} to ${recipientName}`);
    piParams.append("metadata[tenant_id]", tenantId);
    piParams.append("metadata[template_id]", templateId);
    piParams.append("metadata[delivery_method]", deliveryMethod);

    const piRes = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: piParams.toString(),
    });

    if (!piRes.ok) {
      const errBody = await piRes.json();
      console.error("Stripe charge failed:", JSON.stringify(errBody));
      const message = errBody?.error?.message || "Payment failed";
      return jsonResponse({ error: `Payment failed: ${message}` }, 402);
    }

    const paymentIntent = await piRes.json();
    const paymentIntentId = paymentIntent.id;

    // ── 4. LetterStream submit (simulated) ─────────────────
    // In production, replace this block with a real LetterStream API call.
    // The structure is designed for easy drop-in replacement.
    let jobId: string;
    let letterstreamError: string | null = null;

    try {
      // Simulated LetterStream submission
      jobId = "ls_sim_" + Date.now();
      // Uncomment below for real LetterStream integration:
      // const lsRes = await fetch("https://api.letterstream.com/v1/jobs", { ... });
      // if (!lsRes.ok) throw new Error(await lsRes.text());
      // const lsData = await lsRes.json();
      // jobId = lsData.jobId;
    } catch (lsErr) {
      letterstreamError = String(lsErr);
    }

    // ── 5. If LetterStream failed → auto-refund ────────────
    if (letterstreamError) {
      console.error("LetterStream failed, issuing refund:", letterstreamError);

      const refundParams = new URLSearchParams();
      refundParams.append("payment_intent", paymentIntentId);

      const refundRes = await fetch("https://api.stripe.com/v1/refunds", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${STRIPE_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: refundParams.toString(),
      });

      if (!refundRes.ok) {
        console.error("Auto-refund also failed:", await refundRes.text());
      }

      return jsonResponse({
        error: "Mail submission failed. Payment has been refunded.",
        detail: letterstreamError,
        paymentIntentId,
        refunded: refundRes.ok,
      }, 500);
    }

    // ── 6. Success ─────────────────────────────────────────
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 5);

    return jsonResponse({
      jobId: jobId!,
      paymentIntentId,
      status: "submitted",
      estimatedDeliveryDate: estimatedDelivery.toISOString().split("T")[0],
      deliveryMethod,
      pageCount: pageCount || 1,
      totalCents,
    });

  } catch (err) {
    console.error("send-mail error:", err);
    return new Response(JSON.stringify({ error: "Internal server error", detail: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
