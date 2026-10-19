/**
 * BooksReconcile.tsx -- Bank reconciliation segment.
 *
 * Paste/upload bank CSV. Shows differences with one-tap fixes.
 * Badge on Books tab = count of open differences.
 */

import { useState, useCallback, useMemo } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { findDifferences, type BankLine, type ReconcileResult } from '@/lib/reconcile';
import { fmt } from '@/lib/formatters';
import { toPeriod } from '@/lib/monthClose';
import { Upload, CheckCircle, AlertTriangle, ClipboardPaste, Trash2 } from 'lucide-react';
import ReconcileDrawer from '../drawers/ReconcileDrawer';

export default function BooksReconcile() {
  const store = useFinancialStore();
  const [bankLines, setBankLines] = useState<BankLine[]>([]);
  const [csvText, setCsvText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(() => toPeriod(new Date()));

  // Available periods
  const periodOpts = useMemo(() => {
    const periods = new Set(store.generalLedger.map(e => toPeriod(e.date)));
    return [...periods].sort().reverse();
  }, [store.generalLedger]);

  // Filter ledger entries by selected period
  const periodEntries = useMemo(
    () => store.generalLedger.filter(e => toPeriod(e.date) === selectedPeriod),
    [store.generalLedger, selectedPeriod],
  );

  // Run reconciliation
  const result: ReconcileResult | null = useMemo(() => {
    if (bankLines.length === 0) return null;
    return findDifferences(bankLines, periodEntries);
  }, [bankLines, periodEntries]);

  // Parse CSV text into bank lines
  const parseCsv = useCallback((text: string) => {
    const lines = text.trim().split('\n');
    if (lines.length <= 1) return;

    const parsed: BankLine[] = [];
    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < 3) continue;

      const date = cols[0];
      const description = cols[1];
      const amountStr = cols[2].replace(/[$,]/g, '');
      const amount = Math.abs(parseFloat(amountStr));
      if (isNaN(amount) || amount === 0) continue;

      parsed.push({
        id: `bank-${i}`,
        date,
        description,
        amount,
        type: parseFloat(amountStr) >= 0 ? 'credit' : 'debit',
      });
    }
    setBankLines(parsed);
    setShowPaste(false);
    setCsvText('');
  }, []);

  // Handle file upload
  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const text = ev.target?.result as string;
        parseCsv(text);
      };
      reader.readAsText(file);
    },
    [parseCsv],
  );

  const diffCount = result?.differences.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="font-display text-lg font-bold text-ink-900">Bank Reconciliation</h3>
          <p className="text-xs text-ink-400">
            Compare your bank statement to the general ledger to find discrepancies.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedPeriod}
            onChange={e => setSelectedPeriod(e.target.value)}
            className="px-3 py-2 border border-ink-200 rounded-lg text-sm"
          >
            {periodOpts.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Upload / Paste area */}
      {bankLines.length === 0 ? (
        <div className="border-2 border-dashed border-ink-200 rounded-xl p-8 text-center">
          <Upload size={32} className="mx-auto text-ink-300 mb-3" />
          <p className="text-sm text-ink-600 font-medium mb-2">
            Upload or paste your bank statement CSV
          </p>
          <p className="text-xs text-ink-400 mb-4">
            CSV format: Date, Description, Amount (one row per transaction)
          </p>
          <div className="flex items-center justify-center gap-3">
            <label className="px-4 py-2 bg-navy text-white rounded-lg text-sm font-medium hover:bg-navy-800 cursor-pointer transition-colors">
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileUpload}
              />
              Upload CSV
            </label>
            <button
              onClick={() => setShowPaste(true)}
              className="px-4 py-2 border border-ink-200 text-ink-700 rounded-lg text-sm font-medium hover:bg-mist-50 flex items-center gap-1.5 transition-colors"
            >
              <ClipboardPaste size={14} />
              Paste CSV
            </button>
          </div>

          {showPaste && (
            <div className="mt-4 space-y-3">
              <textarea
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                placeholder="Date,Description,Amount&#10;2026-10-01,Assessment Unit 101,500.00&#10;2026-10-05,Water bill,-350.00"
                className="w-full h-32 px-3 py-2 border border-ink-200 rounded-lg text-sm font-mono"
              />
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => parseCsv(csvText)}
                  className="px-4 py-2 bg-navy text-white rounded-lg text-sm font-medium"
                  disabled={!csvText.trim()}
                >
                  Parse
                </button>
                <button
                  onClick={() => { setShowPaste(false); setCsvText(''); }}
                  className="px-4 py-2 text-ink-500 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-sage-50 border border-sage-200 rounded-xl p-4">
              <p className="text-[10px] font-semibold text-sage-600 uppercase tracking-wider">Bank Lines</p>
              <p className="text-xl font-bold text-ink-900 mt-1">{bankLines.length}</p>
            </div>
            <div className="bg-mist-50 border border-mist-200 rounded-xl p-4">
              <p className="text-[10px] font-semibold text-ink-500 uppercase tracking-wider">Ledger Entries</p>
              <p className="text-xl font-bold text-ink-900 mt-1">{periodEntries.length}</p>
            </div>
            <div className={`rounded-xl p-4 border ${
              result && result.matched.length > 0
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-ink-50 border-ink-200'
            }`}>
              <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">Matched</p>
              <p className="text-xl font-bold text-ink-900 mt-1">{result?.matched.length ?? 0}</p>
            </div>
            <div className={`rounded-xl p-4 border ${
              diffCount > 0
                ? 'bg-red-50 border-red-200'
                : 'bg-emerald-50 border-emerald-200'
            }`}>
              <p className={`text-[10px] font-semibold uppercase tracking-wider ${diffCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                Differences
              </p>
              <p className={`text-xl font-bold mt-1 ${diffCount > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                {diffCount}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowDrawer(true)}
              disabled={!result || result.differences.length === 0}
              className="px-4 py-2 bg-navy text-white rounded-lg text-sm font-medium hover:bg-navy-800 disabled:opacity-40 transition-colors"
            >
              Review differences ({diffCount})
            </button>
            <button
              onClick={() => setBankLines([])}
              className="px-3 py-2 text-ink-500 hover:text-ink-700 text-sm flex items-center gap-1.5"
            >
              <Trash2 size={14} />
              Clear bank data
            </button>
          </div>

          {/* Differences list */}
          {result && result.differences.length > 0 && (
            <div className="border border-ink-200 rounded-xl overflow-hidden">
              <div className="bg-amber-50 px-5 py-3 border-b border-amber-200 flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-600" />
                <span className="text-sm font-semibold text-amber-800">
                  {result.differences.length} difference{result.differences.length !== 1 ? 's' : ''} found
                </span>
              </div>
              <div className="divide-y divide-ink-100 max-h-80 overflow-y-auto">
                {result.differences.map((diff, i) => (
                  <div key={i} className="px-5 py-3 flex items-start gap-3">
                    <span className={`mt-0.5 px-2 py-0.5 rounded text-xs font-medium ${
                      diff.type === 'unmatched_bank'
                        ? 'bg-blue-100 text-blue-700'
                        : diff.type === 'unmatched_ledger'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {diff.type === 'unmatched_bank'
                        ? 'Bank'
                        : diff.type === 'unmatched_ledger'
                        ? 'Ledger'
                        : 'Missing reason'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink-800">
                        {diff.bankLine
                          ? `${diff.bankLine.date} -- ${diff.bankLine.description} (${fmt(diff.bankLine.amount)})`
                          : diff.ledgerEntry
                          ? `${diff.ledgerEntry.date} -- ${diff.ledgerEntry.memo} (${fmt(diff.ledgerEntry.amount)})`
                          : ''}
                      </p>
                      <p className="text-xs text-ink-500 mt-0.5">{diff.suggestedFix}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All matched */}
          {result && result.differences.length === 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
              <CheckCircle size={32} className="mx-auto text-emerald-500 mb-2" />
              <p className="text-lg font-bold text-emerald-800">Fully reconciled</p>
              <p className="text-sm text-emerald-600 mt-1">
                All {result.matched.length} bank lines match ledger entries.
              </p>
            </div>
          )}
        </>
      )}

      {/* Reconcile Drawer */}
      {result && (
        <ReconcileDrawer
          open={showDrawer}
          onClose={() => setShowDrawer(false)}
          result={result}
        />
      )}
    </div>
  );
}
