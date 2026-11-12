// supabase/functions/_shared/openaiAds.ts
// Server-side conversion reporting to OpenAI Ads (ChatGPT ads) via the
// Conversions API. Complements the browser pixel in index.html / app.html,
// which misses visitors who block scripts or close the tab before the
// checkout success callback fires.
//
// Secrets (supabase secrets set ...):
//   OPENAI_ADS_API_KEY        bearer key from the Conversions tab in Ads Manager
//   OPENAI_ADS_PIXEL_ID       pixel id (same one the browser snippet uses)
// Optional:
//   OPENAI_ADS_SIGNUP_EVENT   event type to report for a completed signup;
//                             defaults to "trial_started", the same event the
//                             browser sends, so OpenAI dedupes the two
//   OPENAI_ADS_VALIDATE_ONLY  "true" sends with validate_only so OpenAI checks
//                             the payload but records nothing (dry run)

const API_KEY = Deno.env.get("OPENAI_ADS_API_KEY") || "";
const PIXEL_ID = Deno.env.get("OPENAI_ADS_PIXEL_ID") || "";
const SIGNUP_EVENT = Deno.env.get("OPENAI_ADS_SIGNUP_EVENT") || "trial_started";
const VALIDATE_ONLY = (Deno.env.get("OPENAI_ADS_VALIDATE_ONLY") || "").toLowerCase() === "true";
const SITE_URL = Deno.env.get("SITE_URL") || "https://getonetwo.com";

const EVENTS_URL = "https://bzr.openai.com/v1/events";

/** Whether both secrets are set; when false, report* functions are no-ops. */
export function openaiAdsEnabled(): boolean {
  return Boolean(API_KEY && PIXEL_ID);
}

/** Lowercase hex SHA-256 of a trimmed, lowercased value, as the API expects. */
export async function sha256Normalized(value: string): Promise<string> {
  const normalized = value.trim().toLowerCase();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The `data.type` shape each standard event type is defined with. */
function dataTypeFor(eventType: string): string {
  switch (eventType) {
    case "page_viewed":
    case "contents_viewed":
    case "items_added":
    case "checkout_started":
    case "order_created":
      return "contents";
    case "lead_created":
    case "registration_completed":
    case "appointment_scheduled":
      return "customer_action";
    case "subscription_created":
    case "trial_started":
      return "plan_enrollment";
    default:
      return "custom";
  }
}

export interface SignupConversion {
  /**
   * Event id, sent verbatim. Use the same id the browser pixel sent as
   * event_id so OpenAI dedupes the two reports; it also makes webhook
   * retries idempotent.
   */
  id: string;
  /** Signer's email; hashed before sending, never sent raw. */
  email?: string | null;
  /** When the conversion happened, in Unix seconds. Defaults to now. */
  occurredAtSeconds?: number | null;
  /** Page the conversion is attributed to. Defaults to the signup page. */
  sourceUrl?: string;
}

/**
 * Report a completed signup. Never throws: a failure here must not block
 * tenant provisioning, so errors are logged and swallowed.
 * Returns true when OpenAI accepted the batch.
 */
export async function reportSignupConversion(c: SignupConversion): Promise<boolean> {
  if (!openaiAdsEnabled()) {
    console.log("openai-ads: secrets not set, skipping conversion report");
    return false;
  }
  try {
    const timestampMs = c.occurredAtSeconds ? c.occurredAtSeconds * 1000 : Date.now();
    const user: Record<string, unknown> = {};
    if (c.email) user.emails_sha256 = [await sha256Normalized(c.email)];

    const event: Record<string, unknown> = {
      id: c.id,
      type: SIGNUP_EVENT,
      timestamp_ms: timestampMs,
      action_source: "web",
      source_url: c.sourceUrl || `${SITE_URL}/login`,
      data: { type: dataTypeFor(SIGNUP_EVENT) },
    };
    if (SIGNUP_EVENT === "custom") (event.data as Record<string, unknown>).custom_event_name = "signup_completed";
    if (Object.keys(user).length) event.user = user;

    const res = await fetch(`${EVENTS_URL}?pid=${encodeURIComponent(PIXEL_ID)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ validate_only: VALIDATE_ONLY, events: [event] }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`openai-ads: conversion rejected (${res.status}): ${text.slice(0, 500)}`);
      return false;
    }
    console.log(`openai-ads: ${VALIDATE_ONLY ? "validated" : "reported"} ${SIGNUP_EVENT} ${event.id}: ${text.slice(0, 200)}`);
    return true;
  } catch (err) {
    console.error("openai-ads: conversion report error:", err);
    return false;
  }
}
