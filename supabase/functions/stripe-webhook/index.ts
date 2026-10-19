// supabase/functions/stripe-webhook/index.ts
// Handles Stripe webhooks for unit-owner payments and refunds.
// Subscription lifecycle is now handled by Chargebee (chargebee-webhook).
// Zero dependencies -- raw fetch to Supabase REST API + Stripe signature via Web Crypto.

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";

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

// Call Supabase RPC function
async function sbRpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "apikey": SB_SERVICE_KEY,
      "Authorization": `Bearer ${SB_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`RPC ${fn} failed: ${err}`);
  }
  return await res.json();
}

// Simple Stripe signature verification using Web Crypto
async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  try {
    const parts: Record<string, string> = {};
    for (const item of sigHeader.split(",")) {
      const [k, v] = item.split("=");
      parts[k.trim()] = v.trim();
    }
    const timestamp = parts["t"];
    const sig = parts["v1"];
    if (!timestamp || !sig) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
    const expected = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, "0")).join("");

    // Constant-time comparison
    if (expected.length !== sig.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("No signature", { status: 400 });
  }

  const body = await req.text();

  // Verify webhook signature (primary: HMAC, fallback: Stripe API retrieval)
  const sigValid = await verifyStripeSignature(body, signature, WEBHOOK_SECRET);
  // deno-lint-ignore no-explicit-any
  let event: any;

  if (sigValid) {
    event = JSON.parse(body);
  } else if (STRIPE_KEY) {
    // Fallback: verify the event by retrieving it from Stripe's API.
    try {
      const raw = JSON.parse(body);
      if (raw.id && typeof raw.id === "string" && raw.id.startsWith("evt_")) {
        const stripeRes = await fetch(`https://api.stripe.com/v1/events/${raw.id}`, {
          headers: { "Authorization": `Bearer ${STRIPE_KEY}` },
        });
        if (stripeRes.ok) {
          event = await stripeRes.json();
          console.log("Signature failed but event verified via Stripe API");
        }
      }
    } catch {
      // Couldn't parse or verify via API
    }
  }

  if (!event) {
    console.error("Webhook signature verification failed");
    return new Response("Invalid signature", { status: 400 });
  }

  console.log(`Received event: ${event.type}`);

  try {
    switch (event.type) {

      // ═══ CHECKOUT COMPLETED → Unit payment reconciliation ═══
      case "checkout.session.completed": {
        const session = event.data.object;
        const meta = session.metadata || {};

        // Only handle unit payment checkouts (invoice_id + tenant_id in metadata)
        if (meta.invoice_id && meta.tenant_id) {
          console.log(`Unit payment checkout: invoice=${meta.invoice_id} tenant=${meta.tenant_id}`);
          try {
            const result = await sbRpc("reconcile_unit_payment", {
              p_stripe_session_id: session.id,
              p_stripe_payment_intent_id: session.payment_intent || null,
            });
            console.log("Reconciliation result:", JSON.stringify(result));
          } catch (err) {
            console.error("Unit payment reconciliation failed:", err);
          }
        } else {
          console.log("Non-unit-payment checkout, skipping (subscription provisioning handled by Chargebee)");
        }
        break;
      }

      // ═══ CHARGE REFUNDED ═══
      case "charge.refunded": {
        const charge = event.data.object;
        const paymentIntentId = charge.payment_intent;
        if (!paymentIntentId) {
          console.log("charge.refunded without payment_intent, skipping");
          break;
        }

        // Find invoice by stripe_payment_intent_id
        const refundInvoice = await sbQuery("GET", "unit_invoices", {
          "stripe_payment_intent_id": `eq.${paymentIntentId}`,
          "select": "id,tenant_id,unit_number,amount,status,type",
        });

        if (!refundInvoice?.id) {
          console.log(`No invoice found for payment_intent ${paymentIntentId}`);
          break;
        }

        if (refundInvoice.status === "void") {
          console.log(`Invoice ${refundInvoice.id} already voided`);
          break;
        }

        // Determine AR account
        const refundArAcct = refundInvoice.type === "fee" || refundInvoice.type === "amenity_fee" ? "1130"
          : refundInvoice.type === "special_assessment" ? "1120" : "1110";
        const refundGlId = "GL" + Date.now();

        // Post reversal GL entry: debit AR, credit 1010 (cash)
        await sbQuery("POST", "general_ledger", {}, {
          tenant_id: refundInvoice.tenant_id,
          local_id: refundGlId,
          date: new Date().toISOString().split("T")[0],
          memo: `Refund - Invoice ${refundInvoice.id} Unit ${refundInvoice.unit_number}`,
          debit_acct: refundArAcct,
          credit_acct: "1010",
          amount: refundInvoice.amount,
          source: "payment",
          source_id: refundInvoice.unit_number,
          posted: new Date().toISOString(),
          status: "posted",
        });

        // Update invoice to void with refund info
        const stripeRefundId = charge.refunds?.data?.[0]?.id || null;
        await sbQuery("PATCH", `unit_invoices?id=eq.${refundInvoice.id}`, {}, {
          status: "void",
          refund_amount: refundInvoice.amount,
          refund_date: new Date().toISOString().split("T")[0],
          refund_reason: "Stripe refund",
          refund_gl_entry_id: refundGlId,
          stripe_refund_id: stripeRefundId,
        });

        // Update unit balance (increase by refund amount)
        const currentUnit = await sbQuery("GET", "units", {
          "tenant_id": `eq.${refundInvoice.tenant_id}`,
          "number": `eq.${refundInvoice.unit_number}`,
          "select": "balance",
        });
        if (currentUnit) {
          await sbQuery("PATCH", `units?tenant_id=eq.${refundInvoice.tenant_id}&number=eq.${refundInvoice.unit_number}`, {}, {
            balance: (currentUnit.balance || 0) + refundInvoice.amount,
          });
        }

        console.log(`Refund processed for invoice ${refundInvoice.id}, amount: ${refundInvoice.amount}`);
        break;
      }

      default:
        console.log(`Unhandled: ${event.type}`);
    }
  } catch (err) {
    console.error(`Error processing ${event.type}:`, err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
