import { describe, it, expect } from 'vitest';
import {
  closeChecklist,
  buildStatement,
  toPeriod,
  periodLabel,
  type CloseChecklistInputs,
  type BuildStatementInputs,
} from '@/lib/monthClose';
import type { GLEntry, Unit } from '@/types/financial';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeUnit(num: string, balance = 0, monthlyFee = 500): Unit {
  return {
    number: num,
    owner: `Owner ${num}`,
    email: `${num}@test.com`,
    phone: '555-0000',
    monthlyFee,
    votingPct: 2,
    status: 'ACTIVE',
    balance,
    moveIn: null,
    sqft: 800,
    bedrooms: 2,
    parking: null,
    payments: [],
    lateFees: [],
    specialAssessments: [],
  };
}

function makeGLEntry(overrides: Partial<GLEntry> & { date: string; source: GLEntry['source'] }): GLEntry {
  const { date, source, ...rest } = overrides;
  return {
    id: 'GL' + Math.random().toString(36).slice(2, 8),
    date,
    memo: 'test',
    debitAcct: '1110',
    creditAcct: '4010',
    amount: 500,
    source,
    sourceId: null,
    posted: new Date().toISOString(),
    status: 'posted',
    ...rest,
  };
}

function makeDefaultInputs(overrides: Partial<CloseChecklistInputs> = {}): CloseChecklistInputs {
  return {
    generalLedger: [],
    units: [],
    workOrders: [],
    invoices: [],
    communications: [],
    settings: { hoaDueDay: 15 },
    ...overrides,
  };
}

// ── toPeriod / periodLabel ───────────────────────────────────────────────────

describe('toPeriod', () => {
  it('extracts YYYY-MM from date string', () => {
    expect(toPeriod('2026-10-15')).toBe('2026-10');
  });

  it('extracts YYYY-MM from Date object', () => {
    expect(toPeriod(new Date('2026-03-01T00:00:00'))).toBe('2026-03');
  });
});

describe('periodLabel', () => {
  it('returns human-readable month and year', () => {
    expect(periodLabel('2026-10')).toBe('October 2026');
    expect(periodLabel('2026-01')).toBe('January 2026');
  });
});

// ── closeChecklist ───────────────────────────────────────────────────────────

describe('closeChecklist', () => {
  it('returns four steps', () => {
    const steps = closeChecklist('2026-10', makeDefaultInputs());
    expect(steps).toHaveLength(4);
    expect(steps.map(s => s.key)).toEqual([
      'assessmentsPosted',
      'paymentsRecorded',
      'billsPaid',
      'statementSent',
    ]);
  });

  it('assessments: done when all units billed', () => {
    const units = Array.from({ length: 3 }, (_, i) => makeUnit(String(101 + i)));
    const gl = units.map(u =>
      makeGLEntry({ date: '2026-10-01', source: 'assessment', sourceId: u.number, amount: 500 }),
    );
    const steps = closeChecklist('2026-10', makeDefaultInputs({ units, generalLedger: gl }));
    expect(steps[0].done).toBe(true);
    expect(steps[0].detail).toContain('3 units billed');
  });

  it('assessments: not done when some units missing', () => {
    const units = [makeUnit('101'), makeUnit('102'), makeUnit('103')];
    const gl = [
      makeGLEntry({ date: '2026-10-01', source: 'assessment', sourceId: '101', amount: 500 }),
    ];
    const steps = closeChecklist('2026-10', makeDefaultInputs({ units, generalLedger: gl }));
    expect(steps[0].done).toBe(false);
    expect(steps[0].detail).toContain('1 of 3');
  });

  it('payments: done when all billed units paid', () => {
    const units = [makeUnit('101', 0), makeUnit('102', 0)];
    const gl = [
      makeGLEntry({ date: '2026-10-01', source: 'assessment', sourceId: '101', amount: 500 }),
      makeGLEntry({ date: '2026-10-01', source: 'assessment', sourceId: '102', amount: 500 }),
      makeGLEntry({ date: '2026-10-15', source: 'payment', sourceId: '101', amount: 500 }),
      makeGLEntry({ date: '2026-10-15', source: 'payment', sourceId: '102', amount: 500 }),
    ];
    const steps = closeChecklist('2026-10', makeDefaultInputs({ units, generalLedger: gl }));
    expect(steps[1].done).toBe(true);
  });

  it('bills paid: done when no bills exist', () => {
    const steps = closeChecklist('2026-10', makeDefaultInputs());
    expect(steps[2].done).toBe(true);
    expect(steps[2].detail).toContain('No bills');
  });

  it('statement sent: done when communication exists', () => {
    const comms = [{ type: 'statement', date: '2026-10-10' }];
    const steps = closeChecklist('2026-10', makeDefaultInputs({ communications: comms }));
    expect(steps[3].done).toBe(true);
    expect(steps[3].detail).toContain('delivered');
  });

  it('statement sent: not done when no matching communication', () => {
    const steps = closeChecklist('2026-10', makeDefaultInputs());
    expect(steps[3].done).toBe(false);
  });
});

// ── buildStatement ───────────────────────────────────────────────────────────

describe('buildStatement', () => {
  function makeStatementInputs(overrides: Partial<BuildStatementInputs> = {}): BuildStatementInputs {
    return {
      generalLedger: [],
      units: [],
      workOrders: [],
      invoices: [],
      reserveItems: [],
      budgetCategories: [],
      operatingCash: 50000,
      prevOperatingCash: 48000,
      buildingName: 'Sunny Acres Condominium',
      period: '2026-10',
      closedBy: 'David Chen',
      decisions: [],
      ...overrides,
    };
  }

  it('48 billed, 45 paid yields ~94% collection rate and 3 past due', () => {
    // 48 units billed at $500 each = $24,000 billed
    const units = Array.from({ length: 48 }, (_, i) => {
      const num = String(100 + i);
      // 3 units have balance > 0 (past due)
      const isPastDue = i >= 45;
      return makeUnit(num, isPastDue ? 500 : 0);
    });

    const gl: GLEntry[] = [];

    // All 48 units billed
    units.forEach(u => {
      gl.push(makeGLEntry({
        date: '2026-10-01',
        source: 'assessment',
        sourceId: u.number,
        amount: 500,
      }));
    });

    // 45 units paid
    units.slice(0, 45).forEach(u => {
      gl.push(makeGLEntry({
        date: '2026-10-15',
        source: 'payment',
        sourceId: u.number,
        amount: 500,
        debitAcct: '1010',
        creditAcct: '1110',
      }));
    });

    const result = buildStatement('2026-10', makeStatementInputs({
      generalLedger: gl,
      units,
      reserveItems: [
        { estimatedCost: 100000, currentFunding: 60000 },
      ],
    }));

    expect(result.figures.billed).toBe(24000);
    expect(result.figures.collected).toBe(22500);
    expect(result.figures.collectionRate).toBe(94); // 22500/24000 = 93.75, rounded to 94
    expect(result.figures.pastDueUnits).toBe(3);
    expect(result.figures.pastDueTotal).toBe(1500);
    expect(result.figures.reservePct).toBe(60);

    // Statement text contains the reserve percentage
    expect(result.text).toContain('60% funded');
    expect(result.text).toContain('94%');

    // DC Code compliance line
    expect(result.text).toContain('DC Code 42-1903.14');
    expect(result.html).toContain('DC Code 42-1903.14');
  });

  it('includes decisions in statement', () => {
    const result = buildStatement('2026-10', makeStatementInputs({
      decisions: ['Approved roof repair bid', 'Waived late fees for Unit 203'],
    }));

    expect(result.text).toContain('Approved roof repair bid');
    expect(result.text).toContain('Waived late fees for Unit 203');
    expect(result.html).toContain('Approved roof repair bid');
  });

  it('100% collection when nothing billed', () => {
    const result = buildStatement('2026-10', makeStatementInputs());
    expect(result.figures.collectionRate).toBe(100);
  });
});

// ── Period lock guard ────────────────────────────────────────────────────────

describe('PeriodClosedError and period lock guard', () => {
  // We import these separately to test the store integration
  // Use a dynamic import pattern to avoid circular issues in test env
  it('PeriodClosedError has correct name and period', async () => {
    const { PeriodClosedError } = await import('@/store/useFinancialStore');
    const err = new PeriodClosedError('2026-09');
    expect(err.name).toBe('PeriodClosedError');
    expect(err.period).toBe('2026-09');
    expect(err.message).toContain('2026-09');
    expect(err.message).toContain('closed');
  });

  it('glPost throws PeriodClosedError when period is locked', async () => {
    const { useFinancialStore, PeriodClosedError } = await import('@/store/useFinancialStore');
    const { seedChartOfAccounts } = await import('@/data/financial');

    // Reset store with a locked period
    useFinancialStore.setState({
      tenantId: null,
      chartOfAccounts: [...seedChartOfAccounts],
      acctStatus: Object.fromEntries(seedChartOfAccounts.map(a => [a.num, true])),
      generalLedger: [],
      glNextId: 1000,
      periodCloses: [
        {
          id: 'pc-test',
          tenantId: 'test',
          period: '2026-09',
          closedAt: '2026-10-05T00:00:00Z',
          closedBy: 'Test User',
          statementDoc: null,
          locked: true,
          checklist: {},
        },
      ],
    });

    const store = useFinancialStore.getState();

    // Posting to a locked period should throw
    expect(() => {
      store.glPost('2026-09-15', 'Test entry', '1010', '4010', 100, 'manual', null);
    }).toThrow(PeriodClosedError);

    // Posting to the current (unlocked) period should succeed
    expect(() => {
      store.glPost('2026-10-15', 'Current month entry', '1010', '4010', 100, 'manual', null);
    }).not.toThrow();
  });

  it('postManualEntry throws PeriodClosedError for locked period', async () => {
    const { useFinancialStore, PeriodClosedError } = await import('@/store/useFinancialStore');
    const { seedChartOfAccounts } = await import('@/data/financial');

    useFinancialStore.setState({
      tenantId: null,
      chartOfAccounts: [...seedChartOfAccounts],
      acctStatus: Object.fromEntries(seedChartOfAccounts.map(a => [a.num, true])),
      generalLedger: [],
      glNextId: 1000,
      periodCloses: [
        {
          id: 'pc-test2',
          tenantId: 'test',
          period: '2026-08',
          closedAt: '2026-09-05T00:00:00Z',
          closedBy: 'Test User',
          statementDoc: null,
          locked: true,
          checklist: {},
        },
      ],
    });

    expect(() => {
      useFinancialStore.getState().postManualEntry('2026-08-20', 'Manual entry', '1010', '4010', 50);
    }).toThrow(PeriodClosedError);
  });
});
