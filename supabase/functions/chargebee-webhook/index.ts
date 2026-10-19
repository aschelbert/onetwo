// supabase/functions/chargebee-webhook/index.ts
// Processes Chargebee webhook events for subscription lifecycle.
// Zero dependencies -- raw fetch to Supabase REST API.

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const WEBHOOK_USER = Deno.env.get("CHARGEBEE_WEBHOOK_USER") || "";
const WEBHOOK_PASS = Deno.env.get("CHARGEBEE_WEBHOOK_PASS") || "";

const GOVOPS_URL = Deno.env.get("GOVOPS_SUPABASE_URL") || "";
const GOVOPS_SERVICE_KEY = Deno.env.get("GOVOPS_SUPABASE_SERVICE_ROLE_KEY") || "";

// ── Supabase REST helpers (service role bypasses RLS) ──

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

async function sbRpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SB_SERVICE_KEY,
      Authorization: `Bearer ${SB_SERVICE_KEY}`,
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

// ── Price-ID parsing helpers ──

type PlanId = "self_managed" | "facilities";
type Interval = "monthly" | "annual";

interface ParsedSubscription {
  plan: PlanId;
  interval: Interval;
  onCall: boolean;
  pmSeat: boolean;
  monthlyRate: number;
}

// Prices in cents
const PLAN_MONTHLY: Record<PlanId, number> = { self_managed: 17900, facilities: 27900 };
const ON_CALL_MONTHLY: Record<PlanId, number> = { self_managed: 24900, facilities: 49900 };
const PM_SEAT_MONTHLY = 7900;

function parseSubscriptionItems(
  // deno-lint-ignore no-explicit-any
  items: any[],
): ParsedSubscription {
  let plan: PlanId = "self_managed";
  let interval: Interval = "monthly";
  let onCall = false;
  let pmSeat = false;

  for (const item of items) {
    const priceId: string = item.item_price_id || "";

    // Plan detection
    if (priceId.startsWith("Self-Managed")) {
      plan = "self_managed";
      interval = priceId.includes("Annual") ? "annual" : "monthly";
    } else if (priceId.startsWith("Facilities")) {
      plan = "facilities";
      interval = priceId.includes("Annual") ? "annual" : "monthly";
    }

    // On Call detection
    if (priceId.startsWith("OnCall-")) {
      onCall = true;
    }

    // PM Seat detection
    if (priceId.startsWith("PM-Seat")) {
      pmSeat = true;
    }
  }

  let monthlyRate = PLAN_MONTHLY[plan];
  if (onCall) monthlyRate += ON_CALL_MONTHLY[plan];
  if (pmSeat) monthlyRate += PM_SEAT_MONTHLY;

  return { plan, interval, onCall, pmSeat, monthlyRate };
}

// Map Chargebee status to local status
function mapStatus(cbStatus: string): string {
  const m: Record<string, string> = {
    in_trial: "trialing",
    active: "active",
    cancelled: "canceled",
    non_renewing: "active",
    paused: "past_due",
  };
  return m[cbStatus] || cbStatus;
}

// ── Sync to admin console (govops) ──

async function syncGovopsStatus(tenantId: string, fields: Record<string, unknown>) {
  if (!GOVOPS_URL || !GOVOPS_SERVICE_KEY) return;
  try {
    await fetch(`${GOVOPS_URL}/rest/v1/tenancies?id=eq.${tenantId}`, {
      method: "PATCH",
      headers: {
        apikey: GOVOPS_SERVICE_KEY,
        Authorization: `Bearer ${GOVOPS_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fields),
    });
  } catch (e) {
    console.error("Govops sync error:", e);
  }
}

// ── Update webhook event status ──

async function markEvent(eventId: string, status: string, errorMessage?: string) {
  // deno-lint-ignore no-explicit-any
  const body: any = { status, processed_at: new Date().toISOString() };
  if (errorMessage) body.error_message = errorMessage;
  await sbQuery("PATCH", `chargebee_webhook_events?event_id=eq.${eventId}`, {}, body);
}

Deno.serve(async (req) => {
  // ── Basic auth check ──
  const authHeader = req.headers.get("Authorization") || "";
  if (WEBHOOK_USER && WEBHOOK_PASS) {
    const expected = "Basic " + btoa(`${WEBHOOK_USER}:${WEBHOOK_PASS}`);
    if (authHeader !== expected) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  // deno-lint-ignore no-explicit-any
  let event: any;
  try {
    event = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const eventId: string = event.id || "";
  const eventType: string = event.event_type || "";

  if (!eventId || !eventType) {
    return new Response("Missing event id or type", { status: 400 });
  }

  console.log(`Chargebee event: ${eventType} (${eventId})`);

  // ── Idempotency: insert event record (conflict = already processed) ──
  const insertRes = await fetch(`${SB_URL}/rest/v1/chargebee_webhook_events`, {
    method: "POST",
    headers: {
      apikey: SB_SERVICE_KEY,
      Authorization: `Bearer ${SB_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      event_id: eventId,
      event_type: eventType,
      status: "processing",
      payload: event,
    }),
  });

  if (insertRes.status === 409) {
    console.log(`Event ${eventId} already processed, skipping`);
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!insertRes.ok) {
    console.error("Failed to insert webhook event:", await insertRes.text());
    // Process anyway to avoid losing events
  }

  try {
    const content = event.content || {};
    const subscription = content.subscription || {};
    const customer = content.customer || {};
    const subscriptionItems = subscription.subscription_items || [];
    const cfTenantId: string | undefined = subscription.cf_tenant_id;
    const cfTenantPending: string | undefined = subscription.cf_tenant_pending;

    switch (eventType) {
      // ═══ SUBSCRIPTION CREATED ═══
      case "subscription_created": {
        const parsed = parseSubscriptionItems(subscriptionItems);

        if (cfTenantId) {
          // ── Existing tenant: link subscription ──
          console.log(`Linking subscription to tenant ${cfTenantId}`);

          await sbRpc("link_chargebee_subscription", {
            p_tenant_id: cfTenantId,
            p_customer_id: customer.id || null,
            p_subscription_id: subscription.id,
            p_plan: parsed.plan,
            p_on_call: parsed.onCall,
            p_pm_seat: parsed.pmSeat,
            p_interval: parsed.interval,
            p_status: subscription.status || "active",
            p_trial_ends_at: subscription.trial_end
              ? new Date(subscription.trial_end * 1000).toISOString()
              : null,
            p_period_start: subscription.current_term_start
              ? new Date(subscription.current_term_start * 1000).toISOString()
              : null,
            p_period_end: subscription.current_term_end
              ? new Date(subscription.current_term_end * 1000).toISOString()
              : null,
          });

          // Update event with tenant_id
          await sbQuery(
            "PATCH",
            `chargebee_webhook_events?event_id=eq.${eventId}`,
            {},
            { tenant_id: cfTenantId },
          );

          await syncGovopsStatus(cfTenantId, {
            status: subscription.status === "in_trial" ? "trial" : "active",
          });
        } else if (cfTenantPending) {
          // ── New building: provision tenant ──
          let pending;
          try {
            pending = JSON.parse(cfTenantPending);
          } catch {
            throw new Error("Invalid cf_tenant_pending JSON");
          }

          console.log(`Provisioning new tenant: ${pending.name}`);

          const result = await sbRpc("provision_tenant", {
            p_name: pending.name,
            p_address: pending.address || {},
            p_total_units: pending.totalUnits || 0,
            p_year_built: null,
            p_plan: pending.plan || parsed.plan,
            p_contact_name: pending.contactName || "",
            p_contact_email: pending.contactEmail || "",
            p_contact_phone: "",
            p_user_id: pending.userId,
            p_on_call: parsed.onCall,
            p_pm_seat: parsed.pmSeat,
            p_billing_interval: parsed.interval,
            p_chargebee_customer_id: customer.id || null,
            p_chargebee_subscription_id: subscription.id || null,
            p_board_title: pending.boardTitle || "President",
            p_subdomain: pending.subdomain || null,
            // HO-18 extended fields
            p_role: pending.role || "board_member",
            p_role_key: pending.roleKey || null,
            p_first_name: pending.firstName || null,
            p_last_name: pending.lastName || null,
            p_mar_address_id: pending.marAddressId || null,
            p_ssl: pending.ssl || null,
            p_ward: pending.ward || null,
            p_address_flag: pending.addressFlag || null,
          });

          console.log("Provisioned:", JSON.stringify(result));

          // Update event with tenant_id
          if (result?.tenant_id) {
            await sbQuery(
              "PATCH",
              `chargebee_webhook_events?event_id=eq.${eventId}`,
              {},
              { tenant_id: result.tenant_id },
            );

            // Sync to admin console
            await syncGovopsStatus(result.tenant_id, { status: "trial" });
          }
        } else {
          console.log("subscription_created without cf_tenant_id or cf_tenant_pending, skipping");
        }
        break;
      }

      // ═══ SUBSCRIPTION CHANGED / REACTIVATED ═══
      case "subscription_changed":
      case "subscription_reactivated": {
        const parsed = parseSubscriptionItems(subscriptionItems);

        // Find tenant by chargebee_subscription_id
        const sub = await sbQuery("GET", "subscriptions", {
          chargebee_subscription_id: `eq.${subscription.id}`,
          select: "tenant_id,tier",
        });
        if (!sub?.tenant_id) {
          console.log(`No tenant found for subscription ${subscription.id}`);
          break;
        }
        const tenantId = sub.tenant_id;

        // Update subscription
        await sbQuery("PATCH", `subscriptions?tenant_id=eq.${tenantId}`, {}, {
          tier: parsed.plan,
          addon_on_call: parsed.onCall,
          pm_addon: parsed.pmSeat,
          billing_interval: parsed.interval,
          monthly_rate: parsed.monthlyRate,
          chargebee_status: subscription.status,
          status: mapStatus(subscription.status),
          current_period_start: subscription.current_term_start
            ? new Date(subscription.current_term_start * 1000).toISOString()
            : undefined,
          current_period_end: subscription.current_term_end
            ? new Date(subscription.current_term_end * 1000).toISOString()
            : undefined,
        });

        // Update tenant_features
        await sbQuery("PATCH", `tenant_features?tenant_id=eq.${tenantId}`, {}, {
          facilities: parsed.plan === "facilities",
          on_call: parsed.onCall,
        });

        // Audit
        await sbQuery("POST", "audit_log", {}, {
          tenant_id: tenantId,
          actor_name: "Chargebee",
          actor_role: "system",
          action: `subscription.${eventType}`,
          target: subscription.id,
          details: `Plan: ${parsed.plan} | On Call: ${parsed.onCall} | PM: ${parsed.pmSeat} | Interval: ${parsed.interval} | Rate: $${(parsed.monthlyRate / 100).toFixed(2)}/mo`,
        });

        // Update event with tenant_id
        await sbQuery(
          "PATCH",
          `chargebee_webhook_events?event_id=eq.${eventId}`,
          {},
          { tenant_id: tenantId },
        );

        await syncGovopsStatus(tenantId, { status: mapStatus(subscription.status) });
        break;
      }

      // ═══ SUBSCRIPTION CANCELLED ═══
      case "subscription_cancelled": {
        const sub = await sbQuery("GET", "subscriptions", {
          chargebee_subscription_id: `eq.${subscription.id}`,
          select: "tenant_id,status",
        });
        if (!sub?.tenant_id) break;
        const tenantId = sub.tenant_id;

        // Determine if this is a trial-end cancellation
        const cancelReason: string = subscription.cancel_reason || "";
        const wasTrial = sub.status === "trialing" ||
          cancelReason === "no_card" ||
          cancelReason === "not_paid";
        let isTrialEnd = wasTrial;

        if (!isTrialEnd && subscription.trial_end) {
          const trialEnd = new Date(subscription.trial_end * 1000);
          const cancelledAt = new Date();
          if (Math.abs(cancelledAt.getTime() - trialEnd.getTime()) < 86400000) {
            isTrialEnd = true;
          }
        }

        if (isTrialEnd) {
          // Trial-end cancellation: use mark_trial_expired (does NOT touch tenants.status)
          await sbRpc("mark_trial_expired", {
            p_subscription_id: subscription.id,
          });

          await sbQuery("POST", "audit_log", {}, {
            tenant_id: tenantId,
            actor_name: "Chargebee",
            actor_role: "system",
            action: "subscription.trial_expired",
            target: subscription.id,
            details: `Trial ended without payment. Reason: ${cancelReason || "trial_end"}`,
          });

          await syncGovopsStatus(tenantId, { status: "trial_expired" });
        } else {
          // User-initiated cancellation
          await sbQuery("PATCH", `subscriptions?tenant_id=eq.${tenantId}`, {}, {
            status: "canceled",
            chargebee_status: "cancelled",
          });

          await sbQuery("POST", "audit_log", {}, {
            tenant_id: tenantId,
            actor_name: "Chargebee",
            actor_role: "system",
            action: "subscription.canceled",
            target: subscription.id,
            details: `Subscription cancelled by user. Reason: ${cancelReason || "user"}`,
          });

          await syncGovopsStatus(tenantId, { status: "churned" });
        }

        await sbQuery(
          "PATCH",
          `chargebee_webhook_events?event_id=eq.${eventId}`,
          {},
          { tenant_id: tenantId },
        );
        break;
      }

      // ═══ PAYMENT SUCCEEDED / INVOICE GENERATED ═══
      case "payment_succeeded":
      case "invoice_generated": {
        const invoice = content.invoice || {};
        const invSubId: string = invoice.subscription_id || subscription.id || "";

        if (!invSubId) {
          console.log(`${eventType} without subscription_id, skipping`);
          break;
        }

        const sub = await sbQuery("GET", "subscriptions", {
          chargebee_subscription_id: `eq.${invSubId}`,
          select: "tenant_id,status",
        });
        if (!sub?.tenant_id) {
          console.log(`No tenant for subscription ${invSubId}`);
          break;
        }
        const tenantId = sub.tenant_id;

        // Total amount in cents
        const amountCents: number = invoice.total || invoice.amount_due || 0;
        const invoiceStatus = eventType === "payment_succeeded" ? "paid" : "pending";
        const invoiceDate = invoice.date
          ? new Date(invoice.date * 1000).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];
        const dueDate = invoice.due_date
          ? new Date(invoice.due_date * 1000).toISOString().split("T")[0]
          : null;

        // Insert invoice record
        await sbQuery("POST", "invoices", {}, {
          tenant_id: tenantId,
          provider_invoice_id: invoice.id || null,
          amount: amountCents,
          status: invoiceStatus,
          invoice_date: invoiceDate,
          due_date: dueDate,
          paid_date: eventType === "payment_succeeded" ? new Date().toISOString().split("T")[0] : null,
        });

        if (eventType === "payment_succeeded") {
          // Set subscription active
          await sbQuery("PATCH", `subscriptions?tenant_id=eq.${tenantId}`, {}, {
            status: "active",
            chargebee_status: "active",
          });

          // Transition onboarding -> active on first payment
          await sbQuery("PATCH", `tenants?id=eq.${tenantId}&status=eq.onboarding`, {}, {
            status: "active",
          });

          // Check for setup line item
          const lineItems = invoice.line_items || [];
          for (const line of lineItems) {
            const lpId: string = line.item_price_id || "";
            if (lpId.startsWith("Setup-")) {
              const setupAmount = line.amount || 0;
              await sbQuery("PATCH", `subscriptions?tenant_id=eq.${tenantId}`, {}, {
                setup_paid_at: new Date().toISOString(),
                setup_amount: setupAmount,
              });
              console.log(`Setup charge recorded: ${setupAmount} cents`);
              break;
            }
          }

          await syncGovopsStatus(tenantId, { status: "active" });
        }

        await sbQuery(
          "PATCH",
          `chargebee_webhook_events?event_id=eq.${eventId}`,
          {},
          { tenant_id: tenantId },
        );
        break;
      }

      // ═══ PAYMENT FAILED ═══
      case "payment_failed": {
        const invoice = content.invoice || {};
        const invSubId: string = invoice.subscription_id || subscription.id || "";

        if (!invSubId) break;

        const sub = await sbQuery("GET", "subscriptions", {
          chargebee_subscription_id: `eq.${invSubId}`,
          select: "tenant_id",
        });
        if (!sub?.tenant_id) break;
        const tenantId = sub.tenant_id;

        await sbQuery("PATCH", `subscriptions?tenant_id=eq.${tenantId}`, {}, {
          status: "past_due",
          chargebee_status: "active", // Chargebee keeps it active but dunning
        });

        const amountCents: number = invoice.total || invoice.amount_due || 0;
        const invoiceDate = invoice.date
          ? new Date(invoice.date * 1000).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];
        const dueDate = invoice.due_date
          ? new Date(invoice.due_date * 1000).toISOString().split("T")[0]
          : null;

        await sbQuery("POST", "invoices", {}, {
          tenant_id: tenantId,
          provider_invoice_id: invoice.id || null,
          amount: amountCents,
          status: "overdue",
          invoice_date: invoiceDate,
          due_date: dueDate,
        });

        await sbQuery("POST", "audit_log", {}, {
          tenant_id: tenantId,
          actor_name: "Chargebee",
          actor_role: "system",
          action: "invoice.payment_failed",
          target: invoice.id || "",
          details: `Payment of $${(amountCents / 100).toFixed(2)} failed`,
        });

        await sbQuery(
          "PATCH",
          `chargebee_webhook_events?event_id=eq.${eventId}`,
          {},
          { tenant_id: tenantId },
        );
        break;
      }

      // ═══ TRIAL END REMINDER ═══
      case "subscription_trial_end_reminder": {
        const sub = await sbQuery("GET", "subscriptions", {
          chargebee_subscription_id: `eq.${subscription.id}`,
          select: "tenant_id",
        });
        if (!sub?.tenant_id) break;

        await sbQuery("POST", "audit_log", {}, {
          tenant_id: sub.tenant_id,
          actor_name: "Chargebee",
          actor_role: "system",
          action: "subscription.trial_end_reminder",
          target: subscription.id,
          details: `Trial ending soon for subscription ${subscription.id}`,
        });

        // Invoke trial-reminder function
        try {
          const subRow = await sbQuery("GET", "subscriptions", {
            chargebee_subscription_id: `eq.${subscription.id}`,
            select: "tenant_id",
          });
          if (subRow?.tenant_id) {
            await fetch(`${SB_URL}/functions/v1/trial-reminder`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${SB_SERVICE_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ tenant_id: subRow.tenant_id, subscription_id: subscription.id }),
            });
          }
        } catch (e) {
          console.error('trial-reminder invocation error:', e);
        }

        await sbQuery(
          "PATCH",
          `chargebee_webhook_events?event_id=eq.${eventId}`,
          {},
          { tenant_id: sub.tenant_id },
        );
        break;
      }

      // ═══ SUBSCRIPTION ACTIVATED (trial -> paid) ═══
      case "subscription_activated": {
        const parsed = parseSubscriptionItems(subscriptionItems);

        // Find tenant by chargebee_subscription_id
        const sub = await sbQuery("GET", "subscriptions", {
          chargebee_subscription_id: `eq.${subscription.id}`,
          select: "tenant_id",
        });
        if (!sub?.tenant_id) {
          console.log(`No tenant found for subscription ${subscription.id}`);
          break;
        }
        const tenantId = sub.tenant_id;

        // Update tenant_features: set from actual plan (not trial-all-on)
        await sbQuery("PATCH", `tenant_features?tenant_id=eq.${tenantId}`, {}, {
          facilities: parsed.plan === "facilities",
          on_call: parsed.onCall,
        });

        // Update subscription — clear trial_expired_at on reactivation
        await sbQuery("PATCH", `subscriptions?tenant_id=eq.${tenantId}`, {}, {
          status: "active",
          chargebee_status: "active",
          tier: parsed.plan,
          addon_on_call: parsed.onCall,
          pm_addon: parsed.pmSeat,
          billing_interval: parsed.interval,
          monthly_rate: parsed.monthlyRate,
          trial_expired_at: null,
        });

        // Audit
        await sbQuery("POST", "audit_log", {}, {
          tenant_id: tenantId,
          actor_name: "Chargebee",
          actor_role: "system",
          action: "subscription.activated",
          target: subscription.id,
          details: `Trial converted to paid. Plan: ${parsed.plan} | On Call: ${parsed.onCall} | PM: ${parsed.pmSeat} | Interval: ${parsed.interval} | Rate: $${(parsed.monthlyRate / 100).toFixed(2)}/mo`,
        });

        // Update event with tenant_id
        await sbQuery(
          "PATCH",
          `chargebee_webhook_events?event_id=eq.${eventId}`,
          {},
          { tenant_id: tenantId },
        );

        // Sync govops status=active
        await syncGovopsStatus(tenantId, { status: "active" });
        break;
      }

      default:
        console.log(`Unhandled Chargebee event: ${eventType}`);
    }

    // Mark event as success
    await markEvent(eventId, "success");
  } catch (err) {
    console.error(`Error processing ${eventType}:`, err);
    await markEvent(eventId, "failed", String(err));
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
