// supabase/functions/_shared/letterStorage.ts
// Rendered letters for a provider that fetches the PDF by URL (DocuPost).
// The function uploads with the service role into the private mail-letters
// bucket and hands the vendor a signed URL that expires on its own.

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
export const LETTERS_BUCKET = "mail-letters";
/** Long enough for the vendor to fetch it and for a cancelled letter to be re-queued. */
const SIGNED_URL_SECONDS = 7 * 24 * 3600;

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
