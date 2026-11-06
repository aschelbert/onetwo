import AmenitiesTab from '@/features/community/AmenitiesTab';
import { useAmenitiesStore } from '@/store/useAmenitiesStore';
import { Card, SectionLabel, Tile, TileRow } from '../../components';
import { dayLabel } from '../../home/calendar';
import type { CommunitySnapshot } from '../metrics';

export default function AmenitiesSection({ snap }: { snap: CommunitySnapshot }) {
  const configs = useAmenitiesStore(s => s.configs);
  const reservations = useAmenitiesStore(s => s.reservations);
  const pending = useAmenitiesStore(s => s.getPendingApprovals)();
  const mine = useAmenitiesStore(s => s.getReservationsForUser)(snap.viewer.id).filter(r => r.status === 'active' || r.status === 'pending_approval').sort((a, b) => a.date.localeCompare(b.date));
  const reservable = configs.filter(c => c.reservable);
  const upcoming = reservations.filter(r => r.status === 'active' && r.date >= snap.today).length;
  const isBoard = snap.viewer.isBoard;
  return (
    <div className="flex flex-col gap-5">
      <TileRow>
        <Tile tone="grey" label="Shared spaces" value={reservable.length} unit={`of ${configs.length} reservable`} sub={reservable.map(c => `${c.name}${c.reservationFee ? ` · $${c.reservationFee}` : ''}${c.requiresApproval ? ' · board approves' : ''}`).join(' · ') || 'Nothing is reservable yet'} className="min-h-[150px]" />
        <Tile tone={mine.length ? 'teal' : 'grey'} label="My reservations" value={mine.length} sub={mine[0] ? `Next: ${mine[0].amenityName} · ${dayLabel(mine[0].date)} ${mine[0].startTime} to ${mine[0].endTime}${mine[0].status === 'pending_approval' ? ' · pending' : ''}` : 'Nothing booked'} className="min-h-[150px]" />
        {isBoard
          ? <Tile tone={pending.length ? 'navy' : 'grey'} label="Approvals" value={pending.length} unit="to approve" sub={pending[0] ? `${pending[0].amenityName} · ${dayLabel(pending[0].date)} · Unit ${pending[0].reservedByUnit}` : 'Nothing waiting · these also arrive as Home cards'} className="min-h-[150px]" />
          : <Tile tone="grey" label="This month" value={upcoming} unit="upcoming bookings" sub="Confirmed reservations across the building" className="min-h-[150px]" />}
      </TileRow>
      <Card aria-label="Amenities">
        <SectionLabel>Reserve, approve and the rules</SectionLabel>
        <div className="ux2-legacy"><AmenitiesTab /></div>
      </Card>
    </div>
  );
}
