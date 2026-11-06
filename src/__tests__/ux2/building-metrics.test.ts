import { describe, expect, it } from 'vitest';
import { buildingScore, contractRows, contractsSummary, documentsSummary, dutyCounts, insuranceStatus, obligationRows, obligationsSummary, roleLoads, type BuildingSnapshot } from '@/ux2/building/metrics';

const att = [{ name: 'a.pdf', size: '1 KB', uploadedAt: '2026-01-01', type: 'pdf' }];
const item = (id: string, role: string, due: string, over: Record<string, unknown> = {}) => ({
  id, task: `Task ${id}`, role, freq: 'Annual', due, critical: false, tip: '', legalRef: '', whyItMatters: '', consequence: '', howTo: ['a'], fiduciaryDuty: 'care', scope: 'governance', ...over,
});

const snap: BuildingSnapshot = {
  today: '2026-11-06',
  name: 'Sunny Acres',
  address: { street: '1302 R St NW', city: 'Washington', state: 'DC', zip: '20009' },
  details: { yearBuilt: '1928', totalUnits: 24, floors: 6, fiscalYearEnd: '12-31', entityType: 'incorporated' },
  managementCompany: '',
  counselCount: 1,
  board: [
    { id: 'b1', name: 'Marcus Jones', role: 'President', email: '', phone: '', term: '' },
    { id: 'b2', name: 'Sarah Park', role: 'Treasurer', email: '', phone: '', term: '' },
    { id: 'b3', name: 'Priya Kapoor', role: 'Secretary', email: '', phone: '', term: '' },
  ],
  legalDocuments: [
    { id: 'd1', name: 'Bylaws', version: 'v3', size: '', status: 'current', attachments: att },
    { id: 'd2', name: 'CC&Rs', version: '', size: '', status: 'current', attachments: [] },
    { id: 'd3', name: 'Rules', version: '', size: '', status: 'review-due', attachments: [] },
  ],
  insurance: [
    { id: 'p1', type: 'D&O', carrier: 'Hartford', coverage: '', premium: '', expires: '2026-12-04', policyNum: '', attachments: att },
    { id: 'p2', type: 'Property', carrier: 'Hartford', coverage: '', premium: '', expires: '2027-06-01', policyNum: '', attachments: [] },
    { id: 'p3', type: 'Umbrella', carrier: 'CNA', coverage: '', premium: '', expires: '2026-10-01', policyNum: '', attachments: [] },
  ],
  vendors: [
    { id: 'v1', name: 'Lift Service Inc', service: 'elevator', contact: '', phone: '', email: '', contract: '', status: 'active', w9OnFile: true },
    { id: 'v2', name: 'CleanCo', service: 'cleaning', contact: '', phone: '', email: '', contract: '', status: 'active', w9OnFile: false },
    { id: 'v3', name: 'Spark Electric', service: 'electrician', contact: '', phone: '', email: '', contract: '', status: 'active' },
    { id: 'v4', name: 'Old Vendor', service: 'x', contact: '', phone: '', email: '', contract: '', status: 'inactive' },
  ],
  contracts: [
    { id: 'c1', vendorId: 'v1', vendorName: 'Lift Service Inc', title: 'Elevator', startDate: '2025-11-01', endDate: '2026-10-31', amount: 6400, status: 'expired', autoRenew: false, attachments: [], notes: '' },
    { id: 'c2', vendorId: 'v2', vendorName: 'CleanCo', title: 'Cleaning', startDate: '2026-01-01', endDate: '2026-12-31', amount: 9600, status: 'active', autoRenew: false, attachments: [], notes: '' },
  ],
  workOrders: [
    { id: 'w1', title: '', vendor: 'Lift Service Inc', description: '', acctNum: '', amount: 6400, status: 'paid', caseId: null, createdDate: '2026-02-01', approvedDate: null, invoiceNum: null, invoiceDate: null, paidDate: '2026-03-01', glEntryId: null, attachments: [] },
    { id: 'w2', title: '', vendor: 'Spark Electric', description: '', acctNum: '', amount: 540, status: 'paid', caseId: null, createdDate: '2026-02-01', approvedDate: null, invoiceNum: null, invoiceDate: null, paidDate: '2026-04-01', glEntryId: null, attachments: [] },
    { id: 'w3', title: '', vendor: 'CleanCo', description: '', acctNum: '', amount: 800, status: 'invoiced', caseId: null, createdDate: '2026-10-01', approvedDate: null, invoiceNum: null, invoiceDate: null, paidDate: null, glEntryId: null, attachments: [] },
    { id: 'w4', title: '', vendor: 'CleanCo', description: '', acctNum: '', amount: 8000, status: 'paid', caseId: null, createdDate: '2025-10-01', approvedDate: null, invoiceNum: null, invoiceDate: null, paidDate: '2026-09-01', glEntryId: null, attachments: [] },
  ],
  obligations: [
    item('g1', 'Secretary', '2026-11-03'),
    item('g2', 'Treasurer', '2026-11-15', { critical: true }),
    item('g3', 'President', '2027-04-01'),
    item('g4', 'Secretary', 'Per meeting', { fiduciaryDuty: 'obedience' }),
    item('g5', 'President', '2026-06-01', { autoPass: true, fiduciaryDuty: 'loyalty' }),
    item('g6', 'Treasurer', '2026-09-01'),
  ] as BuildingSnapshot['obligations'],
  completions: { g6: true },
  filings: [
    { id: 'f1', name: 'Biennial report', category: 'state', dueDate: '2027-04-01', status: 'pending', filedDate: null, confirmationNum: '', notes: '', responsible: 'Secretary', recurrence: '', legalRef: '', attachments: [] },
    { id: 'f2', name: 'Form 1120-H', category: 'tax', dueDate: '2026-04-15', status: 'filed', filedDate: '2026-04-10', confirmationNum: '', notes: '', responsible: 'Treasurer', recurrence: '', legalRef: '', attachments: [] },
  ],
};

describe('building metrics', () => {
  it('keeps the Dashboard building health formula', () => {
    const sc = buildingScore(snap);
    expect(sc).toMatchObject({ legal: 53, insurance: 57, governance: 75, total: 61, grade: 'D', label: 'Fair' });
  });

  it('orders insurance by time left and flags lapsed and expiring', () => {
    const st = insuranceStatus(snap);
    expect(st.map(p => [p.type, p.state, p.daysLeft])).toEqual([['Umbrella', 'lapsed', -36], ['D&O', 'expiring', 28], ['Property', 'current', 207]]);
    expect(st[1].hasCertificate).toBe(true);
  });

  it('summarises documents and certificates', () => {
    const d = documentsSummary(snap);
    expect(d).toMatchObject({ total: 3, withFile: 1, certificates: 1, policies: 3 });
    expect(d.reviewDue.map(x => x.name)).toEqual(['Rules']);
    expect(d.missingFile.map(x => x.name)).toEqual(['CC&Rs', 'Rules']);
  });

  it('builds a contract row per vendor with lapsed first and the 1099 flag', () => {
    const rows = contractRows(snap);
    expect(rows.map(r => [r.vendor, r.state])).toEqual([['Lift Service Inc', 'lapsed'], ['CleanCo', 'ending'], ['Spark Electric', 'none'], ['Old Vendor', 'inactive']]);
    expect(rows[0]).toMatchObject({ daysLeft: -6, paidThisYear: 6400, needs1099: true, w9OnFile: true });
    expect(rows[1]).toMatchObject({ daysLeft: 55, paidThisYear: 8000, needs1099: true, w9OnFile: false });
    expect(rows[2]).toMatchObject({ paidThisYear: 540, needs1099: false });
    const sum = contractsSummary(rows);
    expect(sum.vendors).toBe(3);
    expect(sum.lapsed.map(r => r.vendor)).toEqual(['Lift Service Inc']);
    expect(sum.ending.map(r => r.vendor)).toEqual(['CleanCo']);
    expect(sum.missingW9.map(r => r.vendor)).toEqual(['CleanCo']);
    expect(sum.signed).toBe(2);
  });

  it('judges every obligation and filing the way the Governance Calendar does', () => {
    const rows = obligationRows(snap);
    const by = Object.fromEntries(rows.map(r => [r.id, r.state]));
    expect(by).toEqual({ g1: 'overdue', g2: 'in-progress', g3: 'upcoming', g4: 'ongoing', g5: 'auto', g6: 'met', f1: 'upcoming', f2: 'met' });
    expect(rows[0].id).toBe('g1');
    const sum = obligationsSummary(rows);
    expect(sum).toMatchObject({ total: 8, met: 3, auto: 1, ongoing: 1, open: 5, pct: 38 });
    expect(sum.overdue.map(r => r.id)).toEqual(['g1']);
    expect(sum.inProgress.map(r => r.id)).toEqual(['g2']);
  });

  it('counts who carries what and the fiduciary duties', () => {
    const rows = obligationRows(snap);
    const loads = roleLoads(rows, snap.board, snap.today);
    const sec = loads.find(l => l.role === 'Secretary')!;
    expect(sec).toMatchObject({ member: 'Priya Kapoor', obligations: 3, ongoing: 1, dated: 2 });
    expect(sec.thisMonth.map(r => r.id)).toEqual(['g1']);
    const tre = loads.find(l => l.role === 'Treasurer')!;
    expect(tre).toMatchObject({ member: 'Sarah Park', obligations: 1, critical: 1 });
    expect(loads.find(l => l.role === 'Member at Large')).toMatchObject({ member: undefined, obligations: 0 });
    expect(dutyCounts(rows)).toEqual({ care: 4, loyalty: 1, obedience: 3 });
  });
});
