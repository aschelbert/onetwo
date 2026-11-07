import { useNavigate } from 'react-router-dom';
import ArchiveTab from '../../boardroom/tabs/ArchiveTab';
import { useBoardRoomSnapshot } from '../../boardroom/useBoardRoomSnapshot';

/**
 * Building › Archive: the closed cases, requests and letters, read-only, with
 * the decision trail. It moved here from the Board Room because it is the
 * building's record; a closed case still opens in the Board Room's case frame.
 */
export default function ArchiveSection() {
  const snap = useBoardRoomSnapshot();
  const navigate = useNavigate();
  return <ArchiveTab snap={snap} onOpenCase={id => navigate(`/boardroom?view=case:${encodeURIComponent(id)}`)} />;
}
