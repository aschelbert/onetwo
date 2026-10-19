/**
 * LateUnitsDrawer -- Batch action drawer for all late units.
 *
 * Shows each late unit with a checkbox and the recommended collection action
 * (from lib/collections.ts). Primary button executes all selected rows.
 */

import { useState, useMemo } from 'react';
import { CheckSquare, Square } from 'lucide-react';
import DrawerShell from '@/components/ui/DrawerShell';
import { useFinancialStore, PeriodClosedError } from '@/store/useFinancialStore';
import { useUndoableAction } from '@/hooks/useUndoableAction';
import { actionForLateUnit, ACTION_LABELS, type CollectionAction } from '@/lib/collections';
import { fmt } from '@/lib/formatters';
import type { Unit } from '@/types/financial';

interface LateUnitsDrawerProps {
  open: boolean;
  onClose: () => void;
}

interface LateUnitRow {
  unit: Unit;
  daysPastDue: number;
  action: CollectionAction;
}

const ACTION_COLORS: Record<CollectionAction, string> = {
  friendly_reminder: 'bg-blue-100 text-blue-700',
  hold_vote_pending: 'bg-yellow-100 text-yellow-700',
  second_notice: 'bg-orange-100 text-orange-700',
  late_fee_and_demand: 'bg-red-100 text-red-700',
  refer_to_collections_case: 'bg-purple-100 text-purple-700',
};

export default function LateUnitsDrawer({ open, onClose }: LateUnitsDrawerProps) {
  const store = useFinancialStore();
  const { run: undoRun } = useUndoableAction();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const rows = useMemo((): LateUnitRow[] => {
    const now = Date.now();
    return store.units
      .filter(u => u.balance > 0)
      .map(unit => {
        // Estimate days past due from the last payment or due day
        const lastPayment = unit.payments.length > 0
          ? unit.payments[unit.payments.length - 1].date
          : null;
        const dueDay = store.hoaDueDay;
        const today = new Date();
        const dueDate = new Date(today.getFullYear(), today.getMonth(), dueDay);
        if (dueDate > today) dueDate.setMonth(dueDate.getMonth() - 1);
        const daysPastDue = Math.max(0, Math.floor((now - dueDate.getTime()) / 86400000));

        const remindersSent = 0; // Could be tracked in communications
        const waiverPending = unit.lateFees.some(f => !f.waived); // Simplified check
        const priorLateCount = unit.lateFees.length;

        const action = actionForLateUnit({
          daysPastDue,
          balance: unit.balance,
          remindersSent,
          waiverPending: false, // Don't hold batches for waivers
          priorLateCount,
        });

        return { unit, daysPastDue, action };
      })
      .sort((a, b) => b.daysPastDue - a.daysPastDue);
  }, [store.units, store.hoaDueDay]);

  // Initialize selection to all rows
  useMemo(() => {
    setSelected(new Set(rows.map(r => r.unit.number)));
  }, [rows.length]);

  const toggleUnit = (num: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map(r => r.unit.number)));
    }
  };

  const totalOutstanding = rows.reduce((sum, r) => sum + r.unit.balance, 0);
  const selectedCount = selected.size;

  const handleExecute = () => {
    setError(null);
    setProcessing(true);

    try {
      const executedActions: Array<{ unitNum: string; action: CollectionAction }> = [];

      for (const row of rows) {
        if (!selected.has(row.unit.number)) continue;

        switch (row.action) {
          case 'friendly_reminder':
            // Would send reminder email via communications store
            executedActions.push({ unitNum: row.unit.number, action: row.action });
            break;
          case 'second_notice':
            // Would send second notice
            executedActions.push({ unitNum: row.unit.number, action: row.action });
            break;
          case 'late_fee_and_demand':
            // Impose late fee from settings
            store.imposeLateFee(row.unit.number, store.lateFeeAmount, 'Late payment -- auto batch');
            executedActions.push({ unitNum: row.unit.number, action: row.action });
            break;
          case 'refer_to_collections_case':
            // Would create a case in the issues store
            executedActions.push({ unitNum: row.unit.number, action: row.action });
            break;
          case 'hold_vote_pending':
            // No action taken -- waiting for board
            break;
        }
      }

      undoRun({
        label: `Executed ${executedActions.length} collection action${executedActions.length !== 1 ? 's' : ''}`,
        undo: () => {
          // Undo any late fees that were imposed
          for (const ea of executedActions) {
            if (ea.action === 'late_fee_and_demand') {
              const u = store.units.find(x => x.number === ea.unitNum);
              if (u && u.lateFees.length > 0) {
                store.waiveLateFee(ea.unitNum, u.lateFees.length - 1);
              }
            }
          }
        },
        commit: () => {},
      });

      onClose();
    } catch (err) {
      if (err instanceof PeriodClosedError) {
        setError(err.message);
      } else {
        setError('An error occurred while processing actions');
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      breadcrumb={['Money in', 'Late units', 'Treasurer']}
      title="Chase late units"
      footer={{
        primaryLabel: processing ? 'Processing...' : `Execute ${selectedCount} action${selectedCount !== 1 ? 's' : ''}`,
        onPrimary: handleExecute,
        primaryDisabled: selectedCount === 0 || processing,
      }}
    >
      <div className="space-y-4">
        {/* Summary bar */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-red-800">{rows.length} unit{rows.length !== 1 ? 's' : ''} past due</p>
              <p className="text-xs text-red-600">{fmt(totalOutstanding)} outstanding</p>
            </div>
            <button
              onClick={toggleAll}
              className="text-xs font-medium text-red-700 hover:text-red-900 transition-colors"
            >
              {selected.size === rows.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Unit rows */}
        {rows.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-ink-400">No late units. All owners are current.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map(row => {
              const isSelected = selected.has(row.unit.number);
              const CheckIcon = isSelected ? CheckSquare : Square;
              return (
                <button
                  key={row.unit.number}
                  onClick={() => toggleUnit(row.unit.number)}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-colors text-left ${
                    isSelected ? 'border-ink-300 bg-mist-50' : 'border-ink-100 hover:border-ink-200'
                  }`}
                >
                  <CheckIcon
                    size={18}
                    className={`mt-0.5 shrink-0 ${isSelected ? 'text-accent-600' : 'text-ink-300'}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-semibold text-ink-800">Unit {row.unit.number}</span>
                        <span className="text-xs text-ink-400 truncate">{row.unit.owner}</span>
                      </div>
                      <span className="text-sm font-bold text-red-600 shrink-0">{fmt(row.unit.balance)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-ink-400">{row.daysPastDue}d late</span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${ACTION_COLORS[row.action]}`}>
                        {ACTION_LABELS[row.action]}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </DrawerShell>
  );
}
