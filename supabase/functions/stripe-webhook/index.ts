// supabase/functions/stripe-webhook/index.ts

import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-04-10" });
const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("No signature", { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, endpointSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  console.log(`Received event: ${event.type}`);

  try {
    switch (event.type) {

      // ═══════════════════════════════════════════════════════════════════
      // CHECKOUT COMPLETED — Provision the tenant
      // ═══════════════════════════════════════════════════════════════════
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const meta = session.metadata || {};

        if (!meta.building_name || !meta.user_id) {
          console.log("Non-onboarding checkout, skipping provision");
          break;
        }

        console.log(`Provisioning tenant: ${meta.building_name} for user ${meta.user_id}`);

        // Call the database function
        const { data, error } = await supabaseAdmin.rpc("provision_tenant", {
          p_name: meta.building_name,
          p_address: JSON.stringify({
            street: meta.address_street,
            city: meta.address_city,
            state: meta.address_state,
            zip: meta.address_zip,
          }),
          p_total_units: parseInt(meta.total_units) || 0,
          p_year_built: meta.year_built || null,
          p_tier: meta.tier,
          p_contact_name: meta.contact_name,
          p_contact_email: meta.contact_email,
          p_contact_phone: meta.contact_phone,
          p_user_id: meta.user_id,
          p_stripe_customer_id: session.customer as string,
          p_stripe_subscription_id: session.subscription as string,
          p_board_title: meta.board_title || "President",
        });

        if (error) {
          console.error("provision_tenant error:", error);
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        console.log("Tenant provisioned:", JSON.stringify(data));

        // TODO: Send welcome email via Resend
        // const subdomain = data.subdomain;
        // await sendWelcomeEmail(meta.contact_email, meta.contact_name, meta.building_name, subdomain);

        break;
      }

      // ═══════════════════════════════════════════════════════════════════
      // INVOICE PAID
      // ═══════════════════════════════════════════════════════════════════
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;

        // Find tenant by Stripe subscription ID
        const { data: sub } = await supabaseAdmin
          .from("subscriptions")
          .select("tenant_id")
          .eq("stripe_subscription_id", subId)
          .single();

        if (sub) {
          // Record invoice
          await supabaseAdmin.from("invoices").insert({
            tenant_id: sub.tenant_id,
            stripe_invoice_id: invoice.id,
            amount: invoice.amount_paid,
            status: "paid",
            invoice_date: new Date(invoice.created * 1000).toISOString().split("T")[0],
            due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString().split("T")[0] : null,
            paid_date: new Date().toISOString().split("T")[0],
          });

          // Ensure subscription status is active
          await supabaseAdmin
            .from("subscriptions")
            .update({ status: "active" })
            .eq("tenant_id", sub.tenant_id);

          // Ensure tenant status is active (if was onboarding and payment came through)
          await supabaseAdmin
            .from("tenants")
            .update({ status: "active" })
            .eq("id", sub.tenant_id)
            .in("status", ["onboarding"]);
        }
        break;
      }

      // ═══════════════════════════════════════════════════════════════════
      // INVOICE PAYMENT FAILED
      // ═══════════════════════════════════════════════════════════════════
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;

        const { data: sub } = await supabaseAdmin
          .from("subscriptions")
          .select("tenant_id")
          .eq("stripe_subscription_id", subId)
          .single();

        if (sub) {
          await supabaseAdmin
            .from("subscriptions")
            .update({ status: "past_due" })
            .eq("tenant_id", sub.tenant_id);

          // Record the failed invoice
          await supabaseAdmin.from("invoices").insert({
            tenant_id: sub.tenant_id,
            stripe_invoice_id: invoice.id,
            amount: invoice.amount_due,
            status: "overdue",
            invoice_date: new Date(invoice.created * 1000).toISOString().split("T")[0],
            due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString().split("T")[0] : null,
          });

          // Audit log
          await supabaseAdmin.from("audit_log").insert({
            tenant_id: sub.tenant_id,
            actor_name: "Stripe",
            actor_role: "system",
            action: "invoice.payment_failed",
            target: invoice.id,
            details: `Payment of $${(invoice.amount_due / 100).toFixed(2)} failed`,
          });
        }
        break;
      }

      // ═══════════════════════════════════════════════════════════════════
      // SUBSCRIPTION CANCELED
      // ═══════════════════════════════════════════════════════════════════
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        const { data: sub } = await supabaseAdmin
          .from("subscriptions")
          .select("tenant_id")
          .eq("stripe_subscription_id", subscription.id)
          .single();

        if (sub) {
          await supabaseAdmin
            .from("subscriptions")
            .update({ status: "canceled" })
            .eq("tenant_id", sub.tenant_id);

          await supabaseAdmin
            .from("tenants")
            .update({ status: "suspended" })
            .eq("id", sub.tenant_id);

          await supabaseAdmin.from("audit_log").insert({
            tenant_id: sub.tenant_id,
            actor_name: "Stripe",
            actor_role: "system",
            action: "subscription.canceled",
            target: subscription.id,
            details: "Subscription canceled — tenant suspended",
          });
        }
        break;
      }

      // ═══════════════════════════════════════════════════════════════════
      // SUBSCRIPTION UPDATED (tier change, renewal, etc.)
      // ═══════════════════════════════════════════════════════════════════
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;

        const { data: sub } = await supabaseAdmin
          .from("subscriptions")
          .select("tenant_id, tier")
          .eq("stripe_subscription_id", subscription.id)
          .single();

        if (sub) {
          // Update period dates
          await supabaseAdmin
            .from("subscriptions")
            .update({
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              status: subscription.status === "active" ? "active" :
                      subscription.status === "trialing" ? "trialing" :
                      subscription.status === "past_due" ? "past_due" : "canceled",
            })
            .eq("tenant_id", sub.tenant_id);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`Error processing ${event.type}:`, err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

