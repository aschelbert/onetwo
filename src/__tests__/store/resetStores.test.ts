import { describe, it, expect } from 'vitest';
import { useFinancialStore } from '@/store/useFinancialStore';
import { resetStoresForRealTenant } from '@/store/resetStores';

describe('resetStoresForRealTenant', () => {
  it('clears the previous building\'s Stripe connection and billing settings', () => {
    // A board member of one building connected Stripe and turned on billing
    // automation; the same browser then signs in to a newly provisioned
    // building with no financial_settings row yet.
    useFinancialStore.setState({
      stripeConnectId: 'acct_previous_building',
      stripeOnboardingComplete: true,
      autoBillingEnabled: true,
      lastBillingRun: '2026-10-01',
      lateFeeEnabled: true,
      lateFeeAmount: 50,
      lateFeeGraceDays: 5,
      lastLateFeeRun: '2026-10-16',
      hoaDueDay: 1,
    });

    resetStoresForRealTenant();

    const s = useFinancialStore.getState();
    expect(s.stripeConnectId).toBeNull();
    expect(s.stripeOnboardingComplete).toBe(false);
    expect(s.autoBillingEnabled).toBe(false);
    expect(s.lastBillingRun).toBeNull();
    expect(s.lateFeeEnabled).toBe(false);
    expect(s.lateFeeAmount).toBe(25);
    expect(s.lateFeeGraceDays).toBe(15);
    expect(s.lastLateFeeRun).toBeNull();
    expect(s.hoaDueDay).toBe(15);
    expect(s.units).toEqual([]);
    expect(s.unitInvoices).toEqual([]);
  });
});
