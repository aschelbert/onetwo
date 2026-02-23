export type Role = 'BOARD_MEMBER' | 'RESIDENT' | 'PROPERTY_MANAGER' | 'PLATFORM_ADMIN';

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
  | 'welcome'
  | 'login'
  | 'join-role'
  | 'join-invite'
  | 'join-create'
  | 'board-subscribe'
  | 'board-building'
  | 'board-profile'
  | 'board-invite';

export const ROLE_LABELS: Record<Role, string> = {
  BOARD_MEMBER: 'Board Member',
  RESIDENT: 'Resident',
  PROPERTY_MANAGER: 'Property Manager',
  PLATFORM_ADMIN: 'Platform Admin',
};

