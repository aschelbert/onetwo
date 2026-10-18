import { describe, it, expect } from 'vitest';
import { seasonWindows, buildSeasons, currentSeason, type SeasonState } from '@/lib/seasons';
import { DEFAULT_SETTINGS, type BuildingSettings } from '@/lib/buildingSettings';
import { refreshComplianceRequirements, type ComplianceItem } from '@/lib/complianceRefresh';
import { ALL_MILESTONES, allMilestoneItemIds } from '@/data/milestones';
import type { RegulatoryFiling } from '@/store/useComplianceStore';

// ── Fixtures ────────────────────────────────────────────────────────────────

const today = new Date(2026, 5, 15); // Jun 15 local

function dcItems(): ComplianceItem[] {
  const result = refreshComplianceRequirements({
    state: 'District of Columbia',
    legalDocuments: [
      { name: 'Bylaws', status: 'uploaded' },
      { name: 'CC&Rs Declaration', status: 'uploaded' },
      { name: 'Rules & Regulations', status: 'uploaded' },
      { name: 'Resale Certificate Policy', status: 'uploaded' },
      { name: 'Collection Policy', status: 'uploaded' },
      { name: 'Document Retention Policy', status: 'uploaded' },
      { name: 'Emergency Plan', status: 'uploaded' },
    ],
    insurance: [
      { type: 'D&O Insurance', expires: '2027-01-01' },
      { type: 'General Liability', expires: '2027-01-01' },
      { type: 'Fidelity Bond', expires: '2027-01-01' },
    ],
    boardCount: 5,
    hasManagement: false,
  });
  return result.categories.flatMap(c => c.items);
}

const sampleFilings: RegulatoryFiling[] = [
  { id: 'rf1', name: 'DC Biennial Report', category: 'government', dueDate: '2026-04-01', status: 'pending', filedDate: null, confirmationNum: '', notes: '', responsible: 'President', recurrence: 'biennial', legalRef: 'DC Code', attachments: [] },
  { id: 'rf2', name: 'Form 1120-H', category: 'tax', dueDate: '2026-03-15', status: 'pending', filedDate: null, confirmationNum: '', notes: '', responsible: 'Treasurer', recurrence: 'annual', legalRef: 'IRS', attachments: [] },
  { id: 'rf3', name: 'DC Personal Property Tax', category: 'tax', dueDate: '2026-07-31', status: 'pending', filedDate: null, confirmationNum: '', notes: '', responsible: 'Treasurer', recurrence: 'annual', legalRef: 'DC Code', attachments: [] },
  { id: 'rf4', name: 'Fire Safety Inspection', category: 'inspection', dueDate: '2026-06-30', status: 'pending', filedDate: null, confirmationNum: '', notes: '', responsible: 'Vice President', recurrence: 'annual', legalRef: 'DC Fire Code', attachments: [] },
  { id: 'rf5', name: 'Elevator Inspection', category: 'inspection', dueDate: '2026-08-15', status: 'filed', filedDate: '2025-08-20', confirmationNum: 'ELEV-2025', notes: '', responsible: 'Vice President', recurrence: 'annual', legalRef: 'DC Code', attachments: [] },
  { id: 'rf6', name: 'Annual Financial Audit', category: 'financial', dueDate: '2026-06-30', status: 'pending', filedDate: null, confirmationNum: '', notes: '', responsible: 'Treasurer', recurrence: 'annual', legalRef: 'DC Code', attachments: [] },
];

function noCompletions(): Record<string, boolean> {
  return {};
}

function allCompletions(items: ComplianceItem[]): Record<string, boolean> {
  const c: Record<string, boolean> = {};
  for (const item of items) c[item.id] = true;
  return c;
}

function allFilingsFiled(): RegulatoryFiling[] {
  return sampleFilings.map(f => ({ ...f, status: 'filed' as const, filedDate: '2026-01-01' }));
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('seasonWindows', () => {
  it('default settings yield Filing Jan-Mar, Annual Meeting Apr-Jun, Maintenance Jul-Sep, Budget Oct-Dec', () => {
    const windows = seasonWindows(DEFAULT_SETTINGS, 2026);

    expect(windows).toHaveLength(4);

    // Filing = Q1
    const filing = windows.find(w => w.seasonId === 'filing')!;
    expect(filing.startMonth).toBe(1);
    expect(filing.endMonth).toBe(3);
    expect(filing.startDate).toBe('2026-01-01');
    expect(filing.endDate).toBe('2026-03-31');

    // Annual Meeting = Q2
    const meeting = windows.find(w => w.seasonId === 'annual_meeting')!;
    expect(meeting.startMonth).toBe(4);
    expect(meeting.endMonth).toBe(6);
    expect(meeting.startDate).toBe('2026-04-01');
    expect(meeting.endDate).toBe('2026-06-30');

    // Maintenance = Q3
    const maint = windows.find(w => w.seasonId === 'maintenance')!;
    expect(maint.startMonth).toBe(7);
    expect(maint.endMonth).toBe(9);
    expect(maint.startDate).toBe('2026-07-01');
    expect(maint.endDate).toBe('2026-09-30');

    // Budget = Q4
    const budget = windows.find(w => w.seasonId === 'budget')!;
    expect(budget.startMonth).toBe(10);
    expect(budget.endMonth).toBe(12);
    expect(budget.startDate).toBe('2026-10-01');
    expect(budget.endDate).toBe('2026-12-31');
  });

  it('FY start July shifts seasons correctly', () => {
    const settings: BuildingSettings = {
      ...DEFAULT_SETTINGS,
      fiscalYearStartMonth: 7,
      annualMeetingMonth: 10, // October
    };
    const windows = seasonWindows(settings, 2026);

    expect(windows).toHaveLength(4);

    // Filing = first quarter of FY = Jul-Sep
    const filing = windows.find(w => w.seasonId === 'filing')!;
    expect(filing.startMonth).toBe(7);
    expect(filing.endMonth).toBe(9);

    // Budget = last quarter before FY start = Apr-Jun
    const budget = windows.find(w => w.seasonId === 'budget')!;
    expect(budget.startMonth).toBe(4);
    expect(budget.endMonth).toBe(6);

    // Annual Meeting = quarter containing Oct = Oct-Dec
    const meeting = windows.find(w => w.seasonId === 'annual_meeting')!;
    expect(meeting.startMonth).toBe(10);
    expect(meeting.endMonth).toBe(12);

    // Maintenance = remaining quarter = Jan-Mar
    const maint = windows.find(w => w.seasonId === 'maintenance')!;
    expect(maint.startMonth).toBe(1);
    expect(maint.endMonth).toBe(3);
  });

  it('returns proper labels', () => {
    const windows = seasonWindows(DEFAULT_SETTINGS, 2026);
    const labels = windows.map(w => w.label);
    expect(labels).toContain('Filing Season');
    expect(labels).toContain('Annual Meeting');
    expect(labels).toContain('Maintenance');
    expect(labels).toContain('Budget Season');
  });
});

describe('milestone coverage', () => {
  it('every runbook ID from DC refresh appears in exactly one milestone', () => {
    const items = dcItems();
    const allItemIds = items.map(i => i.id);
    const milestoneItemIds = allMilestoneItemIds();

    // Every runbook id must be in at least one milestone
    for (const id of allItemIds) {
      expect(milestoneItemIds).toContain(id);
    }

    // Each id appears in exactly one milestone
    for (const id of allItemIds) {
      const count = ALL_MILESTONES.reduce((sum, m) => sum + (m.itemIds.includes(id) ? 1 : 0), 0);
      expect(count).toBe(1);
    }
  });

  it('total milestone item count covers all DC items', () => {
    const items = dcItems();
    const milestoneIds = allMilestoneItemIds();
    // Every item id must be covered
    for (const item of items) {
      expect(milestoneIds).toContain(item.id);
    }
  });
});

describe('buildSeasons', () => {
  it('returns 4 seasons for active tenant', () => {
    const items = dcItems();
    const seasons = buildSeasons({
      items,
      completions: noCompletions(),
      filings: sampleFilings,
      settings: DEFAULT_SETTINGS,
      tenantStatus: 'active',
      today,
    });

    expect(seasons).toHaveLength(4);
    const ids = seasons.map(s => s.seasonId);
    expect(ids).toContain('filing');
    expect(ids).toContain('annual_meeting');
    expect(ids).toContain('maintenance');
    expect(ids).toContain('budget');
    expect(ids).not.toContain('setup');
  });

  it('returns 5 seasons for onboarding tenant (setup + 4)', () => {
    const items = dcItems();
    const seasons = buildSeasons({
      items,
      completions: noCompletions(),
      filings: sampleFilings,
      settings: DEFAULT_SETTINGS,
      tenantStatus: 'onboarding',
      setupProgress: { completed: 3, total: 10 },
      today,
    });

    expect(seasons).toHaveLength(5);
    expect(seasons[0].seasonId).toBe('setup');
    expect(seasons[0].isCurrent).toBe(true);
    expect(seasons[0].completedCount).toBe(3);
    expect(seasons[0].totalCount).toBe(10);
  });

  it('marks current season correctly', () => {
    const items = dcItems();
    // June 15 falls in Annual Meeting season (Apr-Jun) with default settings
    const seasons = buildSeasons({
      items,
      completions: noCompletions(),
      filings: sampleFilings,
      settings: DEFAULT_SETTINGS,
      tenantStatus: 'active',
      today,
    });

    const current = seasons.find(s => s.isCurrent);
    expect(current).toBeDefined();
    expect(current!.seasonId).toBe('annual_meeting');
  });

  it('season with all completions is complete', () => {
    const items = dcItems();
    const comps = allCompletions(items);
    const filedFilings = allFilingsFiled();

    const seasons = buildSeasons({
      items,
      completions: comps,
      filings: filedFilings,
      settings: DEFAULT_SETTINGS,
      tenantStatus: 'active',
      today,
    });

    // Every milestone in every season should be complete
    for (const season of seasons) {
      for (const m of season.milestones) {
        if (m.totalCount > 0) {
          expect(m.status).toBe('complete');
          expect(m.completedCount).toBe(m.totalCount);
        }
      }
      if (season.totalCount > 0) {
        expect(season.completedCount).toBe(season.totalCount);
      }
    }
  });

  it('overdue milestone has overdue status', () => {
    const items = dcItems();
    // Today is June 15. Items due before that without completion are overdue.
    // g1 is due 2026-01-15 - overdue if not completed
    const seasons = buildSeasons({
      items,
      completions: noCompletions(),
      filings: sampleFilings,
      settings: DEFAULT_SETTINGS,
      tenantStatus: 'active',
      today,
    });

    // g1 is in filing-governance-reset milestone
    const filingSeason = seasons.find(s => s.seasonId === 'filing')!;
    const govReset = filingSeason.milestones.find(m => m.id === 'filing-governance-reset')!;
    expect(govReset.status).toBe('overdue');
  });

  it('daysLeft is positive for current season', () => {
    const items = dcItems();
    const seasons = buildSeasons({
      items,
      completions: noCompletions(),
      filings: sampleFilings,
      settings: DEFAULT_SETTINGS,
      tenantStatus: 'active',
      today,
    });

    const current = seasons.find(s => s.isCurrent)!;
    expect(current.daysLeft).toBeGreaterThan(0);
    // Jun 15 to Jun 30 = 15 days
    expect(current.daysLeft).toBe(15);
  });

  it('each milestone has a non-empty ownerRole', () => {
    const items = dcItems();
    const seasons = buildSeasons({
      items,
      completions: noCompletions(),
      filings: sampleFilings,
      settings: DEFAULT_SETTINGS,
      tenantStatus: 'active',
      today,
    });

    for (const s of seasons) {
      for (const m of s.milestones) {
        expect(m.ownerRole).toBeTruthy();
      }
    }
  });
});

describe('currentSeason', () => {
  it('returns the current season', () => {
    const items = dcItems();
    const seasons = buildSeasons({
      items,
      completions: noCompletions(),
      filings: sampleFilings,
      settings: DEFAULT_SETTINGS,
      tenantStatus: 'active',
      today,
    });

    const current = currentSeason(seasons);
    expect(current.isCurrent).toBe(true);
    expect(current.seasonId).toBe('annual_meeting');
  });

  it('returns first season if none is current', () => {
    // Build seasons for a year where none is current
    const items = dcItems();
    const seasons = buildSeasons({
      items,
      completions: noCompletions(),
      filings: sampleFilings,
      settings: DEFAULT_SETTINGS,
      tenantStatus: 'active',
      today: new Date('2025-06-15'), // Different year
    });

    // Even if none match, should return something
    const current = currentSeason(seasons);
    expect(current).toBeDefined();
  });
});
