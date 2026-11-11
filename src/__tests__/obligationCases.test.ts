/**
 * "Up next" obligations walk through their steps: Start opens a case (the
 * runbook's steps, or the obligation's own how-to list as a checklist), the
 * card then says Continue with progress, and closing the case as Resolved
 * marks the obligation done.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { refreshComplianceRequirements } from '@/lib/complianceRefresh';
import { resolveCheck } from '@/features/issues/checkAssist';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { OBLIGATION_SITUATIONS, caseProgress, categoryOf, obligationCase, startObligationCase, watchObligationCases } from '@/ux2/runbook/obligationCases';
import { generateCards } from '@/ux2/runbook/model';

const items = refreshComplianceRequirements({ state: 'DC', legalDocuments: [], insurance: [], boardCount: 3, hasManagement: false }).categories.flatMap(c => c.items);
const item = (id: string) => items.find(i => i.id === id)!;

beforeEach(() => {
  useIssuesStore.setState({ cases: [] });
  useComplianceStore.setState({ completions: {} });
});

describe('starting an obligation', () => {
  it('opens a case from its own how-to steps, as a checklist, then a step to record it; Start again resumes it', () => {
    const g7 = item('g7');
    const id = startObligationCase({ kind: 'obligation', id: 'g7', item: g7 })!;
    const c = useIssuesStore.getState().cases.find(x => x.id === id)!;
    expect(c).toMatchObject({ source: 'obligation', sourceId: 'g7', title: g7.task, catId: 'governance', sitId: 'obligation-g7', status: 'open' });
    expect(c.steps!.map(s => s.s)).toEqual([`Work through: ${g7.task}`, 'Record that it is done']);
    expect(c.steps![0].checks!.map(k => k.label)).toEqual(g7.howTo);
    expect(caseProgress(c)).toEqual({ done: 0, total: g7.howTo.length + 2 });
    expect(startObligationCase({ kind: 'obligation', id: 'g7', item: g7 })).toBe(id);
    expect(useIssuesStore.getState().cases).toHaveLength(1);
  });

  it('opens the runbook the case wizard has for the annual meeting and a filing, and the guided Annual budget for the budget', () => {
    const meeting = startObligationCase({ kind: 'obligation', id: 'g4', item: item('g4') })!;
    const budget = startObligationCase({ kind: 'obligation', id: 'f1', item: item('f1') })!;
    const filing = startObligationCase({ kind: 'filing', id: 'rf1', filing: { id: 'rf1', name: 'Biennial report', agency: 'DLCP', dueDate: '2026-04-01', status: 'pending', filedDate: null, confirmationNum: '', notes: '', responsible: 'Secretary', recurrence: 'biennial', attachments: [] } as never })!;
    const byId = (id: string) => useIssuesStore.getState().cases.find(c => c.id === id)!;
    expect(byId(meeting)).toMatchObject({ sitId: 'annual-meeting-planning', catId: 'governance' });
    expect(byId(budget)).toMatchObject({ sitId: 'runbook-annual-budget', catId: 'financial', source: 'runbook' });
    expect(byId(budget).sourceId).toMatch(/^annual-budget:\d{4}-\d{2}-\d{2}$/);
    // Start again, from Home or Building, resumes the same action.
    expect(startObligationCase({ kind: 'obligation', id: 'f1', item: item('f1') })).toBe(budget);
    expect(obligationCase(useIssuesStore.getState().cases, 'obligation', 'f1')?.id).toBe(budget);
    expect(byId(filing)).toMatchObject({ sitId: 'compliance-filing', source: 'filing', sourceId: 'rf1', dueDate: '2026-04-01' });
    for (const c of [meeting, budget, filing]) expect(byId(c).steps!.length).toBeGreaterThan(2);
    for (const sit of Object.values(OBLIGATION_SITUATIONS)) expect(categoryOf(sit), sit).toBeTruthy();
  });

  it('gives every how-to item a place in the app where it is done', () => {
    const misses: string[] = [];
    let total = 0;
    for (const it of items) {
      if (OBLIGATION_SITUATIONS[it.id]) continue;
      const labels = [...it.howTo, 'Upload the reviewed or adopted document to Building › Documents', 'Record the review in the next board minutes', 'Schedule the meeting and send notice', 'Attach proof that it is done'];
      for (const h of labels) {
        total++;
        if (resolveCheck(h, { catId: 'governance', sitId: `obligation-${it.id}`, step: `Work through: ${it.task}`, hasUnit: false }).fallback) misses.push(`${it.id}: ${h}`);
      }
    }
    expect(total).toBeGreaterThan(150);
    expect(misses).toEqual([]);
    const evac = resolveCheck('Review evacuation routes and assembly points', { catId: 'maintenance', sitId: 'obligation-m5', step: 'Work through: Emergency preparedness plan updated', hasUnit: false });
    expect(evac.rule).toBe('evacuation');
    expect(evac.assists.map(a => a.label)).toEqual(['Review the floor plans on file', 'Post the routes to residents']);
  });
});

describe('finishing it', () => {
  it('closing the case as Resolved marks the obligation done; withdrawing it does not', () => {
    const stop = watchObligationCases();
    try {
      const a = startObligationCase({ kind: 'obligation', id: 'g7', item: item('g7') })!;
      const b = startObligationCase({ kind: 'obligation', id: 'g9', item: item('g9') })!;
      useIssuesStore.getState().closeCaseWithReason(b, 'Withdrawn by Owner', '');
      expect(useComplianceStore.getState().completions.g9).toBeFalsy();
      useIssuesStore.getState().closeCaseWithReason(a, 'Resolved', 'Forms collected');
      expect(useComplianceStore.getState().completions.g7).toBe(true);
      expect(obligationCase(useIssuesStore.getState().cases, 'obligation', 'g7')).toBeUndefined();
    } finally { stop(); }
  });

  it('a resolved filing case marks the filing filed with the case as proof', () => {
    const stop = watchObligationCases();
    try {
      useComplianceStore.setState({ filings: [{ id: 'rf1', name: 'Biennial report', agency: 'DLCP', dueDate: '2026-04-01', status: 'pending', filedDate: null, confirmationNum: '', notes: '', responsible: 'Secretary', recurrence: 'biennial', attachments: [] } as never] });
      const id = startObligationCase({ kind: 'filing', id: 'rf1', filing: useComplianceStore.getState().filings[0] })!;
      useIssuesStore.getState().closeCase(id);
      const f = useComplianceStore.getState().filings[0];
      expect(f.status).toBe('filed');
      expect(f.confirmationNum).toMatch(/^Action /);
    } finally { stop(); }
  });
});

describe('the Up next card', () => {
  const ctx = { today: '2026-03-20', role: 'BOARD_MEMBER' as const, userId: 'u1' };
  it('says Start until a case is open, then Continue with how far along it is', () => {
    const base = { id: 'g7', task: 'Conflict of interest disclosures collected', role: 'Secretary', due: '2026-03-01', critical: false, kind: 'obligation' as const };
    const start = generateCards({ obligations: [base] }, ctx).forYou.find(c => c.refId === 'g7')!;
    expect(start.action).toEqual({ label: 'Start', path: '/obligations/start?kind=obligation&id=g7' });
    const cont = generateCards({ obligations: [{ ...base, openCase: { id: 'case-1', done: 2, total: 7 } }] }, ctx).forYou.find(c => c.refId === 'g7')!;
    expect(cont.action).toEqual({ label: 'Continue · 2 of 7', path: '/issues?view=case:case-1' });
    expect(cont.why).toContain('in progress');
    const filing = generateCards({ obligations: [{ ...base, id: 'rf1', kind: 'filing' }] }, ctx).forYou.find(c => c.refId === 'rf1')!;
    expect(filing.action).toEqual({ label: 'Start the filing', path: '/obligations/start?kind=filing&id=rf1' });
  });
});
