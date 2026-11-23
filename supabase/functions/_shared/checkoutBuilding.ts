// supabase/functions/_shared/checkoutBuilding.ts
// The building a signup is paying for: checking what the form sent, and
// giving the same building the same reserved id every time it is submitted.
//
// No Deno and no network in this file, so tests can import it.

import { isStateCode, toStateCode } from "./usStates.ts";

export interface BuildingInput {
  name: string;
  address: { street: string; city: string; state: string; zip: string };
}

export type BuildingCheck =
  | { ok: true; building: BuildingInput }
  | { ok: false; field: "name" | "street" | "city" | "state" | "zip"; error: string };

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The step-4 fields, trimmed and checked. The address is also the billing address. */
export function checkBuilding(input: unknown): BuildingCheck {
  const b = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const a = (b.address && typeof b.address === "object" ? b.address : {}) as Record<string, unknown>;
  const name = text(b.name, 250);
  const street = text(a.street, 150);
  const city = text(a.city, 50);
  const state = toStateCode(text(a.state, 50));
  const zip = text(a.zip, 20);
  if (!name) return { ok: false, field: "name", error: "Enter the association's name." };
  if (!street) return { ok: false, field: "street", error: "Enter the building's street address." };
  if (!city) return { ok: false, field: "city", error: "Enter the city." };
  if (!isStateCode(state)) return { ok: false, field: "state", error: "Enter a US state, such as DC." };
  if (!/^\d{5}(-\d{4})?$/.test(zip)) return { ok: false, field: "zip", error: "Enter a 5-digit ZIP code." };
  return { ok: true, building: { name, address: { street, city, state, zip } } };
}

/**
 * Identifies a building within one person's signups. A retried checkout for
 * the same building yields the same key, so it reuses the same reserved
 * building id, and a key equal to one of the account's existing buildings
 * means it already owns this one.
 *
 * Street + ZIP when both are given. Without a ZIP the street alone is too
 * weak to go on (a half-filled address such as "123" matches far too much),
 * so the name is part of the key. With no street, the name alone.
 */
export function buildingKey(b: { name?: string; address?: { street?: string; zip?: string } | null }): string {
  const norm = (v: string | undefined) => (v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const street = norm(b.address?.street);
  const zip = (b.address?.zip || "").replace(/\D/g, "").slice(0, 5);
  if (street && zip) return `addr:${street}|${zip}`;
  if (street) return `addr:${street}|name:${norm(b.name)}`;
  return `name:${norm(b.name)}`;
}

/**
 * The id reserved for a building before it exists, derived from who is
 * signing up and which building it is. Two submissions of the same form, a
 * double click included, arrive at the same id, and so at the same Chargebee
 * customer, without having to find each other first.
 */
export async function reservedTenantId(userId: string, key: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`onetwo-building:${userId}:${key}`)),
  );
  const b = digest.slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4 layout, so it reads as an ordinary uuid
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Keep only the known attribution fields, as trimmed, length-capped strings. */
export function cleanAttribution(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== "object") return null;
  const limits: Record<string, number> = {
    utm_source: 100, utm_medium: 100, utm_campaign: 100, utm_term: 100, utm_content: 100,
    first_landing_url: 500,
  };
  const out: Record<string, string> = {};
  for (const [key, max] of Object.entries(limits)) {
    const v = (input as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim()) out[key] = v.trim().slice(0, max);
  }
  return Object.keys(out).length ? out : null;
}

/** The signup page on the site the visitor used, or null if origin isn't a web origin. */
export function signupPageUrl(origin: unknown): string | null {
  if (typeof origin !== "string" || !origin) return null;
  try {
    const u = new URL(origin);
    return u.protocol === "https:" || u.protocol === "http:" ? `${u.origin}/login` : null;
  } catch {
    return null;
  }
}
