import { useFinancialStore } from '@/store/useFinancialStore';
import { useNavigate } from 'react-router-dom';
import type { Unit, MoveEvent } from '@/types/financial';

export default function MyMoveHistoryTab({ activeUnit }: { activeUnit: Unit }) {
  const { moveEvents } = useFinancialStore();
  const navigate = useNavigate();

  const myEvents = moveEvents.filter(e => e.unitNumber === activeUnit.number);

  // Synthetic entry from units.move_in if no real events exist
  const syntheticEvents: MoveEvent[] = [];
  if (myEvents.length === 0 && activeUnit.moveIn) {
    syntheticEvents.push({
      id: 'synthetic-movein',
      unitNumber: activeUnit.number,
      moveType: 'in',
      scheduledDate: activeUnit.moveIn,
      timeWindow: null,
      elevatorSlot: null,
      depositAmount: 0,
      depositStatus: 'pending',
      accessStatus: 'issued',
      insuranceConfirmed: false,
      inspectionStatus: 'pending',
      residentName: activeUnit.owner,
      moverName: null,
      caseId: null,
      notes: 'Pre-populated from unit record',
      createdAt: activeUnit.moveIn,
    });
  }

  const allEvents = [...myEvents, ...syntheticEvents].sort(
    (a, b) => b.scheduledDate.localeCompare(a.scheduledDate)
  );

  const depositBadge = (status: MoveEvent['depositStatus']) => {
    const map: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      collected: 'bg-sage-100 text-sage-700',
      refunded: 'bg-blue-100 text-blue-700',
      forfeited: 'bg-red-100 text-red-700',
    };
    return <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${map[status] || 'bg-ink-100 text-ink-500'}`}>{status}</span>;
  };

  const accessBadge = (status: MoveEvent['accessStatus']) => {
    const map: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      issued: 'bg-sage-100 text-sage-700',
      revoked: 'bg-red-100 text-red-700',
    };
    return <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${map[status] || 'bg-ink-100 text-ink-500'}`}>Access: {status}</span>;
  };

  if (allEvents.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">🚚</div>
        <p className="text-sm text-ink-500">No move history for this unit.</p>
      </div>
    );
  }

  return (
    <div className="relative pl-6">
      {/* Vertical timeline line */}
      <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-ink-100" />

      <div className="space-y-6">
        {allEvents.map((event) => {
          const isIn = event.moveType === 'in';
          return (
            <div key={event.id} className="relative">
              {/* Timeline dot */}
              <div className={`absolute -left-6 top-1 w-5 h-5 rounded-full border-2 flex items-center justify-center ${isIn ? 'border-sage-400 bg-sage-50' : 'border-red-400 bg-red-50'}`}>
                <svg className={`w-3 h-3 ${isIn ? 'text-sage-600' : 'text-red-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  {isIn ? <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />}
                </svg>
              </div>

              <div className={`bg-white border rounded-xl p-4 ${isIn ? 'border-sage-200' : 'border-red-200'}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${isIn ? 'text-sage-700' : 'text-red-700'}`}>
                        Move-{isIn ? 'In' : 'Out'}
                      </span>
                      <span className="text-xs text-ink-400">{event.scheduledDate}</span>
                    </div>
                    {event.residentName && <p className="text-xs text-ink-600 mt-0.5">{event.residentName}</p>}
                  </div>
                  {event.caseId && event.id !== 'synthetic-movein' && (
                    <button onClick={() => navigate(`/cases?view=case:${event.caseId}`)} className="text-[10px] font-semibold text-accent-600 hover:text-accent-700 border border-accent-200 rounded px-2 py-0.5">
                      View Case →
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mt-2">
                  {event.depositAmount > 0 && depositBadge(event.depositStatus)}
                  {accessBadge(event.accessStatus)}
                  {event.insuranceConfirmed && <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sage-100 text-sage-700">Insured</span>}
                  {event.inspectionStatus !== 'pending' && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${event.inspectionStatus === 'passed' ? 'bg-sage-100 text-sage-700' : event.inspectionStatus === 'failed' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                      Inspection: {event.inspectionStatus}
                    </span>
                  )}
                </div>

                {(event.timeWindow || event.elevatorSlot || event.moverName) && (
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-ink-500">
                    {event.timeWindow && <span>Time: {event.timeWindow}</span>}
                    {event.elevatorSlot && <span>Elevator: {event.elevatorSlot}</span>}
                    {event.moverName && <span>Mover: {event.moverName}</span>}
                  </div>
                )}

                {event.notes && event.id !== 'synthetic-movein' && (
                  <p className="text-xs text-ink-400 mt-2 italic">{event.notes}</p>
                )}
                {event.id === 'synthetic-movein' && (
                  <p className="text-[10px] text-ink-300 mt-2 italic">From unit record</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
