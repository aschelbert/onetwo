import { describe, expect, it } from 'vitest';
import { agingTotals, behind, bills, budgetSummary, collected, doneForYou, healthLabel, healthScore, invoiceSummary, monthsOfCash, nextYearScenarios, ordinal, reserveSummary, type FundsSnapshot } from '@/ux2/funds/metrics';
import { resolveTab } from '@/ux2/funds/FundsPage';
import { nextTwelveMonths } from '@/ux2/funds/tabs/OverviewTab';

const unit = (number: string, over: Partial<FundsSnapshot['units'][number]> = {}) => ({
  number, owner: `Owner ${number}`, email: '', phone: '', monthlyFee: 400, votingPct: 4, status: 'ACTIVE' as const, balance: 0, moveIn: null, sqft: 900, bedrooms: 2, parking: null,
  payments: [], lateFees: [], specialAssessments: [], ...over,
});

const snap: FundsSnapshot = {
  today: '2026-11-06',
  units: [
    unit('1A', { payments: [{ date: '2026-11-01', amount: 400, method: 'stripe', note: '' }] }),
    unit('1B', { payments: [{ date: '2026-11-03', amount: 400, method: 'check', note: '' }] }),
    unit('3A', { balance: 1200, lateFees: [{ date: '2026-10-15', amount: 50, reason: 'late', waived: false }, { date: '2026-09-15', amount: 50, reason: 'late', waived: true }] }),
    unit('5A', { balance: 400, status: 'FOR_SALE' }),
  ],
  unitInvoices: [
    { id: 'i1', unitNumber: '3A', type: 'monthly', description: 'Dues · August', amount: 400, status: 'overdue', createdDate: '2026-08-01', dueDate: '2026-08-01', paidDate: null, paidAmount: null, paymentMethod: null, stripePaymentLink: null, glEntryId: null, paymentGlEntryId: null },
    { id: 'i2', unitNumber: '1A', type: 'monthly', description: 'Dues · November', amount: 400, status: 'paid', createdDate: '2026-11-01', dueDate: '2026-11-01', paidDate: '2026-11-01', paidAmount: 400, paymentMethod: 'stripe', stripePaymentLink: null, glEntryId: null, paymentGlEntryId: null },
    { id: 'i3', unitNumber: '5A', type: 'special_assessment', description: 'Roof assessment', amount: 6000, status: 'sent', createdDate: '2026-11-02', dueDate: '2026-12-01', paidDate: null, paidAmount: null, paymentMethod: null, stripePaymentLink: null, glEntryId: null, paymentGlEntryId: null },
    { id: 'i4', unitNumber: '1B', type: 'fee', description: 'Voided', amount: 25, status: 'void', createdDate: '2026-11-02', dueDate: '2026-11-10', paidDate: null, paidAmount: null, paymentMethod: null, stripePaymentLink: null, glEntryId: null, paymentGlEntryId: null },
  ],
  workOrders: [
    { id: 'WO-1', title: 'Snow retainer', vendor: 'GreenLeaf', description: '', acctNum: '5030', amount: 1900, status: 'invoiced', caseId: null, createdDate: '2026-10-20', approvedDate: '2026-10-21', invoiceNum: '4471', invoiceDate: '2026-11-01', paidDate: null, glEntryId: null, attachments: [] },
    { id: 'WO-2', title: 'Boiler service', vendor: 'Heating Co', description: '', acctNum: '5010', amount: 2450, status: 'invoiced', caseId: null, createdDate: '2026-10-20', approvedDate: '2026-10-21', invoiceNum: 'H-1', invoiceDate: '2026-11-02', paidDate: null, glEntryId: null, attachments: [] },
    { id: 'WO-3', title: 'Hallway light', vendor: 'Spark', description: '', acctNum: '5010', amount: 340, status: 'approved', caseId: 'c9', createdDate: '2026-11-01', approvedDate: '2026-11-02', invoiceNum: null, invoiceDate: null, paidDate: null, glEntryId: null, attachments: [] },
    { id: 'WO-4', title: 'Treadmill', vendor: 'Fitness Co', description: '', acctNum: '5010', amount: 4800, status: 'draft', caseId: null, createdDate: '2026-11-03', approvedDate: null, invoiceNum: null, invoiceDate: null, paidDate: null, glEntryId: null, attachments: [] },
    { id: 'WO-5', title: 'Cleaning', vendor: 'CleanCo', description: '', acctNum: '5020', amount: 800, status: 'paid', caseId: null, createdDate: '2026-10-01', approvedDate: '2026-10-02', invoiceNum: 'CC', invoiceDate: '2026-10-25', paidDate: '2026-11-02', glEntryId: 'g', attachments: [] },
  ],
  budget: [
    { name: 'Snow removal', budgeted: 3000, actual: 1500, acctNum: '5030' },
    { name: 'Repairs', budgeted: 12000, actual: 8900, acctNum: '5010' },
    { name: 'Cleaning', budgeted: 9600, actual: 9800, acctNum: '5020' },
  ],
  reserves: [
    { id: 'r1', name: 'Roof', estimatedCost: 410000, currentFunding: 196800, yearsRemaining: 3 },
    { id: 'r2', name: 'Boiler', estimatedCost: 60000, currentFunding: 40000, yearsRemaining: 5 },
    { id: 'r3', name: 'Contingency', estimatedCost: 10000, currentFunding: 10000, yearsRemaining: 0, isContingency: true },
  ],
  annualReserveContribution: 28800,
  recommendedAnnualReserve: 71100,
  operatingCash: 142300,
  reservesCash: 246800,
  hoaDueDay: 1,
  autoBillingEnabled: true,
  lastBillingRun: '2026-11-01T06:00:00Z',
  lateFee: { enabled: true, amount: 25, graceDays: 14 },
  stripeConnected: true,
  stripeOnboardingComplete: true,
};

describe('funds metrics', () => {
  it('keeps the Fiscal Lens health formula', () => {
    expect(healthScore(100, 100, 50)).toBe(100);
    expect(healthScore(50, 40, 90)).toBe(50);
    expect(healthLabel(80)).toBe('Healthy');
    expect(healthLabel(60)).toBe('Fair');
    expect(healthLabel(59)).toBe('At risk');
  });

  it('counts this month\'s collections by method and who is paid up', () => {
    const c = collected(snap);
    expect(c).toMatchObject({ month: '2026-11', billed: 1600, amount: 800, paidUnits: 2, units: 4, pct: 50, online: 1, check: 1, outstanding: 1650, behindUnits: 2 });
  });

  it('lists who is behind, oldest first, with unwaived fees and the aging buckets', () => {
    const list = behind(snap);
    expect(list.map(b => b.number)).toEqual(['3A', '5A']);
    expect(list[0]).toMatchObject({ amount: 1250, daysPastDue: 97, bucket: '90+', forSale: false });
    expect(list[0].invoice?.id).toBe('i1');
    expect(list[1]).toMatchObject({ amount: 400, daysPastDue: 30, bucket: '0-30', forSale: true });
    expect(agingTotals(list)).toEqual({ '0-30': 400, '31-60': 0, '61-90': 0, '90+': 1250 });
  });

  it('summarises the invoice register without voided invoices', () => {
    const all = invoiceSummary(snap.unitInvoices);
    expect(all).toMatchObject({ sent: 3, paid: 1, paidAmount: 400, open: 2, openAmount: 6400, overdue: 1 });
    expect(invoiceSummary(snap.unitInvoices, '2026-11').sent).toBe(2);
  });

  it('flags a bill that would push its budget line over', () => {
    const b = bills(snap);
    expect(b.toApprove.map(w => w.id)).toEqual(['WO-1', 'WO-2']);
    expect(b.flagged.map(w => w.id)).toEqual(['WO-1']);
    expect(b.within.map(w => w.id)).toEqual(['WO-2']);
    expect(b).toMatchObject({ amount: 4350, drafts: [expect.objectContaining({ id: 'WO-4' })], open: 4, vendors: 4 });
    expect(b.paidThisMonth.map(w => w.id)).toEqual(['WO-5']);
  });

  it('reads the budget pace and the lines over', () => {
    const b = budgetSummary(snap);
    expect(b).toMatchObject({ total: 24600, spent: 20200, pct: 82, expectedPct: 92, lines: 3, onTrack: 2 });
    expect(b.over.map(o => [o.name, o.overBy])).toEqual([['Cleaning', 200]]);
  });

  it('finds the reserve gap and the next big repair', () => {
    const r = reserveSummary(snap);
    expect(r).toMatchObject({ needed: 480000, funded: 246800, pct: 51, monthly: 2400, recommendedMonthly: 5925, onSchedule: false });
    expect(r.next).toEqual({ name: 'Roof', year: 2029, cost: 410000, funded: 196800 });
    expect(monthsOfCash(snap)).toEqual({ months: 69.4, monthlyOut: 2050 });
  });

  it('drafts next year with today\'s dues, the recommended reserve and the minimum', () => {
    const d = nextYearScenarios(snap);
    expect(d.year).toBe(2027);
    expect(d.current).toBe(400);
    expect(d.scenarios.map(s => s.id)).toEqual(['keep', 'recommended', 'minimum']);
    expect(d.scenarios[0]).toMatchObject({ dues: 400, change: 0, reserveAnnual: 0 });
    expect(d.scenarios[1]).toMatchObject({ dues: 2009, reserveAnnual: 71100 });
    expect(d.scenarios[2]).toMatchObject({ dues: 1128, reserveAnnual: 28800 });
    expect(new Set(d.scenarios.map(s => s.linesAnnual))).toEqual(new Set([25338]));
  });

  it('describes what runs on its own', () => {
    const lines = doneForYou(snap);
    expect(lines.map(l => l.on)).toEqual([true, true, true]);
    expect(lines[0].detail).toContain('Runs on the 1st');
    expect(lines[1].detail).toContain('$25 after 14 days');
    expect(doneForYou({ ...snap, autoBillingEnabled: false, lateFee: { enabled: false, amount: 0, graceDays: 0 } }).map(l => l.on)).toEqual([false, false, true]);
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(13)).toBe('13th');
  });

  it('maps legacy Fiscal Lens tab ids onto Funds tabs and sections', () => {
    expect(resolveTab(null)).toEqual({ tab: 'overview' });
    expect(resolveTab('income')).toEqual({ tab: 'income' });
    expect(resolveTab('units')).toEqual({ tab: 'income', section: 'ledger' });
    expect(resolveTab('reserves')).toEqual({ tab: 'planning', section: 'reserves' });
    expect(resolveTab('approvals')).toEqual({ tab: 'expenses', section: 'decisions' });
    expect(resolveTab('coa')).toEqual({ tab: 'settings', section: 'accounts' });
    expect(resolveTab('nonsense')).toEqual({ tab: 'overview' });
  });

  it('lists the next twelve months of money events in date order', () => {
    const items = nextTwelveMonths({
      today: '2026-11-06',
      filings: [
        { name: 'Form 1120-H', dueDate: '2027-04-15', status: 'pending', category: 'tax', responsible: 'Treasurer' },
        { name: 'Elevator permit', dueDate: '2027-02-01', status: 'pending', category: 'safety', responsible: 'President' },
        { name: 'Old return', dueDate: '2026-04-15', status: 'filed', category: 'tax', responsible: 'Treasurer' },
      ],
      insurance: [{ type: 'D&O', expires: '2026-12-04', carrier: 'Travelers', premium: '$12,950' }],
      meetings: [{ title: 'November Board Meeting', date: '2026-11-13', status: 'SCHEDULED', agenda: ['Adopt the 2027 budget'] }],
      duesStartYear: 2027,
    });
    expect(items.map(i => [i.date, i.tag])).toEqual([
      ['2026-11-13', 'Needs the vote'],
      ['2026-12-04', 'Renewal'],
      ['2027-01-01', 'Automatic'],
      ['2027-04-15', 'Runbook'],
    ]);
  });
});
