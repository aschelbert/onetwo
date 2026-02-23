import { create } from 'zustand';
import type { User, Role, AuthStep, BuildingMember, BuildingInvite } from '@/types/auth';

interface AuthState {
  isAuthenticated: boolean;
  authStep: AuthStep;
  authJoinRole: Role;
  currentUser: User;
  currentRole: Role;
  buildingMembers: BuildingMember[];
  buildingInvites: BuildingInvite[];

  // Actions
  setAuthStep: (step: AuthStep) => void;
  setAuthJoinRole: (role: Role) => void;
  switchRole: (role: Role) => void;
  login: (member: BuildingMember) => void;
  skipToDemo: () => void;
  signOut: () => void;
  updateProfile: (updates: Partial<User>) => void;
  addMember: (member: BuildingMember) => void;
  removeMember: (id: string) => void;
  updateMemberRole: (id: string, role: Role) => void;
  addInvite: (invite: BuildingInvite) => void;
  revokeInvite: (id: string) => void;
  inviteMember: (email: string, role: Role, unit?: string) => void;
  generateInviteCode: (role: Role) => string;
}

const defaultUser: User = {
  id: 'user1',
  name: 'John Smith',
  email: 'john@example.com',
  phone: '202-555-0301',
  unitNumber: '301',
  role: 'BOARD_MEMBER',
  linkedUnits: ['301'],
  emergencyContact: '',
  emergencyPhone: '',
  moveInDate: '2017-04-01',
  notifications: { email: true, sms: false },
};

const seedMembers: BuildingMember[] = [
  { id: 'user0', name: 'Alex Rivera', email: 'admin@getonetwo.com', phone: '202-555-0000', role: 'PLATFORM_ADMIN', unit: '', status: 'active', joined: '2024-11-01', boardTitle: null },
  { id: 'user0b', name: 'Alyssa Schelbert', email: 'alyssa@getonetwo.com', phone: '202-555-0001', role: 'PLATFORM_ADMIN', unit: '', status: 'active', joined: '2024-10-01', boardTitle: null },
  { id: 'user-test1', name: 'Test User', email: 'testuser1@test.com', phone: '202-555-9999', role: 'BOARD_MEMBER', unit: '301', status: 'active', joined: '2024-10-01', boardTitle: 'President' },
  { id: 'user1', name: 'John Smith', email: 'john@example.com', phone: '202-555-0301', role: 'BOARD_MEMBER', unit: '301', status: 'active', joined: '2017-04-01', boardTitle: 'Treasurer' },
  { id: 'user2', name: 'Sarah Johnson', email: 'sarah@example.com', phone: '202-555-0204', role: 'RESIDENT', unit: '204', status: 'active', joined: '2019-08-15', boardTitle: null },
  { id: 'user3', name: 'Robert Mitchell', email: 'robert@example.com', phone: '202-555-0401', role: 'BOARD_MEMBER', unit: '401', status: 'active', joined: '2015-03-01', boardTitle: 'President' },
  { id: 'user4', name: 'Jennifer Adams', email: 'jennifer@example.com', phone: '202-555-0202', role: 'BOARD_MEMBER', unit: '202', status: 'active', joined: '2018-11-10', boardTitle: 'Vice President' },
  { id: 'user5', name: 'David Chen', email: 'david@example.com', phone: '202-555-0102', role: 'BOARD_MEMBER', unit: '102', status: 'active', joined: '2020-06-01', boardTitle: 'Secretary' },
  { id: 'user6', name: 'Maria Garcia', email: 'maria@example.com', phone: '202-555-0403', role: 'RESIDENT', unit: '403', status: 'active', joined: '2021-02-15', boardTitle: null },
  { id: 'user7', name: 'Lisa Park', email: 'lisa@example.com', phone: '202-555-0502', role: 'RESIDENT', unit: '502', status: 'active', joined: '2022-09-01', boardTitle: null },
];

const seedInvites: BuildingInvite[] = [
  { id: 'inv1', email: 'thomas@example.com', role: 'BOARD_MEMBER', unit: '303', sentBy: 'John Smith', sentDate: '2026-02-15', code: 'SA-BRD-7X4K', status: 'pending' },
  { id: 'inv2', email: 'kevin@example.com', role: 'RESIDENT', unit: '407', sentBy: 'Robert Mitchell', sentDate: '2026-02-18', code: 'SA-RES-9M2P', status: 'pending' },
];

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  authStep: 'welcome',
  authJoinRole: 'RESIDENT',
  currentUser: defaultUser,
  currentRole: 'BOARD_MEMBER',
  buildingMembers: seedMembers,
  buildingInvites: seedInvites,

  setAuthStep: (step) => set({ authStep: step }),
  setAuthJoinRole: (role) => set({ authJoinRole: role }),

  switchRole: (role) =>
    set((state) => ({
      currentRole: role,
      currentUser: { ...state.currentUser, role },
    })),

  login: (member) =>
    set({
      isAuthenticated: true,
      currentUser: {
        ...defaultUser,
        id: member.id,
        name: member.name,
        email: member.email,
        phone: member.phone,
        role: member.role,
        unitNumber: member.unit,
        linkedUnits: member.unit ? [member.unit] : [],
      },
      currentRole: member.role,
    }),

  skipToDemo: () =>
    set({
      isAuthenticated: true,
      currentUser: defaultUser,
      currentRole: 'BOARD_MEMBER',
    }),

  signOut: () =>
    set({
      isAuthenticated: false,
      authStep: 'welcome',
      currentUser: defaultUser,
      currentRole: 'BOARD_MEMBER',
    }),

  updateProfile: (updates) =>
    set((state) => ({
      currentUser: { ...state.currentUser, ...updates },
    })),

  addMember: (member) =>
    set((state) => ({
      buildingMembers: [...state.buildingMembers, member],
    })),

  removeMember: (id) =>
    set((state) => ({
      buildingMembers: state.buildingMembers.filter((m) => m.id !== id),
    })),

  updateMemberRole: (id, role) =>
    set((state) => ({
      buildingMembers: state.buildingMembers.map((m) =>
        m.id === id ? { ...m, role } : m
      ),
    })),

  addInvite: (invite) =>
    set((state) => ({
      buildingInvites: [...state.buildingInvites, invite],
    })),

  revokeInvite: (id) =>
    set((state) => ({
      buildingInvites: state.buildingInvites.filter((i) => i.id !== id),
    })),

  inviteMember: (email, role, unit) => {
    const code = get().generateInviteCode(role);
    const invite: BuildingInvite = {
      id: `inv-${Date.now()}`,
      email,
      role,
      unit: unit || '',
      sentBy: get().currentUser.name,
      sentDate: new Date().toISOString().split('T')[0],
      code,
      status: 'pending',
    };
    set((state) => ({
      buildingInvites: [...state.buildingInvites, invite],
    }));
  },

  generateInviteCode: (role) => {
    const prefix = role === 'BOARD_MEMBER' ? 'BRD' : role === 'PROPERTY_MANAGER' ? 'MGR' : 'RES';
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return `SA-${prefix}-${code}`;
  },
}));

