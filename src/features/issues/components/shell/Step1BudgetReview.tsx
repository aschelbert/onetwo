import { useState } from 'react';
import type { CaseTrackerCase, CaseStep } from '@/types/issues';
import { deriveBaseline, ANNUAL_BUDGET_FINANCIALS } from './budgetData';

interface Step1BudgetReviewProps {
  c: CaseTrackerCase;
  step: CaseStep;
  onToggleAction: (actionId: string) => void;
}

/* ── tiny helpers ── */
const fmt = (n: number) => '$' + n.toLocaleString();
const pct = (n: number) => n.toFixed(0) + '%';

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-[10px] font-bold text-ink-400 uppercase tracking-wider text-left px-3 py-2">{children}</th>;
}
function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={`text-[13px] text-ink-700 px-3 py-1.5 ${right ? 'text-right font-mono' : ''}`}>{children}</td>;
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: color + '40', backgroundColor: color + '0a' }}>
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>{label}</div>
      <div className="text-lg font-bold text-ink-900 mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-ink-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function BCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink-50 rounded-lg px-3 py-2 text-center">
      <div className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-bold text-ink-900 mt-0.5 font-mono">{value}</div>
    </div>
  );
}

function CPill({ rate }: { rate: number }) {
  const color = rate >= 96 ? '#059669' : rate >= 93 ? '#d97706' : '#dc2626';
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: color }}>
      {rate}%
    </span>
  );
}

function Derivation({ items, total, totalLabel }: { items: { label: string; amount: number }[]; total: number; totalLabel: string }) {
  const max = Math.max(...items.map(i => i.amount), 1);
  return (
    <div className="space-y-1">
      {items.map(it => (
        <div key={it.label} className="flex items-center gap-2">
          <span className="text-[11px] text-ink-500 w-40 truncate">{it.label}</span>
          <div className="flex-1 h-4 bg-ink-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: pct(it.amount / max * 100), backgroundColor: '#6366f1' }}
            />
          </div>
          <span className="text-[11px] font-mono text-ink-700 w-20 text-right">{fmt(it.amount)}</span>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1 border-t border-ink-200">
        <span className="text-[11px] font-bold text-ink-700 w-40">{totalLabel}</span>
        <div className="flex-1" />
        <span className="text-[13px] font-bold font-mono text-ink-900 w-20 text-right">{fmt(total)}</span>
      </div>
    </div>
  );
}

/* ── ReviewSection ── */
function ReviewSection({
  title,
  actionId,
  done,
  onToggle,
  children,
}: {
  title: string;
  actionId: string;
  done: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className={`rounded-xl border overflow-hidden ${done ? 'border-sage-300 bg-sage-50/30' : 'border-ink-200 bg-white'}`}>
      {/* Header */}
      <div className={`flex items-center gap-3 px-4 py-3 cursor-pointer select-none ${done ? 'bg-sage-50' : 'bg-ink-50'}`}>
        <button
          onClick={onToggle}
          className={`w-6 h-6 rounded-md border-2 flex items-center justify-center text-[11px] font-bold transition-all shrink-0 ${
            done
              ? 'bg-sage-500 border-sage-500 text-white'
              : 'border-ink-300 text-ink-300 hover:border-accent-400'
          }`}
        >
          {done ? '✓' : ''}
        </button>
        <button onClick={() => setOpen(!open)} className="flex-1 flex items-center gap-2 text-left">
          <h3 className={`text-[13px] font-semibold ${done ? 'text-sage-600' : 'text-ink-900'}`}>{title}</h3>
          <span className="text-ink-400 text-[11px] ml-auto">{open ? '▾' : '▸'}</span>
        </button>
      </div>

      {/* Body */}
      {open && <div className="px-4 py-3 space-y-3">{children}</div>}
    </div>
  );
}

/* ── Main component ── */
export function Step1BudgetReview({ c, step, onToggleAction }: Step1BudgetReviewProps) {
  const actions = step.actions || [];
  const actionMap = Object.fromEntries(actions.map(a => [a.id, a]));
  const financials = c.financials;
  const allDone = actions.every(a => a.done);

  const fin = financials || ANNUAL_BUDGET_FINANCIALS;
  const baseline = deriveBaseline(fin);

  return (
    <div className="p-5 md:px-7 md:py-6 space-y-4" style={{ maxWidth: 860 }}>
      {/* Description */}
      {step.desc && (
        <div className="bg-mist-50 border border-mist-100 rounded-xl p-4">
          <p className="text-[13px] text-ink-700 leading-relaxed">{step.desc}</p>
        </div>
      )}

      {/* Section 1: Reconciliations */}
      <ReviewSection
        title="Bank & Reserve Reconciliations"
        actionId="reconciliations"
        done={actionMap['reconciliations']?.done || false}
        onToggle={() => onToggleAction('reconciliations')}
      >
        <table className="w-full">
          <thead><tr><Th>Account</Th><Th>Name</Th><Th>Balance</Th></tr></thead>
          <tbody>
            {fin.accounts.map(a => (
              <tr key={a.num} className="border-t border-ink-100">
                <Td>{a.num}</Td>
                <Td>{a.name}</Td>
                <Td right>{fmt(a.actual)}</Td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink-300">
              <Td><span className="font-bold">Total</span></Td>
              <Td>{''}</Td>
              <Td right><span className="font-bold">{fmt(fin.accounts.reduce((s, a) => s + a.actual, 0))}</span></Td>
            </tr>
          </tbody>
        </table>
      </ReviewSection>

      {/* Section 2: Budget Variance */}
      <ReviewSection
        title="Budget Variance Analysis"
        actionId="budget-variance"
        done={actionMap['budget-variance']?.done || false}
        onToggle={() => onToggleAction('budget-variance')}
      >
        <Derivation
          items={fin.budgetLines}
          total={baseline.totalExpenseBaseline}
          totalLabel="Total Operating"
        />
      </ReviewSection>

      {/* Section 3: Collections */}
      <ReviewSection
        title="Collection Rate & Delinquency"
        actionId="collections"
        done={actionMap['collections']?.done || false}
        onToggle={() => onToggleAction('collections')}
      >
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Metric
            label="Collection Rate"
            value={pct(fin.collectionRates.reduce((s, r) => s + r.rate, 0) / fin.collectionRates.length)}
            sub="6-month avg"
            color="#6366f1"
          />
          <Metric label="Delinquent Units" value={String(fin.delinquent.units)} sub={`of ${fin.totalUnits}`} color="#d97706" />
          <Metric label="Outstanding" value={fmt(fin.delinquent.total)} color="#dc2626" />
        </div>
        <div className="flex items-center gap-3">
          {fin.collectionRates.map(r => (
            <div key={r.month} className="text-center">
              <div className="text-[10px] text-ink-400 mb-1">{r.month}</div>
              <CPill rate={r.rate} />
            </div>
          ))}
        </div>
        <div className="mt-3">
          <div className="text-[10px] font-bold text-ink-400 uppercase tracking-wide mb-1">Aging</div>
          <div className="flex gap-2">
            {fin.delinquent.aging.map(a => (
              <BCard key={a.bucket} label={a.bucket} value={fmt(a.amount)} />
            ))}
          </div>
        </div>
      </ReviewSection>

      {/* Section 4: Reserves */}
      <ReviewSection
        title="Reserve Balances & Funding"
        actionId="reserves"
        done={actionMap['reserves']?.done || false}
        onToggle={() => onToggleAction('reserves')}
      >
        <table className="w-full">
          <thead><tr><Th>Component</Th><Th>Balance</Th><Th>Funded</Th></tr></thead>
          <tbody>
            {fin.reserveComponents.map(r => (
              <tr key={r.name} className="border-t border-ink-100">
                <Td>{r.name}</Td>
                <Td right>{fmt(r.balance)}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-ink-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${r.funded}%`,
                          backgroundColor: r.funded >= 70 ? '#059669' : r.funded >= 50 ? '#d97706' : '#dc2626',
                        }}
                      />
                    </div>
                    <span className="text-[11px] font-mono text-ink-600">{r.funded}%</span>
                  </div>
                </Td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink-300">
              <Td><span className="font-bold">Total</span></Td>
              <Td right><span className="font-bold">{fmt(fin.reserveComponents.reduce((s, r) => s + r.balance, 0))}</span></Td>
              <Td>
                <span className="text-[11px] font-mono text-ink-600">
                  Avg {pct(fin.reserveComponents.reduce((s, r) => s + r.funded, 0) / fin.reserveComponents.length)}
                </span>
              </Td>
            </tr>
          </tbody>
        </table>
      </ReviewSection>

      {/* Section 5: Projections */}
      <ReviewSection
        title="Year-End Projections"
        actionId="projections"
        done={actionMap['projections']?.done || false}
        onToggle={() => onToggleAction('projections')}
      >
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Gross Revenue" value={fmt(baseline.grossRevenue)} sub={`${fin.totalUnits} units × ${fmt(fin.currentMonthly)}/mo`} color="#6366f1" />
          <Metric label="Net Revenue" value={fmt(baseline.netRevenue)} sub="After collection loss" color="#3b82f6" />
          <Metric label="Operating Costs" value={fmt(baseline.totalExpenseBaseline)} color="#d97706" />
          <Metric label="Reserve Contribution" value={fmt(baseline.reserveContribution)} sub="15% of operating" color="#059669" />
        </div>
        <div className="mt-3">
          <Metric
            label="Net Position"
            value={fmt(baseline.netPosition)}
            sub={baseline.netPosition >= 0 ? 'Surplus' : 'Deficit'}
            color={baseline.netPosition >= 0 ? '#059669' : '#dc2626'}
          />
        </div>
      </ReviewSection>

      {/* Baseline summary — visible when all done */}
      {allDone && (
        <div className="rounded-xl border-2 border-sage-300 bg-sage-50 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-sage-500 text-white flex items-center justify-center text-[11px] font-bold">✓</span>
            <h3 className="text-sm font-bold text-ink-900">Baseline Established</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <BCard label="Total Costs" value={fmt(baseline.totalCosts)} />
            <BCard label="Required Monthly" value={fmt(baseline.requiredMonthly)} />
            <BCard label="Increase Needed" value={baseline.increaseNeeded > 0 ? `+${fmt(baseline.increaseNeeded)}` : fmt(baseline.increaseNeeded)} />
          </div>
          <p className="text-[12px] text-ink-500 leading-relaxed">
            Financial review complete. Baseline data is now available in the budget tracker. Proceed to Step 2 to review the reserve study.
          </p>
        </div>
      )}
    </div>
  );
}
