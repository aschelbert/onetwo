import { describe, it, expect } from 'vitest';
import { computeBoardHealth, computeStreaks, computeBadges, type HealthInputs } from '@/lib/boardHealth';

const today = new Date('2026-06-15');

function makeInputs(overrides: Partial<HealthInputs> = {}): HealthInputs {
  return {
    runbookItems: [
      { id: 'g1', due: '2026-12-31', critical: false, scope: 'governance' },
      { id: 'g2', due: '2026-12-31', critical: false, scope: 'governance' },
      { id: 'f1', due: '2026-12-31', critical: true, scope: 'financial' },
      { id: 'i1', due: '2026-12-31', critical: false, scope: 'insurance' },
    ],
    completions: { g1: true, g2: true, f1: true, i1: true },
    filings: [
      { status: 'filed', dueDate: '2026-03-15', filedDate: '2026-03-10' },
      { status: 'filed', dueDate: '2026-06-30', filedDate: '2026-06-01' },
    ],
    collectionRate: 95,
    reservePctFunded: 75,
    monthsClosedOnTime: 12,
    meetings: [
      { date: '2026-01-15', status: 'COMPLETED', noticeSentAt: '2026-01-10', minutesApprovedAt: '2026-01-18', quorumMet: true },
      { date: '2026-03-15', status: 'COMPLETED', noticeSentAt: '2026-03-10', minutesApprovedAt: '2026-03-18', quorumMet: true },
    ],
    proofCoverage: 0.9,
    documentsCurrentPct: 80,
    reportsGeneratedPct: 80,
    today,
    ...overrides,
  };
}

describe('computeBoardHealth', () => {
  it('all complete scores 100', () => {
    const inputs = makeInputs({
      collectionRate: 100,
      reservePctFunded: 100,
      monthsClosedOnTime: 12,
      proofCoverage: 1,
      documentsCurrentPct: 100,
      reportsGeneratedPct: 100,
    });
    const result = computeBoardHealth(inputs);
    expect(result.score).toBe(100);
    expect(result.compliance).toBe(100);
    expect(result.financial).toBe(100);
    expect(result.governance).toBe(100);
    expect(result.records).toBe(100);
  });

  it('missing monthsClosedOnTime redistributes weight', () => {
    const inputs = makeInputs({ monthsClosedOnTime: 0 });
    const result = computeBoardHealth(inputs);
    // monthsClosedOnTime = 0 but collectionRate > 0, so the line is dropped (max=0)
    // Score should still be computed from remaining lines
    const closedLine = result.breakdown.find(b => b.label === 'Books closed on time');
    expect(closedLine).toBeDefined();
    expect(closedLine!.max).toBe(0);
    expect(closedLine!.detail).toContain('redistributed');
    // Score should not be 0 since other components have values
    expect(result.score).toBeGreaterThan(0);
  });

  it('critical item overdue costs double', () => {
    // All items completed except the critical one which is overdue
    const inputs = makeInputs({
      runbookItems: [
        { id: 'g1', due: '2026-12-31', critical: false, scope: 'governance' },
        { id: 'f1', due: '2026-01-01', critical: true, scope: 'financial' }, // overdue
        { id: 'i1', due: '2026-12-31', critical: false, scope: 'insurance' },
      ],
      completions: { g1: true, f1: false, i1: true },
    });
    const resultCritical = computeBoardHealth(inputs);

    // Compare with non-critical item overdue
    const inputsNonCritical = makeInputs({
      runbookItems: [
        { id: 'g1', due: '2026-12-31', critical: false, scope: 'governance' },
        { id: 'f1', due: '2026-01-01', critical: false, scope: 'financial' }, // overdue but not critical
        { id: 'i1', due: '2026-12-31', critical: false, scope: 'insurance' },
      ],
      completions: { g1: true, f1: false, i1: true },
    });
    const resultNonCritical = computeBoardHealth(inputsNonCritical);

    // The critical overdue should have a lower compliance score
    expect(resultCritical.compliance).toBeLessThan(resultNonCritical.compliance);
  });

  it('badge fully_insured earned only with all insurance policies current', () => {
    const badgesAll = computeBadges(makeInputs());
    const fullyInsured = badgesAll.find(b => b.id === 'fully_insured');
    expect(fullyInsured).toBeDefined();
    expect(fullyInsured!.earned).toBe(true);

    // Missing insurance completion
    const badgesMissing = computeBadges(makeInputs({
      completions: { g1: true, g2: true, f1: true, i1: false },
    }));
    const notInsured = badgesMissing.find(b => b.id === 'fully_insured');
    expect(notInsured).toBeDefined();
    expect(notInsured!.earned).toBe(false);
  });

  it('returns breakdown lines', () => {
    const result = computeBoardHealth(makeInputs());
    expect(result.breakdown.length).toBeGreaterThan(0);
    for (const line of result.breakdown) {
      expect(line.points).toBeLessThanOrEqual(line.max);
      expect(line.points).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('computeStreaks', () => {
  it('returns all streak types', () => {
    const streaks = computeStreaks(makeInputs());
    expect(streaks.length).toBe(5);
    const labels = streaks.map(s => s.label);
    expect(labels).toContain('months_nothing_overdue');
    expect(labels).toContain('meetings_noticed_on_time');
    expect(labels).toContain('minutes_within_7_days');
    expect(labels).toContain('books_closed_by_10th');
    expect(labels).toContain('dcra_on_time_years');
  });

  it('meetings_noticed_on_time counts consecutive', () => {
    const streaks = computeStreaks(makeInputs());
    const s = streaks.find(s => s.label === 'meetings_noticed_on_time');
    expect(s!.count).toBe(2);
    expect(s!.brokenOn).toBeUndefined();
  });
});

describe('computeBadges', () => {
  it('returns all badge ids', () => {
    const badges = computeBadges(makeInputs());
    const ids = badges.map(b => b.id);
    expect(ids).toContain('fully_insured');
    expect(ids).toContain('reserve_ready');
    expect(ids).toContain('clean_books');
    expect(ids).toContain('clean_minutes');
    expect(ids).toContain('budget_adopted');
    expect(ids).toContain('on_time_x12');
    expect(ids).toContain('zero_delinquency');
    expect(ids).toContain('full_season');
  });

  it('reserve_ready earned when above 70%', () => {
    const badges = computeBadges(makeInputs({ reservePctFunded: 80 }));
    expect(badges.find(b => b.id === 'reserve_ready')!.earned).toBe(true);
  });

  it('reserve_ready not earned when below 70%', () => {
    const badges = computeBadges(makeInputs({ reservePctFunded: 50 }));
    expect(badges.find(b => b.id === 'reserve_ready')!.earned).toBe(false);
  });

  it('zero_delinquency earned at 100% collection', () => {
    const badges = computeBadges(makeInputs({ collectionRate: 100 }));
    expect(badges.find(b => b.id === 'zero_delinquency')!.earned).toBe(true);
  });
});
