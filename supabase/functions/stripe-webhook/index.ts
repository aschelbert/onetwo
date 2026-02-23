// supabase/functions/stripe-webhook/index.ts
// Zero dependencies — raw fetch to Supabase REST API + Stripe signature via Web Crypto

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";

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

  // Verify webhook signature
  const valid = await verifyStripeSignature(body, signature, WEBHOOK_SECRET);
  if (!valid) {
    console.error("Webhook signature verification failed");
    return new Response("Invalid signature", { status: 400 });
  }

  const event = JSON.parse(body);
  console.log(`Received event: ${event.type}`);

  try {
    switch (event.type) {

      // ═══ CHECKOUT COMPLETED → Provision tenant ═══
      case "checkout.session.completed": {
        const session = event.data.object;
        const meta = session.metadata || {};

        if (!meta.building_name || !meta.user_id) {
          console.log("Non-onboarding checkout, skipping");
          break;
        }

        console.log(`Provisioning: ${meta.building_name} for ${meta.user_id}`);

        const result = await sbRpc("provision_tenant", {
          p_name: meta.building_name,
          p_subdomain: meta.subdomain || null,
          p_address: JSON.stringify({
            street: meta.address_street || "",
            city: meta.address_city || "",
            state: meta.address_state || "",
            zip: meta.address_zip || "",
          }),
          p_total_units: parseInt(meta.total_units) || 0,
          p_year_built: meta.year_built || null,
          p_tier: meta.tier,
          p_contact_name: meta.contact_name || "",
          p_contact_email: meta.contact_email || "",
          p_contact_phone: meta.contact_phone || "",
          p_user_id: meta.user_id,
          p_stripe_customer_id: session.customer || null,
          p_stripe_subscription_id: session.subscription || null,
          p_board_title: meta.board_title || "President",
        });

        console.log("Provisioned:", JSON.stringify(result));
        break;
      }

      // ═══ INVOICE PAID ═══
      case "invoice.paid": {
        const invoice = event.data.object;
        const subId = invoice.subscription;
        if (!subId) break;

        // Find tenant
        const sub = await sbQuery("GET", "subscriptions", {
          "stripe_subscription_id": `eq.${subId}`,
          "select": "tenant_id",
        });
        if (!sub?.tenant_id) break;

        // Record invoice
        await sbQuery("POST", "invoices", {}, {
          tenant_id: sub.tenant_id,
          stripe_invoice_id: invoice.id,
          amount: invoice.amount_paid,
          status: "paid",
          invoice_date: new Date(invoice.created * 1000).toISOString().split("T")[0],
          due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString().split("T")[0] : null,
          paid_date: new Date().toISOString().split("T")[0],
        });

        // Update subscription and tenant status
        await sbQuery("PATCH", `subscriptions?tenant_id=eq.${sub.tenant_id}`, {}, { status: "active" });
        await sbQuery("PATCH", `tenants?id=eq.${sub.tenant_id}&status=eq.onboarding`, {}, { status: "active" });
        break;
      }

      // ═══ PAYMENT FAILED ═══
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subId = invoice.subscription;
        if (!subId) break;

        const sub = await sbQuery("GET", "subscriptions", {
          "stripe_subscription_id": `eq.${subId}`,
          "select": "tenant_id",
        });
        if (!sub?.tenant_id) break;

        await sbQuery("PATCH", `subscriptions?tenant_id=eq.${sub.tenant_id}`, {}, { status: "past_due" });

        await sbQuery("POST", "invoices", {}, {
          tenant_id: sub.tenant_id,
          stripe_invoice_id: invoice.id,
          amount: invoice.amount_due,
          status: "overdue",
          invoice_date: new Date(invoice.created * 1000).toISOString().split("T")[0],
          due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString().split("T")[0] : null,
        });

        await sbQuery("POST", "audit_log", {}, {
          tenant_id: sub.tenant_id,
          actor_name: "Stripe", actor_role: "system",
          action: "invoice.payment_failed", target: invoice.id,
          details: `Payment of $${(invoice.amount_due / 100).toFixed(2)} failed`,
        });
        break;
      }

      // ═══ SUBSCRIPTION CANCELED ═══
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const sub = await sbQuery("GET", "subscriptions", {
          "stripe_subscription_id": `eq.${subscription.id}`,
          "select": "tenant_id",
        });
        if (!sub?.tenant_id) break;

        await sbQuery("PATCH", `subscriptions?tenant_id=eq.${sub.tenant_id}`, {}, { status: "canceled" });
        await sbQuery("PATCH", `tenants?id=eq.${sub.tenant_id}`, {}, { status: "suspended" });

        await sbQuery("POST", "audit_log", {}, {
          tenant_id: sub.tenant_id,
          actor_name: "Stripe", actor_role: "system",
          action: "subscription.canceled", target: subscription.id,
          details: "Subscription canceled — tenant suspended",
        });
        break;
      }

      // ═══ SUBSCRIPTION UPDATED ═══
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const sub = await sbQuery("GET", "subscriptions", {
          "stripe_subscription_id": `eq.${subscription.id}`,
          "select": "tenant_id",
        });
        if (!sub?.tenant_id) break;

        const statusMap: Record<string, string> = {
          active: "active", trialing: "trialing", past_due: "past_due",
        };
        await sbQuery("PATCH", `subscriptions?tenant_id=eq.${sub.tenant_id}`, {}, {
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          status: statusMap[subscription.status] || "canceled",
        });
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

