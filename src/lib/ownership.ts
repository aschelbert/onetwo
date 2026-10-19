// Ownership and permission helpers for the account-owner model.
// Runs client-side to determine UI capabilities.

import type { BoardRoleKey } from '@/types/auth';

export interface MembershipInfo {
  role: string;
  roleKey: BoardRoleKey | null;
  isAccountOwner: boolean;
}

/** Is this user the account owner? */
export function isOwner(me: MembershipInfo | null | undefined): boolean {
  return !!me?.isAccountOwner;
}

/** Can this user perform setup actions (owner or board member)? */
export function canSetup(me: MembershipInfo | null | undefined): boolean {
  if (!me) return false;
  return me.isAccountOwner || me.role === 'board_member' || me.role === 'BOARD_MEMBER';
}

/** Can this user govern (make governance changes like voting, bylaws)? */
export function canGovern(me: MembershipInfo | null | undefined): boolean {
  if (!me) return false;
  return me.role === 'board_member' || me.role === 'BOARD_MEMBER';
}

/** Pick the next owner from a list of members (president → treasurer → earliest board member). */
export function nextOwner(members: Array<{
  userId: string;
  role: string;
  roleKey: BoardRoleKey | null;
  joinedAt: string;
  isAccountOwner: boolean;
}>): string | null {
  const boardMembers = members.filter(
    m => (m.role === 'board_member' || m.role === 'BOARD_MEMBER') && !m.isAccountOwner
  );

  // President first
  const president = boardMembers.find(m => m.roleKey === 'president');
  if (president) return president.userId;

  // Treasurer second
  const treasurer = boardMembers.find(m => m.roleKey === 'treasurer');
  if (treasurer) return treasurer.userId;

  // Earliest joined board member
  const sorted = [...boardMembers].sort(
    (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
  );
  return sorted[0]?.userId ?? null;
}
