/**
 * DrawerRouter maps drawer IDs to their corresponding components.
 * This is the single entry point for all drawers opened from the v2 home page.
 *
 * Usage:
 *   <DrawerRouter drawerId="close_month" open={true} onClose={fn} props={{ period: '2026-10' }} />
 */

import CloseMonthDrawer from '@/features/financial/CloseMonthDrawer';

export type DrawerId = 'close_month';

interface DrawerRouterProps {
  drawerId: DrawerId | null;
  open: boolean;
  onClose: () => void;
  props?: Record<string, unknown>;
}

export default function DrawerRouter({ drawerId, open, onClose, props = {} }: DrawerRouterProps) {
  if (!drawerId || !open) return null;

  switch (drawerId) {
    case 'close_month':
      return (
        <CloseMonthDrawer
          open={open}
          onClose={onClose}
          period={(props.period as string) || new Date().toISOString().slice(0, 7)}
        />
      );
    default:
      return null;
  }
}
