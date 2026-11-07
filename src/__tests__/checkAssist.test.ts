import { describe, expect, it } from 'vitest';
import { CATS } from '@/store/useIssuesStore';
import { resolveCheck, ROUTES } from '@/features/issues/checkAssist';

/** Situations whose cases are about one unit. */
const UNIT_SITS = ['delinquent-accounts', 'covenant-violations', 'fine-hearings', 'pet-issues', 'damage-responsibility', 'neighbor-conflicts', 'architectural-review', 'resale-certs', 'scheduled-move', 'move-disputes'];

function everyCheck() {
  const out: { sitId: string; catId: string; step: string; label: string }[] = [];
  for (const cat of CATS) for (const sit of cat.sits) for (const appr of ['pre', 'self', 'legal'] as const) {
    const steps = (sit as unknown as Record<string, { s: string; ck?: string[] }[] | undefined>)[appr] ?? [];
    for (const st of steps) for (const label of st.ck ?? []) out.push({ catId: cat.id, sitId: sit.id, step: st.s, label });
  }
  return out;
}

describe('case checklist assists', () => {
  const checks = everyCheck();

  it('covers every checklist item in every situation with a specific assist', () => {
    expect(checks.length).toBeGreaterThan(1000);
    const fallback = checks.filter(c => resolveCheck(c.label, { ...c, hasUnit: UNIT_SITS.includes(c.sitId) }).fallback);
    expect(fallback.map(f => `${f.sitId}: ${f.label}`)).toEqual([]);
  });

  it('routes only to real module destinations and official https sites', () => {
    const known = new Set<string>(Object.values(ROUTES));
    for (const c of checks) {
      for (const a of resolveCheck(c.label, { ...c, hasUnit: UNIT_SITS.includes(c.sitId) }).assists) {
        if (a.kind === 'route') expect(known.has(a.path)).toBe(true);
        if (a.kind === 'external') expect(a.href.startsWith('https://')).toBe(true);
      }
    }
  });

  it('sends the budget step to the budget drafter and its review panels', () => {
    const ctx = { catId: 'financial', sitId: 'annual-budgeting', step: 'Draft proposed budget: operating expenses + reserve contribution + contingency = total; calculate per-unit assessment', hasUnit: false };
    for (const label of ['Itemize operating expenses by category', 'Add 3-5% contingency', 'Calculate per-unit assessment']) {
      const first = resolveCheck(label, ctx).assists[0];
      expect(first).toMatchObject({ kind: 'panel', panel: 'budget-drafter' });
    }
    expect(resolveCheck('Set reserve contribution per study', ctx).assists[0]).toMatchObject({ kind: 'panel', panel: 'reserve-study' });
  });

  it('matches representative items to the right place', () => {
    const r = (label: string, sitId: string, step = '', hasUnit = false) => resolveCheck(label, { catId: '', sitId, step, hasUnit }).assists[0];
    expect(r('Itemize lien amount', 'delinquent-accounts', '', true)).toMatchObject({ panel: 'unit-ledger' });
    expect(r('State fine amount per schedule', 'fine-hearings', '', true)).toMatchObject({ panel: 'fees' });
    expect(r('Contact carrier claims department', 'insurance-claims')).toMatchObject({ panel: 'insurance' });
    expect(r('Obtain board resolution authorizing lawsuit', 'litigation')).toMatchObject({ tool: 'board-vote' });
    expect(r('Contact DC Multi-Door Dispute Resolution or private mediator', 'litigation')).toMatchObject({ panel: 'counsel' });
    expect(r('Cite specific CC&R or rule section', 'covenant-violations', '', true)).toMatchObject({ panel: 'documents' });
    expect(r('Check references for each', 'capital-projects')).toMatchObject({ panel: 'vendors' });
    expect(r('Verify GL insurance with HOA as additional insured', 'vendor-management')).toMatchObject({ panel: 'vendors' });
    expect(r('Verify workers compensation', 'vendor-management')).toMatchObject({ panel: 'vendors' });
    expect(r('Withhold remaining contract payments', 'vendor-management')).toMatchObject({ panel: 'vendors' });
    expect(r('Send certified mail with return receipt', 'covenant-violations', '', true)).toMatchObject({ tool: 'send-comm' });
    expect(r('Take dated photos or video', 'covenant-violations', '', true)).toMatchObject({ tool: 'upload-doc' });
    expect(r('State 30-day cure period', 'delinquent-accounts', 'Send formal demand letter via certified mail', true)).toMatchObject({ tool: 'send-comm' });
    expect(r('Determine if animal is ESA or service animal', 'pet-issues', '', true)).toMatchObject({ panel: 'documents' });
    expect(r('Identify first mortgage holder/servicer', 'delinquent-accounts', '', true)).toMatchObject({ panel: 'owner' });
  });
});
