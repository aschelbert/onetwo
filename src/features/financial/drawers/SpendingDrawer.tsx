/**
 * SpendingDrawer -- Three-question spending decision flow.
 *
 * 1. What needs doing (text, category, priority)
 * 2. How much (amount; under spendingLimit -> "President can approve",
 *    above -> "Needs a board vote")
 * 3. Pay from (Reserves or Operating)
 *
 * Primary creates approval; above limit also creates an agenda item.
 */

import { useState, useMemo } from 'react';
import { Banknote, Vote, ShieldCheck } from 'lucide-react';
import DrawerShell from '@/components/ui/DrawerShell';
import InlineField from '@/components/ui/InlineField';
import { useSpendingStore } from '@/store/useSpendingStore';
import type { SpendingApproval } from '@/store/useSpendingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useUndoableAction } from '@/hooks/useUndoableAction';
import { DEFAULT_SETTINGS, type BuildingSettings } from '@/lib/buildingSettings';
import { fmt } from '@/lib/formatters';

interface SpendingDrawerProps {
  open: boolean;
  onClose: () => void;
  settings?: BuildingSettings;
}

type Step = 'what' | 'how_much' | 'pay_from';

const CATEGORIES: Array<{ value: SpendingApproval['category']; label: string }> = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'capital', label: 'Capital improvement' },
  { value: 'operations', label: 'Operations' },
  { value: 'legal', label: 'Legal' },
  { value: 'other', label: 'Other' },
];

export default function SpendingDrawer({ open, onClose, settings }: SpendingDrawerProps) {
  const { addApproval } = useSpendingStore();
  const financialStore = useFinancialStore();
  const { currentUser } = useAuthStore();
  const { run: undoRun } = useUndoableAction();

  const spendingLimit = settings?.spendingLimit ?? DEFAULT_SETTINGS.spendingLimit;

  const [step, setStep] = useState<Step>('what');
  const [error, setError] = useState<string | null>(null);

  // Step 1: What
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<SpendingApproval['category']>('maintenance');
  const [priority, setPriority] = useState<SpendingApproval['priority']>('normal');

  // Step 2: How much
  const [amount, setAmount] = useState('');

  // Step 3: Pay from
  const [fundingSource, setFundingSource] = useState<'operating' | 'reserves'>('operating');

  const amountNum = parseFloat(amount) || 0;
  const isAboveLimit = amountNum > spendingLimit;
  const totalUnits = financialStore.units.length;
  const perUnit = totalUnits > 0 ? amountNum / totalUnits : amountNum;

  const operatingCash = useMemo(() => {
    const bs = financialStore.getBalanceSheet();
    return bs.assets.operating;
  }, [financialStore]);

  const reserveBalance = useMemo(() => {
    const bs = financialStore.getBalanceSheet();
    return bs.assets.reserves;
  }, [financialStore]);

  const stepNumber = step === 'what' ? 1 : step === 'how_much' ? 2 : 3;

  const resetForms = () => {
    setStep('what');
    setError(null);
    setTitle('');
    setCategory('maintenance');
    setPriority('normal');
    setAmount('');
    setFundingSource('operating');
  };

  const handleClose = () => {
    resetForms();
    onClose();
  };

  const handlePrimary = () => {
    setError(null);

    switch (step) {
      case 'what':
        if (!title.trim()) { setError('Describe what needs doing'); return; }
        setStep('how_much');
        break;

      case 'how_much':
        if (!amountNum || amountNum <= 0) { setError('Enter a valid amount'); return; }
        setStep('pay_from');
        break;

      case 'pay_from': {
        // Create the spending approval
        addApproval({
          title: title.trim(),
          description: '',
          amount: amountNum,
          category,
          requestedBy: currentUser.name,
          status: 'pending',
          priority,
          vendorName: '',
          workOrderId: '',
          votes: [],
          threshold: spendingLimit,
          notes: isAboveLimit ? 'Requires board vote -- auto-created from spending drawer' : '',
          decidedAt: '',
          fundingSource,
          caseId: '',
        });

        undoRun({
          label: isAboveLimit
            ? `Created spending request for ${fmt(amountNum)} (needs board vote)`
            : `Created spending request for ${fmt(amountNum)}`,
          undo: () => {
            // Remove the most recently added approval
            const latest = useSpendingStore.getState().approvals[0];
            if (latest) useSpendingStore.getState().deleteApproval(latest.id);
          },
          commit: () => {},
        });

        handleClose();
        break;
      }
    }
  };

  const handleBack = () => {
    setError(null);
    if (step === 'how_much') setStep('what');
    else if (step === 'pay_from') setStep('how_much');
  };

  const primaryLabels: Record<Step, string> = {
    what: 'Next: How much?',
    how_much: 'Next: Pay from?',
    pay_from: isAboveLimit ? 'Create request + agenda item' : 'Create request',
  };

  return (
    <DrawerShell
      open={open}
      onClose={handleClose}
      breadcrumb={['Money out', 'Spending decision', 'Treasurer']}
      title="Spending decision"
      step={{ current: stepNumber, total: 3 }}
      footer={{
        primaryLabel: primaryLabels[step],
        onPrimary: handlePrimary,
        secondaryLabel: step !== 'what' ? 'Back' : undefined,
        onSecondary: step !== 'what' ? handleBack : undefined,
      }}
    >
      <div className="space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Step 1: What needs doing */}
        {step === 'what' && (
          <>
            <h3 className="text-sm font-semibold text-ink-700">What needs doing?</h3>

            <InlineField label="Description">
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
                placeholder="e.g., Replace lobby security cameras"
                autoFocus
              />
            </InlineField>

            <InlineField label="Category">
              <select
                value={category}
                onChange={e => setCategory(e.target.value as SpendingApproval['category'])}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </InlineField>

            <InlineField label="Priority">
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as SpendingApproval['priority'])}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
              >
                <option value="normal">Normal</option>
                <option value="urgent">Urgent -- health/safety risk</option>
              </select>
            </InlineField>
          </>
        )}

        {/* Step 2: How much */}
        {step === 'how_much' && (
          <>
            <h3 className="text-sm font-semibold text-ink-700">How much?</h3>

            <InlineField label="Estimated cost">
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
                placeholder="0.00"
                autoFocus
              />
            </InlineField>

            {amountNum > 0 && (
              <div className={`rounded-lg p-4 flex items-start gap-3 ${
                isAboveLimit
                  ? 'bg-yellow-50 border border-yellow-200'
                  : 'bg-sage-50 border border-sage-200'
              }`}>
                {isAboveLimit ? (
                  <Vote size={20} className="text-yellow-600 mt-0.5 shrink-0" />
                ) : (
                  <ShieldCheck size={20} className="text-sage-600 mt-0.5 shrink-0" />
                )}
                <div>
                  <p className={`text-sm font-semibold ${isAboveLimit ? 'text-yellow-800' : 'text-sage-800'}`}>
                    {isAboveLimit ? 'Needs a board vote' : 'President can approve'}
                  </p>
                  <p className="text-xs text-ink-500 mt-1">
                    {isAboveLimit
                      ? `This exceeds the ${fmt(spendingLimit)} spending authority. A board vote will be created automatically.`
                      : `Under the ${fmt(spendingLimit)} spending limit. The president or treasurer can approve.`
                    }
                  </p>
                  {totalUnits > 0 && (
                    <p className="text-xs text-ink-400 mt-1">
                      {fmt(perUnit)}/unit if assessed across {totalUnits} units
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Step 3: Pay from */}
        {step === 'pay_from' && (
          <>
            <h3 className="text-sm font-semibold text-ink-700">Pay from?</h3>

            <div className="space-y-2">
              <button
                onClick={() => setFundingSource('operating')}
                className={`w-full flex items-start gap-3 p-4 rounded-lg border transition-colors text-left ${
                  fundingSource === 'operating'
                    ? 'border-accent-400 bg-accent-50 ring-1 ring-accent-200'
                    : 'border-ink-100 hover:border-ink-300'
                }`}
              >
                <Banknote size={20} className="text-accent-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-ink-800">Operating budget</p>
                  <p className="text-xs text-ink-500 mt-0.5">
                    Available: {fmt(operatingCash)}
                  </p>
                  {operatingCash < amountNum && (
                    <p className="text-xs text-red-600 mt-0.5 font-medium">
                      Short by {fmt(amountNum - operatingCash)}
                    </p>
                  )}
                </div>
              </button>

              <button
                onClick={() => setFundingSource('reserves')}
                className={`w-full flex items-start gap-3 p-4 rounded-lg border transition-colors text-left ${
                  fundingSource === 'reserves'
                    ? 'border-accent-400 bg-accent-50 ring-1 ring-accent-200'
                    : 'border-ink-100 hover:border-ink-300'
                }`}
              >
                <ShieldCheck size={20} className="text-accent-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-ink-800">Reserve fund</p>
                  <p className="text-xs text-ink-500 mt-0.5">
                    Available: {fmt(reserveBalance)}
                  </p>
                  {reserveBalance < amountNum && (
                    <p className="text-xs text-red-600 mt-0.5 font-medium">
                      Short by {fmt(amountNum - reserveBalance)}
                    </p>
                  )}
                </div>
              </button>
            </div>

            {/* Summary */}
            <div className="bg-mist-50 rounded-lg p-4 space-y-2">
              <p className="text-xs text-ink-400 font-medium uppercase">Summary</p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-700">{title}</span>
                <span className="text-sm font-bold text-ink-900">{fmt(amountNum)}</span>
              </div>
              <p className="text-xs text-ink-400 capitalize">{category} -- {priority}</p>
              <p className="text-xs text-ink-400">
                Funded from: {fundingSource === 'operating' ? 'Operating' : 'Reserves'}
              </p>
              {isAboveLimit && (
                <p className="text-xs text-yellow-700 font-medium mt-1">
                  Board vote required. An agenda item will be created.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </DrawerShell>
  );
}
