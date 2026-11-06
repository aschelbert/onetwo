import { describe, expect, it } from 'vitest';
import { PARITY_FLOWS, integrationFlows, regressions } from '@/ux2/parity/flows';

describe('parity manifest', () => {
  it('has unique flow ids', () => {
    const ids = PARITY_FLOWS.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never makes a flow take more steps than production', () => {
    expect(regressions().map(f => f.id)).toEqual([]);
  });

  it('covers every integration the plan names', () => {
    const kinds = new Set(integrationFlows().map(f => f.integration));
    for (const k of ['stripe', 'chargebee', 'mail', 'email', 'calendar']) expect(kinds.has(k as never)).toBe(true);
  });

  it('assigns every flow to a phase that builds it', () => {
    for (const f of PARITY_FLOWS) expect([1, 2, 3, 4, 5, 6]).toContain(f.phase);
  });
});
