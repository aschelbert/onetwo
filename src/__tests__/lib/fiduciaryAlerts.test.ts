import { describe, it, expect } from 'vitest';
import { computeFiduciaryAlerts } from '@/lib/fiduciaryAlerts';

const baseCtx = {
  insurance: [],
  reservePctFunded: 80,
  openCases: [],
  delinquentUnits: [],
  boardVotesWithoutConflictChecks: 0,
  bylawsSpendingLimit: 5000,
  pendingSpendingAboveLimit: 0,
};

describe('computeFiduciaryAlerts', () => {
  it('expired insurance → critical alert', () => {
    const alerts = computeFiduciaryAlerts({
      ...baseCtx,
      insurance: [{ type: 'General Liability', expires: '2025-01-01' }],
    });
    const ins = alerts.find(a => a.id.startsWith('ins-expired'));
    expect(ins).toBeDefined();
    expect(ins!.severity).toBe('critical');
  });

  it('insurance expiring within 60 days → critical', () => {
    const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const alerts = computeFiduciaryAlerts({
      ...baseCtx,
      insurance: [{ type: 'Property', expires: soon }],
    });
    const ins = alerts.find(a => a.id.startsWith('ins-expiring'));
    expect(ins).toBeDefined();
    expect(ins!.severity).toBe('critical');
  });

  it('reserve < 50% funded → critical', () => {
    const alerts = computeFiduciaryAlerts({
      ...baseCtx,
      reservePctFunded: 40,
    });
    const res = alerts.find(a => a.id === 'reserves-critical');
    expect(res).toBeDefined();
    expect(res!.severity).toBe('critical');
  });

  it('reserve 50-70% → warning', () => {
    const alerts = computeFiduciaryAlerts({
      ...baseCtx,
      reservePctFunded: 60,
    });
    const res = alerts.find(a => a.id === 'reserves-low');
    expect(res).toBeDefined();
    expect(res!.severity).toBe('warning');
  });

  it('delinquent units 60+ days → warning', () => {
    const alerts = computeFiduciaryAlerts({
      ...baseCtx,
      delinquentUnits: [{ number: '101', balance: 1500, daysPastDue: 90 }],
    });
    const del = alerts.find(a => a.id === 'delinquent-no-case');
    expect(del).toBeDefined();
    expect(del!.severity).toBe('warning');
  });

  it('board votes without conflict checks → critical', () => {
    const alerts = computeFiduciaryAlerts({
      ...baseCtx,
      boardVotesWithoutConflictChecks: 3,
    });
    const coi = alerts.find(a => a.id === 'votes-no-coi');
    expect(coi).toBeDefined();
    expect(coi!.severity).toBe('critical');
  });

  it('spending above bylaws limit → critical', () => {
    const alerts = computeFiduciaryAlerts({
      ...baseCtx,
      pendingSpendingAboveLimit: 2,
    });
    const spend = alerts.find(a => a.id === 'spending-above-authority');
    expect(spend).toBeDefined();
    expect(spend!.severity).toBe('critical');
  });
});
