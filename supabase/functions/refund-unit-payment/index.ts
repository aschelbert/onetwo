// supabase/functions/refund-unit-payment/index.ts
// Zero dependencies — raw fetch to Stripe API + Supabase REST API
// Refunds a paid unit invoice: the Stripe refund, then the database function
// refund_unit_invoice posts the same entries the app posts (the charge was
// wrong: Dr income / Cr bank, anything still open cancelled, invoice void).

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, baggage, sentry-trace",
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

    // Authz: confirm caller is a board_member
    const tu = await sbQuery("GET", "tenant_users", {
      "user_id": `eq.${user.id}`,
      "role": "eq.board_member",
      "select": "tenant_id",
    });
    if (!tu?.tenant_id) {
      return jsonResponse({ error: "Only board members can process refunds" }, 403);
    }
    const tenantId = tu.tenant_id;

    const { invoiceId, reason } = await req.json();
    if (!invoiceId) {
      return jsonResponse({ error: "invoiceId is required" }, 400);
    }

    // Lookup invoice
    const invoice = await sbQuery("GET", "unit_invoices", {
      "id": `eq.${invoiceId}`,
      "tenant_id": `eq.${tenantId}`,
      "select": "id,tenant_id,unit_number,amount,paid_amount,status,type,stripe_payment_intent_id,stripe_checkout_session_id",
    });

    if (!invoice?.id) {
      return jsonResponse({ error: "Invoice not found" }, 404);
    }

    if (invoice.status === "void") {
      return jsonResponse({ error: "This invoice was already refunded or cancelled" }, 400);
    }
    if (invoice.status !== "paid" && !(invoice.paid_amount > 0)) {
      return jsonResponse({ error: `Nothing has been paid on this invoice (status '${invoice.status}'); void it instead of refunding` }, 400);
    }

    let stripeRefundId: string | null = null;

    // If there's a Stripe payment intent, issue a Stripe refund
    if (invoice.stripe_payment_intent_id && STRIPE_KEY) {
      const refundParams = new URLSearchParams();
      refundParams.append("payment_intent", invoice.stripe_payment_intent_id);

      // Check if this is a connected account payment
      const settings = await sbQuery("GET", "financial_settings", {
        "tenant_id": `eq.${tenantId}`,
        "select": "stripe_connect_id",
      });

      const stripeHeaders: Record<string, string> = {
        "Authorization": `Bearer ${STRIPE_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      };

      if (settings?.stripe_connect_id) {
        stripeHeaders["Stripe-Account"] = settings.stripe_connect_id;
      }

      const refundRes = await fetch("https://api.stripe.com/v1/refunds", {
        method: "POST",
        headers: stripeHeaders,
        body: refundParams.toString(),
      });

      if (refundRes.ok) {
        const refund = await refundRes.json();
        stripeRefundId = refund.id;
        console.log("Stripe refund created:", stripeRefundId);
      } else {
        const errBody = await refundRes.text();
        console.error("Stripe refund error:", refundRes.status, errBody);
        return jsonResponse({ error: `Stripe refund failed: ${errBody.slice(0, 200)}` }, 500);
      }
    }

    // Post it: income reversed, cash returned, anything still open cancelled, invoice void.
    const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/refund_unit_invoice`, {
      method: "POST",
      headers: { "apikey": SB_SERVICE_KEY, "Authorization": `Bearer ${SB_SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_invoice_id: invoice.id, p_reason: reason || "Board-initiated refund", p_stripe_refund_id: stripeRefundId }),
    });
    if (!rpcRes.ok) {
      const err = await rpcRes.text();
      console.error("refund_unit_invoice failed:", err);
      return jsonResponse({ error: `The refund went out but could not be posted to the ledger: ${err.slice(0, 200)}`, stripeRefundId }, 500);
    }
    const posted = await rpcRes.json();

    return jsonResponse({
      success: true,
      invoiceId: invoice.id,
      refundAmount: posted?.refund_amount ?? invoice.amount,
      stripeRefundId,
      glEntryId: posted?.gl_entry_id ?? null,
    });

  } catch (err) {
    console.error("refund-unit-payment error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
