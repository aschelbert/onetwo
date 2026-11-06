import type { ReactElement } from 'react';
import AccountSettingsPage from '@/features/account/AccountSettingsPage';
import MyUnitPage from '@/features/unit-manager/MyUnitPage';
import UserManagementPage from '@/features/user-management/UserManagementPage';
import SubscriptionPage from '@/features/subscription/SubscriptionPage';
import HelpSupportPage from '@/features/support/HelpSupportPage';
import { useUx2 } from '../flags';
import MeModule, { type MeTab } from './MeModule';

/** Each Me route shows the module tab behind ux2.me, the production page otherwise. */
function meSwitch(tab: MeTab, Legacy: () => ReactElement) {
  return function Switch() {
    return useUx2('me') ? <MeModule tab={tab} /> : <Legacy />;
  };
}

export const AccountSwitch = meSwitch('account', AccountSettingsPage);
export const MyUnitSwitch = meSwitch('unit', MyUnitPage);
export const UsersSwitch = meSwitch('users', UserManagementPage);
export const SubscriptionSwitch = meSwitch('subscription', SubscriptionPage);
export const SupportSwitch = meSwitch('help', HelpSupportPage);
