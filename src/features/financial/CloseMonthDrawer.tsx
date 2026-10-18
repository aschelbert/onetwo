import { useState, useMemo } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useCommunicationsStore } from '@/store/useCommunicationsStore';
import { useTenantContext } from '@/components/TenantProvider';
import { useAuthStore } from '@/store/useAuthStore';
import { useUndoableAction } from '@/hooks/useUndoableAction';
import { buildStatement, closeChecklist, periodLabel } from '@/lib/monthClose';
import { fmt } from '@/lib/formatters';
import DrawerShell from '@/components/ui/DrawerShell';
import { Lock, Mail, Archive, FileText } from 'lucide-react';

interface CloseMonthDrawerProps {
  open: boolean;
  onClose: () => void;
  period: string;
}

export default function CloseMonthDrawer({ open, onClose, period }: CloseMonthDrawerProps) {
  const store = useFinancialStore();
  const commsStore = useCommunicationsStore();
  const tenant = useTenantContext();
  const currentUser = useAuthStore(s => s.currentUser);
  const { run: runUndo } = useUndoableAction();

  const [emailOwners, setEmailOwners] = useState(true);
  const [postCommunityRoom, setPostCommunityRoom] = useState(true);
  const [filePDF, setFilePDF] = useState(true);
  const [lockEntries, setLockEntries] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [ownerNote, setOwnerNote] = useState('');
  const [isClosing, setIsClosing] = useState(false);

  const monthName = periodLabel(period);
  const closedByName = currentUser?.name || currentUser?.email || 'Treasurer';

  // Compute checklist steps
  const steps = useMemo(() => {
    return closeChecklist(period, {
      generalLedger: store.generalLedger,
      units: store.units,
      workOrders: store.workOrders,
      invoices: store.unitInvoices,
      communications: commsStore.communications.map(c => ({
        type: c.source === 'compose' && c.subject?.toLowerCase().includes('statement') ? 'statement' : c.source || '',
        date: c.createdAt,
      })),
      settings: { hoaDueDay: store.hoaDueDay },
    });
  }, [store.generalLedger, store.units, store.workOrders, store.unitInvoices, commsStore.communications, store.hoaDueDay, period]);

  const doneCount = steps.filter(s => s.done).length;

  // Build the statement preview
  const bs = store.getBalanceSheet();
  const statement = useMemo(() => {
    return buildStatement(period, {
      generalLedger: store.generalLedger,
      units: store.units,
      workOrders: store.workOrders,
      invoices: store.unitInvoices,
      reserveItems: store.reserveItems,
      budgetCategories: store.budgetCategories,
      operatingCash: bs.assets.operating,
      prevOperatingCash: bs.assets.operating, // Simplified: use current as prev for demo
      buildingName: tenant.name,
      period,
      closedBy: closedByName,
      decisions: [],
    });
  }, [period, store.generalLedger, store.units, store.workOrders, store.unitInvoices, store.reserveItems, store.budgetCategories, bs.assets.operating, tenant.name, closedByName]);

  const handleClose = async () => {
    setIsClosing(true);

    const checklist: Record<string, boolean> = {};
    steps.forEach(s => { checklist[s.key] = s.done; });

    const closeRow = store.closeMonth(period, {
      lock: lockEntries,
      statementDoc: { html: statement.html, text: statement.text },
      closedBy: closedByName,
      checklist,
    });

    // Add a communication of type statement
    if (emailOwners || postCommunityRoom) {
      commsStore.sendCommunication({
        scope: 'community',
        subject: `${monthName} -- Monthly Financial Statement`,
        body: ownerNote ? `${ownerNote}\n\n${statement.text}` : statement.text,
        templateId: null,
        templateName: null,
        channels: [
          ...(emailOwners ? ['email' as const] : []),
          ...(postCommunityRoom ? ['announcement' as const] : []),
        ],
        recipientUnit: null,
        recipientName: null,
        recipientEmail: null,
        mailDeliveryMethod: null,
        mailLetterCount: 0,
        caseId: null,
        stepIdx: null,
        source: 'compose',
        createdBy: closedByName,
      });
    }

    setIsClosing(false);
    onClose();

    // Undo: revert the close row (not the email)
    runUndo({
      label: `${monthName} closed`,
      undo: () => {
        store.reopenMonth(period);
      },
      commit: () => {
        // Close is already persisted; nothing additional needed
      },
      ms: 10000,
    });
  };

  const { figures } = statement;

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      breadcrumb={['This month', `Step ${doneCount} of 4`, 'Treasurer']}
      title={`Close ${monthName}`}
      legalRef="DC Code 42-1903.14"
      footer={{
        primaryLabel: isClosing ? 'Closing...' : `Close ${monthName} and send statement`,
        onPrimary: handleClose,
        primaryDisabled: isClosing,
        secondaryLabel: 'Cancel',
        onSecondary: onClose,
        tertiaryLink: !showNote
          ? { label: 'Add a note to owners', onClick: () => setShowNote(true) }
          : undefined,
      }}
    >
      <div className="space-y-6">
        {/* Statement preview card */}
        <div className="rounded-xl overflow-hidden border border-ink-200">
          {/* Navy header */}
          <div className="bg-navy text-white px-5 py-4">
            <h3 className="font-display text-base font-bold">{tenant.name}</h3>
            <p className="text-xs text-white/70 mt-0.5">
              Monthly Treasurer's Statement -- {monthName}
            </p>
          </div>

          {/* Four-figure grid */}
          <div className="grid grid-cols-2 gap-px bg-ink-100">
            {[
              { label: 'Collected', value: fmt(figures.collected) },
              { label: 'Collection Rate', value: `${figures.collectionRate}%` },
              { label: 'Operating Cash', value: fmt(figures.operatingCash) },
              { label: `Reserves (${figures.reservePct}%)`, value: fmt(figures.reserves) },
            ].map(f => (
              <div key={f.label} className="bg-white px-4 py-3">
                <p className="text-[10px] text-ink-400 uppercase tracking-wide">{f.label}</p>
                <p className="text-lg font-bold text-ink-900 mt-0.5">{f.value}</p>
              </div>
            ))}
          </div>

          {/* Narrative line */}
          <div className="bg-white px-5 py-3 border-t border-ink-100">
            <p className="text-xs text-ink-500 leading-relaxed">
              In {monthName}, the association collected {fmt(figures.collected)} on {fmt(figures.billed)} billed
              ({figures.collectionRate}% rate).
              {figures.pastDueUnits > 0
                ? ` ${figures.pastDueUnits} unit${figures.pastDueUnits !== 1 ? 's' : ''} past due totaling ${fmt(figures.pastDueTotal)}.`
                : ' All units are current.'}
              {' '}Operating expenses of {fmt(figures.expensesPaid)} were paid.
            </p>
          </div>
        </div>

        {/* Options checkboxes */}
        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={emailOwners}
              onChange={e => setEmailOwners(e.target.checked)}
              className="mt-0.5 rounded border-ink-300 text-navy focus:ring-navy"
            />
            <div>
              <span className="text-sm font-medium text-ink-800 flex items-center gap-1.5">
                <Mail size={13} className="text-ink-400" />
                Email statement to owners
              </span>
              <span className="text-xs text-ink-400 block mt-0.5">
                Post in Community Room
              </span>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={postCommunityRoom}
              onChange={e => setPostCommunityRoom(e.target.checked)}
              className="mt-0.5 rounded border-ink-300 text-navy focus:ring-navy"
            />
            <div>
              <span className="text-sm font-medium text-ink-800 flex items-center gap-1.5">
                <FileText size={13} className="text-ink-400" />
                Post in Community Room
              </span>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={filePDF}
              onChange={e => setFilePDF(e.target.checked)}
              className="mt-0.5 rounded border-ink-300 text-navy focus:ring-navy"
            />
            <div>
              <span className="text-sm font-medium text-ink-800 flex items-center gap-1.5">
                <Archive size={13} className="text-ink-400" />
                File PDF in The Archives under Financials {new Date().getFullYear()}
              </span>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={lockEntries}
              onChange={e => setLockEntries(e.target.checked)}
              className="mt-0.5 rounded border-ink-300 text-navy focus:ring-navy"
            />
            <div>
              <span className="text-sm font-medium text-ink-800 flex items-center gap-1.5">
                <Lock size={13} className="text-ink-400" />
                Lock entries for {monthName}
              </span>
              <span className="text-xs text-ink-400 block mt-0.5">
                Prevents new GL entries from being posted to this period. Corrections must be posted in the current month.
              </span>
            </div>
          </label>
        </div>

        {/* Owner note textarea */}
        {showNote && (
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              Note to owners
            </label>
            <textarea
              value={ownerNote}
              onChange={e => setOwnerNote(e.target.value)}
              placeholder="Add a message to include with the statement..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy resize-none"
            />
          </div>
        )}
      </div>
    </DrawerShell>
  );
}
