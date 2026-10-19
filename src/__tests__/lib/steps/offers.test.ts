import { describe, it, expect } from 'vitest';
import { buildOffers, type BuildOffersInput, type Approval, type ReserveItem } from '@/lib/steps/offers';
import { DEFAULT_SETTINGS } from '@/lib/buildingSettings';
import type { CaseTrackerCase } from '@/types/issues';

// ── Fixtures ────────────────────────────────────────────────────────────

const today = new Date('2026-06-15');

function makeInput(overrides: Partial<BuildOffersInput> = {}): BuildOffersInput {
  return {
    delinquency: [],
    cases: [],
    approvals: [],
    settings: DEFAULT_SETTINGS,
    reserveItems: [],
    today,
    ...overrides,
  };
}

function makeCase(overrides: Partial<CaseTrackerCase> = {}): CaseTrackerCase {
  return {
    id: 'c1',
    catId: 'enforcement',
    sitId: 'covenant-violations',
    title: 'Test case',
    unit: '101',
    owner: 'Board',
    approach: 'pre',
    status: 'open',
    priority: 'medium',
    created: '2026-01-01',
    notes: '',
    steps: null,
    linkedWOs: [],
    linkedLetterIds: [],
    linkedInvoiceIds: [],
    linkedMeetingIds: [],
    attachments: [],
    boardVotes: null,
    additionalApproaches: [],
    comms: [],
    ...overrides,
  };
}

// ── Collections ──────────────────────────────────────────────────────────

describe('collections offers', () => {
  it('creates offer for unit 60+ days past due', () => {
    const input = makeInput({
      delinquency: [{ unit: '101', balance: 5000, daysPastDue: 90 }],
    });
    const offers = buildOffers(input);

    expect(offers).toHaveLength(1);
    expect(offers[0].kind).toBe('collections');
    expect(offers[0].title).toContain('Unit 101');
    expect(offers[0].roleKey).toBe('treasurer');
    expect(offers[0].situationId).toBe('delinquent-accounts');
  });

  it('skips unit under 60 days', () => {
    const input = makeInput({
      delinquency: [{ unit: '101', balance: 1000, daysPastDue: 30 }],
    });
    const offers = buildOffers(input);
    expect(offers).toHaveLength(0);
  });

  it('skips when open collections case exists for unit', () => {
    const input = makeInput({
      delinquency: [{ unit: '101', balance: 5000, daysPastDue: 90 }],
      cases: [
        makeCase({ id: 'c1', unit: '101', title: 'Collections - Unit 101', status: 'open' }),
      ],
    });
    const offers = buildOffers(input);
    expect(offers).toHaveLength(0);
  });
});

// ── Capital Project ──────────────────────────────────────────────────────

describe('capital project offers', () => {
  it('creates offer for approval above spending limit', () => {
    const input = makeInput({
      approvals: [
        { id: 'a1', title: 'Roof Replacement', amount: 50000, status: 'pending' },
      ],
    });
    const offers = buildOffers(input);

    const capitalOffer = offers.find(o => o.kind === 'capital_project');
    expect(capitalOffer).toBeDefined();
    expect(capitalOffer!.title).toContain('Roof Replacement');
    expect(capitalOffer!.roleKey).toBe('president');
  });

  it('skips approval below spending limit', () => {
    const input = makeInput({
      approvals: [
        { id: 'a1', title: 'Small repair', amount: 1000, status: 'pending' },
      ],
    });
    const offers = buildOffers(input);
    const capitalOffer = offers.find(o => o.kind === 'capital_project');
    expect(capitalOffer).toBeUndefined();
  });

  it('creates offer for reserve item with replacementYear this year', () => {
    const input = makeInput({
      reserveItems: [
        { name: 'Elevator', estimatedCost: 80000, currentFunding: 20000, replacementYear: 2026 },
      ],
    });
    const offers = buildOffers(input);

    const capitalOffer = offers.find(o => o.kind === 'capital_project');
    expect(capitalOffer).toBeDefined();
    expect(capitalOffer!.title).toContain('Elevator');
  });

  it('skips reserve item with future replacementYear', () => {
    const input = makeInput({
      reserveItems: [
        { name: 'Elevator', estimatedCost: 80000, currentFunding: 20000, replacementYear: 2030 },
      ],
    });
    const offers = buildOffers(input);
    const capitalOffer = offers.find(o => o.kind === 'capital_project');
    expect(capitalOffer).toBeUndefined();
  });
});

// ── Fine Hearing ─────────────────────────────────────────────────────────

describe('fine hearing offers', () => {
  it('creates offer for covenant case with notice 30+ days ago', () => {
    const input = makeInput({
      cases: [
        makeCase({
          id: 'cv1',
          sitId: 'covenant-violations',
          unit: '202',
          title: 'Covenant violation Unit 202',
          steps: [
            { id: 's0', s: 'Send notice to owner', done: true, doneDate: '2026-05-01', userNotes: '' },
            { id: 's1', s: 'Follow up', done: false, doneDate: null, userNotes: '' },
          ],
        }),
      ],
    });
    const offers = buildOffers(input);

    const fineOffer = offers.find(o => o.kind === 'fine_hearing');
    expect(fineOffer).toBeDefined();
    expect(fineOffer!.title).toContain('Unit 202');
    expect(fineOffer!.situationId).toBe('fine-hearings');
  });

  it('skips when notice is less than 30 days ago', () => {
    const input = makeInput({
      cases: [
        makeCase({
          id: 'cv1',
          sitId: 'covenant-violations',
          steps: [
            { id: 's0', s: 'Send notice', done: true, doneDate: '2026-06-10', userNotes: '' },
          ],
        }),
      ],
    });
    const offers = buildOffers(input);
    const fineOffer = offers.find(o => o.kind === 'fine_hearing');
    expect(fineOffer).toBeUndefined();
  });
});

// ── Special Assessment ───────────────────────────────────────────────────

describe('special assessment offers', () => {
  it('creates offer when approved spend has no funding line', () => {
    const input = makeInput({
      approvals: [
        { id: 'a2', title: 'Emergency Plumbing', amount: 25000, status: 'approved' },
      ],
      reserveItems: [],
    });
    const offers = buildOffers(input);

    const saOffer = offers.find(o => o.kind === 'special_assessment');
    expect(saOffer).toBeDefined();
    expect(saOffer!.title).toContain('Emergency Plumbing');
    expect(saOffer!.roleKey).toBe('treasurer');
  });

  it('skips when matching funding line exists', () => {
    const input = makeInput({
      approvals: [
        { id: 'a2', title: 'Emergency Plumbing', amount: 25000, status: 'approved' },
      ],
      reserveItems: [
        { name: 'Emergency Plumbing Fund', estimatedCost: 30000, currentFunding: 30000 },
      ],
    });
    const offers = buildOffers(input);
    const saOffer = offers.find(o => o.kind === 'special_assessment');
    expect(saOffer).toBeUndefined();
  });
});
