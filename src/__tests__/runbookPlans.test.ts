import { describe, expect, it } from 'vitest';
import { CATS } from '@/store/useIssuesStore';
import { RUNBOOKS } from '@/ux2/boardroom/runbooks';
import { automationLine, runbookPlan } from '@/ux2/boardroom/runbookPlans';
import { monthCloseSteps } from '@/ux2/boardroom/monthClose';
import { budgetSteps } from '@/ux2/boardroom/annualBudget';
import { onboardingSteps } from '@/ux2/boardroom/vendorOnboarding';
import { yearEndSteps } from '@/ux2/boardroom/yearEndClose';
import { disclosureSteps } from '@/ux2/boardroom/ownerDisclosure';
import { collectionsSteps } from '@/ux2/boardroom/collections';
import { insuranceSteps } from '@/ux2/boardroom/insuranceRenewal';

describe('runbook plans', () => {
  it('give every runbook named steps, and say how each automated step happens', () => {
    for (const def of RUNBOOKS) {
      const plan = runbookPlan(def);
      expect(plan.steps.length, def.id).toBeGreaterThan(0);
      expect(plan.steps.every(s => s.title && !/^Step \d+$/.test(s.title)), def.id).toBe(true);
      expect(plan.steps.filter(s => s.auto).every(s => !!s.how), def.id).toBe(true);
      if (!plan.live) expect(plan.steps.some(s => s.auto), def.id).toBe(false);
    }
  });

  it('match the steps the runbooks really put on their cases', () => {
    const len = (id: string) => runbookPlan(RUNBOOKS.find(r => r.id === id)!).steps.length;
    expect(len('month-close')).toBe(monthCloseSteps('2026-10', 1).length);
    expect(len('annual-budget')).toBe(budgetSteps({ start: '2027-01-01', end: '2027-12-31' }).length);
    expect(len('vendor-onboarding')).toBe(onboardingSteps('Apex').length);
    expect(len('year-end')).toBe(yearEndSteps({ start: '2026-01-01', end: '2026-12-31' }, 60000).length);
    expect(len('owner-disclosure')).toBe(disclosureSteps(2027).length);
    expect(len('collections')).toBe(collectionsSteps('101', 900, '2026-09-01').length);
    expect(len('insurance-renewal')).toBe(insuranceSteps({ type: 'Property', carrier: 'X', expires: '2027-01-01' }).length);
  });

  it('find every automated workflow step the runbooks tick', () => {
    for (const id of ['board-meeting', 'annual-meeting', 'move', 'reserve-study', 'elevator-inspection']) {
      const def = RUNBOOKS.find(r => r.id === id)!;
      const sit = CATS.flatMap(c => c.sits).find(s => s.id === def.sitId)!;
      expect(sit, id).toBeTruthy();
      expect(runbookPlan(def).steps.filter(s => s.auto).length, id).toBeGreaterThan(0);
    }
    expect(automationLine(RUNBOOKS.find(r => r.id === 'move')!)).toEqual({ auto: 6, total: 6, planned: false });
    expect(automationLine(RUNBOOKS.find(r => r.id === 'elections')!).planned).toBe(true);
  });
});
