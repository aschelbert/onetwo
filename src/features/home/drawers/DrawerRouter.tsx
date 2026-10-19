/**
 * DrawerRouter -- Maps drawer IDs from the Home page to their corresponding
 * drawer components. Used when v2 feature flags are enabled.
 */

import RunbookDrawer from '@/features/compliance/RunbookDrawer';
import CloseMonthDrawer from '@/features/financial/CloseMonthDrawer';
import UnitDrawer from '@/features/financial/drawers/UnitDrawer';
import LateUnitsDrawer from '@/features/financial/drawers/LateUnitsDrawer';
import PayBillDrawer from '@/features/financial/drawers/PayBillDrawer';
import SpendingDrawer from '@/features/financial/drawers/SpendingDrawer';

export type DrawerId =
  | 'runbook'
  | 'close_month'
  | 'payment'
  | 'payment_batch'
  | 'bill'
  | 'approval';

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

    case 'payment':
      return (
        <UnitDrawer
          open={open}
          onClose={onClose}
          unitNumber={context.unitNumber || ''}
        />
      );

    case 'payment_batch':
      return (
        <LateUnitsDrawer
          open={open}
          onClose={onClose}
        />
      );

    case 'bill':
      return (
        <PayBillDrawer
          open={open}
          onClose={onClose}
        />
      );

    case 'approval':
      return (
        <SpendingDrawer
          open={open}
          onClose={onClose}
        />
      );

    default:
      return null;
  }
}
