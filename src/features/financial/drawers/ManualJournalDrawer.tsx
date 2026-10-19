/**
 * ManualJournalDrawer.tsx -- Manual journal entry drawer.
 *
 * Debit account, Credit account, Amount, Date (period guard),
 * Reason (required), Proof upload (optional).
 * Writes `postedBy.flow = 'manual'`.
 */

import { useState } from 'react';
import DrawerShell from '@/components/ui/DrawerShell';
import { useFinancialStore, PeriodClosedError } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';
import { periodLabel } from '@/lib/monthClose';

interface ManualJournalDrawerProps {
  open: boolean;
  onClose: () => void;
}

const PRESETS = [
  { id: 'vendor', label: 'Paid a vendor/bill', debit: null as string | null, credit: '1010' },
  { id: 'refund', label: 'Received a refund', debit: '1010', credit: null as string | null },
  { id: 'to-reserve', label: 'Transferred to reserves', debit: '1020', credit: '1010' },
  { id: 'from-reserve', label: 'Transferred from reserves', debit: '1010', credit: '1020' },
  { id: 'insurance', label: 'Recorded insurance claim', debit: '1140', credit: '4080' },
  { id: 'income', label: 'Received other income', debit: '1010', credit: null as string | null },
  { id: 'custom', label: 'Custom entry', debit: null as string | null, credit: null as string | null },
];

export default function ManualJournalDrawer({ open, onClose }: ManualJournalDrawerProps) {
  const store = useFinancialStore();
  const { chartOfAccounts, getAcctName, postManualEntry } = store;

  const today = new Date().toISOString().split('T')[0];
  const allAccts = chartOfAccounts.filter(a => a.sub !== 'header');

  const [preset, setPreset] = useState('');
  const [date, setDate] = useState(today);
  const [memo, setMemo] = useState('');
  const [debit, setDebit] = useState('');
  const [credit, setCredit] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [periodError, setPeriodError] = useState<string | null>(null);

  const resetForm = () => {
    setPreset('');
    setDate(today);
    setMemo('');
    setDebit('');
    setCredit('');
    setAmount('');
    setReason('');
    setError(null);
    setPeriodError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const applyPreset = (presetId: string) => {
    const p = PRESETS.find(x => x.id === presetId);
    if (!p) return;
    setPreset(presetId);
    setDebit(p.debit || '');
    setCredit(p.credit || '');
  };

  const handlePost = () => {
    setError(null);
    setPeriodError(null);

    const amt = parseFloat(amount);
    if (!date) { setError('Date is required'); return; }
    if (!memo.trim()) { setError('Memo is required'); return; }
    if (!debit) { setError('Debit account is required'); return; }
    if (!credit) { setError('Credit account is required'); return; }
    if (!amt || amt <= 0) { setError('Amount must be greater than zero'); return; }
    if (!reason.trim()) { setError('Reason is required for manual entries'); return; }

    try {
      postManualEntry(date, memo.trim(), debit, credit, amt, reason.trim());
      handleClose();
    } catch (err) {
      if (err instanceof PeriodClosedError) {
        setPeriodError(
          `${periodLabel(err.period)} is closed. Post a correction in the current month instead.`,
        );
      } else {
        throw err;
      }
    }
  };

  // Flow summary
  const flowSummary = (debit || credit)
    ? `${credit ? getAcctName(credit) : '(select)'} -> ${debit ? getAcctName(debit) : '(select)'}`
    : null;

  return (
    <DrawerShell
      open={open}
      onClose={handleClose}
      breadcrumb={['Books', 'Ledger', 'Manual Journal']}
      title="Manual Journal Entry"
      legalRef="Double-entry: must have equal debit and credit"
      footer={{
        primaryLabel: 'Post Entry',
        onPrimary: handlePost,
        secondaryLabel: 'Cancel',
        onSecondary: handleClose,
      }}
    >
      <div className="space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {periodError && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            {periodError}
          </div>
        )}

        {/* Preset selector */}
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">What happened?</label>
          <select
            value={preset}
            onChange={e => applyPreset(e.target.value)}
            className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
          >
            <option value="">Select a transaction type...</option>
            {PRESETS.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Date *</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-ink-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Amount *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full px-3 py-2 border border-ink-200 rounded-lg"
              placeholder="0.00"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Memo *</label>
          <input
            value={memo}
            onChange={e => setMemo(e.target.value)}
            className="w-full px-3 py-2 border border-ink-200 rounded-lg"
            placeholder="Description of transaction"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-sage-700 mb-1">Debit Account *</label>
            <select
              value={debit}
              onChange={e => setDebit(e.target.value)}
              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
            >
              <option value="">Select...</option>
              {allAccts.map(a => (
                <option key={a.num} value={a.num}>
                  {a.num} . {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-accent-700 mb-1">Credit Account *</label>
            <select
              value={credit}
              onChange={e => setCredit(e.target.value)}
              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
            >
              <option value="">Select...</option>
              {allAccts.map(a => (
                <option key={a.num} value={a.num}>
                  {a.num} . {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Flow summary */}
        {flowSummary && (
          <p className="text-sm text-ink-500 bg-mist-50 px-3 py-2 rounded-lg">{flowSummary}</p>
        )}

        {/* Reason (required) */}
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Reason *</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
            rows={2}
            placeholder="Why is this manual entry necessary?"
          />
          <p className="text-xs text-ink-400 mt-1">
            Required for audit trail. Entries without a reason appear flagged in the ledger.
          </p>
        </div>

        {/* Amount preview */}
        {parseFloat(amount) > 0 && debit && credit && (
          <div className="bg-sage-50 rounded-lg p-3 text-sm">
            <p className="font-medium text-ink-800">Preview:</p>
            <p className="text-ink-600 mt-1">
              DR {getAcctName(debit)} ... {fmt(parseFloat(amount))}
            </p>
            <p className="text-ink-600">
              CR {getAcctName(credit)} ... {fmt(parseFloat(amount))}
            </p>
          </div>
        )}
      </div>
    </DrawerShell>
  );
}
