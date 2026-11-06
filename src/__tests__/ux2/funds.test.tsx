import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { _resetUx2ForTests, setUx2Flags } from '@/ux2/flags';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';

vi.mock('@/components/TenantProvider', () => ({
  useTenantContext: () => ({ name: 'Sunny Acres', isDemo: false, status: 'active', features: {}, id: 't1' }),
}));
vi.mock('@/features/financial/FinancialPage', () => ({ default: () => <div data-testid="legacy-funds">fiscal lens</div> }));
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

import FundsSwitch from '@/ux2/funds/FundsSwitch';
import PayPage from '@/ux2/funds/PayPage';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/funds" element={<FundsSwitch />} />
        <Route path="/financial" element={<FundsSwitch />} />
        <Route path="/my-unit/pay" element={<PayPage />} />
        <Route path="/my-unit" element={<div data-testid="my-unit">my unit</div>} />
        <Route path="*" element={<div data-testid="elsewhere">elsewhere</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Funds behind ux2.funds', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetUx2ForTests();
  });

  it('shows the production Fiscal Lens when the flag is off', () => {
    renderAt('/financial');
    expect(screen.getByTestId('legacy-funds')).toBeTruthy();
    renderAt('/my-unit/pay');
    expect(screen.getByTestId('my-unit')).toBeTruthy();
  });

  it('renders the Overview with the three tiles and the five sub-tabs', () => {
    setUx2Flags('funds');
    renderAt('/funds');
    expect(screen.queryByTestId('legacy-funds')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Funds');
    const nav = screen.getByRole('navigation', { name: 'Funds sections' });
    expect(within(nav).getAllByRole('button').map(b => b.textContent?.replace(/\d+ (behind|to pay|over)$/, '').trim())).toEqual(['Overview', 'Income', 'Expenses', 'Planning', 'Statements & taxes']);
    expect(screen.getByText('This month')).toBeTruthy();
    expect(screen.getByText('This year')).toBeTruthy();
    expect(screen.getByText('Ahead')).toBeTruthy();
    expect(document.querySelector('[aria-label="Done for you"]')).toBeTruthy();
  });

  it('Income opens on the unit ledger and the tiles switch the detail', () => {
    setUx2Flags('funds');
    renderAt('/funds?tab=income');
    expect(screen.getByTestId('legacy-units').textContent).toBe('fiscal');
    fireEvent.click(screen.getByRole('button', { name: /^Behind/ }));
    expect(screen.queryByTestId('legacy-units')).toBeNull();
    expect(document.querySelector('[aria-label="Behind"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Invoices/ }));
    expect(document.querySelector('[aria-label="Invoices"]')).toBeTruthy();
  });

  it('legacy Fiscal Lens tab ids deep link into the right section', () => {
    setUx2Flags('funds');
    renderAt('/funds?tab=reserves');
    expect(screen.getByTestId('legacy-reserves')).toBeTruthy();
    expect(document.querySelector('[aria-label="Reserve contribution"]')).toBeTruthy();
  });

  it('Expenses mounts WO & Invoices, Spending Decisions and the work-order list; payroll opens on demand', () => {
    setUx2Flags('funds');
    renderAt('/funds?tab=expenses');
    expect(screen.getByTestId('legacy-workorders')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Spending decisions/ }));
    expect(screen.getByTestId('legacy-approvals')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Work orders/ }));
    expect(document.querySelector('[aria-label="Work orders"]')).toBeTruthy();
    expect(screen.queryByTestId('legacy-payroll')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByTestId('legacy-payroll')).toBeTruthy();
  });

  it('the reserve lever sets the annual contribution through the store', () => {
    setUx2Flags('funds');
    renderAt('/funds?tab=planning&section=reserves');
    const before = useFinancialStore.getState().annualReserveContribution;
    fireEvent.change(screen.getByLabelText('Custom'), { target: { value: '3100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    expect(useFinancialStore.getState().annualReserveContribution).toBe(37200);
    useFinancialStore.getState().setAnnualReserveContribution(before);
  });

  it('Online payments and the gear restore the orphaned Stripe and rules screens', () => {
    setUx2Flags('funds');
    renderAt('/funds?tab=payments');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Online payments');
    expect(screen.getByTestId('legacy-payments')).toBeTruthy();
    renderAt('/funds?tab=settings&section=rules');
    expect(document.querySelector('[aria-label="Billing rules"]')).toBeTruthy();
    renderAt('/funds?tab=settings&section=mailing');
    expect(screen.getByTestId('legacy-mailing')).toBeTruthy();
  });

  it('Pay wraps the production balance tab for the owner\'s unit', () => {
    setUx2Flags('funds');
    const user = useAuthStore.getState().currentUser;
    renderAt('/my-unit/pay');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(`Unit ${user.linkedUnits[0]}`);
    expect(screen.getByTestId('legacy-balance').textContent).toBe(user.linkedUnits[0]);
    expect(screen.getByText('Balance')).toBeTruthy();
  });
});
