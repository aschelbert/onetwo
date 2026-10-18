/**
 * DrawerRouter — Maps drawer IDs from the Home page to their corresponding
 * drawer components. Used when v2 feature flags are enabled.
 */

import RunbookDrawer from '@/features/compliance/RunbookDrawer';
import CloseMonthDrawer from '@/features/financial/CloseMonthDrawer';
import ComposeDrawer from '@/features/boardroom/components/ComposeDrawer';

export type DrawerId = 'runbook' | 'close_month' | 'compose';

interface DrawerRouterProps {
  drawerId: DrawerId | null;
  open: boolean;
  onClose: () => void;
  context?: Record<string, string>;
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

    default:
      return null;
  }
}
