import { Navigate } from 'react-router-dom';
import CommunityRoomPage from '@/features/community/CommunityRoomPage';
import { useUx2 } from '../flags';
import CommunityModule from './CommunityModule';

/** `/community` shows the redesigned Community module behind ux2.community, the production Community Room otherwise. */
export default function CommunitySwitch() {
  return useUx2('community') ? <CommunityModule /> : <CommunityRoomPage />;
}

/** `/voting` goes to Community › Votes when the module is on; to the Board Room otherwise, as before. */
export function VotingRedirect() {
  return <Navigate to={useUx2('community') ? '/community?tab=votes' : '/boardroom'} replace />;
}
