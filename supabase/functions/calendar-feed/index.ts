// supabase/functions/calendar-feed/index.ts
// GET endpoint that returns an ICS calendar feed for a tenant + role.
// Authenticated via HMAC-signed token: base64url(tenantId:role:timestamp:hmac)
// The HMAC is SHA-256 of "tenantId:role" using CALENDAR_FEED_SECRET.

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const FEED_SECRET = Deno.env.get("CALENDAR_FEED_SECRET") || "default-dev-secret";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── HMAC helpers (Web Crypto) ────────────────────────────────────────────────

async function hmacSign(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function verifyToken(
  token: string
): Promise<{ tenantId: string; role: string } | null> {
  try {
    // Decode base64url
    const padded = token.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(padded);
    const parts = decoded.split(":");
    if (parts.length < 3) return null;

    const tenantId = parts[0];
    const role = parts[1];
    const providedHmac = parts.slice(2).join(":");

    const expectedHmac = await hmacSign(`${tenantId}:${role}`, FEED_SECRET);
    if (providedHmac !== expectedHmac) return null;

    return { tenantId, role };
  } catch {
    return null;
  }
}

// ── ICS builder (server-side, simplified) ────────────────────────────────────

function toIcsDate(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

interface CalendarEvent {
  uid: string;
  summary: string;
  dtstart: string; // YYYY-MM-DD
  description?: string;
  location?: string;
  categories?: string;
}

function buildIcsFromEvents(
  events: CalendarEvent[],
  calName: string
): string {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//ONE two//Governance Calendar//EN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push(`X-WR-CALNAME:${escapeIcs(calName)}`);

  for (const ev of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.uid}`);
    lines.push(`DTSTART;VALUE=DATE:${toIcsDate(ev.dtstart)}`);
    lines.push(`SUMMARY:${escapeIcs(ev.summary)}`);
    if (ev.description) {
      lines.push(`DESCRIPTION:${escapeIcs(ev.description)}`);
    }
    if (ev.location) {
      lines.push(`LOCATION:${escapeIcs(ev.location)}`);
    }
    if (ev.categories) {
      lines.push(`CATEGORIES:${ev.categories}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }

  // Extract token from query string
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Missing token", { status: 401, headers: cors });
  }

  const auth = await verifyToken(token);
  if (!auth) {
    return new Response("Invalid token", { status: 403, headers: cors });
  }

  const { tenantId, role } = auth;

  // Fetch data from Supabase using service role key
  const headers = {
    Authorization: `Bearer ${SB_SERVICE_KEY}`,
    apikey: SB_SERVICE_KEY,
    "Content-Type": "application/json",
  };

  const events: CalendarEvent[] = [];

  try {
    // Fetch compliance completions (items with due dates)
    const complianceRes = await fetch(
      `${SB_URL}/rest/v1/compliance_items?tenant_id=eq.${tenantId}&select=id,task,due_date,legal_ref,primary_role,backstop_role,freq`,
      { headers }
    );
    if (complianceRes.ok) {
      const items = await complianceRes.json();
      for (const item of items) {
        if (!item.due_date || !/^\d{4}-\d{2}-\d{2}$/.test(item.due_date))
          continue;
        if (
          role !== "all" &&
          item.primary_role !== role &&
          item.backstop_role !== role
        )
          continue;

        events.push({
          uid: `item-${item.id}@getonetwo.com`,
          summary: item.task,
          dtstart: item.due_date,
          description: item.legal_ref || undefined,
          categories: item.freq || "Compliance",
        });
      }
    }

    // Fetch filings
    const filingsRes = await fetch(
      `${SB_URL}/rest/v1/regulatory_filings?tenant_id=eq.${tenantId}&select=id,name,due_date,responsible,category`,
      { headers }
    );
    if (filingsRes.ok) {
      const filings = await filingsRes.json();
      for (const f of filings) {
        if (
          role !== "all" &&
          f.responsible?.toLowerCase() !== role.toLowerCase()
        )
          continue;

        events.push({
          uid: `filing-${f.id}@getonetwo.com`,
          summary: f.name,
          dtstart: f.due_date,
          description: `Filing category: ${f.category}`,
          categories: "Filing",
        });
      }
    }

    // Fetch meetings
    const meetingsRes = await fetch(
      `${SB_URL}/rest/v1/meetings?tenant_id=eq.${tenantId}&status=neq.CANCELLED&select=id,title,date,time,location,agenda`,
      { headers }
    );
    if (meetingsRes.ok) {
      const meetings = await meetingsRes.json();
      for (const m of meetings) {
        events.push({
          uid: `mtg-${m.id}@getonetwo.com`,
          summary: m.title,
          dtstart: m.date,
          location: m.location || undefined,
          description: Array.isArray(m.agenda)
            ? `Agenda:\n${m.agenda.join("\n")}`
            : undefined,
          categories: "Meeting",
        });
      }
    }
  } catch (err) {
    console.error("calendar-feed fetch error:", err);
    // Return an empty calendar rather than failing
  }

  const calName = `ONE two Governance${role !== "all" ? ` (${role})` : ""}`;
  const ics = buildIcsFromEvents(events, calName);

  return new Response(ics, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="governance.ics"',
      "Cache-Control": "public, max-age=3600",
    },
  });
});
