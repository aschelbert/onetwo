// supabase/functions/send-unit-invoice/index.ts
// Creates a Stripe Checkout session for a unit invoice and emails the payment link.
// Only a signed-in board member, property manager or account owner of the
// building may call it: the caller is verified before anything is read from
// the body, and the building's name and Stripe account come from the database,
// not from the request.

import { authUser, canManageBuilding, cors, escapeHtml, jsonResponse, membershipIn, restGetOne } from "../_shared/supabaseRest.ts";
import { sendEmail } from "../_shared/email.ts";

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://app.getonetwo.com";
const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // Who is asking: a signed-in user, or nothing happens.
    const user = await authUser(req);
    if (!user?.id) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const {
      invoiceId,
      unitNumber,
      ownerName,
      ownerEmail,
      description,
      type, // 'fee' | 'special_assessment'
      buildingAddress,
    } = body;
    const amount = Number(body.amount); // in dollars
    // The due date, when the caller names one: shown in the email so the owner knows what to pay by.
    const dueDate = typeof body.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) ? body.dueDate : "";
    const dueLabel = dueDate
      ? new Date(`${dueDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
      : "";

    // May they bill units in this building?
    if (body.tenantId !== undefined && body.tenantId !== null && !(typeof body.tenantId === "string" && UUID.test(body.tenantId))) {
      return jsonResponse({ error: "Invalid tenantId" }, 400);
    }
    const tu = await membershipIn(user.id, body.tenantId || undefined);
    if (!canManageBuilding(tu)) {
      return jsonResponse({ error: "Only board members and property managers can send unit invoices" }, 403);
    }
    const tenantId = tu!.tenant_id;

    if (!ownerEmail || typeof ownerEmail !== "string" || !description || !Number.isFinite(amount) || amount <= 0) {
      return jsonResponse({ error: "Missing required fields: ownerEmail, amount, description" }, 400);
    }

    // The building's own name and Stripe account, whatever the request says.
    const tenant = await restGetOne("tenants", { "id": `eq.${tenantId}`, "select": "name" });
    const buildingName: string = tenant?.name || "Your HOA";
    let stripeConnectId = "";
    if (body.stripeConnectId) {
      const settings = await restGetOne("financial_settings", { "tenant_id": `eq.${tenantId}`, "select": "stripe_connect_id" });
      if (!settings?.stripe_connect_id || settings.stripe_connect_id !== body.stripeConnectId) {
        return jsonResponse({ error: "That Stripe account is not connected to this building" }, 403);
      }
      stripeConnectId = settings.stripe_connect_id;
    }

    let paymentUrl = "";
    let stripeSessionId = "";
    let stripeError = "";

    // Create Stripe Checkout Session
    if (STRIPE_KEY) {
      const stripeParams = new URLSearchParams();
      stripeParams.append("mode", "payment");
      stripeParams.append("success_url", `${SITE_URL}/my-unit?payment=success&invoice=${invoiceId || ""}`);
      stripeParams.append("cancel_url", `${SITE_URL}/my-unit?payment=cancelled`);
      stripeParams.append("customer_email", ownerEmail);
      stripeParams.append("line_items[0][price_data][currency]", "usd");
      stripeParams.append("line_items[0][price_data][unit_amount]", String(Math.round(amount * 100)));
      stripeParams.append("line_items[0][price_data][product_data][name]", description);
      stripeParams.append("line_items[0][price_data][product_data][description]",
        `Unit ${unitNumber || "N/A"} — ${buildingName || "HOA"}`);
      stripeParams.append("line_items[0][quantity]", "1");
      stripeParams.append("metadata[invoice_id]", invoiceId || "");
      stripeParams.append("metadata[unit_number]", unitNumber || "");
      stripeParams.append("metadata[type]", type || "invoice");
      stripeParams.append("metadata[tenant_id]", tenantId);

      // If a real Stripe Connect account ID is provided, create the session on that account
      // with an application fee. Otherwise, create on the platform account.
      const headers: Record<string, string> = {
        "Authorization": `Bearer ${STRIPE_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      };

      if (stripeConnectId.startsWith("acct_") && stripeConnectId.length > 10) {
        headers["Stripe-Account"] = stripeConnectId;
        // Add application fee (2.9% platform fee)
        stripeParams.append("payment_intent_data[application_fee_amount]", String(Math.round(amount * 100 * 0.029)));
        console.log("Creating Checkout on connected account:", stripeConnectId);
      }

      const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers,
        body: stripeParams.toString(),
      });

      if (stripeRes.ok) {
        const session = await stripeRes.json();
        paymentUrl = session.url || "";
        stripeSessionId = session.id || "";
        console.log("Stripe session created:", stripeSessionId, "url:", paymentUrl);

        // Save stripe session ID and payment link to unit_invoices
        if (invoiceId && SB_URL && SB_SERVICE_KEY) {
          // Only ever this building's invoice: the link on another building's invoice is not ours to replace.
          const patchUrl = `${SB_URL}/rest/v1/unit_invoices?id=eq.${encodeURIComponent(String(invoiceId))}&tenant_id=eq.${tenantId}`;
          await fetch(patchUrl, {
            method: "PATCH",
            headers: {
              "apikey": SB_SERVICE_KEY,
              "Authorization": `Bearer ${SB_SERVICE_KEY}`,
              "Content-Type": "application/json",
              "Prefer": "return=minimal",
            },
            body: JSON.stringify({
              stripe_checkout_session_id: stripeSessionId,
              stripe_payment_link: paymentUrl,
            }),
          }).then(r => {
            if (!r.ok) console.error("Failed to patch unit_invoices:", r.status);
            else console.log("Saved stripe session to invoice:", invoiceId);
          }).catch(e => console.error("Patch error:", e));
        }
      } else {
        const errBody = await stripeRes.text();
        console.error("Stripe error:", stripeRes.status, errBody);
        stripeError = `Stripe ${stripeRes.status}: ${errBody.slice(0, 200)}`;
        // Continue without Stripe — still send email without payment link
      }
    } else {
      stripeError = "STRIPE_SECRET_KEY not set in Supabase secrets";
      console.error(stripeError);
    }

    // Format amount
    const fmtAmount = "$" + Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2 });
    const typeLabel = type === "fee" ? "Fee" : type === "special_assessment" ? "Special Assessment" : type === "monthly" ? "Dues" : type === "amenity_fee" ? "Amenity Fee" : "Invoice";

    // Send the email
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: #3D3D3D; border-radius: 8px; width: 48px; height: 48px; line-height: 48px; color: white; font-weight: bold; font-size: 24px;">+</div>
          <h1 style="font-size: 20px; color: #1a1a1a; margin: 16px 0 4px;">New ${typeLabel} — Unit ${escapeHtml(unitNumber || "N/A")}</h1>
          <p style="color: #666; font-size: 14px; margin: 0;">${escapeHtml(buildingName || "Your HOA")}</p>
        </div>

        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <table style="width: 100%; font-size: 14px; color: #374151;">
            <tr><td style="padding: 8px 0; color: #6b7280;">Invoice</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${escapeHtml(invoiceId || "—")}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Type</td><td style="padding: 8px 0; text-align: right;">${typeLabel}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Unit</td><td style="padding: 8px 0; text-align: right;">${escapeHtml(unitNumber || "N/A")}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Description</td><td style="padding: 8px 0; text-align: right;">${escapeHtml(description)}</td></tr>
            ${dueLabel ? `<tr><td style="padding: 8px 0; color: #6b7280;">Due</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${dueLabel}</td></tr>` : ""}
            ${buildingAddress ? `<tr><td style="padding: 8px 0; color: #6b7280;">Address</td><td style="padding: 8px 0; text-align: right; font-size: 12px;">${escapeHtml(buildingAddress)}</td></tr>` : ""}
            <tr style="border-top: 2px solid #d1d5db;"><td style="padding: 12px 0; font-weight: bold; font-size: 16px;">Amount Due</td><td style="padding: 12px 0; text-align: right; font-weight: bold; font-size: 20px; color: #dc2626;">${fmtAmount}</td></tr>
          </table>
        </div>

        ${paymentUrl ? `
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${paymentUrl}" style="display: inline-block; background: #635bff; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">Pay ${fmtAmount} Now &rarr;</a>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 8px;">Secure payment powered by Stripe</p>
        </div>
        ` : `
        <div style="text-align: center; margin-bottom: 24px;">
          <p style="color: #6b7280; font-size: 14px;">Please contact your board for payment instructions.</p>
        </div>
        `}

        <div style="text-align: center; color: #9ca3af; font-size: 11px; border-top: 1px solid #e5e7eb; padding-top: 16px;">
          <p>${escapeHtml(buildingName || "Your HOA")} · ${escapeHtml(buildingAddress || "")}</p>
          <p style="margin-top: 4px;">Powered by <strong>ONE two</strong> HOA GovOps</p>
        </div>
      </div>
    `;

    const textBody = `${typeLabel} — Unit ${unitNumber || "N/A"}\n\n${description}\nAmount Due: ${fmtAmount}${dueLabel ? `\nDue: ${dueLabel}` : ""}\n\n${paymentUrl ? `Pay now: ${paymentUrl}` : "Contact your board for payment instructions."}\n\n${buildingName || "Your HOA"}`;

    const emailRes = await sendEmail({
      fromName: buildingName || "ONE two HOA",
      to: { email: ownerEmail, name: ownerName || ownerEmail.split("@")[0] },
      subject: `${typeLabel}: ${fmtAmount} — Unit ${unitNumber || "N/A"} · ${buildingName || "HOA"}`,
      text: textBody,
      html: htmlBody,
    });

    let emailSent = false;
    if (emailRes.ok) {
      console.log("Invoice email sent to:", ownerEmail);
      emailSent = true;
    }

    return jsonResponse({
      success: true,
      emailSent,
      paymentUrl,
      stripeSessionId,
      stripeError: stripeError || null,
      invoiceId,
    });

  } catch (err) {
    console.error("send-unit-invoice error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});

