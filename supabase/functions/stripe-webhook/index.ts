// supabase/functions/stripe-webhook/index.ts
// Zero dependencies — raw fetch to Supabase REST API + Stripe signature via Web Crypto

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";

// Admin console (govops) project — for syncing tenancies
const GOVOPS_URL = Deno.env.get("GOVOPS_SUPABASE_URL") || "";
const GOVOPS_SERVICE_KEY = Deno.env.get("GOVOPS_SUPABASE_SERVICE_ROLE_KEY") || "";

const DEFAULT_TRIAL_DAYS = 30;

async function getTrialDays(): Promise<number> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/get_trial_days`, {
      method: "POST",
      headers: {
        "apikey": SB_SERVICE_KEY,
        "Authorization": `Bearer ${SB_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (res.ok) {
      const val = await res.json();
      if (typeof val === "number" && val >= 0) return val;
    }
  } catch { /* fall through */ }
  return DEFAULT_TRIAL_DAYS;
}

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

// Sync tenancy to admin console (govops) — best-effort, non-blocking
async function syncToAdminConsole(tenantId: string, meta: Record<string, string>, result: Record<string, unknown>, customerId: string | null, subscriptionId: string | null) {
  if (!GOVOPS_URL || !GOVOPS_SERVICE_KEY) {
    console.log("Govops env vars not set, skipping admin console sync");
    return;
  }
  try {
    const tierToSubscriptionId: Record<string, string> = {
      compliance_pro: "compliance-pro",
      community_plus: "community-plus",
      management_suite: "management-suite",
    };
    const address = [meta.address_street, meta.address_city, meta.address_state, meta.address_zip]
      .filter(Boolean).join(", ") || null;
    const trialDays = await getTrialDays();
    const trialEndsAt = result.trial_ends_at || new Date(Date.now() + trialDays * 86400000).toISOString();

    const res = await fetch(`${GOVOPS_URL}/rest/v1/tenancies`, {
      method: "POST",
      headers: {
        "apikey": GOVOPS_SERVICE_KEY,
        "Authorization": `Bearer ${GOVOPS_SERVICE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        id: tenantId,
        name: meta.building_name,
        slug: result.subdomain || meta.subdomain || "",
        address,
        units: parseInt(meta.total_units) || 0,
        subscription_id: tierToSubscriptionId[meta.tier] || "compliance-pro",
        status: "trial",
        billing_cycle: "monthly",
        board_members: 1,
        residents: 0,
        managers: 0,
        staff: 0,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        trial_ends_at: trialEndsAt,
      }),
    });
    if (res.ok) {
      console.log("Synced tenancy to admin console");
    } else {
      console.error("Admin console sync failed:", await res.text());
    }
  } catch (err) {
    console.error("Admin console sync error:", err);
  }
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
    // This handles signing-secret mismatches (e.g. duplicate webhook endpoints).
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

      // ═══ CHECKOUT COMPLETED → Unit payment or Provision tenant ═══
      case "checkout.session.completed": {
        const session = event.data.object;
        const meta = session.metadata || {};

        // ═══ UNIT PAYMENT checkout ═══
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
          break;
        }

        // ═══ ONBOARDING checkout ═══
        if (!meta.building_name || !meta.user_id) {
          console.log("Non-onboarding checkout, skipping");
          break;
        }

        // Idempotency: skip if user already has a tenant
        const existing = await sbQuery("GET", "tenant_users", {
          "user_id": `eq.${meta.user_id}`,
          "select": "tenant_id",
        });
        if (existing?.tenant_id) {
          console.log(`User ${meta.user_id} already provisioned (tenant ${existing.tenant_id}), skipping`);
          break;
        }

        console.log(`Provisioning: ${meta.building_name} for ${meta.user_id}`);

        const result = await sbRpc("provision_tenant", {
          p_name: meta.building_name,
          p_subdomain: meta.subdomain || null,
          p_address: {
            street: meta.address_street || "",
            city: meta.address_city || "",
            state: meta.address_state || "",
            zip: meta.address_zip || "",
          },
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

        // Sync to admin console (best-effort, non-fatal)
        await syncToAdminConsole(
          result.tenant_id,
          meta,
          result,
          session.customer || null,
          session.subscription || null,
        );
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

        // Sync status to admin console
        if (GOVOPS_URL && GOVOPS_SERVICE_KEY) {
          await fetch(`${GOVOPS_URL}/rest/v1/tenancies?id=eq.${sub.tenant_id}`, {
            method: "PATCH",
            headers: { "apikey": GOVOPS_SERVICE_KEY, "Authorization": `Bearer ${GOVOPS_SERVICE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ status: "active" }),
          }).catch(e => console.error("Govops sync (active):", e));
        }
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

        await sbQuery("PATCH", `subscriptions?tenant_id=eq.${sub.tenant_id}`, {}, { status: "canceled", cancel_at_period_end: false });
        await sbQuery("PATCH", `tenants?id=eq.${sub.tenant_id}`, {}, { status: "churned" });

        await sbQuery("POST", "audit_log", {}, {
          tenant_id: sub.tenant_id,
          actor_name: "Stripe", actor_role: "system",
          action: "subscription.canceled", target: subscription.id,
          details: "Subscription ended — tenant churned",
        });

        // Sync status to admin console
        if (GOVOPS_URL && GOVOPS_SERVICE_KEY) {
          await fetch(`${GOVOPS_URL}/rest/v1/tenancies?id=eq.${sub.tenant_id}`, {
            method: "PATCH",
            headers: { "apikey": GOVOPS_SERVICE_KEY, "Authorization": `Bearer ${GOVOPS_SERVICE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ status: "churned" }),
          }).catch(e => console.error("Govops sync (churned):", e));
        }
        break;
      }

      // ═══ SUBSCRIPTION UPDATED ═══
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const sub = await sbQuery("GET", "subscriptions", {
          "stripe_subscription_id": `eq.${subscription.id}`,
          "select": "tenant_id,tier",
        });
        if (!sub?.tenant_id) break;

        const statusMap: Record<string, string> = {
          active: "active", trialing: "trialing", past_due: "past_due",
        };

        // Price ID → tier lookup
        const PRICE_TO_TIER: Record<string, string> = {
          "price_1T3qQD2eQBbijDsqxvNiEs8U": "compliance_pro",
          "price_1T3qQD2eQBbijDsqbcwCMX7v": "compliance_pro",
          "price_1T36YO2eQBbijDsqkULOdtRi": "community_plus",
          "price_1T3qQg2eQBbijDsqHaOVBbtA": "community_plus",
          "price_1T3qRQ2eQBbijDsq7PP4vlxh": "management_suite",
          "price_1T3qSR2eQBbijDsqzVEUuZD4": "management_suite",
        };
        const TIER_MONTHLY_RATES: Record<string, number> = {
          compliance_pro: 179, community_plus: 279, management_suite: 399,
        };
        const TIER_SUBSCRIPTION_SLUGS: Record<string, string> = {
          compliance_pro: "compliance-pro", community_plus: "community-plus", management_suite: "management-suite",
        };
        const TIER_FEATURES: Record<string, Record<string, boolean>> = {
          compliance_pro: { fiscal_lens: true, case_ops: true, compliance_runbook: true, ai_advisor: true, document_vault: true, payment_processing: true, votes_resolutions: false, community_portal: false, vendor_management: true, reserve_study_tools: false },
          community_plus: { fiscal_lens: true, case_ops: true, compliance_runbook: true, ai_advisor: true, document_vault: true, payment_processing: true, votes_resolutions: true, community_portal: true, vendor_management: true, reserve_study_tools: false },
          management_suite: { fiscal_lens: true, case_ops: true, compliance_runbook: true, ai_advisor: true, document_vault: true, payment_processing: true, votes_resolutions: true, community_portal: true, vendor_management: true, reserve_study_tools: true },
        };

        // Build update payload
        const updatePayload: Record<string, unknown> = {
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          status: statusMap[subscription.status] || "canceled",
          cancel_at_period_end: subscription.cancel_at_period_end || false,
        };

        // Detect tier change from price ID
        const currentPriceId = subscription.items?.data?.[0]?.price?.id;
        const detectedTier = currentPriceId ? PRICE_TO_TIER[currentPriceId] : null;

        if (detectedTier && detectedTier !== sub.tier) {
          updatePayload.tier = detectedTier;
          updatePayload.monthly_rate = TIER_MONTHLY_RATES[detectedTier];

          // Update tenant_features
          const features = TIER_FEATURES[detectedTier];
          if (features) {
            await sbQuery("PATCH", `tenant_features?tenant_id=eq.${sub.tenant_id}`, {}, features);
          }

          // Sync tier change to govops
          if (GOVOPS_URL && GOVOPS_SERVICE_KEY) {
            await fetch(`${GOVOPS_URL}/rest/v1/tenancies?id=eq.${sub.tenant_id}`, {
              method: "PATCH",
              headers: { "apikey": GOVOPS_SERVICE_KEY, "Authorization": `Bearer ${GOVOPS_SERVICE_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ subscription_id: TIER_SUBSCRIPTION_SLUGS[detectedTier] }),
            }).catch(e => console.error("Govops sync (tier change):", e));
          }

          console.log(`Tier changed: ${sub.tier} → ${detectedTier} for tenant ${sub.tenant_id}`);
        }

        await sbQuery("PATCH", `subscriptions?tenant_id=eq.${sub.tenant_id}`, {}, updatePayload);
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
        // Use raw SQL via RPC since we need an increment
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

