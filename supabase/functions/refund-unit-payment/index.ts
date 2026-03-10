// supabase/functions/refund-unit-payment/index.ts
// Zero dependencies — raw fetch to Stripe API + Supabase REST API
// Refunds a paid unit invoice: Stripe refund + GL reversal + DB updates

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
      "select": "id,tenant_id,unit_number,amount,status,type,stripe_payment_intent_id,stripe_checkout_session_id",
    });

    if (!invoice?.id) {
      return jsonResponse({ error: "Invoice not found" }, 404);
    }

    if (invoice.status !== "paid") {
      return jsonResponse({ error: `Invoice status is '${invoice.status}', can only refund 'paid' invoices` }, 400);
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

    // Determine AR account for GL reversal
    const arAcct = invoice.type === "fee" || invoice.type === "amenity_fee" ? "1130"
      : invoice.type === "special_assessment" ? "1120" : "1110";
    const glLocalId = "GL" + Date.now();
    const today = new Date().toISOString().split("T")[0];

    // Post reversal GL entry: debit AR account, credit 1010 (cash)
    await sbQuery("POST", "general_ledger", {}, {
      tenant_id: tenantId,
      local_id: glLocalId,
      date: today,
      memo: `Refund - Invoice ${invoice.id} Unit ${invoice.unit_number}${reason ? ': ' + reason : ''}`,
      debit_acct: arAcct,
      credit_acct: "1010",
      amount: invoice.amount,
      source: "refund",
      source_id: invoice.unit_number,
      posted: new Date().toISOString(),
      status: "posted",
    });

    // Update invoice: mark as void with refund fields
    await sbQuery("PATCH", `unit_invoices?id=eq.${invoice.id}`, {}, {
      status: "void",
      refund_amount: invoice.amount,
      refund_date: today,
      refund_reason: reason || "Board-initiated refund",
      refund_gl_entry_id: glLocalId,
      stripe_refund_id: stripeRefundId,
    });

    // Update unit balance: increase by refund amount
    const currentUnit = await sbQuery("GET", "units", {
      "tenant_id": `eq.${tenantId}`,
      "number": `eq.${invoice.unit_number}`,
      "select": "balance",
    });
    if (currentUnit) {
      await sbQuery("PATCH", `units?tenant_id=eq.${tenantId}&number=eq.${invoice.unit_number}`, {}, {
        balance: (currentUnit.balance || 0) + invoice.amount,
      });
    }

    return jsonResponse({
      success: true,
      invoiceId: invoice.id,
      refundAmount: invoice.amount,
      stripeRefundId,
      glEntryId: glLocalId,
    });

  } catch (err) {
    console.error("refund-unit-payment error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
