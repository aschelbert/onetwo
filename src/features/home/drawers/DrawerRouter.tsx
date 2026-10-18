/**
 * DrawerRouter — Maps drawer IDs from the Home page to their corresponding
 * drawer components. Used when `features.v2Drawers` is enabled.
 */

import React from 'react';
import RunbookDrawer from '@/features/compliance/RunbookDrawer';

export type DrawerId = 'runbook' | null;

interface DrawerRouterProps {
  drawerId: DrawerId;
  /** Opaque context passed to the drawer — typically contains an itemId */
  context: Record<string, string>;
  onClose: () => void;
}

export default function DrawerRouter({ drawerId, context, onClose }: DrawerRouterProps) {
  if (!drawerId) return null;

  switch (drawerId) {
    case 'runbook':
      return (
        <RunbookDrawer
          itemId={context.itemId || ''}
          onClose={onClose}
        />
      );

    default:
      return null;
  }
}
