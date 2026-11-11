import { useNavigate } from 'react-router-dom';
import ArchiveTab from '../../boardroom/tabs/ArchiveTab';
import { useBoardRoomSnapshot } from '../../boardroom/useBoardRoomSnapshot';
import MeetingRecords from '../../community/meeting/MeetingRecords';

/**
 * Building › Archive: the closed cases, requests and letters, read-only, with
 * the decision trail, and every held meeting's sealed record. It moved here from the Board Room because it is the
 * building's record; a closed case still opens in the Board Room's case frame.
 */
export default function ArchiveSection() {
  const snap = useBoardRoomSnapshot();
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-4">
      <MeetingRecords />
      <ArchiveTab snap={snap} onOpenCase={id => navigate(`/boardroom?view=case:${encodeURIComponent(id)}`)} />
    </div>
  );
}
