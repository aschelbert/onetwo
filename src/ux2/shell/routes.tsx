/**
 * Route glue for the redesign: the old paths keep working as redirects into
 * the module that absorbed them (nothing a bookmark or an email ever
 * linked to goes dead), and the two role-sensitive routes pick the right
 * screen for owners.
 */
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import BoardRoomPage from '@/features/boardroom/BoardRoomPage';
import IssuesPage from '@/features/issues/IssuesPage';
import { useAuthStore } from '@/store/useAuthStore';
import BuildingModule, { MOVED_TABS, resolveBuildingTab } from '../building/BuildingModule';
import BoardRoomModule from '../boardroom/BoardRoomModule';

/** Redirect to `to`, keeping the query string (so `?view=case:…` and `?tab=…` survive). */
export function RedirectKeepQuery({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

/** `/building`: the module, unless the tab id asks for a section that moved to Community or the Board Room. */
export function BuildingRoute() {
  const [params] = useSearchParams();
  const moved = MOVED_TABS[params.get('tab') ?? ''];
  return moved ? <Navigate to={moved} replace /> : <BuildingModule />;
}

/** The Archives and Association Team pages live under Building now, except the Association Team tabs that moved on (`MOVED_TABS`). */
export function BuildingRedirect({ defaultTab }: { defaultTab: string }) {
  const [params] = useSearchParams();
  const raw = params.get('tab') ?? defaultTab;
  if (MOVED_TABS[raw]) return <Navigate to={MOVED_TABS[raw]} replace />;
  const { tab, section } = resolveBuildingTab(raw);
  const q = new URLSearchParams();
  if (tab !== 'overview') q.set('tab', tab);
  if (section) q.set('section', section);
  return <Navigate to={`/building${q.toString() ? `?${q}` : ''}`} replace />;
}

/**
 * `/boardroom`: the board's operations module. Duties and the Governance
 * Calendar live under Building › Obligations, meetings and votes under
 * Community; those tab ids redirect there. Owners go to Community.
 * `communications` and `dailyops` resolve inside the module.
 */
export function BoardRoomRoute() {
  const role = useAuthStore(s => s.currentRole);
  const [params] = useSearchParams();
  const tab = params.get('tab');
  if (role === 'RESIDENT') return <Navigate to="/community" replace />;
  if (tab === 'duties' || tab === 'runbook') return <Navigate to={`/building?tab=obligations&section=${tab === 'duties' ? 'duties' : 'calendar'}`} replace />;
  if (tab === 'meetings' || tab === 'votes') return <Navigate to={`/community?tab=${tab}`} replace />;
  return <BoardRoomModule />;
}

/** `/issues`: the Board Room for the board and staff; owners keep their own case view. */
export function IssuesRoute() {
  const role = useAuthStore(s => s.currentRole);
  return role === 'RESIDENT' ? <IssuesPage /> : <BoardRoomModule />;
}

/** Kept for one production link (Board Room › Daily Operations deep link) that pins a tab. */
export function LegacyBoardRoomTab({ tab }: { tab: 'duties' | 'runbook' | 'meetings' | 'votes' }) {
  return <BoardRoomPage embedded tab={tab} />;
}
