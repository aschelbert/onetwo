// supabase/functions/_shared/chargebee.ts
// Calls to the Chargebee API for the inline checkout. The API key stays here,
// on the server; the browser only ever holds the site name and the
// publishable key.

export const CHARGEBEE_SITE = Deno.env.get("CHARGEBEE_SITE") || "";
const CHARGEBEE_API_KEY = Deno.env.get("CHARGEBEE_API_KEY") || "";

/** The production site's custom field carries a typo; the test site's does not. */
export const CF_TENANT_ID = CHARGEBEE_SITE.includes("test") ? "cf_tenant_id" : "cf_tenent_id";

export interface ChargebeeResult {
  ok: boolean;
  status: number;
  // deno-lint-ignore no-explicit-any
  data: any;
  /** Chargebee answered from its idempotency record instead of acting again. */
  replayed: boolean;
  /** Chargebee's own message when the call failed. */
  message: string;
}

/**
 * One Chargebee API call. Never throws on an API error: the caller decides
 * what a refusal means. `idempotencyKey` makes a repeated POST return the
 * first answer instead of acting twice (Chargebee keeps keys for 30 minutes,
 * at most 100 characters).
 */
export async function chargebee(
  method: "GET" | "POST",
  path: string,
  params?: URLSearchParams,
  idempotencyKey?: string,
): Promise<ChargebeeResult> {
  const base = `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/${path}`;
  const headers: Record<string, string> = { Authorization: "Basic " + btoa(CHARGEBEE_API_KEY + ":") };
  let url = base;
  let body: string | undefined;
  if (method === "GET") {
    if (params && [...params].length) url = `${base}?${params.toString()}`;
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = (params ?? new URLSearchParams()).toString();
    if (idempotencyKey) headers["chargebee-idempotency-key"] = idempotencyKey.slice(0, 100);
  }
  const res = await fetch(url, { method, headers, body });
  // deno-lint-ignore no-explicit-any
  let data: any = null;
  try { data = await res.json(); } catch { /* an empty or non-JSON body */ }
  return {
    ok: res.ok,
    status: res.status,
    data,
    replayed: res.headers.get("chargebee-idempotency-replayed") === "true",
    message: res.ok ? "" : String(data?.message || data?.error_msg || `Chargebee answered ${res.status}`),
  };
}
