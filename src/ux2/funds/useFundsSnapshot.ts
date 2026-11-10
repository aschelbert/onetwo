import { useMemo } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { fiscalYearStart } from '@/lib/ledger';
import { todayIso } from '../runbook/adapters';
import type { FundsSnapshot } from './metrics';

/** Collect the Funds snapshot from the financial store. Re-computes when a persisted slice changes. */
export function useFundsSnapshot(today: string = todayIso()): FundsSnapshot {
  const fin = useFinancialStore();
  const {
    units, unitInvoices, workOrders, reserveItems, annualReserveContribution, hoaDueDay,
    autoBillingEnabled, lastBillingRun, lateFeeEnabled, lateFeeAmount, lateFeeGraceDays,
    stripeConnectId, stripeOnboardingComplete, budgetCategories, generalLedger,
  } = fin;
  const fiscalYearEnd = useBuildingStore(s => s.details?.fiscalYearEnd) || '12-31';
  return useMemo(() => {
    const bs = fin.getBalanceSheet() as { assets: { operating: number; reserves: number } };
    const budget = (fin.getBudgetVariance() as { id?: string; name: string; budgeted: number; actual: number; acctNum?: string }[])
      .map(b => ({ id: b.id, name: b.name, budgeted: b.budgeted, actual: b.actual, acctNum: b.acctNum }));
    const year = today.slice(0, 4);
    const spendByMonth = Array(12).fill(0) as number[];
    for (const c of budgetCategories) for (const e of c.expenses) if (e.date?.startsWith(year)) spendByMonth[Number(e.date.slice(5, 7)) - 1] += e.amount;
    return {
      today,
      units,
      unitInvoices,
      workOrders,
      budget,
      reserves: reserveItems,
      annualReserveContribution,
      recommendedAnnualReserve: Math.round(fin.calculateRecommendedAnnualReserve()),
      operatingCash: bs.assets?.operating ?? 0,
      reservesCash: bs.assets?.reserves ?? 0,
      hoaDueDay,
      autoBillingEnabled,
      lastBillingRun,
      lateFee: { enabled: lateFeeEnabled, amount: lateFeeAmount, graceDays: lateFeeGraceDays },
      stripeConnected: !!stripeConnectId,
      stripeOnboardingComplete,
      spendByMonth,
      fiscalYearStart: fiscalYearStart(today, fiscalYearEnd),
    };
  }, [today, units, unitInvoices, workOrders, reserveItems, annualReserveContribution, hoaDueDay, autoBillingEnabled, lastBillingRun, lateFeeEnabled, lateFeeAmount, lateFeeGraceDays, stripeConnectId, stripeOnboardingComplete, budgetCategories, generalLedger, fiscalYearEnd]); // eslint-disable-line react-hooks/exhaustive-deps
}
