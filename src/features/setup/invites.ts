/**
 * Invites on the setup page: who someone is invited as (owner or resident of
 * a unit, a board seat, the manager, staff), reading a pasted list, and what
 * the send-invite function is sent for each person.
 */
import type { InviteAccess, SetupInvite } from './useSetupStore';

export const ACCESS_OPTIONS: { id: InviteAccess; label: string; unit: boolean }[] = [
  { id: 'owner', label: 'Owner', unit: true },
  { id: 'resident', label: 'Resident or tenant', unit: true },
  { id: 'board', label: 'Board member', unit: true },
  { id: 'property_manager', label: 'Property manager', unit: false },
  { id: 'staff', label: 'Staff', unit: false },
];

/** Board seats; the key is what send-invite records (role_key), Director has none. */
export const SEATS: { key: string; label: string }[] = [
  { key: 'president', label: 'President' },
  { key: 'vice_president', label: 'Vice President' },
  { key: 'treasurer', label: 'Treasurer' },
  { key: 'secretary', label: 'Secretary' },
  { key: 'member_at_large', label: 'Member at Large' },
  { key: 'director', label: 'Director' },
];

export const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function accessLabel(i: Pick<SetupInvite, 'access' | 'seat'>): string {
  if (i.access === 'board') return SEATS.find(s => s.key === i.seat)?.label ?? 'Board member';
  return ACCESS_OPTIONS.find(a => a.id === i.access)?.label ?? 'Owner';
}

/** What send-invite takes for one person. */
export function invitePayload(i: Pick<SetupInvite, 'email' | 'access' | 'seat' | 'unit'>): { email: string; role: string; unit?: string | null; roleKey?: string } {
  const role = i.access === 'board' ? 'board_member' : i.access === 'property_manager' ? 'property_manager' : i.access === 'staff' ? 'staff' : 'resident';
  return {
    email: i.email.trim().toLowerCase(),
    role,
    ...(i.unit ? { unit: i.unit } : {}),
    ...(i.access === 'board' && i.seat && i.seat !== 'director' ? { roleKey: i.seat } : {}),
  };
}

/** The role and seat a few words describe ("treasurer", "PM", "tenant"); owner when nothing matches. */
export function readRole(words: string): { access: InviteAccess; seat: string | null } {
  const w = words.toLowerCase();
  if (/vice[\s-]*pres/.test(w)) return { access: 'board', seat: 'vice_president' };
  if (/\bpres(ident)?\b/.test(w)) return { access: 'board', seat: 'president' };
  if (/treasurer/.test(w)) return { access: 'board', seat: 'treasurer' };
  if (/secretary/.test(w)) return { access: 'board', seat: 'secretary' };
  if (/at[\s-]*large/.test(w)) return { access: 'board', seat: 'member_at_large' };
  if (/\b(director|board|trustee)\b/.test(w)) return { access: 'board', seat: 'director' };
  if (/\b(property manager|manager|management|pm)\b/.test(w)) return { access: 'property_manager', seat: null };
  if (/\b(staff|super(intendent)?|porter|concierge|maintenance|janitor|custodian)\b/.test(w)) return { access: 'staff', seat: null };
  if (/\b(tenant|renter|resident|occupant)\b/.test(w)) return { access: 'resident', seat: null };
  return { access: 'owner', seat: null };
}

/**
 * Read a pasted list, one person per line, in any order: an email, words for
 * the role, and a unit ("ana@x.com, treasurer, 4B" or "4B  Ana Rivera  ana@x.com").
 * A unit is recognised when it matches one of the building's units, or follows
 * the word "unit".
 */
export function parseInviteLines(text: string, units: string[]): { invites: Omit<SetupInvite, 'id'>[]; skipped: string[] } {
  const known = new Map(units.map(u => [u.toLowerCase().replace(/\s+/g, ''), u]));
  const invites: Omit<SetupInvite, 'id'>[] = [];
  const skipped: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const email = /[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]+/.exec(line)?.[0];
    if (!email || !EMAIL_RE.test(email)) { skipped.push(line); continue; }
    const rest = line.replace(email, ' ');
    const tokens = rest.split(/[\s,;\t|]+/).filter(Boolean);
    let unit: string | null = null;
    const after = /\bunit\s*#?\s*([A-Za-z0-9-]+)/i.exec(rest);
    if (after) unit = known.get(after[1].toLowerCase()) ?? after[1].toUpperCase();
    else for (const t of tokens) { const k = known.get(t.toLowerCase().replace(/^#/, '')); if (k) { unit = k; break; } }
    const { access, seat } = readRole(rest);
    invites.push({ email: email.toLowerCase(), access, seat, unit });
  }
  return { invites, skipped };
}
