// supabase/functions/stripe-webhook/index.ts
// Handles Stripe webhooks for unit-owner payments and refunds.
// Subscription lifecycle is now handled by Chargebee (chargebee-webhook).
// Zero dependencies -- raw fetch to Supabase REST API + Stripe signature via Web Crypto.

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// Two endpoints deliver here: the platform account's and the connected-accounts one (payments land on each
// building's connected account). Each has its own signing secret; an event is accepted if either signs it.
const WEBHOOK_SECRETS = [Deno.env.get("STRIPE_WEBHOOK_SECRET") || "", Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET") || ""].filter(Boolean);
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

// The unit and building a subscription invoice is for. connect-stripe-account puts them on the subscription's
// metadata; Stripe copies that onto each invoice, but where depends on the API version: `parent.subscription_details`
// (2025-03-31 and later), `subscription_details` (earlier), or the line items. If none carries it, the subscription
// itself is fetched (on the connected account the event came from).
// deno-lint-ignore no-explicit-any
async function unitMetadataOf(invoice: any, account?: string): Promise<Record<string, string>> {
  const hasUnit = (m: unknown): m is Record<string, string> =>
    !!m && typeof m === "object" && !!(m as Record<string, string>).unit_number && !!(m as Record<string, string>).tenant_id;
  const candidates = [
    invoice.parent?.subscription_details?.metadata,
    invoice.subscription_details?.metadata,
    invoice.metadata,
    // deno-lint-ignore no-explicit-any
    ...((invoice.lines?.data || []) as any[]).map((l) => l.metadata),
  ];
  for (const m of candidates) if (hasUnit(m)) return m;
  const subId = invoice.parent?.subscription_details?.subscription || invoice.subscription;
  if (STRIPE_KEY && typeof subId === "string" && subId.startsWith("sub_")) {
    try {
      const headers: Record<string, string> = { "Authorization": `Bearer ${STRIPE_KEY}` };
      if (account && typeof account === "string" && account.startsWith("acct_")) headers["Stripe-Account"] = account;
      const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, { headers });
      if (res.ok) {
        const sub = await res.json();
        if (hasUnit(sub.metadata)) return sub.metadata;
      }
    } catch (err) {
      console.error("Subscription lookup failed:", err);
    }
  }
  return {};
}

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("No signature", { status: 400 });
  }

  const body = await req.text();

  // Verify webhook signature (primary: HMAC with any known secret, fallback: Stripe API retrieval)
  let sigValid = false;
  for (const secret of WEBHOOK_SECRETS) {
    if (await verifyStripeSignature(body, signature, secret)) { sigValid = true; break; }
  }
  // deno-lint-ignore no-explicit-any
  let event: any;

  if (sigValid) {
    event = JSON.parse(body);
  } else if (STRIPE_KEY) {
    // Fallback: verify the event by retrieving it from Stripe's API. What Stripe returns is what we act on, never
    // the posted body. An event from a connected account lives on that account, so the lookup names it.
    try {
      const raw = JSON.parse(body);
      if (raw.id && typeof raw.id === "string" && raw.id.startsWith("evt_")) {
        const headers: Record<string, string> = { "Authorization": `Bearer ${STRIPE_KEY}` };
        if (raw.account && typeof raw.account === "string" && raw.account.startsWith("acct_")) headers["Stripe-Account"] = raw.account;
        const stripeRes = await fetch(`https://api.stripe.com/v1/events/${raw.id}`, { headers });
        if (stripeRes.ok) {
          event = await stripeRes.json();
          console.log(`Signature failed but event verified via Stripe API${raw.account ? ` (connected account ${raw.account})` : ""}`);
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

      // ═══ CHECKOUT COMPLETED → the payment posts to the unit's ledger ═══
      // Every posting is done by a database function that applies the payment
      // the way the app does (dues, then special assessments, then fees, oldest
      // first; the rest is a credit) and is idempotent on the session id, so a
      // webhook delivered twice posts once.
      case "checkout.session.completed": {
        const session = event.data.object;
        const meta = session.metadata || {};
        if (session.mode === "subscription") {
          console.log("Subscription checkout: the first month posts from invoice.paid");
          break;
        }
        try {
          if (meta.invoice_id) {
            // A payment link for one invoice (send-unit-invoice).
            console.log(`Invoice checkout: invoice=${meta.invoice_id}`);
            const result = await sbRpc("reconcile_unit_payment", {
              p_stripe_session_id: session.id,
              p_stripe_payment_intent_id: session.payment_intent || null,
            });
            console.log("Reconciliation result:", JSON.stringify(result));
          } else if (meta.unit_number && meta.tenant_id && session.amount_total) {
            // The owner paid a balance from the Pay page (connect-stripe-account create_checkout).
            console.log(`Unit checkout: unit=${meta.unit_number} tenant=${meta.tenant_id}`);
            const result = await sbRpc("record_unit_payment", {
              p_tenant_id: meta.tenant_id,
              p_unit_number: meta.unit_number,
              p_amount: session.amount_total / 100,
              p_method: "stripe",
              p_reference: `stripe:${session.id}`,
            });
            console.log("Payment result:", JSON.stringify(result));
          } else {
            console.log("Checkout with no unit or invoice in its metadata, skipping (subscription provisioning handled by Chargebee)");
          }
        } catch (err) {
          console.error("Unit payment posting failed:", err);
        }
        break;
      }

      // ═══ AUTOPAY: a subscription invoice was paid ═══
      // connect-stripe-account puts the unit and building on the subscription's
      // metadata, so each month's payment posts to the unit. Needs the webhook
      // endpoint to receive connected-account events.
      case "invoice.paid": {
        const invoice = event.data.object;
        const meta = await unitMetadataOf(invoice, event.account);
        if (!meta.unit_number || !meta.tenant_id || !invoice.amount_paid) {
          console.log("invoice.paid without a unit in its metadata, skipping");
          break;
        }
        try {
          const result = await sbRpc("record_unit_payment", {
            p_tenant_id: meta.tenant_id,
            p_unit_number: meta.unit_number,
            p_amount: invoice.amount_paid / 100,
            p_method: "stripe",
            p_reference: `stripe:${invoice.id}`,
          });
          console.log("Autopay result:", JSON.stringify(result));
        } catch (err) {
          console.error("Autopay posting failed:", err);
        }
        break;
      }

      // ═══ CHARGE REFUNDED (from the Stripe dashboard; refunds from the app are posted by refund-unit-payment) ═══
      case "charge.refunded": {
        const charge = event.data.object;
        const paymentIntentId = charge.payment_intent;
        if (!paymentIntentId) {
          console.log("charge.refunded without payment_intent, skipping");
          break;
        }
        const refundInvoice = await sbQuery("GET", "unit_invoices", {
          "stripe_payment_intent_id": `eq.${paymentIntentId}`,
          "select": "id,status",
        });
        if (!refundInvoice?.id) {
          console.log(`No invoice found for payment_intent ${paymentIntentId}`);
          break;
        }
        if (refundInvoice.status === "void") {
          console.log(`Invoice ${refundInvoice.id} already refunded`);
          break;
        }
        try {
          const result = await sbRpc("refund_unit_invoice", {
            p_invoice_id: refundInvoice.id,
            p_reason: "Refunded in Stripe",
            p_stripe_refund_id: charge.refunds?.data?.[0]?.id || null,
          });
          console.log("Refund result:", JSON.stringify(result));
        } catch (err) {
          console.error("Refund posting failed:", err);
        }
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
