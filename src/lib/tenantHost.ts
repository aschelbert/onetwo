/**
 * Where a signed-in member should land.
 *
 * In production every building lives on its own subdomain
 * (`<subdomain>.getonetwo.com`), so after login on the root host the app hops
 * to the building's host and hands the session over in the URL. That hop must
 * never leave the environment the session was minted in: `staging.getonetwo.com`,
 * Vercel preview URLs and localhost each talk to their own Supabase project,
 * and a token from one is rejected by another ("bad_jwt", "unrecognized JWT kid").
 * On those hosts the app stays put; the tenant is resolved from the user's
 * membership, not from the hostname, so nothing else depends on the hop.
 */

export const ROOT_DOMAIN = 'getonetwo.com';

/** Hosts that are an environment, not a building. */
export function isEnvironmentHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h.endsWith('.localhost') ||
    h.endsWith('.vercel.app') ||
    h === `staging.${ROOT_DOMAIN}` ||
    h.endsWith(`.staging.${ROOT_DOMAIN}`)
  );
}

/** A production building host (anything under the root domain except the app root and environments). */
export function isTenantHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h.endsWith(`.${ROOT_DOMAIN}`) && h !== `app.${ROOT_DOMAIN}` && h !== `www.${ROOT_DOMAIN}` && !isEnvironmentHost(h);
}

/**
 * The login URL on the building's own host, carrying the session, or `null`
 * when no hop is needed: already on that building's host, or on an environment
 * host that must keep its own session.
 */
export function tenantLoginUrl(
  subdomain: string | null | undefined,
  tokens: { accessToken: string; refreshToken: string },
  hostname: string = typeof window !== 'undefined' ? window.location.hostname : '',
): string | null {
  if (!subdomain) return null;
  const h = hostname.toLowerCase();
  if (isEnvironmentHost(h)) return null;
  if (h === subdomain.toLowerCase() || h.startsWith(`${subdomain.toLowerCase()}.`)) return null;
  const q = new URLSearchParams({ sb_access: tokens.accessToken, sb_refresh: tokens.refreshToken });
  return `https://${subdomain}.${ROOT_DOMAIN}/login?${q.toString()}`;
}
