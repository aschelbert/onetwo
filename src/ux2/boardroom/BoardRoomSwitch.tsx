import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import BoardRoomPage from '@/features/boardroom/BoardRoomPage';
import IssuesPage from '@/features/issues/IssuesPage';
import { useAuthStore } from '@/store/useAuthStore';
import { useUx2 } from '../flags';
import BoardRoomModule from './BoardRoomModule';

/**
 * `/boardroom` shows the redesigned Board Room behind ux2.boardroom, the
 * production Board Room otherwise. With the flag on, the tabs other modules
 * absorbed redirect there when that module is on (duties and runbook →
 * Building › Obligations, meetings and votes → Community); otherwise they
 * still render inside the production page.
 */
export default function BoardRoomSwitch() {
  const on = useUx2('boardroom');
  const building = useUx2('building');
  const community = useUx2('community');
  const role = useAuthStore(s => s.currentRole);
  const [params] = useSearchParams();
  const tab = params.get('tab');
  if (!on) return <BoardRoomPage />;
  if (role === 'RESIDENT') return <Navigate to="/community" replace />;
  if ((tab === 'duties' || tab === 'runbook') && building) return <Navigate to={`/building?tab=obligations&section=${tab === 'duties' ? 'duties' : 'calendar'}`} replace />;
  if ((tab === 'meetings' || tab === 'votes') && community) return <Navigate to={`/community?tab=${tab}`} replace />;
  if (tab === 'duties' || tab === 'runbook' || tab === 'meetings' || tab === 'votes') return <BoardRoomPage embedded tab={tab} />;
  return <BoardRoomModule />;
}

/** `/issues` is the Board Room with the flag on (Home's case links land here); the production Issues page otherwise. Owners keep their own case view. */
export function IssuesSwitch() {
  const on = useUx2('boardroom');
  const role = useAuthStore(s => s.currentRole);
  if (!on || role === 'RESIDENT') return <IssuesPage />;
  return <BoardRoomModule />;
}

/** `/cases?view=case:<id>` (an old link from My Unit's move history) never had a route; send it to the case. */
export function CasesRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/issues${search}`} replace />;
}
