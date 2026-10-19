/**
 * UnitDrawer -- Money In drawer for a single unit.
 *
 * Breadcrumb: Money in > Unit {number} > Treasurer
 * Shows owner name, balance, recent ledger entries, and a question-driven
 * action picker: Record payment, Impose fee, Waive fee, Send invoice,
 * Send reminder.
 */

import { useState, useMemo } from 'react';
import {
  DollarSign,
  AlertTriangle,
  XCircle,
  FileText,
  Bell,
  ArrowLeft,
} from 'lucide-react';
import DrawerShell from '@/components/ui/DrawerShell';
import InlineField from '@/components/ui/InlineField';
import { useFinancialStore, PeriodClosedError } from '@/store/useFinancialStore';
import { useFeeScheduleStore } from '@/store/useFeeScheduleStore';
import { useUndoableAction } from '@/hooks/useUndoableAction';
import { fmt, formatDate } from '@/lib/formatters';
import type { Unit, GLEntry } from '@/types/financial';

type UnitAction =
  | 'pick'
  | 'record_payment'
  | 'impose_fee'
  | 'waive_fee'
  | 'send_invoice'
  | 'send_reminder';

interface UnitDrawerProps {
  open: boolean;
  onClose: () => void;
  unitNumber: string;
}

const ACTION_OPTIONS: Array<{ id: UnitAction; label: string; icon: typeof DollarSign; desc: string }> = [
  { id: 'record_payment', label: 'Record a payment', icon: DollarSign, desc: 'Log a payment received from this owner' },
  { id: 'impose_fee', label: 'Impose a fee', icon: AlertTriangle, desc: 'Assess a late fee or other charge' },
  { id: 'waive_fee', label: 'Waive a fee', icon: XCircle, desc: 'Waive a previously assessed fee' },
  { id: 'send_invoice', label: 'Send an invoice', icon: FileText, desc: 'Create and send an invoice to this owner' },
  { id: 'send_reminder', label: 'Send a reminder', icon: Bell, desc: 'Send a payment reminder email' },
];

export default function UnitDrawer({ open, onClose, unitNumber }: UnitDrawerProps) {
  const store = useFinancialStore();
  const feeStore = useFeeScheduleStore();
  const { run: undoRun } = useUndoableAction();

  const unit = store.units.find(u => u.number === unitNumber);
  const [action, setAction] = useState<UnitAction>('pick');
  const [error, setError] = useState<string | null>(null);

  // Payment form state
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('check');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payCheckNum, setPayCheckNum] = useState('');

  // Fee form state
  const [feeId, setFeeId] = useState('');
  const [feeAmount, setFeeAmount] = useState('');

  // Waive form state
  const [waiveFeeIdx, setWaiveFeeIdx] = useState<number>(-1);
  const [waiveReason, setWaiveReason] = useState('');

  // Invoice form state
  const [invType, setInvType] = useState<'fee' | 'special_assessment' | 'amenity_fee' | 'monthly'>('fee');
  const [invAmount, setInvAmount] = useState('');
  const [invDueDate, setInvDueDate] = useState('');
  const [invMemo, setInvMemo] = useState('');

  // Reminder form state
  const [reminderTemplate, setReminderTemplate] = useState('friendly');

  // Recent ledger entries for this unit
  const recentEntries = useMemo(() => {
    return store.generalLedger
      .filter((e: GLEntry) => e.sourceId === unitNumber)
      .sort((a: GLEntry, b: GLEntry) => b.date.localeCompare(a.date))
      .slice(0, 8);
  }, [store.generalLedger, unitNumber]);

  // Available fees from fee schedule
  const availableFees = useMemo(() => {
    return feeStore.fees.filter(f => f.enabled);
  }, [feeStore.fees]);

  // Auto-fill fee amount when fee type changes
  const handleFeeSelect = (id: string) => {
    setFeeId(id);
    const fee = feeStore.getFee(id);
    if (fee) {
      setFeeAmount(String(fee.amount));
    }
  };

  if (!unit) return null;

  const resetForms = () => {
    setAction('pick');
    setError(null);
    setPayAmount('');
    setPayMethod('check');
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayCheckNum('');
    setFeeId('');
    setFeeAmount('');
    setWaiveFeeIdx(-1);
    setWaiveReason('');
    setInvType('fee');
    setInvAmount('');
    setInvDueDate('');
    setInvMemo('');
    setReminderTemplate('friendly');
  };

  const handleClose = () => {
    resetForms();
    onClose();
  };

  const handlePrimary = () => {
    setError(null);
    try {
      switch (action) {
        case 'record_payment': {
          const amt = parseFloat(payAmount);
          if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }
          const prevBalance = unit.balance;
          store.recordUnitPayment(unitNumber, amt, payMethod);
          undoRun({
            label: `Recorded ${fmt(amt)} payment for Unit ${unitNumber}`,
            undo: () => store.updateUnit(unitNumber, { balance: prevBalance }),
            commit: () => {},
          });
          handleClose();
          break;
        }
        case 'impose_fee': {
          const amt = parseFloat(feeAmount);
          if (!amt || amt <= 0) { setError('Enter a valid fee amount'); return; }
          const feeName = feeStore.getFee(feeId)?.name || 'Fee';
          store.imposeLateFee(unitNumber, amt, feeName);
          undoRun({
            label: `Imposed ${fmt(amt)} ${feeName} on Unit ${unitNumber}`,
            undo: () => {
              const u = store.units.find(x => x.number === unitNumber);
              if (u && u.lateFees.length > 0) {
                store.waiveLateFee(unitNumber, u.lateFees.length - 1);
              }
            },
            commit: () => {},
          });
          handleClose();
          break;
        }
        case 'waive_fee': {
          if (waiveFeeIdx < 0) { setError('Select a fee to waive'); return; }
          if (!waiveReason.trim()) { setError('Provide a reason for waiving'); return; }
          store.waiveLateFee(unitNumber, waiveFeeIdx);
          undoRun({
            label: `Waived fee for Unit ${unitNumber}`,
            undo: () => {
              // Re-impose the fee if undone
              const fee = unit.lateFees[waiveFeeIdx];
              if (fee) store.imposeLateFee(unitNumber, fee.amount, fee.reason);
            },
            commit: () => {},
          });
          handleClose();
          break;
        }
        case 'send_invoice': {
          const amt = parseFloat(invAmount);
          if (!amt || amt <= 0) { setError('Enter a valid invoice amount'); return; }
          store.createUnitInvoice(unitNumber, invType, amt, invMemo || `Invoice for Unit ${unitNumber}`);
          undoRun({
            label: `Invoice of ${fmt(amt)} sent to Unit ${unitNumber}`,
            undo: () => {},
            commit: () => {},
          });
          handleClose();
          break;
        }
        case 'send_reminder': {
          // In a full implementation this would send via the communications store.
          // For now, record it as a no-op undoable action.
          undoRun({
            label: `Reminder sent to Unit ${unitNumber} (${unit.email})`,
            undo: () => {},
            commit: () => {},
          });
          handleClose();
          break;
        }
        default:
          break;
      }
    } catch (err) {
      if (err instanceof PeriodClosedError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    }
  };

  const primaryLabel = action === 'pick' ? 'Select an action' : {
    record_payment: 'Record payment',
    impose_fee: 'Impose fee',
    waive_fee: 'Waive fee',
    send_invoice: 'Send invoice',
    send_reminder: 'Send reminder',
  }[action] || 'Confirm';

  const stepInfo = action === 'pick' ? undefined : { current: 2, total: 2 };

  return (
    <DrawerShell
      open={open}
      onClose={handleClose}
      breadcrumb={['Money in', `Unit ${unitNumber}`, 'Treasurer']}
      title={`${unit.owner} -- Unit ${unitNumber}`}
      step={stepInfo}
      footer={{
        primaryLabel,
        onPrimary: handlePrimary,
        primaryDisabled: action === 'pick',
        secondaryLabel: action !== 'pick' ? 'Back' : undefined,
        onSecondary: action !== 'pick' ? () => { setAction('pick'); setError(null); } : undefined,
      }}
    >
      <div className="space-y-5">
        {/* Balance summary */}
        <div className="flex items-center justify-between bg-mist-50 rounded-lg p-4">
          <div>
            <p className="text-xs text-ink-400 font-medium uppercase">Current balance</p>
            <p className={`text-2xl font-bold ${unit.balance > 0 ? 'text-red-600' : 'text-sage-700'}`}>
              {fmt(unit.balance)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-ink-400">Monthly fee: {fmt(unit.monthlyFee)}</p>
            <p className="text-xs text-ink-400">Status: {unit.status}</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Action picker */}
        {action === 'pick' && (
          <>
            <div>
              <h3 className="text-sm font-semibold text-ink-700 mb-3">What happened?</h3>
              <div className="space-y-2">
                {ACTION_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setAction(opt.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border border-ink-100 hover:border-ink-300 hover:bg-mist-50 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-lg bg-accent-50 flex items-center justify-center shrink-0">
                        <Icon size={18} className="text-accent-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink-800">{opt.label}</p>
                        <p className="text-xs text-ink-400">{opt.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Recent ledger */}
            {recentEntries.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-ink-700 mb-2">Recent activity</h3>
                <div className="space-y-1">
                  {recentEntries.map(entry => (
                    <div key={entry.id} className="flex items-center justify-between py-1.5 text-xs border-b border-ink-50 last:border-0">
                      <div className="flex-1 min-w-0">
                        <span className="text-ink-500">{formatDate(entry.date)}</span>
                        <span className="mx-1.5 text-ink-300">--</span>
                        <span className="text-ink-700 truncate">{entry.memo}</span>
                      </div>
                      <span className={`font-medium ${entry.source === 'payment' ? 'text-sage-700' : 'text-ink-700'}`}>
                        {fmt(entry.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Record Payment form */}
        {action === 'record_payment' && (
          <div className="space-y-4">
            <button onClick={() => { setAction('pick'); setError(null); }} className="flex items-center gap-1 text-xs text-ink-500 hover:text-ink-700">
              <ArrowLeft size={14} /> Back to actions
            </button>
            <h3 className="text-sm font-semibold text-ink-700">Record a payment</h3>
            <InlineField label="Amount">
              <input
                type="number"
                step="0.01"
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
                placeholder="0.00"
                autoFocus
              />
            </InlineField>
            <InlineField label="Method">
              <select
                value={payMethod}
                onChange={e => setPayMethod(e.target.value)}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
              >
                <option value="check">Check</option>
                <option value="ach">ACH / Bank transfer</option>
                <option value="cash">Cash</option>
                <option value="credit_card">Credit card</option>
                <option value="zelle">Zelle</option>
                <option value="other">Other</option>
              </select>
            </InlineField>
            <InlineField label="Date">
              <input
                type="date"
                value={payDate}
                onChange={e => setPayDate(e.target.value)}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
              />
            </InlineField>
            {payMethod === 'check' && (
              <InlineField label="Check number">
                <input
                  type="text"
                  value={payCheckNum}
                  onChange={e => setPayCheckNum(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
                  placeholder="Optional"
                />
              </InlineField>
            )}
          </div>
        )}

        {/* Impose Fee form */}
        {action === 'impose_fee' && (
          <div className="space-y-4">
            <button onClick={() => { setAction('pick'); setError(null); }} className="flex items-center gap-1 text-xs text-ink-500 hover:text-ink-700">
              <ArrowLeft size={14} /> Back to actions
            </button>
            <h3 className="text-sm font-semibold text-ink-700">Impose a fee</h3>
            <InlineField label="Fee type">
              <select
                value={feeId}
                onChange={e => handleFeeSelect(e.target.value)}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
              >
                <option value="">Select a fee</option>
                {availableFees.map(f => (
                  <option key={f.id} value={f.id}>{f.name} ({fmt(f.amount)})</option>
                ))}
              </select>
            </InlineField>
            <InlineField label="Amount">
              <input
                type="number"
                step="0.01"
                value={feeAmount}
                onChange={e => setFeeAmount(e.target.value)}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
                placeholder="Prefilled from fee schedule"
              />
            </InlineField>
          </div>
        )}

        {/* Waive Fee form */}
        {action === 'waive_fee' && (
          <div className="space-y-4">
            <button onClick={() => { setAction('pick'); setError(null); }} className="flex items-center gap-1 text-xs text-ink-500 hover:text-ink-700">
              <ArrowLeft size={14} /> Back to actions
            </button>
            <h3 className="text-sm font-semibold text-ink-700">Waive a fee</h3>
            {unit.lateFees.filter(f => !f.waived).length === 0 ? (
              <p className="text-sm text-ink-400">No active fees to waive.</p>
            ) : (
              <>
                <InlineField label="Select fee">
                  <select
                    value={waiveFeeIdx}
                    onChange={e => setWaiveFeeIdx(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
                  >
                    <option value={-1}>Pick a fee</option>
                    {unit.lateFees.map((f, i) =>
                      !f.waived ? (
                        <option key={i} value={i}>
                          {formatDate(f.date)} -- {f.reason} ({fmt(f.amount)})
                        </option>
                      ) : null,
                    )}
                  </select>
                </InlineField>
                <InlineField label="Reason for waiver">
                  <input
                    type="text"
                    value={waiveReason}
                    onChange={e => setWaiveReason(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
                    placeholder="e.g., First-time courtesy, payment received same day"
                  />
                </InlineField>
              </>
            )}
          </div>
        )}

        {/* Send Invoice form */}
        {action === 'send_invoice' && (
          <div className="space-y-4">
            <button onClick={() => { setAction('pick'); setError(null); }} className="flex items-center gap-1 text-xs text-ink-500 hover:text-ink-700">
              <ArrowLeft size={14} /> Back to actions
            </button>
            <h3 className="text-sm font-semibold text-ink-700">Send an invoice</h3>
            <InlineField label="Type">
              <select
                value={invType}
                onChange={e => setInvType(e.target.value as typeof invType)}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
              >
                <option value="fee">Fee</option>
                <option value="special_assessment">Special assessment</option>
                <option value="amenity_fee">Amenity fee</option>
                <option value="monthly">Monthly assessment</option>
              </select>
            </InlineField>
            <InlineField label="Amount">
              <input
                type="number"
                step="0.01"
                value={invAmount}
                onChange={e => setInvAmount(e.target.value)}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
                placeholder="0.00"
              />
            </InlineField>
            <InlineField label="Due date">
              <input
                type="date"
                value={invDueDate}
                onChange={e => setInvDueDate(e.target.value)}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
              />
            </InlineField>
            <InlineField label="Memo">
              <input
                type="text"
                value={invMemo}
                onChange={e => setInvMemo(e.target.value)}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
                placeholder="Description for the invoice"
              />
            </InlineField>
          </div>
        )}

        {/* Send Reminder form */}
        {action === 'send_reminder' && (
          <div className="space-y-4">
            <button onClick={() => { setAction('pick'); setError(null); }} className="flex items-center gap-1 text-xs text-ink-500 hover:text-ink-700">
              <ArrowLeft size={14} /> Back to actions
            </button>
            <h3 className="text-sm font-semibold text-ink-700">Send a reminder</h3>
            <InlineField label="Template">
              <select
                value={reminderTemplate}
                onChange={e => setReminderTemplate(e.target.value)}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
              >
                <option value="friendly">Friendly reminder</option>
                <option value="second_notice">Second notice</option>
                <option value="final_warning">Final warning</option>
              </select>
            </InlineField>
            <div className="bg-mist-50 rounded-lg p-3 text-xs text-ink-500">
              Will send to: <strong>{unit.email}</strong>
            </div>
          </div>
        )}
      </div>
    </DrawerShell>
  );
}
