import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const tenant = { name: 'Maple Court', isDemo: false, status: 'onboarding', features: {}, onboarding: { goLive: false }, updateOnboardingStep: vi.fn(async () => {}) };
vi.mock('@/components/TenantProvider', () => ({ useTenantContext: () => tenant }));

import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useSetupStore } from '@/features/setup/useSetupStore';
import { buildItems, coverage, essentials, isClear, pathFor, progress, resolve, type ReadResult, type SetupDoc } from '@/features/setup/setupModel';
import { applyItem, monthDay } from '@/features/setup/applySetup';
import { addPastedText } from '@/features/setup/readDocument';
import { invitePayload, parseInviteLines } from '@/features/setup/invites';
import { parseUnitLines, unitRange } from '@/features/setup/unitEntry';
import { extractFromPages, wordNumber } from '@/features/setup/extractText';
import { readSheet, parseCsv } from '@/features/setup/importSpreadsheet';
import SetupPage from '@/ux2/setup/SetupPage';
import SetupCard from '@/ux2/setup/SetupCard';
import ObligationsTab from '@/ux2/building/tabs/ObligationsTab';
import { useBuildingSnapshot } from '@/ux2/building/useBuildingSnapshot';

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
const ownersDoc: SetupDoc = {
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
    const items = buildItems([bylaws, rules, ownersDoc]);
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
    useBuildingStore.setState({ board: [], governingClauses: [] });
  });

  it('writes units, budget lines, board members and late-fee settings through the stores', () => {
    const items = buildItems([bylaws, rules, ownersDoc]);
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
    expect(applyItem(items.find(i => i.key === 'fact:annual_meeting_month')!)).toBe('Building › Obligations · duties and roles');
    expect(useBuildingStore.getState().governingClauses.find(c => c.heading === 'Annual meeting')).toMatchObject({ topic: 'board', text: expect.stringMatching(/^March/) });
  });

  it('imports spreadsheets by their headings, whatever they are called', () => {
    const rows = parseCsv('Maple Court owners\nUnit #,Owner Name,E-mail,% Interest,Monthly Dues\n1A,"Rivera, Ana",ana@example.com,3.85%,$412.00\n1B,Okafor James,,0.0410,439\nTOTAL,,,,851');
    const r = readSheet(rows, 'Owners');
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.docType).toBe('owner_list');
    expect(r.units.map(u => [u.unit, u.owner, u.email, u.ownershipPct, u.monthlyFee])).toEqual([['1A', 'Rivera, Ana', 'ana@example.com', 3.85, 412], ['1B', 'Okafor James', null, 0.041, 439]]);
    expect(r.units[0].quote).toMatch(/^Row 3:/);
    const budget = readSheet([['Line item', 'Proposed 2027'], ['Landscaping', '$12,000'], ['Total', '$12,000']], 'Budget');
    expect('error' in budget ? [] : budget.budget.map(b => [b.category, b.annualAmount])).toEqual([['Landscaping', 12000]]);
    expect(readSheet([['Color', 'Shape'], ['red', 'round']], 'x')).toHaveProperty('error');
  });
});

const BYLAWS = [
  ['ARTICLE III MEETINGS', 'Section 3.1. The annual meeting of the Unit Owners shall be held in March of each year.', 'Section 3.4. Notice of each meeting shall be given not less than ten (10) nor more than sixty (60) days before the meeting.', 'Section 3.6. The presence of owners holding twenty-five percent (25%) of the votes shall constitute a quorum.'],
  ['ARTICLE IV BOARD', 'Section 4.1. The Board of Directors shall consist of five (5) members.', 'Section 4.6. A majority of the directors shall constitute a quorum for the transaction of business.'],
  ['ARTICLE VI ASSESSMENTS', 'Section 6.1. Assessments shall be payable in equal monthly installments on the first day of each month.', 'Section 6.2. Any installment not paid within fifteen (15) days after the due date shall incur a late charge of twenty-five dollars ($25.00).', 'Section 8.1. The fiscal year of the Association shall begin on January 1 of each year.'],
];

describe('Reading text without AI', () => {
  it('finds the settings in bylaws, with the page and sentence', () => {
    const r = extractFromPages(BYLAWS, { title: 'Bylaws', docType: 'bylaws' });
    const fact = (k: string) => r.facts.find(f => f.key === k);
    expect(fact('annual_meeting_month')).toMatchObject({ value: 'March', page: 1 });
    expect(fact('owner_meeting_notice')).toMatchObject({ value: '10 to 60 days before the meeting', number: 10 });
    expect(fact('owner_quorum_pct')).toMatchObject({ number: 25 });
    expect(fact('board_size')).toMatchObject({ number: 5, page: 2 });
    expect(fact('board_quorum')?.value).toBe('A majority of the directors');
    expect(fact('assessment_due_day')).toMatchObject({ number: 1, value: 'the 1st of each month', page: 3 });
    expect(fact('grace_period_days')).toMatchObject({ number: 15 });
    expect(fact('late_fee')).toMatchObject({ number: 25, value: '$25 per late payment' });
    expect(fact('late_fee')?.quote).toMatch(/late charge of twenty-five dollars/);
    expect(fact('fiscal_year_end')?.value).toBe('December 31');
    expect(r.units).toEqual([]);
    expect(wordNumber('sixty-seven')).toBe(67);
    expect(wordNumber('fifteenth')).toBe(15);
  });

  it('reads tables and lists: owners, officers, budget lines and an insurance declarations page', () => {
    const owners = extractFromPages([['Unit  Owner  Percentage Interest  Email', '101  Rivera, Ana  3.85%  ana@example.com', '102  Okafor, James  4.10%  james@example.com', '103  Chen, David  3.85%']], { title: 'Owner list', docType: 'owner_list' });
    expect(owners.units.map(u => [u.unit, u.owner, u.ownershipPct, u.email])).toEqual([['101', 'Rivera, Ana', 3.85, 'ana@example.com'], ['102', 'Okafor, James', 4.1, 'james@example.com'], ['103', 'Chen, David', 3.85, null]]);

    const minutes = extractFromPages([['Minutes of the Annual Meeting, March 12, 2026', 'Ana Rivera was elected President by acclamation.', 'Treasurer: James Okafor', 'Priya Shah - Secretary']], { title: 'AGM minutes', docType: 'minutes' });
    expect(minutes.board.map(b => [b.name, b.role])).toEqual([['James Okafor', 'Treasurer'], ['Priya Shah', 'Secretary'], ['Ana Rivera', 'President']]);

    const budget = extractFromPages([['Operating Budget 2027', 'Landscaping  $12,000.00', 'Insurance  $18,500.00', 'Utilities  $21,000.00  $22,000.00', 'Total Expenses  $52,500.00']], { title: 'Budget', docType: 'budget' });
    expect(budget.budget.map(b => [b.category, b.annualAmount, b.confidence])).toEqual([['Landscaping', 12000, 'high'], ['Insurance', 18500, 'high'], ['Utilities', 22000, 'low']]);

    const ins = extractFromPages([['Commercial Property Declarations', 'Named Insured: Maple Court Condominium', 'Insurer: Acme Mutual Insurance Co.', 'Policy Number: CPP-1234567', 'Policy Period: 02/01/2026 to 02/01/2027', 'Premium: $14,250.00']], { title: 'Commercial Property Declarations', docType: 'insurance' });
    expect(ins.insurance).toEqual([expect.objectContaining({ type: 'Commercial Property', carrier: 'Acme Mutual Insurance Co.', policyNumber: 'CPP-1234567', expires: '2027-02-01', premium: 14250 })]);
  });

  it('reads the clauses of bylaws: board and officer duties, owner obligations, rules; and shows them under Duties and roles', () => {
    const pages = [
      ['ARTICLE IV', 'BOARD OF DIRECTORS', 'Section 4.1. Number. The Board of Directors shall consist of five (5) members.', 'Section 4.3. Powers and Duties. The Board shall have all powers necessary for the administration of the Association,', 'including adopting the annual budget and enforcing the rules.', 'Section 4.7. Meetings. Regular meetings of the Board shall be held quarterly.'],
      ['ARTICLE V OFFICERS', 'Section 5.4. Treasurer. The Treasurer shall keep full and accurate financial records of the Association.'],
      ['ARTICLE VII OBLIGATIONS OF UNIT OWNERS', 'Section 7.1. Maintenance and Repair. Each unit owner shall maintain and repair the interior of the unit.', 'ARTICLE VIII USE RESTRICTIONS', 'Section 8.1. Pets. No more than two (2) pets may be kept in any unit.'],
    ];
    const r = extractFromPages(pages, { title: 'Bylaws', docType: 'bylaws' });
    expect(r.clauses?.map(c => [c.topic, c.role, c.ref, c.heading, c.page])).toEqual([
      ['board', null, 'Art. IV §4.3', 'Powers and Duties', 1],
      ['officer', 'Treasurer', 'Art. V §5.4', 'Treasurer', 2],
      ['owners', null, 'Art. VII §7.1', 'Maintenance and Repair', 3],
      ['rules', null, 'Art. VIII §8.1', 'Pets', 3],
    ]);
    expect(r.clauses?.[0].text).toMatch(/including adopting the annual budget/);

    useBuildingStore.setState({ governingClauses: [] });
    const doc: SetupDoc = { id: 'b', name: 'Bylaws.pdf', size: 1, mediaType: 'application/pdf', status: 'read', addedAt: '', result: r };
    const items = buildItems([doc]);
    const treasurer = items.find(i => i.section === 'duties' && i.label === 'Treasurer duties')!;
    expect(applyItem(treasurer)).toBe('Building › Obligations · duties and roles');
    for (const it of items.filter(i => ['duties', 'obligations', 'houserules'].includes(i.section) && i !== treasurer)) applyItem(it);
    expect(useBuildingStore.getState().governingClauses.map(c => [c.topic, c.role, c.heading, c.source])).toEqual([
      ['officer', 'Treasurer', 'Treasurer', 'Bylaws p.2'], ['board', null, 'Powers and Duties', 'Bylaws p.1'], ['owners', null, 'Maintenance and Repair', 'Bylaws p.3'], ['rules', null, 'Pets', 'Bylaws p.3'],
    ]);

    function Duties() { const snap = useBuildingSnapshot(); return <ObligationsTab snap={snap} section="duties" onSection={() => {}} isBoard />; }
    render(<MemoryRouter><Duties /></MemoryRouter>);
    const card = (label: string) => document.querySelector(`[aria-label="${label}"]`) as HTMLElement;
    expect(within(card('Treasurer duties')).getByText('Art. V §5.4')).toBeTruthy();
    expect(within(card('Rules for residents')).getByText('Pets')).toBeTruthy();
    expect(within(card('The board, from your bylaws')).getByText('Powers and Duties')).toBeTruthy();
  });

  it('judges what a document holds by its content: bylaws with an ownership exhibit and use restrictions cover the owner list and the rules', () => {
    const pages = [
      ['ARTICLE VI ASSESSMENTS', 'Section 6.2. Any installment not paid within fifteen (15) days after the due date shall incur a late charge of twenty-five dollars ($25.00).'],
      ['ARTICLE VIII USE RESTRICTIONS', 'Section 8.1. Pets. No more than two (2) pets may be kept in any unit.'],
      ['Exhibit B Percentage Interests', '101  Rivera, Ana  33.34%', '102  Okafor, James  33.33%', '103  Chen, David  33.33%'],
    ];
    const r = extractFromPages(pages, { title: 'Bylaws', docType: 'bylaws' });
    expect(coverage(r).map(c => [c.kind, c.count, c.pages])).toEqual([['governing', 2, 'p.1'], ['owners', 3, 'p.3'], ['rules', 1, 'p.2']]);
    expect(pathFor('Funds › Accounts and ledger · billing rules')).toBe('/funds?tab=settings');
    expect(pathFor('Building › Obligations · duties and roles')).toBe('/building?tab=obligations&section=duties');
  });

  it('reads pasted text into items to review', () => {
    useSetupStore.getState().reset();
    addPastedText(BYLAWS.flat().join('\n'), 'bylaws', 'Bylaws excerpt');
    const doc = useSetupStore.getState().docs[0];
    expect(doc).toMatchObject({ name: 'Bylaws excerpt', status: 'read', docType: 'bylaws', pasted: true });
    expect(buildItems([doc]).find(i => i.key === 'fact:late_fee')?.fields.value[0].sources[0]).toMatchObject({ page: null, docName: 'Bylaws excerpt' });
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
    expect(within(governing).getByRole('button', { name: 'Add' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Paste text' }));
    fireEvent.change(screen.getByLabelText('Text to read'), { target: { value: BYLAWS.flat().join('\n') } });
    fireEvent.click(screen.getByRole('button', { name: 'Read it' }));
    expect(document.querySelector('[data-setup-doc="read"]')?.textContent).toMatch(/Bylaws · \d+ found to review/);
  });

  it('reviews what was found: accept the matches together, settle a disagreement, and save into the building', () => {
    useSetupStore.setState({ docs: [bylaws, rules, ownersDoc] });
    renderSetup('/setup?step=review');
    const assessment = document.querySelector('[data-widget="setup-assessment"]') as HTMLElement;
    expect(within(assessment).getByText(/Not found in anything yet:/)).toBeTruthy();
    expect(within(assessment.querySelector('[data-assess-doc="Owners.xlsx"]') as HTMLElement).getByText('Owner list')).toBeTruthy();
    // Units first: 1A matches across the owner list and bylaws; 1B (bylaws only) has no owner yet but is clear.
    fireEvent.click(screen.getByRole('button', { name: 'Accept the 2 that match' }));
    expect(useFinancialStore.getState().units.map(u => u.number).sort()).toEqual(['1A', '1B']);
    expect(document.querySelector('[data-setup-item="unit:1a"]')?.getAttribute('data-decision')).toBe('accepted');
    expect(within(document.querySelector('[data-setup-item="unit:1a"]') as HTMLElement).getByRole('link', { name: /Saved to Building › Directory · units/ }).getAttribute('href')).toBe('/building?tab=directory');

    fireEvent.click(screen.getByRole('button', { name: /Rules and money/ }));
    const late = document.querySelector('[data-setup-item="fact:late_fee"]') as HTMLElement;
    expect(within(late).getByText('Documents disagree')).toBeTruthy();
    expect(within(late).getByText('House Rules 2023 p.3')).toBeTruthy();
    fireEvent.click(within(late).getByRole('radio', { name: /10% after 15 days/ }));
    fireEvent.click(within(late).getByRole('button', { name: 'Use this' }));
    expect(useFinancialStore.getState().lateFeeAmount).toBe(10);
    expect(useSetupStore.getState().decisions['fact:late_fee']).toMatchObject({ status: 'accepted', picks: { value: 1 } });

    const faint = document.querySelector('[data-setup-item="fact:annual_meeting_month"]') as HTMLElement;
    expect(within(faint).getByText('Check the source')).toBeTruthy();
    fireEvent.click(within(faint).getByRole('button', { name: 'Skip Annual meeting' }));
    expect(useSetupStore.getState().decisions['fact:annual_meeting_month'].status).toBe('skipped');
  });

  it('assesses every document on step 2, including ones only filed, and flags readings from an earlier version', () => {
    const scan: SetupDoc = { id: 's', name: 'Bylaws-scan.pdf', size: 1, mediaType: 'application/pdf', status: 'filed', addedAt: '', docType: 'bylaws', note: 'Filed. This PDF is a scan: it has no text layer to read.' };
    const old: SetupDoc = { ...bylaws, id: 'o', name: 'Old-bylaws.pdf' };
    useSetupStore.setState({ docs: [scan, old] });
    renderSetup('/setup?step=review');
    const a = document.querySelector('[data-widget="setup-assessment"]') as HTMLElement;
    expect(within(a.querySelector('[data-assess-doc="Bylaws-scan.pdf"]') as HTMLElement).getByText(/scan: it has no text layer/)).toBeTruthy();
    expect(within(a.querySelector('[data-assess-doc="Old-bylaws.pdf"]') as HTMLElement).getByText(/Read by an earlier version of setup/)).toBeTruthy();
  });

  it('sends items accepted before they had a home in the app back to review', async () => {
    const migrate = useSetupStore.persist.getOptions().migrate!;
    const out = await migrate({ docs: [], decisions: {
      'fact:annual_meeting_month': { status: 'accepted', savedTo: 'Rules on file', at: '' },
      'fact:late_fee': { status: 'accepted', savedTo: 'Funds settings · late fees', at: '' },
      'unit:1a': { status: 'accepted', savedTo: 'Building › Directory · units', at: '' },
      'fact:pet_rule': { status: 'skipped', at: '' },
    } }, 1) as { decisions: Record<string, unknown> };
    expect(Object.keys(out.decisions).sort()).toEqual(['fact:pet_rule', 'unit:1a']);
  });

  it('adds people to invite with a role and unit, one at a time or from a pasted list', () => {
    useFinancialStore.setState({ units: [{ number: '4B', owner: 'Rivera, Ana', email: '', phone: '', monthlyFee: 400, votingPct: 50, status: 'ACTIVE', balance: 0, moveIn: null, sqft: 0, bedrooms: 0, parking: null, payments: [], lateFees: [], specialAssessments: [] }] });
    renderSetup('/setup?step=finish');
    const form = document.querySelector('[data-invite-form]') as HTMLElement;
    fireEvent.change(within(form).getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add' }));
    expect(within(form).getByRole('alert').textContent).toMatch(/Enter an email/);

    fireEvent.change(within(form).getByLabelText('Email'), { target: { value: 'Ana@Example.com' } });
    fireEvent.change(within(form).getByLabelText('Role'), { target: { value: 'board' } });
    fireEvent.change(within(form).getByLabelText('Seat'), { target: { value: 'treasurer' } });
    fireEvent.change(within(form).getByLabelText(/^Unit/), { target: { value: '4b' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add' }));
    expect(useSetupStore.getState().invites).toEqual([expect.objectContaining({ email: 'ana@example.com', access: 'board', seat: 'treasurer', unit: '4B' })]);
    expect(document.querySelector('[data-invite="ana@example.com"]')?.textContent).toMatch(/Treasurer · Unit 4B.*Not sent yet/);

    fireEvent.click(within(form).getByRole('button', { name: 'Add several at once' }));
    fireEvent.change(within(form).getByLabelText(/One person per line/), { target: { value: 'jo@example.com tenant unit 12\nmgr@acme.com, property manager\nno email here' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add these' }));
    expect(useSetupStore.getState().invites.map(i => [i.email, i.access, i.unit])).toEqual([['ana@example.com', 'board', '4B'], ['jo@example.com', 'resident', '12'], ['mgr@acme.com', 'property_manager', null]]);
    expect(screen.getByRole('status').textContent).toMatch(/1 line has no email/);
    expect(screen.getByRole('button', { name: 'Send 3 invitations' })).toBeTruthy();
  });

  it('adds units by hand: one, a range, or a pasted list, then edits and removes them', () => {
    renderSetup('/setup?step=finish');
    const ed = document.querySelector('[data-units-editor]') as HTMLElement; // open by default with no units
    fireEvent.change(within(ed).getByLabelText('Unit'), { target: { value: '4b' } });
    fireEvent.change(within(ed).getByLabelText('Owner'), { target: { value: 'Ana Rivera' } });
    fireEvent.change(within(ed).getByLabelText('Ownership %'), { target: { value: '50' } });
    fireEvent.change(within(ed).getByLabelText('Monthly $'), { target: { value: '$412' } });
    fireEvent.click(within(ed).getByRole('button', { name: 'Add unit' }));
    expect(useFinancialStore.getState().units).toEqual([expect.objectContaining({ number: '4B', owner: 'Ana Rivera', votingPct: 50, monthlyFee: 412 })]);

    fireEvent.click(within(ed).getByRole('tab', { name: 'Add a range' }));
    fireEvent.change(within(ed).getByLabelText('First unit'), { target: { value: '101' } });
    fireEvent.change(within(ed).getByLabelText('Last unit'), { target: { value: '103' } });
    fireEvent.click(within(ed).getByRole('button', { name: 'Add 3 units' }));
    expect(useFinancialStore.getState().units.map(u => u.number).sort()).toEqual(['101', '102', '103', '4B']);

    fireEvent.click(within(ed).getByRole('tab', { name: 'Paste a list' }));
    fireEvent.change(within(ed).getByLabelText(/One unit per line/), { target: { value: '101, Okafor James, james@example.com, 25%, $300\n5C  Chen David  0.25\nno unit here' } });
    fireEvent.click(within(ed).getByRole('button', { name: 'Add these units' }));
    const u = (n: string) => useFinancialStore.getState().units.find(x => x.number === n);
    expect(u('101')).toMatchObject({ owner: 'Okafor James', email: 'james@example.com', votingPct: 25, monthlyFee: 300 });
    expect(u('5C')).toMatchObject({ owner: 'Chen David', votingPct: 25 });
    expect(within(ed).getByRole('status').textContent).toMatch(/1 added, 1 updated. 1 line has no unit number/);
    expect(within(ed).getByText('Ownership adds to 100%')).toBeTruthy();

    fireEvent.change(within(ed).getByLabelText('Email for 4B'), { target: { value: 'ana@example.com' } });
    fireEvent.blur(within(ed).getByLabelText('Email for 4B'));
    expect(u('4B')?.email).toBe('ana@example.com');
    fireEvent.click(within(ed).getByRole('button', { name: 'Remove unit 103' }));
    expect(u('103')).toBeUndefined();
    expect(unitRange('1A', '1D')).toEqual(['1A', '1B', '1C', '1D']);
    expect(unitRange('A-01', 'A-03')).toEqual(['A-01', 'A-02', 'A-03']);
    expect(unitRange('101', '9')).toBeNull();
    expect(parseUnitLines('Unit,Owner,% Interest\n2A,Shah Priya,4.1%').units).toEqual([{ number: '2A', owner: 'Shah Priya', email: '', votingPct: 4.1, monthlyFee: null }]);
  });

  it('asks for a monthly amount for each unit that has none, in review and in Fill the gaps', () => {
    useSetupStore.setState({ docs: [bylaws] }); // bylaws give 1A and 1B their ownership % but no monthly amounts
    renderSetup('/setup?step=review');
    expect(screen.getByText(/2 of these units have no monthly amount/)).toBeTruthy();
    const a = document.querySelector('[data-setup-item="unit:1a"]') as HTMLElement;
    expect(within(a).getByText('No monthly amount')).toBeTruthy();
    fireEvent.change(within(a).getByLabelText('Monthly assessment for Unit 1A'), { target: { value: '$412.50' } });
    fireEvent.click(within(a).getByRole('button', { name: 'Accept' }));
    expect(useFinancialStore.getState().units.find(u => u.number === '1A')).toMatchObject({ votingPct: 50, monthlyFee: 412.5 });
    expect(document.querySelector('[data-setup-item="unit:1a"]')?.textContent).toMatch(/50% · \$412.5 a month/);
    const b = document.querySelector('[data-setup-item="unit:1b"]') as HTMLElement;
    fireEvent.click(within(b).getByRole('button', { name: 'Accept' }));
    expect(useFinancialStore.getState().units.find(u => u.number === '1B')?.monthlyFee).toBe(0);
  });

  it('keeps a monthly amount typed into a unit when the matching units are accepted together', () => {
    const third: SetupDoc = { ...bylaws, id: 'd9', result: { ...bylaws.result!, facts: [], units: [...bylaws.result!.units, { ...bylaws.result!.units[0], unit: '1C' }] } };
    useSetupStore.setState({ docs: [third] });
    renderSetup('/setup?step=review');
    fireEvent.change(screen.getByLabelText('Monthly assessment for Unit 1B'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept the 3 that match' }));
    const fee = (n: string) => useFinancialStore.getState().units.find(u => u.number === n)?.monthlyFee;
    expect([fee('1A'), fee('1B'), fee('1C')]).toEqual([0, 300, 0]);
  });

  it('sets the missing monthly amounts unit by unit, or splits a typed total by ownership %', () => {
    const unit = (number: string, votingPct: number, monthlyFee = 0) => ({ number, owner: '', email: '', phone: '', monthlyFee, votingPct, status: 'ACTIVE' as const, balance: 0, moveIn: null, sqft: 0, bedrooms: 0, parking: null, payments: [], lateFees: [], specialAssessments: [] });
    useFinancialStore.setState({ units: [unit('1A', 60), unit('1B', 40)] });
    renderSetup('/setup?step=finish');
    const gap = document.querySelector('[data-gap="assessment"]') as HTMLElement;
    const fee1a = within(gap).getByLabelText('Monthly assessment for 1A');
    fireEvent.change(fee1a, { target: { value: '500' } });
    fireEvent.blur(fee1a);
    expect(useFinancialStore.getState().units.find(u => u.number === '1A')?.monthlyFee).toBe(500);
    fireEvent.change(within(gap).getByLabelText('Total monthly assessments for the building'), { target: { value: '$1,000' } });
    fireEvent.click(within(gap).getByRole('button', { name: 'Split by ownership %' }));
    expect(useFinancialStore.getState().units.map(u => u.monthlyFee)).toEqual([600, 400]);
  });

  it('says so when going live fails instead of leaving the building half live', async () => {
    const unit = { number: '1A', owner: 'Ana Rivera', email: '', phone: '', monthlyFee: 400, votingPct: 100, status: 'ACTIVE' as const, balance: 0, moveIn: null, sqft: 0, bedrooms: 0, parking: null, payments: [], lateFees: [], specialAssessments: [] };
    useFinancialStore.setState({ units: [unit], budgetCategories: [] });
    useBuildingStore.setState({ name: 'Maple Court', address: { street: '12 Maple Ct', city: 'Washington', state: 'DC', zip: '20001' }, board: [{ id: 'b1', name: 'Ana Rivera', role: 'President', email: '', phone: '', term: '' }] });
    tenant.updateOnboardingStep.mockImplementation(async (step: string) => { if (step === 'goLive') throw new Error("The building couldn't be set live: permission denied"); });
    renderSetup('/setup?step=finish');
    fireEvent.click(screen.getByRole('button', { name: 'Go live' }));
    expect(await screen.findByText("The building couldn't be set live: permission denied")).toBeTruthy();
    expect(screen.queryByTestId('home')).toBeNull();
    tenant.updateOnboardingStep.mockImplementation(async () => {});
  });

  it('reads pasted invite lists and sends each person with their role, seat and unit', () => {
    const { invites, skipped } = parseInviteLines('4B  Ana Rivera  ana@example.com\nbo@example.com, vice president\nsam@example.com super\njust a name', ['4B', '12']);
    expect(invites.map(i => [i.email, i.access, i.seat, i.unit])).toEqual([['ana@example.com', 'owner', null, '4B'], ['bo@example.com', 'board', 'vice_president', null], ['sam@example.com', 'staff', null, null]]);
    expect(skipped).toEqual(['just a name']);
    expect(invitePayload({ email: 'Ana@Example.com', access: 'board', seat: 'treasurer', unit: '4B' })).toEqual({ email: 'ana@example.com', role: 'board_member', unit: '4B', roleKey: 'treasurer' });
    expect(invitePayload({ email: 'jo@example.com', access: 'resident', seat: null, unit: '12' })).toEqual({ email: 'jo@example.com', role: 'resident', unit: '12' });
    expect(invitePayload({ email: 'd@example.com', access: 'board', seat: 'director', unit: null })).toEqual({ email: 'd@example.com', role: 'board_member' });
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
    expect(screen.getByRole('button', { name: 'Send 1 invitation' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Go live · 2 essentials left/ })).toBeTruthy();
  });
});
