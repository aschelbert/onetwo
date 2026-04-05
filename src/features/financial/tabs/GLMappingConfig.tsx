import { useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { DEFAULT_GL_MAPPING, type GLAccountMapping } from '@/lib/financial-logic';

export default function GLMappingConfig() {
  const { chartOfAccounts, glAccountMapping, setGlAccountMapping } = useFinancialStore();
  const [open, setOpen] = useState(false);

  const bankAccounts = chartOfAccounts.filter(a => a.sub === 'bank');
  const receivableAccounts = chartOfAccounts.filter(a => a.sub === 'receivable');
  const revenueAccounts = chartOfAccounts.filter(a => a.type === 'income' && a.sub !== 'header');

  const select = (label: string, key: keyof GLAccountMapping, options: typeof chartOfAccounts) => (
    <div key={key} className="flex items-center gap-3">
      <label className="text-sm text-ink-600 w-48 shrink-0">{label}</label>
      <select
        value={glAccountMapping[key]}
        onChange={e => setGlAccountMapping({ [key]: e.target.value })}
        className="flex-1 px-2 py-1.5 border border-ink-200 rounded-lg text-sm bg-white"
      >
        {options.map(a => (
          <option key={a.num} value={a.num}>{a.num} &middot; {a.name}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="border border-ink-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-ink-50 hover:bg-ink-100 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-ink-700">GL Account Mapping</span>
        <span className="text-xs text-ink-400">{open ? 'Collapse' : 'Expand'}</span>
      </button>

      {open && (
        <div className="px-4 py-4 space-y-5">
          {/* Bank & Cash */}
          <div>
            <h4 className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">Bank &amp; Cash</h4>
            {select('Operating Bank Account', 'bankAccount', bankAccounts)}
          </div>

          {/* Receivables */}
          <div>
            <h4 className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">Receivables</h4>
            <div className="space-y-2">
              {select('Monthly Assessment AR', 'assessmentsReceivable', receivableAccounts)}
              {select('Special Assessment AR', 'specialAssessmentsReceivable', receivableAccounts)}
              {select('Late Fee AR', 'lateFeeReceivable', receivableAccounts)}
            </div>
          </div>

          {/* Revenue */}
          <div>
            <h4 className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">Revenue</h4>
            <div className="space-y-2">
              {select('Regular Assessment Revenue', 'regularAssessmentRevenue', revenueAccounts)}
              {select('Special Assessment Revenue', 'specialAssessmentRevenue', revenueAccounts)}
              {select('Late Fee Revenue', 'lateFeeRevenue', revenueAccounts)}
              {select('Amenity Revenue', 'amenityRevenue', revenueAccounts)}
            </div>
          </div>

          <div className="pt-2 border-t border-ink-100">
            <button
              onClick={() => setGlAccountMapping(DEFAULT_GL_MAPPING)}
              className="text-xs text-accent-600 hover:text-accent-700 font-medium"
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
