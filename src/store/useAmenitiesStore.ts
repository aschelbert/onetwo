import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AmenityConfig {
  id: string;
  name: string;
  reservable: boolean;
  notificationEnabled: boolean;
  icon: string;
  description: string;
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
  status: 'active' | 'cancelled';
  createdAt: string;
  notes: string;
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

interface AmenitiesState {
  configs: AmenityConfig[];
  reservations: Reservation[];
  notifications: AmenityNotification[];

  initializeFromBuilding: (names: string[]) => void;
  updateConfig: (id: string, updates: Partial<Pick<AmenityConfig, 'reservable' | 'notificationEnabled'>>) => void;
  addReservation: (r: Omit<Reservation, 'id' | 'status' | 'createdAt'>) => Reservation | null;
  cancelReservation: (id: string) => void;
  getReservationsForAmenity: (amenityId: string, date?: string) => Reservation[];
  getReservationsForUser: (userId: string) => Reservation[];
  hasConflict: (amenityId: string, date: string, startTime: string, endTime: string) => boolean;
  sendNotification: (n: Omit<AmenityNotification, 'id' | 'readBy'>) => void;
  markNotificationRead: (notifId: string, userId: string) => void;
  getUnreadCount: (userId: string) => number;
}

const seedConfigs: AmenityConfig[] = [
  { id: 'community-room', name: 'Community Room', reservable: true, notificationEnabled: false, icon: '🏠', description: 'Shared gathering space for residents and events' },
  { id: 'fitness-center', name: 'Fitness Center', reservable: false, notificationEnabled: false, icon: '💪', description: 'On-site fitness center with exercise equipment' },
  { id: 'rooftop-deck', name: 'Rooftop Deck', reservable: true, notificationEnabled: false, icon: '🌇', description: 'Rooftop terrace with seating and views' },
  { id: 'secure-lobby', name: 'Secure Lobby', reservable: false, notificationEnabled: true, icon: '🚪', description: 'Secure building entrance with controlled access' },
  { id: 'elevator-2', name: 'Elevator (2)', reservable: false, notificationEnabled: true, icon: '🛗', description: 'Building elevator service' },
  { id: 'package-room', name: 'Package Room', reservable: false, notificationEnabled: true, icon: '📦', description: 'Secure package delivery and pickup area' },
];

const seedReservations: Reservation[] = [
  {
    id: 'res1', amenityId: 'community-room', amenityName: 'Community Room',
    date: '2026-03-15', startTime: '14:00', endTime: '16:00',
    reservedBy: 'user1', reservedByName: 'John Smith', reservedByUnit: '301',
    status: 'active', createdAt: '2026-03-01T10:00:00Z', notes: 'Birthday party setup',
  },
  {
    id: 'res2', amenityId: 'rooftop-deck', amenityName: 'Rooftop Deck',
    date: '2026-03-20', startTime: '18:00', endTime: '20:00',
    reservedBy: 'user2', reservedByName: 'Sarah Johnson', reservedByUnit: '204',
    status: 'active', createdAt: '2026-03-02T14:30:00Z', notes: 'Evening gathering with friends',
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

export const useAmenitiesStore = create<AmenitiesState>()(persist((set, get) => ({
  configs: seedConfigs,
  reservations: seedReservations,
  notifications: seedNotifications,

  initializeFromBuilding: (names: string[]) => {
    const existing = get().configs;
    const existingIds = new Set(existing.map(c => c.id));
    const newIds = new Set(names.map(n => slugify(n)));

    // Keep existing configs that still exist in building amenities
    const kept = existing.filter(c => newIds.has(c.id));
    // Add new amenities not yet in configs
    const added = names
      .filter(n => !existingIds.has(slugify(n)))
      .map(n => ({
        id: slugify(n),
        name: n,
        reservable: false,
        notificationEnabled: false,
        icon: guessIcon(n),
        description: guessDescription(n),
      }));

    set({ configs: [...kept, ...added] });
  },

  updateConfig: (id, updates) => {
    set(s => ({
      configs: s.configs.map(c => c.id === id ? { ...c, ...updates } : c),
    }));
  },

  addReservation: (r) => {
    if (get().hasConflict(r.amenityId, r.date, r.startTime, r.endTime)) return null;
    const reservation: Reservation = {
      ...r,
      id: 'res' + Date.now(),
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    set(s => ({ reservations: [...s.reservations, reservation] }));
    return reservation;
  },

  cancelReservation: (id) => {
    set(s => ({
      reservations: s.reservations.map(r => r.id === id ? { ...r, status: 'cancelled' } : r),
    }));
  },

  getReservationsForAmenity: (amenityId, date?) => {
    return get().reservations.filter(r =>
      r.amenityId === amenityId && r.status === 'active' && (!date || r.date === date)
    );
  },

  getReservationsForUser: (userId) => {
    return get().reservations.filter(r => r.reservedBy === userId && r.status === 'active');
  },

  hasConflict: (amenityId, date, startTime, endTime) => {
    return get().reservations.some(r =>
      r.amenityId === amenityId &&
      r.date === date &&
      r.status === 'active' &&
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
}), { name: 'onetwo-amenities' }));
