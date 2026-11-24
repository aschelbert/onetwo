import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useComplianceStore } from '@/store/useComplianceStore';

vi.mock('@/components/TenantProvider', () => ({
  useTenantContext: () => ({ name: 'Sunny Acres', isDemo: false, status: 'active', features: {}, id: 't1' }),
}));
// The production tab components are heavy; the switcher tests only need to know which one is mounted.
vi.mock('@/features/building/tabs/TheUnitsTab', () => ({ default: ({ variant }: { variant?: string }) => <div data-testid="legacy-units">{variant}</div> }));
vi.mock('@/features/financial/tabs/FLWorkOrders', () => ({ default: () => <div data-testid="legacy-workorders" /> }));
vi.mock('@/features/financial/tabs/FLApprovals', () => ({ default: () => <div data-testid="legacy-approvals" /> }));
vi.mock('@/features/financial/tabs/FLBudget', () => ({ default: () => <div data-testid="legacy-budget" /> }));
vi.mock('@/features/financial/tabs/FLReserves', () => ({ default: () => <div data-testid="legacy-reserves" /> }));
vi.mock('@/features/financial/tabs/FLReports', () => ({ default: () => <div data-testid="legacy-reports" /> }));
vi.mock('@/features/financial/tabs/FLChartOfAccounts', () => ({ default: () => <div data-testid="legacy-coa" /> }));
vi.mock('@/features/financial/tabs/FLGeneralLedger', () => ({ default: () => <div data-testid="legacy-ledger" /> }));
vi.mock('@/features/building/tabs/PaymentsManager', () => ({ default: () => <div data-testid="legacy-payments" /> }));
vi.mock('@/features/building/tabs/FeeScheduleTab', () => ({ default: () => <div data-testid="legacy-fees" /> }));
vi.mock('@/features/building/tabs/MailingSettingsTab', () => ({ default: () => <div data-testid="legacy-mailing" /> }));
vi.mock('@/features/association-team/tabs/PayrollTab', () => ({ default: () => <div data-testid="legacy-payroll" /> }));
vi.mock('@/features/unit-manager/tabs/MyBalanceTab', () => ({ default: ({ activeUnit }: { activeUnit: { number: string } }) => <div data-testid="legacy-balance">{activeUnit.number}</div> }));

const emailUnitInvoice = vi.fn();
vi.mock('@/lib/services/invoicing', async orig => ({ ...(await orig<typeof import('@/lib/services/invoicing')>()), emailUnitInvoice: (...a: unknown[]) => emailUnitInvoice(...a) }));

import FundsPage from '@/ux2/funds/FundsPage';
import { RedirectKeepQuery } from '@/ux2/shell/routes';
import PayPage from '@/ux2/funds/PayPage';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useBudgetDraftStore } from '@/store/useBudgetDraftStore';
import { budgetSteps } from '@/ux2/boardroom/annualBudget';
import { nextFiscalYear } from '@/ux2/boardroom/fiscal';
import { todayIso } from '@/ux2/runbook/adapters';

/** The tile acting as a button at the top of a tab, by the start of its label. */
const tile = (label: string) => Array.from(document.querySelectorAll('[role="button"][data-tone]')).find(el => el.textContent?.startsWith(label)) as HTMLElement;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/funds" element={<FundsPage />} />
        <Route path="/financial" element={<RedirectKeepQuery to="/funds" />} />
        <Route path="/my-unit/pay" element={<PayPage />} />
        <Route path="/my-unit" element={<div data-testid="my-unit">my unit</div>} />
        <Route path="*" element={<div data-testid="elsewhere">elsewhere</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Funds', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('the old /financial path redirects into Funds and keeps its tab', () => {
    renderAt('/financial?tab=reserves');
    expect(document.querySelector('[aria-label="Reserves"]')).toBeTruthy();
  });

  it('renders the Overview with the three tiles and the five sub-tabs', () => {
    renderAt('/funds');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Funds');
    const nav = screen.getByRole('navigation', { name: 'Funds sections' });
    expect(within(nav).getAllByRole('button').map(b => b.textContent?.replace(/\d+ (behind|to pay|over)$/, '').trim())).toEqual(['Overview', 'Income', 'Expenses', 'Planning', 'Statements & taxes']);
    expect(screen.getByText('This month')).toBeTruthy();
    expect(screen.getByText('This year')).toBeTruthy();
    expect(screen.getByText('Ahead')).toBeTruthy();
    expect(document.querySelector('[aria-label="Done for you"]')).toBeTruthy();
  });

  it('Income opens on the unit ledger table and the tiles switch the detail', () => {
    renderAt('/funds?tab=income');
    const ledger = document.querySelector('[aria-label="Unit ledger"]')!;
    expect(ledger).toBeTruthy();
    expect(within(ledger as HTMLElement).getByRole('navigation', { name: 'Filter units' })).toBeTruthy();
    expect(within(ledger as HTMLElement).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Unit', 'Owner', 'Monthly', 'Balance', 'Fees / SA', 'Status', 'Last payment', '']);
    expect(screen.queryByTestId('legacy-units')).toBeNull();
    fireEvent.click(tile('Behind'));
    expect(document.querySelector('[aria-label="Unit ledger"]')).toBeNull();
    expect(document.querySelector('[aria-label="Behind"]')).toBeTruthy();
    fireEvent.click(tile('Invoices'));
    const inv = document.querySelector('[aria-label="Invoices"]') as HTMLElement;
    expect(within(inv).getByRole('navigation', { name: 'Filter invoices' })).toBeTruthy();
    expect(within(inv).getByRole('button', { name: 'New invoice' })).toBeTruthy();
  });

  it('Email this invoice in the row menu sends the open invoice again for what is still owed', async () => {
    emailUnitInvoice.mockReset();
    emailUnitInvoice.mockResolvedValue({ sent: true, payLink: true });
    const fin = useFinancialStore.getState();
    const unit = fin.units.find(u => u.email) ?? fin.units[0];
    const invoice = fin.createUnitInvoice(unit.number, 'fee', 900, 'Repair charge · door closer');
    useFinancialStore.setState(st => ({ unitInvoices: st.unitInvoices.map(x => (x.id === invoice.id ? { ...x, status: 'sent', paidAmount: 300 } : x)) }));
    renderAt('/funds?tab=income&section=invoices');
    const inv = document.querySelector('[aria-label="Invoices"]') as HTMLElement;
    fireEvent.click(within(inv).getByRole('button', { name: `More for ${invoice.id}` }));
    fireEvent.click(within(inv).getByRole('menuitem', { name: 'Email this invoice' }));
    expect(emailUnitInvoice).toHaveBeenCalledTimes(1);
    expect(emailUnitInvoice.mock.calls[0][0]).toMatchObject({ id: invoice.id, unitNumber: unit.number, amount: 600 });
    expect((await within(inv).findByRole('status')).textContent).toContain('with a new link to pay online');
  });

  it('a payment recorded from the ledger form posts through the store', () => {
    renderAt('/funds?tab=income');
    const unit = useFinancialStore.getState().units[0];
    const before = unit.payments.length;
    const ledger = document.querySelector('[aria-label="Unit ledger"]') as HTMLElement;
    fireEvent.click(within(ledger).getByRole('button', { name: 'Record a payment' }));
    const form = screen.getByRole('form', { name: 'Record a payment' });
    fireEvent.change(within(form).getByLabelText('Amount'), { target: { value: '125' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Record' }));
    expect(useFinancialStore.getState().units.find(u => u.number === unit.number)!.payments.length).toBe(before + 1);
  });

  it('legacy Fiscal Lens tab ids deep link into the right section', () => {
    renderAt('/funds?tab=reserves');
    expect(screen.queryByTestId('legacy-reserves')).toBeNull();
    expect(document.querySelector('[aria-label="Reserves"]')).toBeTruthy();
    expect(document.querySelector('[data-reserve-components]')).toBeTruthy();
    expect(document.querySelector('[data-reserve-levels]')).toBeTruthy();
    renderAt('/funds?tab=budget');
    expect(document.querySelector('[aria-label="Budget against actual"]')).toBeTruthy();
  });

  it('Expenses shows the Bills table, the decisions deck and the work orders table; payroll opens from the vendors row', () => {
    renderAt('/funds?tab=expenses');
    const billsCard = document.querySelector('[aria-label="Bills"]') as HTMLElement;
    expect(billsCard).toBeTruthy();
    expect(within(billsCard).getByRole('navigation', { name: 'Filter bills' })).toBeTruthy();
    expect(screen.queryByTestId('legacy-workorders')).toBeNull();
    fireEvent.click(tile('Spending decisions'));
    const deck = document.querySelector('[aria-label="Spending decisions"]') as HTMLElement;
    expect(within(deck).getByText('Know before you decide')).toBeTruthy();
    expect(within(deck).getByRole('button', { name: 'Approve and next' })).toBeTruthy();
    expect(screen.queryByTestId('legacy-approvals')).toBeNull();
    fireEvent.click(tile('Work orders'));
    const wo = document.querySelector('[aria-label="Work orders"]') as HTMLElement;
    expect(within(wo).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Work order', 'Vendor', 'Budget line', 'Amount', 'Opened', 'Status', '', '']);
    expect(screen.queryByTestId('legacy-payroll')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Payroll and 1099s' }));
    expect(screen.getByTestId('legacy-payroll')).toBeTruthy();
  });

  it('approving a draft work order from its row moves it through the store', () => {
    renderAt('/funds?tab=expenses&section=workorders');
    const draft = useFinancialStore.getState().workOrders.find(w => w.status === 'draft');
    expect(draft).toBeTruthy();
    const wo = document.querySelector('[aria-label="Work orders"]') as HTMLElement;
    const row = within(wo).getByText(draft!.title).closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Approve' }));
    expect(useFinancialStore.getState().workOrders.find(w => w.id === draft!.id)!.status).toBe('approved');
  });

  it('picking a contribution level on the screen changes nothing by itself: it opens a reserve funding review', () => {
    renderAt('/funds?tab=planning&section=reserves');
    const before = useFinancialStore.getState().annualReserveContribution;
    const row = document.querySelector('[data-level="never-short"]') as HTMLElement;
    expect(row).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: 'Take to a review' }));
    expect(useFinancialStore.getState().annualReserveContribution).toBe(before);
    expect(useActionRecordsStore.getState().records.some(r => r.kind === 'reserve-review' && !r.closedOn)).toBe(true);
    expect(useIssuesStore.getState().cases.some(c => (c.sourceId ?? '').startsWith('reserve-funding-review:'))).toBe(true);
  });

  it('Planning shows the budget table with the expected-by-now mark and the next-year draft', () => {
    renderAt('/funds?tab=planning');
    const budget = document.querySelector('[aria-label="Budget against actual"]') as HTMLElement;
    expect(within(budget).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Budget line', 'Budget', 'Spent', 'Expected by now', 'Used', 'Status', '']);
    expect(within(budget).getByText('Where the dues go')).toBeTruthy();
    expect(screen.queryByTestId('legacy-budget')).toBeNull();
    fireEvent.click(tile(`${new Date().getFullYear() + 1} budget`));
    const draft = document.querySelector('[aria-label="Next year draft"]') as HTMLElement;
    // Before the draft starts: a first look from this year, and a way to start it or carry on.
    expect(within(draft).getByText('A first look, from this year')).toBeTruthy();
    expect(within(draft).getByRole('button', { name: /^(Start it now|Continue the budget|Open the budget)$/ })).toBeTruthy();
  });

  it('Planning: an open budget action with no draft yet shows where it is, not a date already past', () => {
    const cases = useIssuesStore.getState().cases;
    const drafts = useBudgetDraftStore.getState().drafts;
    const fy = nextFiscalYear(todayIso(), useBuildingStore.getState().details?.fiscalYearEnd);
    useIssuesStore.setState({ cases: [{ id: 'b1', catId: 'financial', sitId: 'runbook-annual-budget', title: 'Annual budget', unit: '', owner: '', approach: 'pre', status: 'open', priority: 'high', created: todayIso(), notes: '', steps: budgetSteps(fy).map((x, i) => ({ id: `s${i}`, s: x.s, done: i === 0, doneDate: null, userNotes: '' })), linkedWOs: [], linkedLetterIds: [], linkedInvoiceIds: [], linkedMeetingIds: [], attachments: [], boardVotes: null, additionalApproaches: [], comms: [], source: 'runbook', sourceId: `annual-budget:${fy.start}` } as never] });
    useBudgetDraftStore.setState({ drafts: {} });
    try {
      renderAt('/funds?tab=planning&section=draft');
      const draft = document.querySelector('[aria-label="Next year draft"]') as HTMLElement;
      expect(within(draft).getByText('Where it is')).toBeTruthy();
      expect(within(draft).getByText(/Step 2 of 10/)).toBeTruthy();
      expect(within(draft).queryByText(/runbook opens on/)).toBeNull();
      fireEvent.click(within(draft).getByRole('button', { name: 'Continue the budget' }));
      expect(screen.getByTestId('elsewhere')).toBeTruthy();
    } finally {
      useIssuesStore.setState({ cases });
      useBudgetDraftStore.setState({ drafts });
    }
  });

  it('Online payments shows the collected, payouts and fees tiles, the payments table, the Stripe card and the setup runbook', () => {
    renderAt('/funds?tab=payments');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Online payments');
    expect(screen.queryByTestId('legacy-payments')).toBeNull();
    expect(document.querySelector('[aria-label="Recent payments"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Stripe account"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="What owners can pay here"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Get paid online"]')).toBeTruthy();
    const sw = screen.getByRole('switch', { name: 'Pass card fees to the owner' });
    fireEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });

  it('Billing rules sets the Tasker job limit, up to the bylaws spending limit', () => {
    useFinancialStore.setState({ taskerLimit: 300 });
    useBuildingStore.setState(s => ({ bylawsConfig: { ...s.bylawsConfig, boardSpendingLimit: 5000 } }));
    renderAt('/funds?tab=settings&section=rules');
    const card = document.querySelector('[aria-label="Tasker job limit"]') as HTMLElement;
    expect(card.textContent).toContain('up to $300 without a vote');
    fireEvent.change(within(card).getByLabelText('Dollars per job'), { target: { value: '6000' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Save' }));
    expect(useFinancialStore.getState().taskerLimit).toBe(300);
    expect(within(card).getByRole('alert').textContent).toContain('$0 to $5,000');
    fireEvent.change(within(card).getByLabelText('Dollars per job'), { target: { value: '500' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Save' }));
    expect(useFinancialStore.getState().taskerLimit).toBe(500);
    expect(card.textContent).toContain('up to $500 without a vote');
    expect(within(card).queryByRole('alert')).toBeNull();
  });

  it('Billing rules shows the day the month close starts and saves a new one', () => {
    useFinancialStore.setState({ monthCloseStartDay: 1 });
    renderAt('/funds?tab=settings&section=rules');
    const card = document.querySelector('[aria-label="Month close start"]') as HTMLElement;
    expect(card.textContent).toContain('Month close starts on the 1st');
    fireEvent.change(within(card).getByLabelText('Day of the month (1–28)'), { target: { value: '10' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Save' }));
    expect(useFinancialStore.getState().monthCloseStartDay).toBe(10);
    expect(card.textContent).toContain('Month close starts on the 10th');
    fireEvent.change(within(card).getByLabelText('Day of the month (1–28)'), { target: { value: '31' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Save' }));
    expect(useFinancialStore.getState().monthCloseStartDay).toBe(10);
    fireEvent.click(within(card).getByRole('button', { name: 'Runbook' }));
    expect(screen.getByTestId('elsewhere')).toBeTruthy();
  });

  it('the ledger says who posted each entry', () => {
    const before = useFinancialStore.getState().generalLedger;
    const today = new Date().toISOString().slice(0, 10);
    useFinancialStore.setState({ generalLedger: [{ id: 'GL9001', date: today, memo: 'Bank service fee', debitAcct: '5070', creditAcct: '1010', amount: 18, source: 'manual', sourceId: null, posted: today, postedBy: 'Dana Carter', status: 'posted' }] });
    renderAt('/funds?tab=settings&section=ledger');
    const row = document.querySelector('tr[data-entry="GL9001"]') as HTMLElement;
    expect(row.textContent).toContain('posted by Dana Carter');
    useFinancialStore.setState({ generalLedger: before });
  });

  it("Who can do what opens from its own address and holds the board's switches", () => {
    renderAt('/funds?tab=settings&section=controls');
    expect(screen.getAllByRole('switch').map(x => x.getAttribute('aria-label'))).toEqual(expect.arrayContaining(['A bill needs two people', 'A month needs signed reconciliations before its books close']));
  });

  it('Accounts and ledger has six pages under the gear; a deep link opens the page that holds its card', () => {
    renderAt('/funds?tab=settings&section=rules');
    const nav = screen.getByRole('navigation', { name: 'Accounts and ledger sections' });
    expect(within(nav).getAllByRole('button').map(b => b.textContent)).toEqual(['Ledger', 'Chart of Accounts', 'GL mapping', 'Fees & Billing', 'Bank & Mail', 'Who can do what']);
    // ?section=rules lands on Fees & Billing: the fee schedule and billing rules, nothing from the other pages.
    expect(document.querySelector('[aria-label="Billing rules"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Fee schedule"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Ledger"]')).toBeNull();
    expect(document.querySelector('[aria-label="Chart of accounts"]')).toBeNull();
    expect(screen.queryByTestId('legacy-mailing')).toBeNull();

    fireEvent.click(within(nav).getByRole('button', { name: 'Ledger' }));
    expect(document.querySelector('[aria-label="Ledger"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Opening balances"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Billing rules"]')).toBeNull();
    const before = useFinancialStore.getState().generalLedger.length;
    fireEvent.click(screen.getByRole('button', { name: 'Moved money to reserves' }));
    const form = screen.getByRole('form', { name: 'Moved money to reserves' });
    fireEvent.change(within(form).getByLabelText('Amount'), { target: { value: '2400' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Post' }));
    const gl = useFinancialStore.getState().generalLedger;
    expect(gl.length).toBe(before + 1);
    expect(gl[gl.length - 1]).toMatchObject({ debitAcct: '1020', creditAcct: '1010', amount: 2400, source: 'transfer' });

    fireEvent.click(within(nav).getByRole('button', { name: 'Chart of Accounts' }));
    const chart = document.querySelector('[aria-label="Chart of accounts"]') as HTMLElement;
    expect(chart).toBeTruthy();
    // The chart is grouped under its section rows, each account showing its fund.
    const sectionRows = Array.from(chart.querySelectorAll('tr[data-section]')).map(r => r.getAttribute('data-section'));
    expect(sectionRows).toEqual(['1000', '2000', '3000', '4000', '5000', '6000']);
    expect(within(chart).getByText(/1000 · Assets · Owns/)).toBeTruthy();
    expect(within(chart.querySelector('tr[data-account="1020"]') as HTMLElement).getByText('Reserve')).toBeTruthy();
    expect(within(chart.querySelector('tr[data-account="1010"]') as HTMLElement).getByText('Operating')).toBeTruthy();

    fireEvent.click(within(nav).getByRole('button', { name: 'GL mapping' }));
    expect(document.querySelector('[aria-label="Where things post"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Chart of accounts"]')).toBeNull();

    fireEvent.click(within(nav).getByRole('button', { name: 'Bank & Mail' }));
    expect(document.querySelector('[aria-label="Bank and payments"]')).toBeTruthy();
    expect(screen.getByTestId('legacy-mailing')).toBeTruthy();
  });

  it('Accounts and ledger opens on the Ledger page without a section, and ?section=opening opens the opening balances', () => {
    renderAt('/funds?tab=settings');
    expect(document.querySelector('[aria-label="Ledger"]')).toBeTruthy();
    cleanup();
    renderAt('/funds?tab=settings&section=opening');
    expect(document.querySelector('[aria-label="Ledger"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide' })).toBeTruthy();
  });

  it('Statements shows the balance sheet, income statement, packets, filings and accountant cards; a packet posts as a notice', () => {
    renderAt('/funds?tab=statements');
    expect(screen.queryByTestId('legacy-reports')).toBeNull();
    // One card holds every statement; the two older cards are gone.
    expect(document.querySelector('[aria-label="Balance sheet"]')).toBeNull();
    expect(document.querySelector('[aria-label="Income statement"]')).toBeNull();
    expect(document.querySelector('[aria-label="Monthly statement packets"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Taxes and filings"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Accountant access"]')).toBeTruthy();
    // The balance sheet shows both funds and ties.
    const bs = document.querySelector('[aria-label="Statements for a period"]') as HTMLElement;
    expect(within(bs).getAllByRole('columnheader').map(h => h.textContent?.trim())).toEqual(['', 'Operating', 'Reserve', 'Total']);
    expect(within(bs).getByText('Owns − owes = fund balances ✓')).toBeTruthy();
    // It is dated at the end of the period chosen: last month's end to start with, today for the year to date.
    const asOf = () => bs.querySelector('[data-balance-as-of]')!.getAttribute('data-balance-as-of')!;
    const lastMonthEnd = asOf();
    expect(lastMonthEnd < new Date().toISOString().slice(0, 10)).toBe(true);
    fireEvent.click(within(bs).getByRole('button', { name: 'Year to date' }));
    expect(asOf() > lastMonthEnd).toBe(true);
    fireEvent.click(within(bs).getByRole('button', { name: 'Operating statement' }));
    expect(within(bs).getByText('Net operating income')).toBeTruthy();
    const send = screen.queryAllByRole('button', { name: 'Send to owners' })[0];
    if (send) {
      const before = useComplianceStore.getState().announcements.length;
      fireEvent.click(send);
      expect(useComplianceStore.getState().announcements.length).toBe(before + 1);
    }
  });

  it('Pay wraps the production balance tab for the owner\'s unit', () => {
    const user = useAuthStore.getState().currentUser;
    renderAt('/my-unit/pay');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(`Unit ${user.linkedUnits[0]}`);
    expect(screen.getByTestId('legacy-balance').textContent).toBe(user.linkedUnits[0]);
    expect(screen.getByText('Balance')).toBeTruthy();
  });
});
