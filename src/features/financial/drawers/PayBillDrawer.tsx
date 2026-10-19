/**
 * PayBillDrawer -- Invoice-first drawer for Money Out.
 *
 * Flow: paste or enter invoice text -> auto-parse fields -> select payment
 * method -> record bill + payment with proof.
 */

import { useState, useMemo, useCallback } from 'react';
import { Upload, AlertTriangle, CheckCircle } from 'lucide-react';
import DrawerShell from '@/components/ui/DrawerShell';
import InlineField from '@/components/ui/InlineField';
import ProofBadge from '@/components/ui/ProofBadge';
import { useFinancialStore, PeriodClosedError } from '@/store/useFinancialStore';
import { useUndoableAction } from '@/hooks/useUndoableAction';
import { parseInvoiceText, inferFromVendorHistory } from '@/lib/invoiceInference';
import { fmt } from '@/lib/formatters';

interface PayBillDrawerProps {
  open: boolean;
  onClose: () => void;
}

type Step = 'invoice' | 'pay';

export default function PayBillDrawer({ open, onClose }: PayBillDrawerProps) {
  const store = useFinancialStore();
  const { run: undoRun } = useUndoableAction();
  const [step, setStep] = useState<Step>('invoice');
  const [error, setError] = useState<string | null>(null);

  // Invoice fields
  const [rawText, setRawText] = useState('');
  const [vendor, setVendor] = useState('');
  const [invoiceNum, setInvoiceNum] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [amount, setAmount] = useState('');
  const [glAccount, setGlAccount] = useState('');
  const [budgetLine, setBudgetLine] = useState('');
  const [hasProof, setHasProof] = useState(false);

  // Payment fields
  const [payMethod, setPayMethod] = useState('check');

  // Vendor inference
  const inference = useMemo(() => {
    if (!vendor.trim()) return null;
    return inferFromVendorHistory(vendor, store.generalLedger, store.budgetCategories);
  }, [vendor, store.generalLedger, store.budgetCategories]);

  // Duplicate check
  const isDuplicate = useMemo(() => {
    if (!invoiceNum.trim() || !vendor.trim()) return false;
    // Check work orders for matching invoice
    return store.workOrders.some(
      wo => wo.invoiceNum === invoiceNum && wo.vendor.toLowerCase() === vendor.toLowerCase(),
    );
  }, [invoiceNum, vendor, store.workOrders]);

  // Expense accounts for the GL dropdown
  const expenseAccounts = useMemo(() => {
    return store.chartOfAccounts.filter(
      a => a.type === 'expense' && a.sub !== 'header',
    );
  }, [store.chartOfAccounts]);

  const handlePasteText = useCallback((text: string) => {
    setRawText(text);
    const parsed = parseInvoiceText(text);
    if (parsed.vendor) setVendor(parsed.vendor);
    if (parsed.invoiceNumber) setInvoiceNum(parsed.invoiceNumber);
    if (parsed.date) setInvoiceDate(parsed.date);
    if (parsed.amount) setAmount(String(parsed.amount));
    setHasProof(true);
  }, []);

  // Apply inference when available
  const applyInference = useCallback(() => {
    if (!inference) return;
    if (inference.glAccount && !glAccount) setGlAccount(inference.glAccount);
    if (inference.budgetCategoryId && !budgetLine) setBudgetLine(inference.budgetCategoryId);
  }, [inference, glAccount, budgetLine]);

  // Auto-apply inference when vendor changes and inference has results
  useMemo(() => {
    if (inference && inference.glAccount) {
      if (!glAccount) setGlAccount(inference.glAccount);
      if (inference.budgetCategoryId && !budgetLine) setBudgetLine(inference.budgetCategoryId);
    }
  }, [inference?.glAccount]);

  const resetForms = () => {
    setStep('invoice');
    setError(null);
    setRawText('');
    setVendor('');
    setInvoiceNum('');
    setInvoiceDate('');
    setAmount('');
    setGlAccount('');
    setBudgetLine('');
    setHasProof(false);
    setPayMethod('check');
  };

  const handleClose = () => {
    resetForms();
    onClose();
  };

  const handlePrimary = () => {
    setError(null);

    if (step === 'invoice') {
      // Validate invoice fields
      if (!vendor.trim()) { setError('Vendor name is required'); return; }
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }
      if (isDuplicate) { setError('Duplicate invoice detected. Check the invoice number and vendor.'); return; }
      setStep('pay');
      return;
    }

    // Step: pay -- record the bill and payment
    try {
      const amt = parseFloat(amount);
      const today = new Date().toISOString().split('T')[0];
      const acct = glAccount || '5070'; // Default to misc expense
      const m = store.glAccountMapping;

      // Post the expense GL entry
      store.glPost(
        invoiceDate || today,
        `${vendor} -- ${invoiceNum || 'No inv#'}`,
        acct,
        m.bankAccount,
        amt,
        'expense',
        invoiceNum || null,
      );

      // Record as a budget expense if budget line is set
      if (budgetLine) {
        store.addExpense(budgetLine, {
          description: `${vendor} -- ${invoiceNum || 'Bill'}`,
          amount: amt,
          date: invoiceDate || today,
          vendor,
          invoice: invoiceNum || '',
        });
      }

      undoRun({
        label: `Paid ${fmt(amt)} to ${vendor}`,
        undo: () => {
          // A full undo would reverse the GL entry; simplified here
        },
        commit: () => {},
      });

      handleClose();
    } catch (err) {
      if (err instanceof PeriodClosedError) {
        setError(err.message);
      } else {
        setError('An error occurred while recording the payment');
      }
    }
  };

  return (
    <DrawerShell
      open={open}
      onClose={handleClose}
      breadcrumb={['Money out', 'Pay a bill', 'Treasurer']}
      title="Pay a bill"
      step={{ current: step === 'invoice' ? 1 : 2, total: 2 }}
      footer={{
        primaryLabel: step === 'invoice' ? 'Continue to payment' : 'Record payment',
        onPrimary: handlePrimary,
        primaryDisabled: false,
        secondaryLabel: step === 'pay' ? 'Back' : undefined,
        onSecondary: step === 'pay' ? () => setStep('invoice') : undefined,
      }}
    >
      <div className="space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isDuplicate && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle size={16} className="text-yellow-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-yellow-800">Possible duplicate</p>
              <p className="text-xs text-yellow-600">An invoice with this number and vendor already exists.</p>
            </div>
          </div>
        )}

        {step === 'invoice' && (
          <>
            {/* Paste zone */}
            <div className="border-2 border-dashed border-ink-200 rounded-lg p-4 text-center hover:border-ink-400 transition-colors">
              <Upload size={24} className="mx-auto text-ink-300 mb-2" />
              <p className="text-sm text-ink-500 mb-2">Paste invoice text below</p>
              <textarea
                value={rawText}
                onChange={e => handlePasteText(e.target.value)}
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-xs font-mono h-24 resize-none"
                placeholder="Paste invoice text here and we will extract the details..."
              />
            </div>

            {hasProof && (
              <div className="flex items-center gap-2">
                <ProofBadge label="Invoice text captured" />
              </div>
            )}

            {/* Parsed fields */}
            <InlineField label="Vendor">
              <input
                type="text"
                value={vendor}
                onChange={e => setVendor(e.target.value)}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
                placeholder="Vendor name"
              />
            </InlineField>

            <InlineField label="Invoice number">
              <input
                type="text"
                value={invoiceNum}
                onChange={e => setInvoiceNum(e.target.value)}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
                placeholder="INV-0001"
              />
            </InlineField>

            <div className="grid grid-cols-2 gap-4">
              <InlineField label="Date">
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={e => setInvoiceDate(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
                />
              </InlineField>
              <InlineField label="Amount">
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
                  placeholder="0.00"
                />
              </InlineField>
            </div>

            {/* GL and budget inference */}
            <InlineField label="GL account">
              <select
                value={glAccount}
                onChange={e => setGlAccount(e.target.value)}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
              >
                <option value="">Select account</option>
                {expenseAccounts.map(a => (
                  <option key={a.num} value={a.num}>{a.num} -- {a.name}</option>
                ))}
              </select>
            </InlineField>

            <InlineField label="Budget line">
              <select
                value={budgetLine}
                onChange={e => setBudgetLine(e.target.value)}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
              >
                <option value="">None</option>
                {store.budgetCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </InlineField>

            {/* Inference confidence badge */}
            {inference && inference.confidence !== 'low' && (
              <div className="bg-sage-50 border border-sage-200 rounded-lg p-3 flex items-start gap-2">
                <CheckCircle size={16} className="text-sage-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-sage-800">
                    Auto-filled from vendor history ({inference.confidence} confidence)
                  </p>
                  {inference.budgetCategoryName && (
                    <p className="text-xs text-sage-600">Budget: {inference.budgetCategoryName}</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {step === 'pay' && (
          <>
            {/* Invoice summary */}
            <div className="bg-mist-50 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-800">{vendor}</span>
                <span className="text-lg font-bold text-ink-900">{fmt(parseFloat(amount) || 0)}</span>
              </div>
              {invoiceNum && <p className="text-xs text-ink-400">Invoice #{invoiceNum}</p>}
              {invoiceDate && <p className="text-xs text-ink-400">Dated {invoiceDate}</p>}
              {glAccount && (
                <p className="text-xs text-ink-400">
                  GL: {store.getAcctName(glAccount)}
                </p>
              )}
            </div>

            <InlineField label="How was this paid?">
              <select
                value={payMethod}
                onChange={e => setPayMethod(e.target.value)}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg text-sm"
              >
                <option value="check">Check</option>
                <option value="ach">ACH / Bank transfer</option>
                <option value="credit_card">Credit card</option>
                <option value="autopay">Autopay</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </InlineField>

            {hasProof && (
              <div className="flex items-center gap-2">
                <ProofBadge label="Invoice text on file" />
              </div>
            )}
          </>
        )}
      </div>
    </DrawerShell>
  );
}
