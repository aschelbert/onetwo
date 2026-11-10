// supabase/functions/_shared/supabaseRest.ts
// What every edge function needs to talk to its own project: CORS, a JSON
// answer, the caller's user, and service-role REST reads and writes.

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, baggage, sentry-trace",
};

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const serviceHeaders = { "apikey": SB_SERVICE_KEY, "Authorization": `Bearer ${SB_SERVICE_KEY}` };

/** The signed-in user behind the request's bearer token, or null. */
export async function authUser(req: Request): Promise<{ id: string; email?: string } | null> {
  const auth = req.headers.get("Authorization") || "";
  const res = await fetch(`${SB_URL}/auth/v1/user`, { headers: { "Authorization": auth, "apikey": SB_ANON } });
  return res.ok ? await res.json() : null;
}

/** The caller's building and role, from tenant_users. */
export async function membership(userId: string): Promise<{ tenant_id: string; role: string } | null> {
  return await restGetOne("tenant_users", { "user_id": `eq.${userId}`, "select": "tenant_id,role", "limit": "1" });
}

/** One row, or null when there is none. */
// deno-lint-ignore no-explicit-any
export async function restGetOne(table: string, params: Record<string, string>): Promise<any | null> {
  const url = new URL(`${SB_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { ...serviceHeaders, "Accept": "application/vnd.pgrst.object+json" } });
  return res.ok ? await res.json() : null;
}

/** A write (POST, PATCH, DELETE) to a table path that may carry its own query string. Answers whether it succeeded. */
export async function restWrite(method: "POST" | "PATCH" | "DELETE", tableAndQuery: string, body?: unknown, prefer = "return=minimal"): Promise<boolean> {
  const res = await fetch(`${SB_URL}/rest/v1/${tableAndQuery}`, {
    method,
    headers: { ...serviceHeaders, "Content-Type": "application/json", "Prefer": prefer },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) console.error(`${method} ${tableAndQuery} failed:`, res.status, (await res.text()).slice(0, 200));
  return res.ok;
}
