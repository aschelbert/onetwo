import { useState } from 'react';
/**
 * Me — the avatar-menu area (ux2.me): My Account, My Unit(s), User
 * Management, Subscription, Help & Support. Each keeps its production route
 * (`/account`, `/my-unit`, `/admin/users`, `/subscription`, `/support`) so
 * the avatar menu and every old link still work; the module draws one
 * header and tab row over them. Each tab is built to its design board and
 * writes through the same paths production used: profile saves and unit
 * linking in the auth store, invites through `send-invite`, Chargebee
 * through `manage-subscription` and `chargebee-portal`, support threads in
 * the admin project.
 */
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useTenantContext } from '@/components/TenantProvider';
import { Button, PillTabs, ModuleHeader, HeaderSlotProvider } from '../components';
import { useMeSnapshot } from './useMeSnapshot';
import AccountTab from './tabs/AccountTab';
import UnitsTab from './tabs/UnitsTab';
import UsersTab from './tabs/UsersTab';
import SubscriptionTab from './tabs/SubscriptionTab';
import HelpTab from './tabs/HelpTab';

export type MeTab = 'account' | 'unit' | 'users' | 'subscription' | 'help';

export const ME_PATHS: Record<MeTab, string> = { account: '/account', unit: '/my-unit', users: '/admin/users', subscription: '/subscription', help: '/support' };

export function meTabForPath(pathname: string): MeTab {
  if (pathname.startsWith('/my-unit')) return 'unit';
  if (pathname.startsWith('/admin/users')) return 'users';
  if (pathname.startsWith('/subscription')) return 'subscription';
  if (pathname.startsWith('/support')) return 'help';
  return 'account';
}

export default function MeModule({ tab: forced }: { tab?: MeTab } = {}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tab = forced ?? meTabForPath(pathname);
  const snap = useMeSnapshot();
  const tenant = useTenantContext();
  const signOut = useAuthStore(s => s.signOut);
  const role = snap.viewer.role;
  const canManage = role === 'BOARD_MEMBER' || role === 'PROPERTY_MANAGER';
  const canBill = role === 'BOARD_MEMBER';
  const units = snap.viewer.linkedUnits;

  const tabs = [
    { id: 'account' as MeTab, label: 'My Account' },
    { id: 'unit' as MeTab, label: units.length > 1 ? 'My Units' : 'My Unit', badge: units.length > 1 ? units.length : units[0], badgeTone: 'cyan' as const },
    ...(canManage ? [{ id: 'users' as MeTab, label: 'User Management', badge: 'Admin', badgeTone: 'ghost' as const }] : []),
    ...(canBill ? [{ id: 'subscription' as MeTab, label: 'Subscription', badge: tenant.tier === 'facilities' ? 'Plus Facilities' : 'Self-Managed', badgeTone: 'ghost' as const }] : []),
    { id: 'help' as MeTab, label: 'Help & Support' },
  ];

  const title = { account: 'My Account', unit: units.length > 1 ? 'My Units' : `My Unit${units[0] ? ` · ${units[0]}` : ''}`, users: 'User Management', subscription: 'Subscription', help: 'Help & Support' }[tab];
  const subtitle = {
    account: `Profile, notifications and preferences. Signed in as ${snap.viewer.email}${snap.viewer.officerTitle ? ` · ${snap.viewer.officerTitle}` : ''}.`,
    unit: units.length > 1 ? `${units.length} units on one sign-in. One vote per unit, one ledger per unit, one place to see both.` : `${tenant.name} · dues on the ${snap.hoaDueDay}${['th', 'st', 'nd', 'rd'][(snap.hoaDueDay % 100 - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][snap.hoaDueDay % 100] ?? 'th'} · the same page every owner sees.`,
    users: `Who can sign in to ${tenant.name}, what each role sees, and the invites still out. Admin only.`,
    subscription: `${tenant.name}'s plan, billing and add-ons. Only admins see this tab.`,
    help: 'Find an answer, learn how ONE two works, or reach a person.',
  }[tab];

  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  return (
    <HeaderSlotProvider value={headerSlot}>
      <div data-page="ux2-me" className="flex flex-col gap-5">
        <ModuleHeader
          slotRef={setHeaderSlot}
          title={title}
          subtitle={subtitle}
          tabs={<PillTabs tabs={tabs} value={tab} onChange={id => navigate(ME_PATHS[id])} aria-label="Me sections" />}
          actions={
            tab === 'unit' ? (units.length > 0 ? <Button onClick={() => navigate('/my-unit/pay')}>Pay</Button> : undefined)
            : tab === 'account' ? <Button variant="ghost" onClick={() => { signOut(); navigate('/login'); }}>Sign out</Button>
            : tab === 'users' ? <><Button onClick={() => document.getElementById('invite-card')?.scrollIntoView({ behavior: 'smooth' })}>Invite someone</Button><Button variant="ghost" onClick={() => document.getElementById('invite-card')?.scrollIntoView({ behavior: 'smooth' })}>Bulk invite</Button></>
            : tab === 'subscription' ? <><Button onClick={() => document.getElementById('plans-card')?.scrollIntoView({ behavior: 'smooth' })}>Manage plan</Button><Button variant="ghost" onClick={() => document.getElementById('invoices-card')?.scrollIntoView({ behavior: 'smooth' })}>Latest invoice</Button></>
            : <Button onClick={() => document.getElementById('thread-card')?.scrollIntoView({ behavior: 'smooth' })}>New support thread</Button>
          }
        />

        {tab === 'account' && <AccountTab snap={snap} />}
        {tab === 'unit' && <UnitsTab snap={snap} />}
        {tab === 'users' && canManage && <UsersTab snap={snap} />}
        {tab === 'subscription' && canBill && <SubscriptionTab snap={snap} />}
        {tab === 'help' && <HelpTab snap={snap} />}
      </div>
    </HeaderSlotProvider>
  );
}
