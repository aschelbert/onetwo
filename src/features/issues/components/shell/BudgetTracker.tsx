import type { CaseTrackerCase } from '@/types/issues';
import { deriveBaseline, ANNUAL_BUDGET_FINANCIALS } from './budgetData';

interface BudgetTrackerProps {
  c: CaseTrackerCase;
}

const fmt = (n: number) => '$' + n.toLocaleString();

/**
 * Budget tracker panel in the left sidebar.
 * Active only for annual-budgeting cases.
 * Populates when step 0 is complete (all actions done).
 */
export function BudgetTracker({ c }: BudgetTrackerProps) {
  if (c.catId !== 'financial' || c.sitId !== 'annual-budgeting') return null;

  const fin = c.financials || ANNUAL_BUDGET_FINANCIALS;
  const step0 = c.steps?.[0];
  const isActive = step0?.done === true;
  const baseline = deriveBaseline(fin);

  return (
    <div className="border-b border-ink-100 bg-ink-900 text-white p-4">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-2">Budget Tracker</h3>

      {isActive ? (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-ink-800 rounded-lg px-2.5 py-2">
              <div className="text-[9px] font-bold text-ink-400 uppercase">Gross Revenue</div>
              <div className="text-sm font-bold font-mono text-white">{fmt(baseline.grossRevenue)}</div>
            </div>
            <div className="bg-ink-800 rounded-lg px-2.5 py-2">
              <div className="text-[9px] font-bold text-ink-400 uppercase">Total Costs</div>
              <div className="text-sm font-bold font-mono text-white">{fmt(baseline.totalCosts)}</div>
            </div>
            <div className="bg-ink-800 rounded-lg px-2.5 py-2">
              <div className="text-[9px] font-bold text-ink-400 uppercase">Required/mo</div>
              <div className="text-sm font-bold font-mono text-white">{fmt(baseline.requiredMonthly)}</div>
            </div>
            <div className="bg-ink-800 rounded-lg px-2.5 py-2">
              <div className="text-[9px] font-bold text-ink-400 uppercase">Current/mo</div>
              <div className="text-sm font-bold font-mono text-white">{fmt(fin.currentMonthly)}</div>
            </div>
          </div>

          {/* Net position */}
          <div className="bg-ink-800 rounded-lg px-2.5 py-2">
            <div className="text-[9px] font-bold text-ink-400 uppercase">Net Position</div>
            <div className={`text-base font-bold font-mono ${baseline.netPosition >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {fmt(baseline.netPosition)}
              <span className="text-[10px] font-normal ml-1">{baseline.netPosition >= 0 ? 'surplus' : 'deficit'}</span>
            </div>
          </div>

          {/* Increase needed alert */}
          {baseline.increaseNeeded > 0 && (
            <div className="bg-amber-900/40 border border-amber-700/50 rounded-lg px-2.5 py-2">
              <div className="text-[9px] font-bold text-amber-400 uppercase">Assessment Increase Needed</div>
              <div className="text-sm font-bold text-amber-300 font-mono">+{fmt(baseline.increaseNeeded)}/unit/mo</div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {['Revenue', 'Costs', 'Required', 'Current'].map(label => (
              <div key={label} className="bg-ink-800 rounded-lg px-2.5 py-2">
                <div className="text-[9px] font-bold text-ink-400 uppercase">{label}</div>
                <div className="text-sm font-bold font-mono text-ink-500">—</div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-ink-500 text-center">Complete Step 1 to populate</p>
        </div>
      )}
    </div>
  );
}
