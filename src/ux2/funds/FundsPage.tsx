/**
 * Funds — the redesign's money module (ux2.funds).
 *
 * Five sub-tabs plus Online payments and the accounting gear. Each tab opens
 * with a tile row that doubles as its table of contents (the tile switcher),
 * and the detail under the selected tile is the production component that
 * owns the records (Unit Ledger, WO & Invoices, Budget, Reserves, Spending
 * Decisions, Statements), so every posting, email and Stripe call is the one
 * production makes today.
 *
 * Deep links: `/funds?tab=income&section=behind`. Legacy Fiscal Lens tab ids
 * (`units`, `budget`, `reserves`, `approvals`, …) are accepted and mapped.
 */
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useAuthStore } from '@/store/useAuthStore';
import { fmt } from '@/lib/formatters';
import { Chip, PillTabs, ModuleHeader, ACTION_BUTTON, STATUS_CHIP } from '../components';
import { useFundsSnapshot } from './useFundsSnapshot';
import { bills, budgetSummary, collected, healthLabel, healthScore, reserveSummary } from './metrics';
import OverviewTab from './tabs/OverviewTab';
import IncomeTab from './tabs/IncomeTab';
import ExpensesTab from './tabs/ExpensesTab';
import PlanningTab from './tabs/PlanningTab';
import StatementsTab from './tabs/StatementsTab';
import PaymentsTab from './tabs/PaymentsTab';
import SettingsTab from './tabs/SettingsTab';

export type FundsTab = 'overview' | 'income' | 'expenses' | 'planning' | 'statements' | 'payments' | 'settings';

const TAB_IDS: FundsTab[] = ['overview', 'income', 'expenses', 'planning', 'statements', 'payments', 'settings'];

/** Fiscal Lens tab id → Funds tab and section. */
export const LEGACY_TABS: Record<string, { tab: FundsTab; section?: string }> = {
  dashboard: { tab: 'overview' },
  units: { tab: 'income', section: 'ledger' },
  workorders: { tab: 'expenses', section: 'bills' },
  approvals: { tab: 'expenses', section: 'decisions' },
  budget: { tab: 'planning', section: 'budget' },
  reserves: { tab: 'planning', section: 'reserves' },
  reports: { tab: 'statements' },
  coa: { tab: 'settings', section: 'accounts' },
  ledger: { tab: 'settings', section: 'ledger' },
  payments: { tab: 'payments' },
};

export function resolveTab(raw: string | null): { tab: FundsTab; section?: string } {
  if (!raw) return { tab: 'overview' };
  if ((TAB_IDS as string[]).includes(raw)) return { tab: raw as FundsTab };
  return LEGACY_TABS[raw] ?? { tab: 'overview' };
}

export default function FundsPage() {
  const [params, setParams] = useSearchParams();
  const resolved = resolveTab(params.get('tab'));
  const tab = resolved.tab;
  const section = params.get('section') ?? resolved.section;
  const role = useAuthStore(s => s.currentRole);
  const seedGeneralLedger = useFinancialStore(s => s.seedGeneralLedger);
  const glCount = useFinancialStore(s => s.generalLedger.length);
  useEffect(() => { if (glCount === 0) seedGeneralLedger(); }, [glCount, seedGeneralLedger]);

  const snap = useFundsSnapshot();
  const col = collected(snap);
  const bl = bills(snap);
  const bud = budgetSummary(snap);
  const res = reserveSummary(snap);
  const health = healthScore(snap.units.length ? (col.paidUnits / snap.units.length) * 100 : 0, res.pct, bud.pct);

  const go = (next: FundsTab, nextSection?: string) => {
    setParams(prev => {
      const p = new URLSearchParams(prev);
      if (next === 'overview') p.delete('tab'); else p.set('tab', next);
      if (nextSection) p.set('section', nextSection); else p.delete('section');
      return p;
    }, { replace: true });
  };

  const subtitle = tab === 'overview'
    ? `${col.behindUnits ? `${col.behindUnits} unit${col.behindUnits === 1 ? '' : 's'} behind` : 'Everyone is current'} · ${bl.toApprove.length ? `${bl.toApprove.length} bill${bl.toApprove.length === 1 ? '' : 's'} to approve` : 'no bills waiting'} · ${bud.over.length ? `${bud.over.length} budget line${bud.over.length === 1 ? '' : 's'} over` : 'budget on track'}`
    : {
      income: `What came in, who is behind, and every charge to a unit. ${col.paidUnits} of ${col.units} units are paid up · ${fmt(col.amount)} received this month.`,
      expenses: `Bills to pay, spending to decide, and the work orders behind them. ${bl.toApprove.length ? `${bl.toApprove.length} bills are waiting for approval.` : 'Nothing is waiting for approval.'}`,
      planning: `This year's budget line by line, next year's dues number, and the reserve gap.`,
      statements: 'The reports, the monthly packets, and the filings.',
      payments: "The building's Stripe account, what it collects, and who pays how.",
      settings: 'The chart of accounts, where things post, the ledger, the fee schedule, billing rules and the mailing card.',
    }[tab];

  const tabs = [
    { id: 'overview' as FundsTab, label: 'Overview' },
    { id: 'income' as FundsTab, label: 'Income', badge: col.behindUnits ? `${col.behindUnits} behind` : undefined, badgeTone: 'red' as const },
    { id: 'expenses' as FundsTab, label: 'Expenses', badge: bl.toApprove.length ? `${bl.toApprove.length} to pay` : undefined, badgeTone: 'navy' as const },
    { id: 'planning' as FundsTab, label: 'Planning', badge: bud.over.length ? `${bud.over.length} over` : undefined, badgeTone: 'amber' as const },
    { id: 'statements' as FundsTab, label: 'Statements & taxes' },
  ];
  const pillValue: FundsTab = tab; // payments and settings match no pill, so none is active

  return (
    <div data-page="ux2-funds" className="flex flex-col gap-5">
      <ModuleHeader
        title={tab === 'payments' ? 'Online payments' : tab === 'settings' ? 'Accounts and ledger' : 'Funds'}
        subtitle={subtitle}
        status={<Chip tone={health >= 80 ? 'sage' : health >= 60 ? 'amber' : 'red'} className={STATUS_CHIP} title="Collection, reserves and budget pace, the Fiscal Lens formula">{healthLabel(health)} · {health}</Chip>}
        tabs={<PillTabs tabs={tabs} value={pillValue} onChange={id => go(id)} aria-label="Funds sections" />}
        tabsEnd={role !== 'RESIDENT' ? (
          <button type="button" aria-label="Accounts and ledger" title="Accounts and ledger" onClick={() => go('settings')} className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border ${tab === 'settings' ? 'border-ux2-navy bg-ux2-navy text-white' : 'border-ux2-line-strong bg-white text-ux2-ink hover:bg-ux2-surface'}`}>⚙</button>
        ) : undefined}
        actions={role !== 'RESIDENT' ? ([['Record a payment', 'income', 'ledger'], ['Pay a bill', 'expenses', 'bills'], ['Create a work order', 'expenses', 'workorders'], ['Transfer funds', 'settings', 'ledger']] as [string, FundsTab, string][]).map(([label, t, s]) => (
          <button key={label} type="button" onClick={() => go(t, s)} className={ACTION_BUTTON}>{label}</button>
        )) : undefined}
      />

      {tab === 'overview' && <OverviewTab snap={snap} onGo={go} />}
      {tab === 'income' && <IncomeTab snap={snap} section={section} onSection={s => go('income', s)} onGo={go} />}
      {tab === 'expenses' && <ExpensesTab snap={snap} section={section} onSection={s => go('expenses', s)} onGo={go} />}
      {tab === 'planning' && <PlanningTab snap={snap} section={section} onSection={s => go('planning', s)} onGo={go} />}
      {tab === 'statements' && <StatementsTab snap={snap} />}
      {tab === 'payments' && <PaymentsTab snap={snap} onGo={go} />}
      {tab === 'settings' && <SettingsTab snap={snap} section={section} onSection={s => go('settings', s)} onGo={go} />}
    </div>
  );
}
