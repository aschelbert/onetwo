/**
 * DrawerRouter — Maps drawer IDs from the Home page to their corresponding
 * drawer components. Used when v2 feature flags are enabled.
 *
 * New IDs that map to LegacyActionDrawer (placeholder) until their full
 * drawers land in later handoffs: payment, meeting, case_new,
 * vote, approval, request, collections_offer, case_step, payment_batch.
 */

import DrawerShell from '@/components/ui/DrawerShell';
import RunbookDrawer from '@/features/compliance/RunbookDrawer';
import CloseMonthDrawer from '@/features/financial/CloseMonthDrawer';
import ComposeDrawer from '@/features/boardroom/components/ComposeDrawer';

export type DrawerId =
  | 'runbook'
  | 'close_month'
  | 'compose'
  | 'payment'
  | 'meeting'
  | 'case_new'
  | 'vote'
  | 'approval'
  | 'request'
  | 'collections_offer'
  | 'case_step'
  | 'payment_batch';

const LEGACY_LABELS: Record<string, string> = {
  payment: 'Record Payment',
  meeting: 'Meeting',
  case_new: 'New Case',
  vote: 'Board Vote',
  approval: 'Spending Approval',
  request: 'Owner Request',
  collections_offer: 'Collections',
  case_step: 'Case Step',
  payment_batch: 'Payment Batch',
};

interface DrawerRouterProps {
  drawerId: DrawerId | null;
  open: boolean;
  onClose: () => void;
  context?: Record<string, string>;
}

/**
 * LegacyActionDrawer -- placeholder shown inside DrawerShell for drawer IDs
 * whose full implementation lives in a future handoff.
 */
function LegacyActionDrawer({
  drawerId,
  open,
  onClose,
  context,
}: {
  drawerId: string;
  open: boolean;
  onClose: () => void;
  context: Record<string, string>;
}) {
  const label = LEGACY_LABELS[drawerId] || drawerId;

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      breadcrumb={['Home', label]}
      title={label}
      footer={{
        primaryLabel: 'Close',
        onPrimary: onClose,
      }}
    >
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-ink-500 mb-2">Full drawer coming in a future update.</p>
        <p className="text-xs text-ink-400">
          Drawer: <code className="bg-ink-50 px-1.5 py-0.5 rounded text-ink-600">{drawerId}</code>
        </p>
        {Object.keys(context).length > 0 && (
          <div className="mt-4 text-xs text-ink-400">
            <p className="font-medium mb-1">Context:</p>
            {Object.entries(context).map(([k, v]) => (
              <p key={k}>
                <code className="bg-ink-50 px-1 rounded">{k}</code> = {v}
              </p>
            ))}
          </div>
        )}
      </div>
    </DrawerShell>
  );
}

export default function DrawerRouter({ drawerId, open, onClose, context = {} }: DrawerRouterProps) {
  if (!drawerId || !open) return null;

  switch (drawerId) {
    case 'runbook':
      return (
        <RunbookDrawer
          itemId={context.itemId || ''}
          onClose={onClose}
        />
      );

    case 'close_month':
      return (
        <CloseMonthDrawer
          open={open}
          onClose={onClose}
          period={context.period || new Date().toISOString().slice(0, 7)}
        />
      );

    case 'compose':
      return (
        <ComposeDrawer
          open={open}
          onClose={onClose}
          prefillRecipient={context.recipient}
        />
      );

    case 'payment':
    case 'meeting':
    case 'case_new':
    case 'vote':
    case 'approval':
    case 'request':
    case 'collections_offer':
    case 'case_step':
    case 'payment_batch':
      return (
        <LegacyActionDrawer
          drawerId={drawerId}
          open={open}
          onClose={onClose}
          context={context}
        />
      );

    default:
      return null;
  }
}
