// supabase/functions/_shared/email.ts
// The one place the app hands an email to its delivery provider (Brevo).
// Every function that sends email goes through sendEmail(), so the provider,
// its key and the From address live here and nowhere else.
//
// Needs the BREVO_API_KEY secret. In Brevo, "Block unknown IP addresses" must
// be off for API keys: edge functions have no fixed outbound address.

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") || "";
const FROM_EMAIL = "noreply@getonetwo.com";
const DEFAULT_FROM_NAME = "ONE two HOA";

export interface Address {
  email: string;
  name?: string;
}

export interface OutgoingEmail {
  /** The name shown as the sender; the address is always noreply@getonetwo.com. */
  fromName?: string;
  to: Address;
  replyTo?: Address;
  subject: string;
  text: string;
  html: string;
  /** Extra headers, e.g. the List-Unsubscribe pair from marketingEmail.ts. */
  headers?: Record<string, string>;
}

export interface SendResult {
  ok: boolean;
  /** The provider's HTTP status; 0 when it could not be reached or email isn't set up. */
  status: number;
  /** What the provider said when it refused, trimmed. */
  error?: string;
}

/** Whether email can be sent at all. Check this to tell "not set up" apart from "failed". */
export function emailConfigured(): boolean {
  return !!BREVO_API_KEY;
}

/** Said to the caller when emailConfigured() is false. The app looks for "not configured". */
export const EMAIL_NOT_CONFIGURED = "Email not configured — provider credentials missing";

/**
 * Whether a failed send is worth trying again later: the provider is down or
 * busy (5xx, 429), unreachable (0), or refusing the whole account (401, 403).
 * Anything else means this one message was refused for good.
 */
export function isTemporary(result: SendResult): boolean {
  return result.status === 0 || result.status >= 500 || [401, 403, 429].includes(result.status);
}

const address = (a: Address) => (a.name ? { email: a.email, name: a.name } : { email: a.email });

/** Sends one email. Never throws: a failure comes back as { ok: false }. */
export async function sendEmail(msg: OutgoingEmail): Promise<SendResult> {
  if (!BREVO_API_KEY) return { ok: false, status: 0, error: EMAIL_NOT_CONFIGURED };
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        sender: { email: FROM_EMAIL, name: msg.fromName || DEFAULT_FROM_NAME },
        to: [address(msg.to)],
        ...(msg.replyTo ? { replyTo: address(msg.replyTo) } : {}),
        subject: msg.subject,
        textContent: msg.text,
        htmlContent: msg.html,
        ...(msg.headers && Object.keys(msg.headers).length ? { headers: msg.headers } : {}),
      }),
    });
    if (res.ok) return { ok: true, status: res.status };
    const error = (await res.text()).slice(0, 300);
    console.error("Brevo error:", res.status, error);
    return { ok: false, status: res.status, error };
  } catch (err) {
    console.error("Brevo could not be reached:", err);
    return { ok: false, status: 0, error: String(err) };
  }
}
