// supabase/functions/verify-address/index.ts
// Verifies a DC address against the MAR/OTR and checks for condo use codes.
// Anonymous-callable. Rate limited via address_lookups table (30/IP/hour).

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const MAR_URL =
  "https://citizenatlas.dc.gov/newwebservices/locationverifier.asmx/findLocation2";

// DC ITS feature layer for condo lot lookup (Open Data DC)
const ITS_LAYER_URL =
  Deno.env.get("DC_ITS_LAYER_URL") ||
  "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land_702/MapServer/53/query";

const ITS_USE_CODE_FIELD = Deno.env.get("DC_ITS_USE_CODE_FIELD") || "USECODE";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, baggage, sentry-trace",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ── Supabase REST helper (service role) ──

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
  if (method === "GET") headers["Accept"] = "application/json";
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

// ── Rate limiting ──

async function checkRateLimit(ip: string): Promise<boolean> {
  // Clean up old entries (>1 day)
  await fetch(
    `${SB_URL}/rest/v1/address_lookups?created_at=lt.${new Date(Date.now() - 86400000).toISOString()}`,
    {
      method: "DELETE",
      headers: {
        apikey: SB_SERVICE_KEY,
        Authorization: `Bearer ${SB_SERVICE_KEY}`,
      },
    },
  );

  // Count recent lookups for this IP (last hour)
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const countRes = await fetch(
    `${SB_URL}/rest/v1/address_lookups?ip=eq.${encodeURIComponent(ip)}&created_at=gte.${oneHourAgo}&select=id`,
    {
      headers: {
        apikey: SB_SERVICE_KEY,
        Authorization: `Bearer ${SB_SERVICE_KEY}`,
        Accept: "application/json",
        Prefer: "count=exact",
      },
    },
  );

  const countHeader = countRes.headers.get("content-range");
  const count = countHeader
    ? parseInt(countHeader.split("/")[1] || "0")
    : 0;

  if (count >= 30) return false;

  // Record this lookup
  await sbQuery("POST", "address_lookups", {}, { ip });
  return true;
}

// ── MAR findLocation2 ──

interface MarResult {
  marAddressId: string;
  fullAddress: string;
  ssl: string;
  ward: string;
  lat: number;
  lng: number;
  confidence: number;
}

async function findLocation(query: string): Promise<MarResult | null> {
  const url = new URL(MAR_URL);
  url.searchParams.set("f", "json");
  url.searchParams.set("str", query);

  const res = await fetch(url.toString());
  if (!res.ok) return null;

  // deno-lint-ignore no-explicit-any
  const data: any = await res.json();
  const results =
    data?.returnDataset?.Table1 || data?.returnDataset?.table1 || [];

  if (!Array.isArray(results) || results.length === 0) return null;

  // Find the top match with non-zero confidence
  const best = results.find(
    // deno-lint-ignore no-explicit-any
    (r: any) => r.ConfidenceLevel > 0 || r.CONFIDENCELEVEL > 0,
  );
  if (!best) return null;

  return {
    marAddressId: String(best.ADDRESS_ID || best.ADDRESSID || best.AddressId || ""),
    fullAddress: String(best.FULLADDRESS || best.FullAddress || best.fullAddress || ""),
    ssl: String(best.SSL || best.Ssl || ""),
    ward: String(best.WARD || best.Ward || ""),
    lat: Number(best.LATITUDE || best.Latitude || 0),
    lng: Number(best.LONGITUDE || best.Longitude || 0),
    confidence: Number(best.ConfidenceLevel || best.CONFIDENCELEVEL || 0),
  };
}

// ── Check condo use codes via ITS layer ──

async function checkCondoLots(ssl: string): Promise<number> {
  if (!ssl) return 0;

  // Extract square from SSL (first 4 chars typically)
  const square = ssl.replace(/\s+/g, "").substring(0, 4);

  const url = new URL(ITS_LAYER_URL);
  url.searchParams.set("where", `SQUARE='${square}'`);
  url.searchParams.set("outFields", `${ITS_USE_CODE_FIELD},SSL`);
  url.searchParams.set("returnCountOnly", "false");
  url.searchParams.set("f", "json");

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return -1; // Can't determine — treat as unknown

    // deno-lint-ignore no-explicit-any
    const data: any = await res.json();
    const features = data?.features || [];

    // Condo use codes: 016 (Residential-Condominium) and variations
    const condoCodes = ["016", "017", "116", "117"];
    let condoCount = 0;

    // deno-lint-ignore no-explicit-any
    for (const f of features) {
      const useCode = String(
        f.attributes?.[ITS_USE_CODE_FIELD] || "",
      ).trim();
      if (condoCodes.includes(useCode)) condoCount++;
    }

    return condoCount;
  } catch {
    return -1; // Error — can't determine
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  try {
    // Rate limit check
    const allowed = await checkRateLimit(ip);
    if (!allowed) {
      return jsonResponse(
        { error: "Rate limit exceeded. Try again later." },
        429,
      );
    }

    // ── GET: check if address is already claimed ──
    if (req.method === "GET") {
      const url = new URL(req.url);
      const marAddressId = url.searchParams.get("marAddressId");
      if (!marAddressId) {
        return jsonResponse({ error: "marAddressId query param required" }, 400);
      }

      const tenants = await sbQuery("GET", "tenants", {
        mar_address_id: `eq.${marAddressId}`,
        select: "name",
      });

      if (Array.isArray(tenants) && tenants.length > 0) {
        return jsonResponse({
          claimed: true,
          buildingName: tenants[0].name,
        });
      }

      return jsonResponse({ claimed: false });
    }

    // ── POST: verify address ──
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const body = await req.json();
    const query = body.query?.trim();
    if (!query) {
      return jsonResponse({ error: "query is required" }, 400);
    }

    // 1. Call MAR findLocation2
    const mar = await findLocation(query);
    if (!mar || !mar.marAddressId) {
      return jsonResponse({
        status: "not_found",
        message: "Address not found in the DC Master Address Repository.",
      });
    }

    // 2. Check condo use codes
    const condoCount = await checkCondoLots(mar.ssl);
    if (condoCount === 0) {
      return jsonResponse({
        status: "not_condo",
        marAddressId: mar.marAddressId,
        fullAddress: mar.fullAddress,
        ssl: mar.ssl,
        ward: mar.ward,
        lat: mar.lat,
        lng: mar.lng,
        unitsOnRecord: 0,
        message:
          "This address was found but does not appear to have condominium lots on record.",
      });
    }

    // 3. Success
    return jsonResponse({
      status: "verified",
      marAddressId: mar.marAddressId,
      fullAddress: mar.fullAddress,
      ssl: mar.ssl,
      ward: mar.ward,
      unitsOnRecord: condoCount > 0 ? condoCount : undefined,
      lat: mar.lat,
      lng: mar.lng,
    });
  } catch (err) {
    console.error("verify-address error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
