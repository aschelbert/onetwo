// supabase/functions/_shared/letterStorage.ts
// Rendered letters for a provider that fetches the PDF by URL (DocuPost).
// The function uploads with the service role into the private mail-letters
// bucket and hands the vendor a signed URL that expires on its own.

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
export const LETTERS_BUCKET = "mail-letters";
/** Long enough for the vendor to fetch it and for a cancelled letter to be re-queued. */
const SIGNED_URL_SECONDS = 7 * 24 * 3600;

/** Letters older than this are no longer fetchable by their signed URL and can go. */
const KEEP_DAYS = 8;

/**
 * Drop this building's stored letters whose signed URLs have expired. Called
 * opportunistically on each send, so the bucket never grows beyond a week of
 * mail per building and old notices are not kept around indefinitely.
 */
export async function pruneOldLetters(tenantId: string): Promise<number> {
  const headers = { "apikey": SB_SERVICE_KEY, "Authorization": `Bearer ${SB_SERVICE_KEY}`, "Content-Type": "application/json" };
  const cutoff = Date.now() - KEEP_DAYS * 86400_000;
  try {
    // Letters are filed by month, so list the month folders first, then each month that could hold old letters.
    const months = await fetch(`${SB_URL}/storage/v1/object/list/${LETTERS_BUCKET}`, { method: "POST", headers, body: JSON.stringify({ prefix: `${tenantId}/`, limit: 100 }) });
    if (!months.ok) return 0;
    const stale: string[] = [];
    for (const m of (await months.json()) as { name: string }[]) {
      const files = await fetch(`${SB_URL}/storage/v1/object/list/${LETTERS_BUCKET}`, { method: "POST", headers, body: JSON.stringify({ prefix: `${tenantId}/${m.name}/`, limit: 500 }) });
      if (!files.ok) continue;
      for (const f of (await files.json()) as { name: string; created_at?: string }[]) {
        if (f.created_at && Date.parse(f.created_at) < cutoff) stale.push(`${tenantId}/${m.name}/${f.name}`);
      }
    }
    if (!stale.length) return 0;
    const del = await fetch(`${SB_URL}/storage/v1/object/${LETTERS_BUCKET}`, { method: "DELETE", headers, body: JSON.stringify({ prefixes: stale }) });
    return del.ok ? stale.length : 0;
  } catch (e) {
    console.error("pruneOldLetters failed:", e);
    return 0;
  }
}

export async function storeLetterPdf(tenantId: string, bytes: Uint8Array, fileName: string): Promise<{ path: string; signedUrl: string }> {
  const stamp = new Date().toISOString().slice(0, 7);
  const path = `${tenantId}/${stamp}/${crypto.randomUUID()}-${fileName.replace(/[^\w.-]+/g, "_")}`;
  const headers = { "apikey": SB_SERVICE_KEY, "Authorization": `Bearer ${SB_SERVICE_KEY}` };

  const up = await fetch(`${SB_URL}/storage/v1/object/${LETTERS_BUCKET}/${path}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/pdf", "x-upsert": "true" },
    body: bytes,
  });
  if (!up.ok) throw new Error(`Could not store the letter PDF (${up.status}): ${(await up.text()).slice(0, 200)}`);

  const sign = await fetch(`${SB_URL}/storage/v1/object/sign/${LETTERS_BUCKET}/${path}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: SIGNED_URL_SECONDS }),
  });
  if (!sign.ok) throw new Error(`Could not sign the letter URL (${sign.status}): ${(await sign.text()).slice(0, 200)}`);
  const { signedURL } = await sign.json() as { signedURL: string };
  const signedUrl = signedURL.startsWith("http") ? signedURL : `${SB_URL}/storage/v1${signedURL.startsWith("/") ? "" : "/"}${signedURL}`;
  return { path, signedUrl };
}
