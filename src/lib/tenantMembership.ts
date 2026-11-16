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
}

/** Every building the user belongs to, newest membership first. `null` if the lookup failed. */
export async function fetchMemberships(sb: SupabaseClient, userId: string): Promise<TenantMembership[] | null> {
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

/**
 * The membership to use here: the building whose host we are on, otherwise the
 * most recently joined one. `rows` must be newest first (as `fetchMemberships` returns).
 */
export function pickMembership<T extends Pick<TenantMembership, 'tenant'>>(
  rows: T[] | null | undefined,
  hostname: string = typeof window !== 'undefined' ? window.location.hostname : '',
): T | null {
  if (!rows || rows.length === 0) return null;
  const h = hostname.toLowerCase();
  const onHost = rows.find(r => {
    const sub = r.tenant?.subdomain?.toLowerCase();
    return !!sub && (h === sub || h.startsWith(`${sub}.`));
  });
  return onHost ?? rows[0];
}

/** The user's membership for this host, or `null` if they have none. */
export async function resolveMembership(sb: SupabaseClient, userId: string): Promise<TenantMembership | null> {
  return pickMembership(await fetchMemberships(sb, userId));
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
 * The street address decides: the same street (and ZIP, when both are known)
 * is the same building whatever it is called. Only when one side has no street
 * on file does the name decide.
 */
export function isSameBuilding(
  a: { name?: string | null; address?: BuildingAddress | null },
  b: { name?: string | null; address?: BuildingAddress | null },
): boolean {
  const streetA = normStreet(a.address?.street);
  const streetB = normStreet(b.address?.street);
  if (streetA && streetB) {
    if (streetA !== streetB) return false;
    const zipA = normZip(a.address?.zip);
    const zipB = normZip(b.address?.zip);
    return !zipA || !zipB || zipA === zipB;
  }
  const nameA = normName(a.name);
  return !!nameA && nameA === normName(b.name);
}
