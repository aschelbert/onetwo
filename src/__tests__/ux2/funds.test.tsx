import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';

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

import FundsPage from '@/ux2/funds/FundsPage';
import { RedirectKeepQuery } from '@/ux2/shell/routes';
import PayPage from '@/ux2/funds/PayPage';

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
    expect(document.querySelector('[aria-label="Reserve contribution"]')).toBeTruthy();
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

  it('the reserve lever sets the annual contribution through the store', () => {
    renderAt('/funds?tab=planning&section=reserves');
    const before = useFinancialStore.getState().annualReserveContribution;
    fireEvent.change(screen.getByLabelText('Custom monthly contribution'), { target: { value: '3100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save contribution' }));
    expect(useFinancialStore.getState().annualReserveContribution).toBe(37200);
    useFinancialStore.getState().setAnnualReserveContribution(before);
  });

  it('Planning shows the budget table with the expected-by-now mark and the next-year draft', () => {
    renderAt('/funds?tab=planning');
    const budget = document.querySelector('[aria-label="Budget against actual"]') as HTMLElement;
    expect(within(budget).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Budget line', 'Budget', 'Spent', 'Left', 'Used', 'Status', '']);
    expect(within(budget).getByText('Where the dues go')).toBeTruthy();
    expect(screen.queryByTestId('legacy-budget')).toBeNull();
    fireEvent.click(tile(`${new Date().getFullYear() + 1} budget · decide`));
    const draft = document.querySelector('[aria-label="Next year draft"]') as HTMLElement;
    expect(within(draft).getByRole('navigation', { name: 'Dues options' })).toBeTruthy();
    expect(within(draft).getByText('Where it stands')).toBeTruthy();
  });

  it('Online payments and the gear restore the orphaned Stripe and rules screens', () => {
    renderAt('/funds?tab=payments');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Online payments');
    expect(screen.getByTestId('legacy-payments')).toBeTruthy();
    renderAt('/funds?tab=settings&section=rules');
    expect(document.querySelector('[aria-label="Billing rules"]')).toBeTruthy();
    renderAt('/funds?tab=settings&section=mailing');
    expect(screen.getByTestId('legacy-mailing')).toBeTruthy();
  });

  it('Pay wraps the production balance tab for the owner\'s unit', () => {
    const user = useAuthStore.getState().currentUser;
    renderAt('/my-unit/pay');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(`Unit ${user.linkedUnits[0]}`);
    expect(screen.getByTestId('legacy-balance').textContent).toBe(user.linkedUnits[0]);
    expect(screen.getByText('Balance')).toBeTruthy();
  });
});
