export type Role = 'BOARD_MEMBER' | 'RESIDENT' | 'PROPERTY_MANAGER' | 'STAFF' | 'PLATFORM_ADMIN' | 'PM_COMPANY';

export type BoardRoleKey = 'president' | 'vice_president' | 'treasurer' | 'secretary' | 'member_at_large';

export const BOARD_ROLE_LABELS: Record<BoardRoleKey, string> = {
  president: 'President',
  vice_president: 'Vice President',
  treasurer: 'Treasurer',
  secretary: 'Secretary',
  member_at_large: 'Member at Large',
};

export function toBoardRoleKey(role: string | null | undefined): BoardRoleKey {
  if (!role) return 'member_at_large';
  const lower = role.toLowerCase();
  if (lower.includes('vice') && lower.includes('pres')) return 'vice_president';
  if (lower.includes('pres')) return 'president';
  if (lower.includes('treas')) return 'treasurer';
  if (lower.includes('sec')) return 'secretary';
  return 'member_at_large';
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  unitNumber: string;
  role: Role;
  linkedUnits: string[];
  emergencyContact: string;
  emergencyPhone: string;
  moveInDate: string;
  notifications: { email: boolean; sms: boolean };
}

export interface BuildingMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  unit: string;
  status: 'active' | 'inactive';
  joined: string;
  boardTitle: string | null;
  roleKey?: BoardRoleKey;
}

export interface BuildingInvite {
  id: string;
  email: string;
  role: Role;
  unit: string;
  sentBy: string;
  sentDate: string;
  code: string;
  status: 'pending' | 'accepted' | 'revoked';
}

export type AuthStep =
  | 'login'
  | 'signup'
  | 'building'
  | 'confirm'
  | 'demo';

export const ROLE_LABELS: Record<Role, string> = {
  BOARD_MEMBER: 'Board Member',
  RESIDENT: 'Resident',
  PROPERTY_MANAGER: 'Property Manager',
  STAFF: 'Staff',
  PLATFORM_ADMIN: 'Platform Admin',
  PM_COMPANY: 'Property Portfolio',
};

