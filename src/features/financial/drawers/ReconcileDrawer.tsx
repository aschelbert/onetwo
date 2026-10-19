/**
 * ReconcileDrawer.tsx -- Review reconciliation differences with one-tap fixes.
 */

import DrawerShell from '@/components/ui/DrawerShell';
import { fmt } from '@/lib/formatters';
import type { ReconcileResult } from '@/lib/reconcile';
import { CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';

interface ReconcileDrawerProps {
  open: boolean;
  onClose: () => void;
  result: ReconcileResult;
}

export default function ReconcileDrawer({ open, onClose, result }: ReconcileDrawerProps) {
  const { matched, differences, bankTotal, ledgerTotal, balanceDifference } = result;

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      breadcrumb={['Books', 'Reconcile']}
      title="Reconciliation Review"
      footer={{
        primaryLabel: 'Done',
        onPrimary: onClose,
      }}
    >
      <div className="space-y-5">
        {/* Summary */}
        <div className="bg-mist-50 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-600">Bank total</span>
            <span className="font-medium">{fmt(bankTotal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-600">Ledger total</span>
            <span className="font-medium">{fmt(ledgerTotal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm border-t border-ink-200 pt-2 font-bold">
            <span className="text-ink-800">Difference</span>
            <span className={Math.abs(balanceDifference) < 0.01 ? 'text-emerald-600' : 'text-red-600'}>
              {fmt(balanceDifference)}
            </span>
          </div>
        </div>

        {/* Matched count */}
        <div className="flex items-center gap-2 text-sm text-emerald-600">
          <CheckCircle size={16} />
          <span className="font-medium">{matched.length} matched entries</span>
        </div>

        {/* Differences */}
        {differences.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-ink-700 flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-600" />
              {differences.length} difference{differences.length !== 1 ? 's' : ''}
            </h3>

            {differences.map((diff, i) => (
              <div
                key={i}
                className="border border-ink-200 rounded-lg p-3 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                    diff.type === 'unmatched_bank'
                      ? 'bg-blue-100 text-blue-700'
                      : diff.type === 'unmatched_ledger'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {diff.type === 'unmatched_bank'
                      ? 'Bank only'
                      : diff.type === 'unmatched_ledger'
                      ? 'Books only'
                      : 'Missing reason'}
                  </span>
                  <div className="flex-1 min-w-0">
                    {diff.bankLine && (
                      <p className="text-sm text-ink-800">
                        {diff.bankLine.date} -- {diff.bankLine.description}
                        <span className="font-semibold ml-1">{fmt(diff.bankLine.amount)}</span>
                      </p>
                    )}
                    {diff.ledgerEntry && !diff.bankLine && (
                      <p className="text-sm text-ink-800">
                        {diff.ledgerEntry.date} -- {diff.ledgerEntry.memo}
                        <span className="font-semibold ml-1">{fmt(diff.ledgerEntry.amount)}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-amber-50 rounded-lg p-2">
                  <ArrowRight size={12} className="text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-700">{diff.suggestedFix}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-emerald-50 rounded-lg p-6 text-center">
            <CheckCircle size={32} className="mx-auto text-emerald-500 mb-2" />
            <p className="text-lg font-bold text-emerald-800">Fully reconciled</p>
            <p className="text-sm text-emerald-600 mt-1">
              All bank transactions match the books.
            </p>
          </div>
        )}
      </div>
    </DrawerShell>
  );
}
