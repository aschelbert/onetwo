/**
 * A user's building memberships.
 *
 * One account can belong to more than one building (the same person can set
 * up a second association under the same email), so every "which tenant is
 * this user in" lookup reads all of their `tenant_users` rows and picks one,
 * instead of assuming there is at most one.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface BuildingAddress {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

export interface TenantMembership {
  tenant_id: string;
  role: string;
  board_title: string | null;
  unit: string | null;
  created_at: string | null;
  tenant: { name: string | null; subdomain: string | null; address: BuildingAddress | null } | null;
  /** Subscription state, when the lookup could read it (`my_buildings`). */
  subscription_status?: string | null;
  trial_ends_at?: string | null;
}

/**
 * Every building the user belongs to, newest membership first. `null` if the lookup failed.
 *
 * Reads `my_buildings()` so the list can include each building's subscription
 * state: the database serves one building per request, so the subscriptions
 * of the *other* buildings are not readable from a table query. Falls back to
 * the tables (no subscription state) where that function is not deployed yet.
 */
export async function fetchMemberships(sb: SupabaseClient, userId: string): Promise<TenantMembership[] | null> {
  const viaRpc = await sb.rpc('my_buildings');
  if (!viaRpc.error && Array.isArray(viaRpc.data)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (viaRpc.data as any[]).map(r => ({
      tenant_id: r.tenant_id,
      role: r.role,
      board_title: r.board_title ?? null,
      unit: r.unit ?? null,
      created_at: r.created_at ?? null,
      tenant: { name: r.name ?? null, subdomain: r.subdomain ?? null, address: r.address ?? null },
      subscription_status: r.subscription_status ?? null,
      trial_ends_at: r.trial_ends_at ?? null,
    }));
  }

  const { data, error } = await sb
    .from('tenant_users')
    .select('tenant_id, role, board_title, unit, created_at, tenants(name, subdomain, address)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error || !data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(r => {
    const t = Array.isArray(r.tenants) ? r.tenants[0] : r.tenants;
    return {
      tenant_id: r.tenant_id,
      role: r.role,
      board_title: r.board_title ?? null,
      unit: r.unit ?? null,
      created_at: r.created_at ?? null,
      tenant: t ? { name: t.name ?? null, subdomain: t.subdomain ?? null, address: t.address ?? null } : null,
    };
  });
}

// ── The building this browser last chose ────────────────────────────────────
// Production buildings each have their own host, which decides the building.
// On hosts that are not a building (the root login, staging, previews,
// localhost) the last choice is what tells two buildings apart.
const ACTIVE_KEY = 'onetwo_active_tenant';
const REMEMBER_KEY = 'onetwo_remember_building';

function readLocal(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeLocal(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch { /* storage unavailable: the choice just isn't remembered */ }
}

export function getChosenTenantId(): string | null { return readLocal(ACTIVE_KEY); }

/** Record the building the user chose; `remember` skips the picker at the next login. */
export function chooseTenant(tenantId: string, remember?: boolean): void {
  writeLocal(ACTIVE_KEY, tenantId);
  if (remember !== undefined) writeLocal(REMEMBER_KEY, remember ? '1' : null);
}

function hostMatch<T extends Pick<TenantMembership, 'tenant'>>(rows: T[], hostname: string): T | undefined {
  const h = hostname.toLowerCase();
  return rows.find(r => {
    const sub = r.tenant?.subdomain?.toLowerCase();
    return !!sub && (h === sub || h.startsWith(`${sub}.`));
  });
}

const currentHost = () => (typeof window !== 'undefined' ? window.location.hostname : '');

/**
 * The membership to use here: the building whose host we are on, otherwise the
 * one this browser last chose, otherwise the most recently joined.
 * `rows` must be newest first (as `fetchMemberships` returns).
 */
export function pickMembership<T extends Pick<TenantMembership, 'tenant'> & { tenant_id?: string }>(
  rows: T[] | null | undefined,
  hostname: string = currentHost(),
  chosenTenantId: string | null = getChosenTenantId(),
): T | null {
  if (!rows || rows.length === 0) return null;
  return hostMatch(rows, hostname)
    ?? (chosenTenantId ? rows.find(r => r.tenant_id === chosenTenantId) : undefined)
    ?? rows[0];
}

/**
 * Whether to ask "Which building?": more than one building, not on a
 * building's own host, and no remembered choice that still applies.
 */
export function needsBuildingChoice(
  rows: Pick<TenantMembership, 'tenant' | 'tenant_id'>[] | null | undefined,
  hostname: string = currentHost(),
  chosenTenantId: string | null = getChosenTenantId(),
  remembered: boolean = readLocal(REMEMBER_KEY) === '1',
): boolean {
  if (!rows || rows.length < 2) return false;
  if (hostMatch(rows, hostname)) return false;
  return !(remembered && !!chosenTenantId && rows.some(r => r.tenant_id === chosenTenantId));
}

/** The user's membership for this host, or `null` if they have none. */
export async function resolveMembership(sb: SupabaseClient, userId: string): Promise<TenantMembership | null> {
  return pickMembership(await fetchMemberships(sb, userId));
}

/** Short status for a building card, e.g. "Trial, 18 days left". `null` when unknown. */
export function subscriptionLabel(
  m: Pick<TenantMembership, 'subscription_status' | 'trial_ends_at'>,
  now: Date = new Date(),
): { text: string; tone: 'ok' | 'trial' | 'bad' } | null {
  const status = m.subscription_status;
  if (!status) return null;
  if (status === 'trialing') {
    if (!m.trial_ends_at) return { text: 'Trial', tone: 'trial' };
    const days = Math.ceil((new Date(m.trial_ends_at).getTime() - now.getTime()) / 86_400_000);
    if (days <= 0) return { text: 'Trial ended', tone: 'bad' };
    return { text: `Trial, ${days} day${days === 1 ? '' : 's'} left`, tone: 'trial' };
  }
  if (status === 'active') return { text: 'Active', tone: 'ok' };
  if (status === 'past_due') return { text: 'Payment past due', tone: 'bad' };
  if (status === 'canceled' || status === 'cancelled') return { text: 'Canceled', tone: 'bad' };
  return { text: status.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()), tone: 'trial' };
}

/** One line for a building's street address, or '' when none is on file. */
export function addressLine(a: BuildingAddress | null | undefined): string {
  return (a?.street ?? '').trim();
}

const STREET_WORDS: Record<string, string> = {
  street: 'st', avenue: 'ave', boulevard: 'blvd', road: 'rd', drive: 'dr', lane: 'ln', court: 'ct',
  place: 'pl', terrace: 'ter', circle: 'cir', highway: 'hwy', parkway: 'pkwy', square: 'sq',
  north: 'n', south: 's', east: 'e', west: 'w',
  northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
};

function words(s: string | null | undefined): string[] {
  return (s ?? '').toLowerCase().replace(/[.']/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function normStreet(s: string | null | undefined): string {
  return words(s).map(w => STREET_WORDS[w] ?? w).join(' ');
}

function normName(s: string | null | undefined): string {
  return words(s).join(' ');
}

function normZip(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '').slice(0, 5);
}

/**
 * Whether a building being signed up is one the user already has.
 *
 * Same street and same ZIP is the same building whatever it is called. When a
 * ZIP is missing on either side the street alone is too weak to go on (a
 * half-filled address such as "123" matches far too much), so the name has to
 * match as well. With no street on one side, the name decides on its own.
 */
export function isSameBuilding(
  a: { name?: string | null; address?: BuildingAddress | null },
  b: { name?: string | null; address?: BuildingAddress | null },
): boolean {
  const nameA = normName(a.name);
  const sameName = !!nameA && nameA === normName(b.name);
  const streetA = normStreet(a.address?.street);
  const streetB = normStreet(b.address?.street);
  if (streetA && streetB) {
    if (streetA !== streetB) return false;
    const zipA = normZip(a.address?.zip);
    const zipB = normZip(b.address?.zip);
    return zipA && zipB ? zipA === zipB : sameName;
  }
  return sameName;
}
