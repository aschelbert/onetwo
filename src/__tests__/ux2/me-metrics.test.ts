import { describe, expect, it } from 'vitest';
import { dimensionLines, lowestDimension, receiptRows, recentReceipts, resalePacket, unitSummaries, type MeSnapshot } from '@/ux2/me/metrics';
import { computeScorecard } from '@/ux2/score/stewardship';

const unit = (number: string, over: Partial<MeSnapshot['units'][number]> = {}) => ({
  number, owner: 'Sarah Park', email: '', phone: '', monthlyFee: 475, votingPct: 4.3, status: 'ACTIVE' as const, balance: 0, moveIn: '2019-03-01', sqft: 1180, bedrooms: 2, parking: 'P-12',
  payments: [], lateFees: [], specialAssessments: [], ...over,
});

const snap: MeSnapshot = {
  today: '2026-11-06',
  viewer: { id: 'u1', name: 'Sarah Park', email: 's@x', role: 'BOARD_MEMBER', linkedUnits: ['4B', '6A'], officerTitle: 'Treasurer', isBoard: true },
  units: [
    unit('4B', { balance: 25, payments: [{ date: '2026-11-01', amount: 475, method: 'card', note: '' }, { date: '2026-10-05', amount: 475, method: 'card', note: '' }, { date: '2025-12-01', amount: 475, method: 'card', note: '' }], lateFees: [{ date: '2026-02-06', amount: 25, reason: 'late', waived: true }] }),
    unit('6A', { balance: 0, payments: [{ date: '2026-11-01', amount: 475, method: 'ach', note: 'Dues' }], specialAssessments: [{ id: 'sa1', date: '2026-01-15', amount: 500, reason: 'Roof', paid: false, paidDate: null }] }),
    unit('9Z'),
  ],
  unitInvoices: [
    { id: 'i1', unitNumber: '4B', type: 'amenity_fee', description: 'Community room cleaning fee', amount: 25, status: 'sent', createdDate: '2026-10-30', dueDate: '2026-11-14', paidDate: null, paidAmount: null, paymentMethod: null, stripePaymentLink: null, glEntryId: null, paymentGlEntryId: null },
    { id: 'i2', unitNumber: '4B', type: 'monthly', description: 'Dues · September', amount: 475, status: 'paid', createdDate: '2026-09-01', dueDate: '2026-09-01', paidDate: '2026-09-01', paidAmount: 475, paymentMethod: 'stripe', stripePaymentLink: null, glEntryId: null, paymentGlEntryId: null },
    { id: 'i3', unitNumber: '9Z', type: 'fee', description: 'Not mine', amount: 10, status: 'sent', createdDate: '2026-10-01', dueDate: '2026-10-10', paidDate: null, paidAmount: null, paymentMethod: null, stripePaymentLink: null, glEntryId: null, paymentGlEntryId: null },
  ],
  hoaDueDay: 1,
  legalDocuments: [
    { id: 'd1', name: 'Bylaws', version: '2019 v3', size: '', status: 'current', attachments: [] },
    { id: 'd2', name: 'CC&Rs / Declaration', version: '1998', size: '', status: 'current', attachments: [] },
    { id: 'd3', name: 'Collections Policy', version: 'v2', size: '', status: 'review-due', attachments: [] },
    { id: 'd4', name: 'Reserve Study 2023', version: '', size: '', status: 'current', attachments: [] },
  ],
};

describe('me metrics', () => {
  it('summarises each linked unit: owed, open invoices, next dues and on-time months', () => {
    const list = unitSummaries(snap);
    expect(list.map(u => u.unit.number)).toEqual(['4B', '6A']);
    expect(list[0]).toMatchObject({ balance: 25, fees: 0, assessments: 0, owed: 25, nextDue: '2026-12-01', movedIn: '2019-03-01' });
    expect(list[0].openInvoices.map(i => i.id)).toEqual(['i1']);
    expect(list[0].paidThisYear).toEqual({ months: 2, onTime: 1, amount: 950 });
    expect(list[1]).toMatchObject({ owed: 0, assessments: 500 });
    expect(list[1].paidThisYear).toEqual({ months: 1, onTime: 1, amount: 475 });
  });

  it('judges the resale packet from the documents on file', () => {
    const p = resalePacket(snap.legalDocuments);
    expect(p.total).toBe(7);
    expect(p.ready).toBe(5);
    expect(p.items.filter(i => !i.present).map(i => i.label)).toEqual(['Rules', 'Budget']);
    expect(p.items.find(i => i.label === 'Policies')!.detail).toBe('v2 · review due');
  });

  it('lists statements and receipts across the viewer\'s units, newest first', () => {
    const rows = receiptRows(snap);
    expect(rows.map(r => r.id)).toEqual(['inv:i1', 'pay:4B:0', 'pay:6A:0', 'pay:4B:1', 'inv:i2', 'pay:4B:2']);
    expect(rows[0]).toMatchObject({ unit: '4B', status: 'open', amount: 25, year: '2026' });
    expect(rows[2]).toMatchObject({ unit: '6A', label: 'Dues', method: 'ach', status: 'paid' });
  });

  it('turns a scorecard into dimension lines and recent receipts', () => {
    const events = [
      { id: 'a', dimension: 'Timeliness' as const, date: '2026-11-01', label: 'Dues · 2026-11', earned: 1, available: 1, reason: 'Paid on time' },
      { id: 'b', dimension: 'Timeliness' as const, date: '2026-10-05', label: 'Dues · 2026-10', earned: 0.5, available: 1, reason: 'Paid 4 days late' },
      { id: 'c', dimension: 'Impact' as const, date: '2026-06-01', label: 'Board election', earned: 0, available: 1, reason: 'No ballot' },
    ];
    const card = computeScorecard(events);
    const lines = dimensionLines(card, [90, 80, 70, 60, 50]);
    expect(lines[0]).toMatchObject({ dimension: 'Timeliness', pct: 75, weight: 35, earned: 1.5, available: 2, buildingPct: 90 });
    expect(lines[4]).toMatchObject({ dimension: 'Impact', pct: 0, buildingPct: 50 });
    expect(lowestDimension(card)).toBe('Impact');
    const recent = recentReceipts(events, '2026-11-06', 2);
    expect(recent.map(r => [r.id, r.daysAgo, r.points])).toEqual([['a', 5, 3.5], ['b', 32, 1.8]]);
  });
});
