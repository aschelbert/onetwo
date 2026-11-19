// supabase/functions/notify-signup/index.ts
// Sends an internal notification email to the CONTACT_INBOX secret when someone
// signs up for the demo or a new building is provisioned.
// Fire-and-forget from client — failures logged but don't block UX.
//
// Public by design: the demo form posts here from a logged-out page. It only
// ever mails the CONTACT_INBOX secret, never an address from the request, and
// it defends that inbox itself: a cap per caller and overall per hour (counted
// in signup_notifications), length limits, and every value from the request
// escaped before it goes into the email.

const MJ_API_KEY = Deno.env.get("MAILJET_API_KEY") || "";
const MJ_SECRET_KEY = Deno.env.get("MAILJET_SECRET_KEY") || "";
const CONTACT_INBOX = Deno.env.get("CONTACT_INBOX") || "";
const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const IP_SALT = Deno.env.get("CONTACT_IP_SALT") || SB_SERVICE_KEY.slice(-16);

const PER_IP_PER_HOUR = 5;
const TOTAL_PER_HOUR = 30;
const MAX_FIELD = 200;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** A value from the request as one line of plain text, at most MAX_FIELD long. */
function field(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, MAX_FIELD);
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const serviceHeaders = { apikey: SB_SERVICE_KEY, Authorization: `Bearer ${SB_SERVICE_KEY}` };

/** Notifications sent in the last hour, optionally only those matching `filter`. */
async function recentCount(filter: Record<string, string> = {}): Promise<number> {
  const url = new URL(`${SB_URL}/rest/v1/signup_notifications`);
  url.searchParams.set("select", "id");
  url.searchParams.set("created_at", `gte.${new Date(Date.now() - 3600_000).toISOString()}`);
  for (const [k, v] of Object.entries(filter)) url.searchParams.set(k, v);
  const res = await fetch(url, { method: "HEAD", headers: { ...serviceHeaders, Prefer: "count=exact" } });
  const range = res.headers.get("content-range") || "*/0";
  return Number(range.split("/")[1]) || 0;
}

async function recordNotification(type: string, ipHash: string | null): Promise<void> {
  const res = await fetch(`${SB_URL}/rest/v1/signup_notifications`, {
    method: "POST",
    headers: { ...serviceHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ type, ip_hash: ipHash }),
  });
  if (!res.ok) console.error("signup_notifications insert failed:", res.status, (await res.text()).slice(0, 200));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const body = await req.json();
    const type: "demo" | "building" = body.type;

    if (!type || !["demo", "building"].includes(type)) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid type (demo | building)" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    if (!CONTACT_INBOX) {
      console.warn("CONTACT_INBOX not configured — skipping notification email");
      return new Response(
        JSON.stringify({ sent: false, error: "Recipient not configured" }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    if (!MJ_API_KEY || !MJ_SECRET_KEY) {
      console.warn("Mailjet not configured — skipping notification email");
      return new Response(
        JSON.stringify({ sent: false, error: "Email not configured" }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    let subject: string;
    let detailsHtml: string;
    let detailsText: string;

    if (type === "demo") {
      const name = field(body.name);
      const email = field(body.email);
      const condo_name = field(body.condo_name);
      const unit_count = field(body.unit_count);
      const member_type = field(body.member_type);
      const subscription_interest = field(body.subscription_interest);
      if (!name || !email) {
        return new Response(
          JSON.stringify({ error: "Missing required fields for demo notification" }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      subject = `New Demo Signup: ${name}`;

      const tierLabel: Record<string, string> = {
        compliance_pro: "Compliance Pro",
        community_plus: "Community+",
        management_suite: "Management Suite",
      };
      const memberLabel: Record<string, string> = {
        resident: "Resident",
        board_member: "Board Member",
        property_manager: "Property Manager",
        other: "Other",
      };

      detailsHtml = `
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Name</td><td style="padding:8px 12px;font-size:13px;font-weight:600;">${esc(name)}</td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Email</td><td style="padding:8px 12px;font-size:13px;font-weight:600;"><a href="mailto:${esc(email)}" style="color:#d62839;">${esc(email)}</a></td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Community</td><td style="padding:8px 12px;font-size:13px;font-weight:600;">${esc(condo_name || "—")}</td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Units</td><td style="padding:8px 12px;font-size:13px;font-weight:600;">${esc(unit_count || "—")}</td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Role</td><td style="padding:8px 12px;font-size:13px;font-weight:600;">${esc(memberLabel[member_type] || member_type || "—")}</td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Tier Interest</td><td style="padding:8px 12px;font-size:13px;font-weight:600;">${esc(tierLabel[subscription_interest] || subscription_interest || "—")}</td></tr>`;

      detailsText = `Name: ${name}\nEmail: ${email}\nCommunity: ${condo_name || "—"}\nUnits: ${unit_count || "—"}\nRole: ${memberLabel[member_type] || member_type || "—"}\nTier Interest: ${tierLabel[subscription_interest] || subscription_interest || "—"}`;
    } else {
      // building — called by chargebee-checkout / provision_tenant
      const name = field(body.name);
      const email = field(body.email);
      const plan = field(body.plan);
      if (!name || !email) {
        return new Response(
          JSON.stringify({ error: "Missing required fields for building notification" }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      subject = `New building: ${name}`;

      detailsHtml = `
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Building</td><td style="padding:8px 12px;font-size:13px;font-weight:600;">${esc(name)}</td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Email</td><td style="padding:8px 12px;font-size:13px;font-weight:600;"><a href="mailto:${esc(email)}" style="color:#d62839;">${esc(email)}</a></td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Plan</td><td style="padding:8px 12px;font-size:13px;font-weight:600;">${esc(plan || "—")}</td></tr>`;

      detailsText = `Building: ${name}\nEmail: ${email}\nPlan: ${plan || "—"}`;
    }

    // Cap what one caller, and everyone together, can send to the inbox in an hour.
    if (SB_URL && SB_SERVICE_KEY) {
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
      const ipHash = ip ? await sha256(`${IP_SALT}:${ip}`) : null;
      const [byIp, total] = await Promise.all([
        ipHash ? recentCount({ ip_hash: `eq.${ipHash}` }) : Promise.resolve(0),
        recentCount(),
      ]);
      if (byIp >= PER_IP_PER_HOUR || total >= TOTAL_PER_HOUR) {
        console.warn(`notify-signup rate limited (caller ${byIp}, total ${total} in the last hour)`);
        return new Response(
          JSON.stringify({ sent: false, error: "rate_limited" }),
          { status: 429, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }
      await recordNotification(type, ipHash);
    }

    const typeLabel = type === "demo" ? "Demo Signup" : "New Building";

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="font-family: Georgia, serif; font-size: 24px; font-weight: 900; color: #0f1a2e;">
            ONE <span style="color: #d62839;">two</span>
          </div>
        </div>

        <div style="background: ${type === "demo" ? "#e0f2fe" : "#d1fae5"}; border-radius: 12px; padding: 16px 20px; text-align: center; margin-bottom: 20px;">
          <p style="color: ${type === "demo" ? "#0369a1" : "#059669"}; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 0;">
            ${typeLabel}
          </p>
        </div>

        <table style="width: 100%; border-collapse: collapse; background: #f8f9fa; border-radius: 12px; overflow: hidden;">
          ${detailsHtml}
        </table>

        <div style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 24px;">
          <p>This is an automated notification from getonetwo.com</p>
        </div>
      </div>`;

    const textBody = `${typeLabel}\n${"=".repeat(30)}\n${detailsText}`;

    const auth = btoa(`${MJ_API_KEY}:${MJ_SECRET_KEY}`);
    const res = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        Messages: [
          {
            From: { Email: "noreply@getonetwo.com", Name: "ONE two HOA" },
            To: [{ Email: CONTACT_INBOX }],
            Subject: subject,
            TextPart: textBody,
            HTMLPart: htmlBody,
          },
        ],
      }),
    });

    const resBody = await res.text();
    if (!res.ok) {
      console.error("Mailjet error:", res.status, resBody);
      return new Response(
        JSON.stringify({ sent: false, error: "Email delivery failed" }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    console.log(`Signup notification (${type}) sent`);
    return new Response(JSON.stringify({ sent: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-signup error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
