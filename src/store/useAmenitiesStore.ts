import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useFinancialStore } from '@/store/useFinancialStore';
import { sendInvoiceToStripe } from '@/lib/services/invoicing';
import { useBuildingStore } from '@/store/useBuildingStore';

export interface AmenityConfig {
  id: string;
  name: string;
  reservable: boolean;
  notificationEnabled: boolean;
  icon: string;
  description: string;

  // v2: Fees
  reservationFee: number;
  depositAmount: number;
  feeCurrency: string;

  // v2: Rules & Policies
  maxDurationMinutes: number;
  maxAdvanceDays: number;
  operatingHours: { open: string; close: string } | null;
  capacity: number;
  usageRules: string;

  // v2: Approval
  requiresApproval: boolean;
}

export interface RecurringPattern {
  frequency: 'weekly' | 'biweekly' | 'monthly';
  endDate: string;
}

export interface Reservation {
  id: string;
  amenityId: string;
  amenityName: string;
  date: string;
  startTime: string;
  endTime: string;
  reservedBy: string;
  reservedByName: string;
  reservedByUnit: string;
  status: 'active' | 'cancelled' | 'pending_approval' | 'denied';
  createdAt: string;
  notes: string;

  // v2: Fees
  fee: number;
  deposit: number;
  invoiceId: string | null;
  depositInvoiceId: string | null;

  // v2: Approval
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  denialReason: string | null;

  // v2: Recurring
  recurringGroupId: string | null;
  recurringPattern: RecurringPattern | null;
}

export interface AmenityNotification {
  id: string;
  amenityId: string;
  amenityName: string;
  message: string;
  sentBy: string;
  sentByName: string;
  sentByRole: string;
  sentAt: string;
  recipients: 'all' | string[];
  readBy: string[];
}

function guessIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('community') || lower.includes('clubhouse')) return '🏠';
  if (lower.includes('fitness') || lower.includes('gym')) return '💪';
  if (lower.includes('rooftop') || lower.includes('deck') || lower.includes('terrace')) return '🌇';
  if (lower.includes('lobby')) return '🚪';
  if (lower.includes('elevator')) return '🛗';
  if (lower.includes('package') || lower.includes('mail')) return '📦';
  if (lower.includes('pool') || lower.includes('swim')) return '🏊';
  if (lower.includes('parking') || lower.includes('garage')) return '🅿️';
  if (lower.includes('garden') || lower.includes('courtyard')) return '🌿';
  if (lower.includes('laundry')) return '🧺';
  if (lower.includes('storage')) return '📦';
  if (lower.includes('bbq') || lower.includes('grill')) return '🔥';
  if (lower.includes('playground') || lower.includes('kids')) return '🛝';
  if (lower.includes('business') || lower.includes('office')) return '💼';
  if (lower.includes('theater') || lower.includes('media')) return '🎬';
  return '🏢';
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function guessDescription(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('community')) return 'Shared gathering space for residents and events';
  if (lower.includes('fitness') || lower.includes('gym')) return 'On-site fitness center with exercise equipment';
  if (lower.includes('rooftop') || lower.includes('deck')) return 'Rooftop terrace with seating and views';
  if (lower.includes('lobby')) return 'Secure building entrance with controlled access';
  if (lower.includes('elevator')) return 'Building elevator service';
  if (lower.includes('package') || lower.includes('mail')) return 'Secure package delivery and pickup area';
  if (lower.includes('pool')) return 'Community swimming pool';
  if (lower.includes('parking')) return 'Covered parking facility';
  if (lower.includes('garden')) return 'Shared garden and outdoor space';
  if (lower.includes('laundry')) return 'Shared laundry facilities';
  return 'Building amenity';
}

const v2ConfigDefaults = {
  reservationFee: 0,
  depositAmount: 0,
  feeCurrency: 'USD',
  maxDurationMinutes: 0,
  maxAdvanceDays: 0,
  operatingHours: null,
  capacity: 0,
  usageRules: '',
  requiresApproval: false,
};

const v2ReservationDefaults = {
  fee: 0,
  deposit: 0,
  invoiceId: null,
  depositInvoiceId: null,
  approvedBy: null,
  approvedByName: null,
  approvedAt: null,
  denialReason: null,
  recurringGroupId: null,
  recurringPattern: null,
};

type ConfigUpdateFields = 'reservable' | 'notificationEnabled' | 'reservationFee' | 'depositAmount' |
  'maxDurationMinutes' | 'maxAdvanceDays' | 'operatingHours' | 'capacity' | 'usageRules' | 'requiresApproval';

interface AmenitiesState {
  configs: AmenityConfig[];
  reservations: Reservation[];
  notifications: AmenityNotification[];

  initializeFromBuilding: (names: string[]) => void;
  updateConfig: (id: string, updates: Partial<Pick<AmenityConfig, ConfigUpdateFields>>) => void;
  addReservation: (r: Omit<Reservation, 'id' | 'status' | 'createdAt' | 'fee' | 'deposit' | 'invoiceId' | 'depositInvoiceId' | 'approvedBy' | 'approvedByName' | 'approvedAt' | 'denialReason' | 'recurringGroupId' | 'recurringPattern'>) => Reservation | { error: string };
  cancelReservation: (id: string) => void;
  getReservationsForAmenity: (amenityId: string, date?: string) => Reservation[];
  getReservationsForUser: (userId: string) => Reservation[];
  hasConflict: (amenityId: string, date: string, startTime: string, endTime: string) => boolean;
  sendNotification: (n: Omit<AmenityNotification, 'id' | 'readBy'>) => void;
  markNotificationRead: (notifId: string, userId: string) => void;
  getUnreadCount: (userId: string) => number;

  // v2: Approval
  approveReservation: (id: string, approverUserId: string, approverName: string) => void;
  denyReservation: (id: string, approverUserId: string, approverName: string, reason: string) => void;
  getPendingApprovals: () => Reservation[];

  // v2: Recurring
  addRecurringReservation: (
    base: Omit<Reservation, 'id' | 'status' | 'createdAt' | 'fee' | 'deposit' | 'invoiceId' | 'depositInvoiceId' | 'approvedBy' | 'approvedByName' | 'approvedAt' | 'denialReason' | 'recurringGroupId' | 'recurringPattern'>,
    pattern: RecurringPattern,
  ) => Reservation[];
  cancelRecurringGroup: (groupId: string) => void;
}

const seedConfigs: AmenityConfig[] = [
  {
    id: 'community-room', name: 'Community Room', reservable: true, notificationEnabled: false,
    icon: '🏠', description: 'Shared gathering space for residents and events',
    ...v2ConfigDefaults,
    reservationFee: 50, depositAmount: 100, maxDurationMinutes: 240,
    requiresApproval: true, capacity: 40,
    usageRules: 'No outside catering without approval. Clean-up required within 1 hour of reservation end.',
  },
  {
    id: 'fitness-center', name: 'Fitness Center', reservable: false, notificationEnabled: false,
    icon: '💪', description: 'On-site fitness center with exercise equipment',
    ...v2ConfigDefaults,
  },
  {
    id: 'rooftop-deck', name: 'Rooftop Deck', reservable: true, notificationEnabled: false,
    icon: '🌇', description: 'Rooftop terrace with seating and views',
    ...v2ConfigDefaults,
    reservationFee: 25, maxDurationMinutes: 180, maxAdvanceDays: 14, capacity: 20,
  },
  {
    id: 'secure-lobby', name: 'Secure Lobby', reservable: false, notificationEnabled: true,
    icon: '🚪', description: 'Secure building entrance with controlled access',
    ...v2ConfigDefaults,
  },
  {
    id: 'elevator-2', name: 'Elevator (2)', reservable: false, notificationEnabled: true,
    icon: '🛗', description: 'Building elevator service',
    ...v2ConfigDefaults,
  },
  {
    id: 'package-room', name: 'Package Room', reservable: false, notificationEnabled: true,
    icon: '📦', description: 'Secure package delivery and pickup area',
    ...v2ConfigDefaults,
  },
];

const seedReservations: Reservation[] = [
  {
    id: 'res1', amenityId: 'community-room', amenityName: 'Community Room',
    date: '2026-03-15', startTime: '14:00', endTime: '16:00',
    reservedBy: 'user1', reservedByName: 'John Smith', reservedByUnit: '301',
    status: 'active', createdAt: '2026-03-01T10:00:00Z', notes: 'Birthday party setup',
    ...v2ReservationDefaults, fee: 50, deposit: 100,
  },
  {
    id: 'res2', amenityId: 'rooftop-deck', amenityName: 'Rooftop Deck',
    date: '2026-03-20', startTime: '18:00', endTime: '20:00',
    reservedBy: 'user2', reservedByName: 'Sarah Johnson', reservedByUnit: '204',
    status: 'active', createdAt: '2026-03-02T14:30:00Z', notes: 'Evening gathering with friends',
    ...v2ReservationDefaults, fee: 25,
  },
  {
    id: 'res3', amenityId: 'community-room', amenityName: 'Community Room',
    date: '2026-03-22', startTime: '10:00', endTime: '14:00',
    reservedBy: 'user2', reservedByName: 'Sarah Johnson', reservedByUnit: '204',
    status: 'pending_approval', createdAt: '2026-03-07T09:00:00Z',
    notes: 'HOA social committee meeting and brunch setup',
    ...v2ReservationDefaults, fee: 50, deposit: 100,
  },
];

const seedNotifications: AmenityNotification[] = [
  {
    id: 'notif1', amenityId: 'package-room', amenityName: 'Package Room',
    message: 'Multiple packages have arrived today. Please pick up your deliveries from the package room by end of day.',
    sentBy: 'user3', sentByName: 'Robert Mitchell', sentByRole: 'BOARD_MEMBER',
    sentAt: '2026-03-05T09:00:00Z', recipients: 'all', readBy: ['user1'],
  },
  {
    id: 'notif2', amenityId: 'elevator-2', amenityName: 'Elevator (2)',
    message: 'Elevator B will be out of service for maintenance on March 12th from 9 AM to 3 PM. Please use Elevator A during this time.',
    sentBy: 'user3', sentByName: 'Robert Mitchell', sentByRole: 'BOARD_MEMBER',
    sentAt: '2026-03-04T15:00:00Z', recipients: 'all', readBy: [],
  },
];

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function generateRecurringDates(startDate: string, pattern: RecurringPattern): string[] {
  const dates: string[] = [];
  const end = new Date(pattern.endDate + 'T23:59:59');
  let current = new Date(startDate + 'T12:00:00');

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    if (pattern.frequency === 'weekly') {
      current.setDate(current.getDate() + 7);
    } else if (pattern.frequency === 'biweekly') {
      current.setDate(current.getDate() + 14);
    } else {
      current.setMonth(current.getMonth() + 1);
    }
  }
  return dates;
}

export const useAmenitiesStore = create<AmenitiesState>()(persist((set, get) => ({
  configs: seedConfigs,
  reservations: seedReservations,
  notifications: seedNotifications,

  initializeFromBuilding: (names: string[]) => {
    const existing = get().configs;
    const existingIds = new Set(existing.map(c => c.id));
    const newIds = new Set(names.map(n => slugify(n)));

    const kept = existing.filter(c => newIds.has(c.id));
    const added = names
      .filter(n => !existingIds.has(slugify(n)))
      .map(n => ({
        id: slugify(n),
        name: n,
        reservable: false,
        notificationEnabled: false,
        icon: guessIcon(n),
        description: guessDescription(n),
        ...v2ConfigDefaults,
      }));

    set({ configs: [...kept, ...added] });
  },

  updateConfig: (id, updates) => {
    set(s => ({
      configs: s.configs.map(c => c.id === id ? { ...c, ...updates } : c),
    }));
  },

  addReservation: (r) => {
    const config = get().configs.find(c => c.id === r.amenityId);

    // Rule validation
    if (config) {
      // Max duration check
      if (config.maxDurationMinutes > 0) {
        const durationMins = timeToMinutes(r.endTime) - timeToMinutes(r.startTime);
        if (durationMins > config.maxDurationMinutes) {
          return { error: `Duration exceeds maximum of ${config.maxDurationMinutes / 60} hours` };
        }
      }

      // Advance booking check
      if (config.maxAdvanceDays > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const bookDate = new Date(r.date + 'T12:00:00');
        const diffDays = Math.ceil((bookDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > config.maxAdvanceDays) {
          return { error: `Cannot book more than ${config.maxAdvanceDays} days in advance` };
        }
      }

      // Operating hours check
      if (config.operatingHours) {
        const startMins = timeToMinutes(r.startTime);
        const endMins = timeToMinutes(r.endTime);
        const openMins = timeToMinutes(config.operatingHours.open);
        const closeMins = timeToMinutes(config.operatingHours.close);
        if (startMins < openMins || endMins > closeMins) {
          return { error: `Reservation must be within operating hours: ${config.operatingHours.open} - ${config.operatingHours.close}` };
        }
      }
    }

    // Conflict check
    if (get().hasConflict(r.amenityId, r.date, r.startTime, r.endTime)) {
      return { error: 'Time conflict — this slot overlaps with an existing reservation' };
    }

    const needsApproval = config?.requiresApproval ?? false;
    const fee = config?.reservationFee ?? 0;
    const deposit = config?.depositAmount ?? 0;

    let invoiceId: string | null = null;
    let depositInvoiceId: string | null = null;

    // If no approval needed and has fees, create invoices immediately
    if (!needsApproval && fee > 0 && r.reservedByUnit) {
      const finStore = useFinancialStore.getState();
      const inv = finStore.createUnitInvoice(
        r.reservedByUnit, 'amenity_fee', fee,
        `Amenity: ${r.amenityName} reservation ${r.date}`,
      );
      invoiceId = inv.id;
      const unit = finStore.units.find(u => u.number === r.reservedByUnit);
      if (unit && finStore.tenantId) {
        sendInvoiceToStripe(inv, unit, useBuildingStore.getState().name, finStore.stripeConnectId, finStore.tenantId);
      }
    }
    if (!needsApproval && deposit > 0 && r.reservedByUnit) {
      const finStore = useFinancialStore.getState();
      const depInv = finStore.createUnitInvoice(
        r.reservedByUnit, 'amenity_fee', deposit,
        `Amenity deposit: ${r.amenityName}`,
      );
      depositInvoiceId = depInv.id;
      const unit = finStore.units.find(u => u.number === r.reservedByUnit);
      if (unit && finStore.tenantId) {
        sendInvoiceToStripe(depInv, unit, useBuildingStore.getState().name, finStore.stripeConnectId, finStore.tenantId);
      }
    }

    const reservation: Reservation = {
      ...r,
      id: 'res' + Date.now(),
      status: needsApproval ? 'pending_approval' : 'active',
      createdAt: new Date().toISOString(),
      fee,
      deposit,
      invoiceId,
      depositInvoiceId,
      approvedBy: null,
      approvedByName: null,
      approvedAt: null,
      denialReason: null,
      recurringGroupId: null,
      recurringPattern: null,
    };
    set(s => ({ reservations: [...s.reservations, reservation] }));
    return reservation;
  },

  cancelReservation: (id) => {
    set(s => ({
      reservations: s.reservations.map(r => r.id === id ? { ...r, status: 'cancelled' as const } : r),
    }));
  },

  getReservationsForAmenity: (amenityId, date?) => {
    return get().reservations.filter(r =>
      r.amenityId === amenityId &&
      (r.status === 'active' || r.status === 'pending_approval') &&
      (!date || r.date === date)
    );
  },

  getReservationsForUser: (userId) => {
    return get().reservations.filter(r =>
      r.reservedBy === userId && r.status !== 'cancelled'
    );
  },

  hasConflict: (amenityId, date, startTime, endTime) => {
    return get().reservations.some(r =>
      r.amenityId === amenityId &&
      r.date === date &&
      (r.status === 'active' || r.status === 'pending_approval') &&
      r.startTime < endTime &&
      r.endTime > startTime
    );
  },

  sendNotification: (n) => {
    const notification: AmenityNotification = { ...n, id: 'notif' + Date.now(), readBy: [] };
    set(s => ({ notifications: [notification, ...s.notifications] }));
  },

  markNotificationRead: (notifId, userId) => {
    set(s => ({
      notifications: s.notifications.map(n =>
        n.id === notifId && !n.readBy.includes(userId)
          ? { ...n, readBy: [...n.readBy, userId] }
          : n
      ),
    }));
  },

  getUnreadCount: (userId) => {
    return get().notifications.filter(n => !n.readBy.includes(userId)).length;
  },

  // v2: Approval workflow
  approveReservation: (id, approverUserId, approverName) => {
    const res = get().reservations.find(r => r.id === id);
    if (!res || res.status !== 'pending_approval') return;

    let invoiceId = res.invoiceId;
    let depositInvoiceId = res.depositInvoiceId;

    // Create invoices on approval if fees exist
    if (res.fee > 0 && !invoiceId && res.reservedByUnit) {
      const finStore = useFinancialStore.getState();
      const inv = finStore.createUnitInvoice(
        res.reservedByUnit, 'amenity_fee', res.fee,
        `Amenity: ${res.amenityName} reservation ${res.date}`,
      );
      invoiceId = inv.id;
      const unit = finStore.units.find(u => u.number === res.reservedByUnit);
      if (unit && finStore.tenantId) {
        sendInvoiceToStripe(inv, unit, useBuildingStore.getState().name, finStore.stripeConnectId, finStore.tenantId);
      }
    }
    if (res.deposit > 0 && !depositInvoiceId && res.reservedByUnit) {
      const finStore = useFinancialStore.getState();
      const depInv = finStore.createUnitInvoice(
        res.reservedByUnit, 'amenity_fee', res.deposit,
        `Amenity deposit: ${res.amenityName}`,
      );
      depositInvoiceId = depInv.id;
      const unit = finStore.units.find(u => u.number === res.reservedByUnit);
      if (unit && finStore.tenantId) {
        sendInvoiceToStripe(depInv, unit, useBuildingStore.getState().name, finStore.stripeConnectId, finStore.tenantId);
      }
    }

    set(s => ({
      reservations: s.reservations.map(r => r.id === id ? {
        ...r,
        status: 'active' as const,
        approvedBy: approverUserId,
        approvedByName: approverName,
        approvedAt: new Date().toISOString(),
        invoiceId,
        depositInvoiceId,
      } : r),
    }));
  },

  denyReservation: (id, approverUserId, approverName, reason) => {
    set(s => ({
      reservations: s.reservations.map(r => r.id === id ? {
        ...r,
        status: 'denied' as const,
        approvedBy: approverUserId,
        approvedByName: approverName,
        approvedAt: new Date().toISOString(),
        denialReason: reason,
      } : r),
    }));
  },

  getPendingApprovals: () => {
    return get().reservations.filter(r => r.status === 'pending_approval');
  },

  // v2: Recurring reservations
  addRecurringReservation: (base, pattern) => {
    const groupId = 'rgrp' + Date.now();
    const dates = generateRecurringDates(base.date, pattern);
    const created: Reservation[] = [];

    for (const date of dates) {
      if (get().hasConflict(base.amenityId, date, base.startTime, base.endTime)) continue;

      const config = get().configs.find(c => c.id === base.amenityId);
      const needsApproval = config?.requiresApproval ?? false;
      const fee = config?.reservationFee ?? 0;
      const deposit = config?.depositAmount ?? 0;

      const reservation: Reservation = {
        ...base,
        id: 'res' + Date.now() + Math.random().toString(36).slice(2, 6),
        date,
        status: needsApproval ? 'pending_approval' : 'active',
        createdAt: new Date().toISOString(),
        fee,
        deposit,
        invoiceId: null,
        depositInvoiceId: null,
        approvedBy: null,
        approvedByName: null,
        approvedAt: null,
        denialReason: null,
        recurringGroupId: groupId,
        recurringPattern: pattern,
      };

      // Create invoices for non-approval-required reservations
      if (!needsApproval && fee > 0 && base.reservedByUnit) {
        const finStore = useFinancialStore.getState();
        const inv = finStore.createUnitInvoice(
          base.reservedByUnit, 'amenity_fee', fee,
          `Amenity: ${base.amenityName} reservation ${date}`,
        );
        reservation.invoiceId = inv.id;
        const unit = finStore.units.find(u => u.number === base.reservedByUnit);
        if (unit && finStore.tenantId) {
          sendInvoiceToStripe(inv, unit, useBuildingStore.getState().name, finStore.stripeConnectId, finStore.tenantId);
        }
      }
      if (!needsApproval && deposit > 0 && base.reservedByUnit) {
        const finStore = useFinancialStore.getState();
        const depInv = finStore.createUnitInvoice(
          base.reservedByUnit, 'amenity_fee', deposit,
          `Amenity deposit: ${base.amenityName}`,
        );
        reservation.depositInvoiceId = depInv.id;
        const unit = finStore.units.find(u => u.number === base.reservedByUnit);
        if (unit && finStore.tenantId) {
          sendInvoiceToStripe(depInv, unit, useBuildingStore.getState().name, finStore.stripeConnectId, finStore.tenantId);
        }
      }

      created.push(reservation);
      set(s => ({ reservations: [...s.reservations, reservation] }));
    }

    return created;
  },

  cancelRecurringGroup: (groupId) => {
    const today = new Date().toISOString().split('T')[0];
    set(s => ({
      reservations: s.reservations.map(r =>
        r.recurringGroupId === groupId && r.date >= today && r.status !== 'cancelled'
          ? { ...r, status: 'cancelled' as const }
          : r
      ),
    }));
  },
}), {
  name: 'onetwo-amenities',
  version: 2,
  merge: (persisted: any, current: any) => ({
    ...current,
    ...(persisted || {}),
    configs: persisted?.configs?.length ? persisted.configs : current.configs,
    reservations: persisted?.reservations?.length ? persisted.reservations : current.reservations,
  }),
}));
