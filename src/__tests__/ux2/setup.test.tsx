import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const tenant = { name: 'Maple Court', isDemo: false, status: 'onboarding', features: {}, onboarding: { goLive: false }, updateOnboardingStep: vi.fn(async () => {}) };
vi.mock('@/components/TenantProvider', () => ({ useTenantContext: () => tenant }));

import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useSetupStore } from '@/features/setup/useSetupStore';
import { buildItems, essentials, isClear, progress, resolve, type ReadResult, type SetupDoc } from '@/features/setup/setupModel';
import { applyItem, monthDay } from '@/features/setup/applySetup';
import { payloadFor } from '@/features/setup/readDocument';
import SetupPage from '@/ux2/setup/SetupPage';
import SetupCard from '@/ux2/setup/SetupCard';

const empty = (over: Partial<ReadResult>): ReadResult => ({ docType: 'other', title: '', pageCount: null, summary: '', facts: [], units: [], board: [], insurance: [], vendors: [], budget: [], reserves: [], ...over });
const src = { page: 3, quote: 'quoted words', confidence: 'high' as const };

const bylaws: SetupDoc = {
  id: 'd1', name: 'Bylaws.pdf', size: 2_000_000, mediaType: 'application/pdf', status: 'read', addedAt: '2026-11-07',
  result: empty({
    docType: 'bylaws', title: 'Bylaws of Maple Court', pageCount: 42,
    facts: [
      { key: 'late_fee', value: '$25 per late payment', number: 25, ...src, page: 14 },
      { key: 'assessment_due_day', value: 'the 1st of each month', number: 1, ...src },
      { key: 'annual_meeting_month', value: 'March', number: null, ...src, confidence: 'low' },
    ],
    units: [{ unit: '1A', owner: '', email: null, phone: null, mailingAddress: null, ownershipPct: 50, monthlyFee: null, ...src }, { unit: '1B', owner: '', email: null, phone: null, mailingAddress: null, ownershipPct: 50, monthlyFee: null, ...src }],
  }),
};
const rules: SetupDoc = {
  id: 'd2', name: 'House Rules.pdf', size: 300_000, mediaType: 'application/pdf', status: 'read', addedAt: '2026-11-07',
  result: empty({ docType: 'rules', title: 'House Rules 2023', facts: [{ key: 'late_fee', value: '10% after 15 days', number: 10, ...src }] }),
};
const owners: SetupDoc = {
  id: 'd3', name: 'Owners.xlsx', size: 20_000, mediaType: 'text/csv', status: 'read', addedAt: '2026-11-07',
  result: empty({
    docType: 'owner_list', title: 'Owners 2026',
    units: [{ unit: 'Unit 1A', owner: 'Rivera, Ana', email: 'ana@example.com', phone: null, mailingAddress: null, ownershipPct: 50, monthlyFee: 400, ...src, page: null }],
    budget: [{ category: 'Landscaping', annualAmount: 12000, ...src }],
    board: [{ name: 'Ana Rivera', role: 'President', email: 'ana@example.com', phone: null, termEnds: '2027-03-31', ...src }],
  }),
};

describe('Setup model', () => {
  it('merges readings, flags disagreements and faint scans, and resolves picks and edits', () => {
    const items = buildItems([bylaws, rules, owners]);
    const late = items.find(i => i.key === 'fact:late_fee')!;
    expect(late.conflicts).toEqual(['value']);
    expect(late.fields.value.map(v => v.display)).toEqual(['$25 per late payment', '10% after 15 days']);
    expect(resolve(late, { value: 1 }).value).toBe(10);
    expect(resolve(late, undefined, { value: 30 }).value).toBe(30);

    // "Unit 1A" in the owner list and "1A" in the bylaws are one unit; the matching 50% is not a conflict.
    const a = items.find(i => i.key === 'unit:1a')!;
    expect(a.fields.owner[0].value).toBe('Rivera, Ana');
    expect(a.fields.ownershipPct).toHaveLength(1);
    expect(a.fields.ownershipPct[0].sources).toHaveLength(2);
    expect(isClear(a)).toBe(true);

    expect(isClear(items.find(i => i.key === 'fact:annual_meeting_month')!)).toBe(false);
    expect(items[0].section).toBe('units');
  });

  it('counts progress from documents, decisions and the four essentials', () => {
    const ess = essentials({ name: 'Maple Court', street: '1 Main St', unitCount: 2, boardCount: 0, assessedUnits: 1 });
    expect(ess).toEqual({ profile: true, units: true, board: false, assessment: false });
    expect(progress([], [], 0, { profile: false, units: false, board: false, assessment: false })).toBe(0);
    expect(progress([bylaws], buildItems([bylaws]), buildItems([bylaws]).length, { profile: true, units: true, board: true, assessment: true })).toBe(100);
    expect(monthDay('December 31')).toBe('12-31');
    expect(monthDay('2026-06-30')).toBe('06-30');
  });
});

describe('Applying accepted items', () => {
  beforeEach(() => {
    useFinancialStore.setState({ units: [], budgetCategories: [] });
    useBuildingStore.setState({ board: [] });
  });

  it('writes units, budget lines, board members and late-fee settings through the stores', () => {
    const items = buildItems([bylaws, rules, owners]);
    applyItem(items.find(i => i.key === 'unit:1a')!);
    expect(useFinancialStore.getState().units).toEqual([expect.objectContaining({ number: '1A', owner: 'Rivera, Ana', email: 'ana@example.com', votingPct: 50, monthlyFee: 400 })]);
    applyItem(items.find(i => i.key === 'unit:1a')!, undefined, { monthlyFee: 410 });
    expect(useFinancialStore.getState().units).toHaveLength(1);
    expect(useFinancialStore.getState().units[0].monthlyFee).toBe(410);

    expect(applyItem(items.find(i => i.key === 'budget:landscaping')!)).toBe('Funds › Planning · budget');
    expect(useFinancialStore.getState().budgetCategories).toEqual([expect.objectContaining({ name: 'Landscaping', budgeted: 12000 })]);

    applyItem(items.find(i => i.key === 'board:ana rivera')!);
    expect(useBuildingStore.getState().board).toEqual([expect.objectContaining({ name: 'Ana Rivera', role: 'President', term: '2027-03-31' })]);

    applyItem(items.find(i => i.key === 'fact:late_fee')!, { value: 0 });
    expect(useFinancialStore.getState()).toMatchObject({ lateFeeEnabled: true, lateFeeAmount: 25 });
    expect(applyItem(items.find(i => i.key === 'fact:annual_meeting_month')!)).toBe('Rules on file');
  });

  it('turns a CSV into text for the reader and refuses Word files', async () => {
    const csv = await payloadFor(new File(['unit,owner\n1A,Rivera'], 'owners.csv', { type: 'text/csv' }));
    expect(csv).toMatchObject({ fileName: 'owners.csv', text: 'unit,owner\n1A,Rivera' });
    expect(await payloadFor(new File(['x'], 'bylaws.docx'))).toHaveProperty('error');
  });
});

function renderSetup(path = '/setup') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/home" element={<><div data-testid="home">home</div><SetupCard /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Setup screens', () => {
  beforeEach(() => {
    localStorage.clear();
    useSetupStore.getState().reset();
    useAuthStore.setState({ currentRole: 'BOARD_MEMBER' });
    useFinancialStore.setState({ units: [], budgetCategories: [] });
    useBuildingStore.setState({ board: [], name: 'Maple Court', address: { street: '', city: '', state: '', zip: '' } });
  });

  it('shows the plum setup card on Home with the next step, and hides it to a chip', () => {
    renderSetup('/home');
    const card = document.querySelector('[data-widget="setup-card"]') as HTMLElement;
    expect(card).toBeTruthy();
    expect(within(card).getByText('Set up Maple Court')).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Start with your documents' })).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Hide for now' }));
    expect(document.querySelector('[data-widget="setup-card"]')).toBeNull();
    expect(document.querySelector('[data-widget="setup-chip"]')?.textContent).toMatch(/Setting up · \d+% · Start with your documents/);
  });

  it('opens on the documents step with what each document fills in', () => {
    renderSetup();
    expect(screen.getByText("Drop your building's documents here")).toBeTruthy();
    const governing = document.querySelector('[data-doc-kind="governing"]') as HTMLElement;
    expect(within(governing).getByText('Late fees')).toBeTruthy();
    expect(within(governing).getByRole('button', { name: 'Upload' })).toBeTruthy();
  });

  it('reviews what was found: accept the matches together, settle a disagreement, and save into the building', () => {
    useSetupStore.setState({ docs: [bylaws, rules, owners] });
    renderSetup('/setup?step=review');
    // Units first: 1A matches across the owner list and bylaws; 1B (bylaws only) has no owner yet but is clear.
    fireEvent.click(screen.getByRole('button', { name: 'Accept the 2 that match' }));
    expect(useFinancialStore.getState().units.map(u => u.number).sort()).toEqual(['1A', '1B']);
    expect(document.querySelector('[data-setup-item="unit:1a"]')?.getAttribute('data-decision')).toBe('accepted');

    fireEvent.click(screen.getByRole('button', { name: /Rules and money/ }));
    const late = document.querySelector('[data-setup-item="fact:late_fee"]') as HTMLElement;
    expect(within(late).getByText('Documents disagree')).toBeTruthy();
    expect(within(late).getByText('House Rules 2023 p.3')).toBeTruthy();
    fireEvent.click(within(late).getByRole('radio', { name: /10% after 15 days/ }));
    fireEvent.click(within(late).getByRole('button', { name: 'Use this' }));
    expect(useFinancialStore.getState().lateFeeAmount).toBe(10);
    expect(useSetupStore.getState().decisions['fact:late_fee']).toMatchObject({ status: 'accepted', picks: { value: 1 } });

    const faint = document.querySelector('[data-setup-item="fact:annual_meeting_month"]') as HTMLElement;
    expect(within(faint).getByText('Check the scan')).toBeTruthy();
    fireEvent.click(within(faint).getByRole('button', { name: 'Skip Annual meeting' }));
    expect(useSetupStore.getState().decisions['fact:annual_meeting_month'].status).toBe('skipped');
  });

  it('fills the gaps in place and only lets the building go live with the four essentials', () => {
    renderSetup('/setup?step=finish');
    const live = screen.getByRole('button', { name: /Go live · 4 essentials left/ });
    expect((live as HTMLButtonElement).disabled).toBe(true);

    const profile = document.querySelector('[data-gap="profile"]') as HTMLElement;
    fireEvent.change(within(profile).getByLabelText('Street'), { target: { value: '12 Maple Ct' } });
    fireEvent.click(within(profile).getByRole('button', { name: 'Save' }));
    expect(useBuildingStore.getState().address.street).toBe('12 Maple Ct');

    const board = document.querySelector('[data-gap="board"]') as HTMLElement;
    fireEvent.change(within(board).getByLabelText('Name'), { target: { value: 'Ana Rivera' } });
    fireEvent.change(within(board).getByLabelText('Email'), { target: { value: 'ana@example.com' } });
    fireEvent.click(within(board).getByRole('button', { name: 'Add' }));
    expect(useBuildingStore.getState().board).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Send 1 board invites' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Go live · 2 essentials left/ })).toBeTruthy();
  });
});
