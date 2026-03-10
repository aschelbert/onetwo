import { describe, it, expect, beforeEach } from 'vitest';
import { useAmenitiesStore } from '@/store/useAmenitiesStore';

// Also need to mock the invoicing service and building store since amenities store imports them
vi.mock('@/lib/services/invoicing', () => ({
  sendInvoiceToStripe: () => Promise.resolve(),
}));

vi.mock('@/store/useBuildingStore', () => ({
  useBuildingStore: { getState: () => ({ name: 'Test Building' }) },
}));

beforeEach(() => {
  useAmenitiesStore.setState({
    reservations: [
      {
        id: 'res-existing',
        amenityId: 'community-room',
        amenityName: 'Community Room',
        date: '2026-03-15',
        startTime: '14:00',
        endTime: '16:00',
        reservedBy: 'user1',
        reservedByName: 'Test User',
        reservedByUnit: '101',
        status: 'active',
        createdAt: '2026-03-01T10:00:00Z',
        notes: '',
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
      },
    ],
  });
});

describe('hasConflict', () => {
  it('overlapping times: existing 14:00-16:00, new 15:00-17:00 → conflict', () => {
    const result = useAmenitiesStore.getState().hasConflict(
      'community-room', '2026-03-15', '15:00', '17:00',
    );
    expect(result).toBe(true);
  });

  it('BUG #5: unpadded times — string comparison "9:00" < "16:00" is FALSE', () => {
    // With string comparison: '9:00' < '16:00' evaluates to false ('9' > '1')
    // so hasConflict would return false even though 9:00-10:00 doesn't overlap 14:00-16:00
    // In this case the result happens to be correct (no overlap), but the mechanism is wrong.
    //
    // The real bug manifests when an existing reservation uses unpadded times.
    // Set up: existing reservation 9:00-16:00 (unpadded start)
    useAmenitiesStore.setState({
      reservations: [
        {
          id: 'res-unpadded',
          amenityId: 'community-room',
          amenityName: 'Community Room',
          date: '2026-03-15',
          startTime: '9:00',   // unpadded — string '9:00'
          endTime: '16:00',
          reservedBy: 'user1',
          reservedByName: 'Test User',
          reservedByUnit: '101',
          status: 'active',
          createdAt: '2026-03-01T10:00:00Z',
          notes: '',
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
        },
      ],
    });

    // New reservation 10:00-12:00 should conflict (10:00 is between 9:00 and 16:00)
    // But with string comparison: '9:00' < '12:00' is FALSE ('9' > '1')
    // so r.endTime > startTime evaluates incorrectly
    const result = useAmenitiesStore.getState().hasConflict(
      'community-room', '2026-03-15', '10:00', '12:00',
    );
    // This SHOULD be true (there IS a conflict), but the bug causes it to be false
    // because '9:00' (endTime) is NOT > '10:00' (startTime) in string comparison
    // since '9' > '1' makes the whole string comparison of '9:00' > '10:00' true... wait.
    // Actually: '9:00' > '10:00' is TRUE in string comparison because '9' > '1'.
    // And '16:00' > '10:00' is TRUE because '1' === '1', '6' > '0'.
    // So r.startTime ('9:00') < endTime ('12:00')?  '9:00' < '12:00' is FALSE because '9' > '1'.
    // This means the overlap check fails: the condition r.startTime < endTime is false.
    // So the bug IS that string comparison of '9:00' < '12:00' returns false.
    expect(result).toBe(false); // BUG: should be true
  });
});
