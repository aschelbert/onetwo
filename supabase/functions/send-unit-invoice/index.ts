// supabase/functions/send-unit-invoice/index.ts
// Creates a Stripe Checkout session for a unit invoice and emails the payment link via Mailjet

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const MJ_API_KEY = Deno.env.get("MAILJET_API_KEY") || "";
const MJ_SECRET_KEY = Deno.env.get("MAILJET_SECRET_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://app.getonetwo.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const body = await req.json();
    const {
      invoiceId,
      unitNumber,
      ownerName,
      ownerEmail,
      amount, // in dollars
      description,
      type, // 'fee' | 'special_assessment'
      buildingName,
      buildingAddress,
    } = body;

    if (!ownerEmail || !amount || !description) {
      return new Response(JSON.stringify({ error: "Missing required fields: ownerEmail, amount, description" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
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

      // If a real Stripe Connect account ID is provided, create the session on that account
      // with an application fee. Otherwise, create on the platform account.
      const headers: Record<string, string> = {
        "Authorization": `Bearer ${STRIPE_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      };

      if (body.stripeConnectId && body.stripeConnectId.startsWith("acct_") && body.stripeConnectId.length > 10) {
        headers["Stripe-Account"] = body.stripeConnectId;
        // Add application fee (2.9% platform fee)
        stripeParams.append("payment_intent_data[application_fee_amount]", String(Math.round(amount * 100 * 0.029)));
        console.log("Creating Checkout on connected account:", body.stripeConnectId);
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
    const typeLabel = type === "fee" ? "Fee" : type === "special_assessment" ? "Special Assessment" : "Invoice";

    // Send email via Mailjet
    const auth = btoa(`${MJ_API_KEY}:${MJ_SECRET_KEY}`);
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: #3D3D3D; border-radius: 8px; width: 48px; height: 48px; line-height: 48px; color: white; font-weight: bold; font-size: 24px;">+</div>
          <h1 style="font-size: 20px; color: #1a1a1a; margin: 16px 0 4px;">New ${typeLabel} — Unit ${unitNumber || "N/A"}</h1>
          <p style="color: #666; font-size: 14px; margin: 0;">${buildingName || "Your HOA"}</p>
        </div>

        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <table style="width: 100%; font-size: 14px; color: #374151;">
            <tr><td style="padding: 8px 0; color: #6b7280;">Invoice</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${invoiceId || "—"}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Type</td><td style="padding: 8px 0; text-align: right;">${typeLabel}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Unit</td><td style="padding: 8px 0; text-align: right;">${unitNumber || "N/A"}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Description</td><td style="padding: 8px 0; text-align: right;">${description}</td></tr>
            ${buildingAddress ? `<tr><td style="padding: 8px 0; color: #6b7280;">Address</td><td style="padding: 8px 0; text-align: right; font-size: 12px;">${buildingAddress}</td></tr>` : ""}
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
          <p>${buildingName || "Your HOA"} · ${buildingAddress || ""}</p>
          <p style="margin-top: 4px;">Powered by <strong>ONE two</strong> HOA GovOps</p>
        </div>
      </div>
    `;

    const textBody = `${typeLabel} — Unit ${unitNumber || "N/A"}\n\n${description}\nAmount Due: ${fmtAmount}\n\n${paymentUrl ? `Pay now: ${paymentUrl}` : "Contact your board for payment instructions."}\n\n${buildingName || "Your HOA"}`;

    const mjRes = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        Messages: [{
          From: { Email: "noreply@getonetwo.com", Name: buildingName || "ONE two HOA" },
          To: [{ Email: ownerEmail, Name: ownerName || ownerEmail.split("@")[0] }],
          Subject: `${typeLabel}: ${fmtAmount} — Unit ${unitNumber || "N/A"} · ${buildingName || "HOA"}`,
          TextPart: textBody,
          HTMLPart: htmlBody,
        }],
      }),
    });

    let emailSent = false;
    if (mjRes.ok) {
      console.log("Invoice email sent to:", ownerEmail);
      emailSent = true;
    } else {
      const mjErr = await mjRes.text();
      console.error("Mailjet error:", mjRes.status, mjErr);
    }

    return new Response(JSON.stringify({
      success: true,
      emailSent,
      paymentUrl,
      stripeSessionId,
      stripeError: stripeError || null,
      invoiceId,
    }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-unit-invoice error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

