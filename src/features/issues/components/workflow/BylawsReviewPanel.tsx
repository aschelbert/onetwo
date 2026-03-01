import { useBuildingStore } from '@/store/useBuildingStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';
import type { CaseStep } from '@/types/issues';
import { useState } from 'react';

interface BylawsReviewPanelProps {
  caseId: string;
  step: CaseStep;
}

export function BylawsReviewPanel({ caseId, step }: BylawsReviewPanelProps) {
  const { legalDocuments, bylawsConfig, updateBylawsConfig, address, details } = useBuildingStore();
  const fin = useFinancialStore();
  const store = useIssuesStore();
  const totalUnits = details.totalUnits;
  const variance = fin.getBudgetVariance();

  // Find the case and the budget draft from a prior step
  const c = store.cases.find(x => x.id === caseId);
  const draftStep = c?.steps?.find(s => s.budgetDraft);
  const draft = draftStep?.budgetDraft;

  // Current assessment
  const currentTotal = variance.reduce((s: number, v: any) => s + v.budgeted, 0) + fin.annualReserveContribution;
  const currentPerUnit = totalUnits > 0 ? Math.round(currentTotal / totalUnits) : 0;

  // Proposed assessment (from draft or manual)
  const proposedPerUnit = draft?.perUnitAnnual ?? currentPerUnit;
  const pctIncrease = currentPerUnit > 0 ? ((proposedPerUnit - currentPerUnit) / currentPerUnit * 100) : 0;
  const exceedsCap = pctIncrease > bylawsConfig.assessmentCapPct;

  // Bylaws document
  const bylawsDoc = legalDocuments.find(d =>
    d.name.toLowerCase().includes('bylaws')
  );

  // Editing state
  const [editingConfig, setEditingConfig] = useState(false);
  const [configForm, setConfigForm] = useState(bylawsConfig);

  const saveConfig = () => {
    updateBylawsConfig(configForm);
    setEditingConfig(false);
  };

  return (
    <div className="mt-3 bg-mist-50 border border-mist-200 rounded-lg p-4 space-y-4">
      <p className="text-xs font-bold text-accent-700 uppercase tracking-widest">Assessment Limit & Bylaws Review</p>

      {/* Bylaws Reference */}
      <div className="bg-white rounded-lg border border-ink-100 p-4">
        <p className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">Bylaws Reference</p>
        {bylawsDoc ? (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-semibold text-ink-900">{bylawsDoc.name}</p>
              <p className="text-xs text-ink-500">{bylawsDoc.version} · {bylawsDoc.size}</p>
            </div>
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${bylawsDoc.status === 'current' ? 'bg-sage-100 text-sage-700' : 'bg-yellow-100 text-yellow-700'}`}>{bylawsDoc.status}</span>
          </div>
        ) : (
          <p className="text-sm text-ink-500">No bylaws document found.</p>
        )}
        <p className="text-xs text-ink-500 mt-2">Jurisdiction: <span className="font-medium text-ink-700">{address.state}</span></p>
      </div>

      {/* Assessment Increase Analysis */}
      <div className="bg-white rounded-lg border border-ink-100 p-4 space-y-3">
        <p className="text-xs font-bold text-ink-500 uppercase tracking-wider">Assessment Increase Analysis</p>

        {!draft && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5">
            <p className="text-xs text-yellow-800">No budget draft found. Complete Step 5 (Draft Budget) first for automatic analysis, or review the numbers below based on current data.</p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-mist-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-ink-400 uppercase font-medium">Current Per-Unit</p>
            <p className="text-sm font-bold text-ink-900">{fmt(currentPerUnit)}/yr</p>
          </div>
          <div className="bg-mist-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-ink-400 uppercase font-medium">Proposed Per-Unit</p>
            <p className="text-sm font-bold text-accent-700">{fmt(proposedPerUnit)}/yr</p>
          </div>
          <div className="bg-mist-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-ink-400 uppercase font-medium">% Increase</p>
            <p className={`text-sm font-bold ${pctIncrease > 0 ? 'text-red-600' : 'text-sage-700'}`}>{pctIncrease.toFixed(1)}%</p>
          </div>
          <div className="bg-mist-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-ink-400 uppercase font-medium">Bylaws Cap</p>
            <p className="text-sm font-bold text-ink-900">{bylawsConfig.assessmentCapPct}%</p>
          </div>
        </div>

        {/* Result Badge */}
        {exceedsCap ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <span className="text-red-600 text-lg">⚠</span>
              <div>
                <p className="text-sm font-bold text-red-800">Owner vote required</p>
                <p className="text-xs text-red-700">Assessment increase of {pctIncrease.toFixed(1)}% exceeds the {bylawsConfig.assessmentCapPct}% bylaws cap. A {bylawsConfig.ownerVoteThreshold}% owner vote is required.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-sage-50 border border-sage-200 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <span className="text-sage-600 text-lg">✓</span>
              <div>
                <p className="text-sm font-bold text-sage-800">No owner vote required</p>
                <p className="text-xs text-sage-700">Assessment increase of {pctIncrease.toFixed(1)}% is within the {bylawsConfig.assessmentCapPct}% bylaws cap. Board can adopt without owner vote.</p>
              </div>
            </div>
          </div>
        )}

        {/* Phasing Suggestion */}
        {exceedsCap && (
          <div className="bg-accent-50 border border-accent-200 rounded-lg p-3">
            <p className="text-xs font-bold text-accent-800 uppercase tracking-wider mb-1">Phasing Suggestion</p>
            <p className="text-xs text-accent-900">
              Consider splitting the increase over 2 years to stay within the {bylawsConfig.assessmentCapPct}% cap:
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-ink-400 uppercase font-medium">Year 1</p>
                <p className="text-sm font-bold text-ink-900">{fmt(Math.round(currentPerUnit * (1 + bylawsConfig.assessmentCapPct / 100)))}/yr</p>
                <p className="text-[10px] text-ink-500">+{bylawsConfig.assessmentCapPct}% (no vote)</p>
              </div>
              <div className="bg-white rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-ink-400 uppercase font-medium">Year 2</p>
                <p className="text-sm font-bold text-ink-900">{fmt(proposedPerUnit)}/yr</p>
                <p className="text-[10px] text-ink-500">Remainder to target</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Editable Config */}
      <div className="bg-white rounded-lg border border-ink-100 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-ink-500 uppercase tracking-wider">Bylaws Configuration</p>
          <button onClick={() => setEditingConfig(!editingConfig)} className="text-xs text-accent-600 font-medium hover:text-accent-800">
            {editingConfig ? 'Cancel' : 'Edit'}
          </button>
        </div>
        {editingConfig ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-ink-500 block mb-1">Assessment Cap %</label>
                <input type="number" value={configForm.assessmentCapPct} onChange={e => setConfigForm(f => ({ ...f, assessmentCapPct: parseFloat(e.target.value) || 0 }))} className="w-full px-2 py-1.5 border border-ink-200 rounded text-sm" />
              </div>
              <div>
                <label className="text-xs text-ink-500 block mb-1">Owner Vote Threshold %</label>
                <input type="number" value={configForm.ownerVoteThreshold} onChange={e => setConfigForm(f => ({ ...f, ownerVoteThreshold: parseFloat(e.target.value) || 0 }))} className="w-full px-2 py-1.5 border border-ink-200 rounded text-sm" />
              </div>
              <div>
                <label className="text-xs text-ink-500 block mb-1">Board Spending Limit</label>
                <input type="number" value={configForm.boardSpendingLimit} onChange={e => setConfigForm(f => ({ ...f, boardSpendingLimit: parseFloat(e.target.value) || 0 }))} className="w-full px-2 py-1.5 border border-ink-200 rounded text-sm" />
              </div>
              <div>
                <label className="text-xs text-ink-500 block mb-1">Quorum %</label>
                <input type="number" value={configForm.quorumPct} onChange={e => setConfigForm(f => ({ ...f, quorumPct: parseFloat(e.target.value) || 0 }))} className="w-full px-2 py-1.5 border border-ink-200 rounded text-sm" />
              </div>
            </div>
            <button onClick={saveConfig} className="px-4 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-semibold hover:bg-ink-800">Save Configuration</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div><span className="text-ink-400">Assessment Cap:</span> <span className="font-medium text-ink-700">{bylawsConfig.assessmentCapPct}%</span></div>
            <div><span className="text-ink-400">Vote Threshold:</span> <span className="font-medium text-ink-700">{bylawsConfig.ownerVoteThreshold}%</span></div>
            <div><span className="text-ink-400">Spending Limit:</span> <span className="font-medium text-ink-700">{fmt(bylawsConfig.boardSpendingLimit)}</span></div>
            <div><span className="text-ink-400">Quorum:</span> <span className="font-medium text-ink-700">{bylawsConfig.quorumPct}%</span></div>
          </div>
        )}
      </div>
    </div>
  );
}
