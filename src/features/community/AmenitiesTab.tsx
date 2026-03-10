import { useState, useEffect, useMemo } from 'react';
import { useAmenitiesStore, type AmenityConfig, type Reservation, type RecurringPattern } from '@/store/useAmenitiesStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import Modal from '@/components/ui/Modal';

type SubView = 'all' | 'my-reservations' | 'notifications' | 'calendar' | 'approvals';

const TIME_SLOTS: string[] = [];
for (let h = 7; h <= 21; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`);
}
TIME_SLOTS.push('22:00');

const DURATION_OPTIONS: { label: string; value: number }[] = [
  { label: 'Unlimited', value: 0 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '3 hours', value: 180 },
  { label: '4 hours', value: 240 },
  { label: '6 hours', value: 360 },
  { label: '8 hours', value: 480 },
];

const ADVANCE_OPTIONS: { label: string; value: number }[] = [
  { label: 'Unlimited', value: 0 },
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
  { label: '60 days', value: 60 },
  { label: '90 days', value: 90 },
];

const HOUR_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  HOUR_OPTIONS.push(`${String(h).padStart(2, '0')}:00`);
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getWeekDates(baseDate: Date): string[] {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  const monday = new Date(d.setDate(diff));
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    dates.push(dt.toISOString().split('T')[0]);
  }
  return dates;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-sage-100', text: 'text-sage-700', label: 'Active' },
  pending_approval: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending Approval' },
  denied: { bg: 'bg-red-100', text: 'text-red-700', label: 'Denied' },
  cancelled: { bg: 'bg-ink-100', text: 'text-ink-500', label: 'Cancelled' },
};

export default function AmenitiesTab() {
  const store = useAmenitiesStore();
  const user = useAuthStore(s => s.currentUser);
  const currentRole = useAuthStore(s => s.currentRole);
  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';
  const buildingAmenities = useBuildingStore(s => s.details.amenities);

  useEffect(() => {
    if (buildingAmenities.length > 0) {
      store.initializeFromBuilding(buildingAmenities);
    }
  }, [buildingAmenities]);

  const [view, setView] = useState<SubView>('all');
  const [configModal, setConfigModal] = useState<AmenityConfig | null>(null);
  const [reserveModal, setReserveModal] = useState<AmenityConfig | null>(null);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [denyModal, setDenyModal] = useState<Reservation | null>(null);
  const [denyReason, setDenyReason] = useState('');
  const [detailPopover, setDetailPopover] = useState<Reservation | null>(null);

  // Reserve form state
  const [resDate, setResDate] = useState('');
  const [resStart, setResStart] = useState('09:00');
  const [resEnd, setResEnd] = useState('10:00');
  const [resNotes, setResNotes] = useState('');
  const [resError, setResError] = useState('');
  const [resRecurring, setResRecurring] = useState(false);
  const [resFrequency, setResFrequency] = useState<RecurringPattern['frequency']>('weekly');
  const [resEndDate, setResEndDate] = useState('');

  // Notification form state
  const [notifAmenityId, setNotifAmenityId] = useState('');
  const [notifMessage, setNotifMessage] = useState('');

  // Config form state
  const [cfgReservable, setCfgReservable] = useState(false);
  const [cfgNotifEnabled, setCfgNotifEnabled] = useState(false);
  const [cfgFee, setCfgFee] = useState(0);
  const [cfgDeposit, setCfgDeposit] = useState(0);
  const [cfgMaxDuration, setCfgMaxDuration] = useState(0);
  const [cfgMaxAdvance, setCfgMaxAdvance] = useState(0);
  const [cfgCapacity, setCfgCapacity] = useState(0);
  const [cfgHoursEnabled, setCfgHoursEnabled] = useState(false);
  const [cfgOpen, setCfgOpen] = useState('07:00');
  const [cfgClose, setCfgClose] = useState('22:00');
  const [cfgUsageRules, setCfgUsageRules] = useState('');
  const [cfgRequiresApproval, setCfgRequiresApproval] = useState(false);

  // Calendar state
  const [calWeekBase, setCalWeekBase] = useState(new Date());
  const [calFilter, setCalFilter] = useState('all');

  const myReservations = store.getReservationsForUser(user.id);
  const unreadCount = store.getUnreadCount(user.id);
  const pendingApprovals = store.getPendingApprovals();
  const notifEnabledAmenities = store.configs.filter(c => c.notificationEnabled);
  const reservableAmenities = store.configs.filter(c => c.reservable);

  const openConfigModal = (amenity: AmenityConfig) => {
    setCfgReservable(amenity.reservable);
    setCfgNotifEnabled(amenity.notificationEnabled);
    setCfgFee(amenity.reservationFee);
    setCfgDeposit(amenity.depositAmount);
    setCfgMaxDuration(amenity.maxDurationMinutes);
    setCfgMaxAdvance(amenity.maxAdvanceDays);
    setCfgCapacity(amenity.capacity);
    setCfgHoursEnabled(!!amenity.operatingHours);
    setCfgOpen(amenity.operatingHours?.open || '07:00');
    setCfgClose(amenity.operatingHours?.close || '22:00');
    setCfgUsageRules(amenity.usageRules);
    setCfgRequiresApproval(amenity.requiresApproval);
    setConfigModal(amenity);
  };

  const handleSaveConfig = () => {
    if (!configModal) return;
    store.updateConfig(configModal.id, {
      reservable: cfgReservable,
      notificationEnabled: cfgNotifEnabled,
      reservationFee: cfgFee,
      depositAmount: cfgDeposit,
      maxDurationMinutes: cfgMaxDuration,
      maxAdvanceDays: cfgMaxAdvance,
      capacity: cfgCapacity,
      operatingHours: cfgHoursEnabled ? { open: cfgOpen, close: cfgClose } : null,
      usageRules: cfgUsageRules,
      requiresApproval: cfgRequiresApproval,
    });
    setConfigModal(null);
  };

  const openReserveModal = (amenity: AmenityConfig, preDate?: string, preStart?: string) => {
    setResDate(preDate || '');
    setResStart(preStart || '09:00');
    setResEnd(preStart ? `${String(Number(preStart.split(':')[0]) + 1).padStart(2, '0')}:00` : '10:00');
    setResNotes('');
    setResError('');
    setResRecurring(false);
    setResFrequency('weekly');
    setResEndDate('');
    setReserveModal(amenity);
  };

  const handleReserve = () => {
    if (!reserveModal || !resDate) { setResError('Please select a date'); return; }
    if (resStart >= resEnd) { setResError('End time must be after start time'); return; }

    const baseData = {
      amenityId: reserveModal.id,
      amenityName: reserveModal.name,
      date: resDate,
      startTime: resStart,
      endTime: resEnd,
      reservedBy: user.id,
      reservedByName: user.name,
      reservedByUnit: user.linkedUnits?.[0] || user.unitNumber || '',
      notes: resNotes,
    };

    if (resRecurring && resEndDate) {
      const pattern: RecurringPattern = { frequency: resFrequency, endDate: resEndDate };
      const created = store.addRecurringReservation(baseData, pattern);
      if (created.length === 0) {
        setResError('All recurring dates conflict with existing reservations');
        return;
      }
      setReserveModal(null);
      return;
    }

    const result = store.addReservation(baseData);
    if ('error' in result) { setResError(result.error); return; }
    setReserveModal(null);
  };

  const openNotifModal = () => {
    setNotifAmenityId(notifEnabledAmenities[0]?.id || '');
    setNotifMessage('');
    setShowNotifModal(true);
  };

  const handleSendNotification = () => {
    if (!notifAmenityId || !notifMessage.trim()) return;
    const amenity = store.configs.find(c => c.id === notifAmenityId);
    if (!amenity) return;
    store.sendNotification({
      amenityId: notifAmenityId,
      amenityName: amenity.name,
      message: notifMessage.trim(),
      sentBy: user.id,
      sentByName: user.name,
      sentByRole: currentRole,
      sentAt: new Date().toISOString(),
      recipients: 'all',
    });
    setShowNotifModal(false);
  };

  const handleApprove = (res: Reservation) => {
    store.approveReservation(res.id, user.id, user.name);
  };

  const handleDeny = () => {
    if (!denyModal || !denyReason.trim()) return;
    store.denyReservation(denyModal.id, user.id, user.name, denyReason.trim());
    setDenyModal(null);
    setDenyReason('');
  };

  const existingForDate = reserveModal
    ? store.getReservationsForAmenity(reserveModal.id, resDate || undefined)
    : [];

  // Calendar data
  const weekDates = useMemo(() => getWeekDates(calWeekBase), [calWeekBase]);
  const calHours = useMemo(() => {
    const hours: string[] = [];
    for (let h = 7; h <= 21; h++) hours.push(`${String(h).padStart(2, '0')}:00`);
    return hours;
  }, []);

  const calReservations = useMemo(() => {
    return store.reservations.filter(r =>
      r.status !== 'cancelled' && r.status !== 'denied' &&
      weekDates.includes(r.date) &&
      (calFilter === 'all' || r.amenityId === calFilter)
    );
  }, [store.reservations, weekDates, calFilter]);

  const SUB_TABS: { id: SubView; label: string; badge?: number; boardOnly?: boolean }[] = [
    { id: 'all', label: 'All Amenities' },
    { id: 'my-reservations', label: 'My Reservations', badge: myReservations.length || undefined },
    { id: 'notifications', label: 'Notifications', badge: unreadCount || undefined },
    { id: 'calendar', label: 'Calendar' },
    ...(isBoard ? [{ id: 'approvals' as SubView, label: 'Approvals', badge: pendingApprovals.length || undefined, boardOnly: true }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-display text-lg font-bold text-ink-900">Amenities</h3>
          <p className="text-xs text-ink-400 mt-1">Reserve spaces, manage amenities & receive notifications</p>
        </div>
        {isBoard && (
          <button onClick={openNotifModal} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800">
            + Send Notification
          </button>
        )}
      </div>

      {/* Sub-nav */}
      <div className="flex gap-1 bg-mist-50 rounded-lg p-1 overflow-x-auto">
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setView(t.id)} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${view === t.id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}>
            {t.label}
            {t.badge ? <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {/* ALL AMENITIES */}
      {view === 'all' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {store.configs.map(amenity => (
            <div key={amenity.id} className="rounded-xl border border-ink-100 p-5 hover:border-accent-200 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{amenity.icon}</span>
                  <div>
                    <h4 className="text-sm font-bold text-ink-900">{amenity.name}</h4>
                    <p className="text-[11px] text-ink-400 mt-0.5">{amenity.description}</p>
                  </div>
                </div>
                {isBoard && (
                  <button onClick={() => openConfigModal(amenity)} className="text-ink-300 hover:text-ink-500 text-xs" title="Configure">
                    Settings
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {amenity.reservable && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-100 text-accent-700 font-semibold">Reservable</span>
                )}
                {amenity.notificationEnabled && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-sage-100 text-sage-700 font-semibold">Notifications</span>
                )}
                {amenity.reservationFee > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-semibold">${amenity.reservationFee}/reservation</span>
                )}
                {amenity.depositAmount > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">${amenity.depositAmount} deposit</span>
                )}
                {amenity.capacity > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-mist-100 text-ink-600 font-semibold">Capacity: {amenity.capacity}</span>
                )}
                {amenity.requiresApproval && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">Requires Approval</span>
                )}
                {!amenity.reservable && !amenity.notificationEnabled && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-ink-50 text-ink-400 font-medium">Standard</span>
                )}
              </div>
              {amenity.reservable && (
                <button onClick={() => openReserveModal(amenity)} className="mt-3 w-full px-3 py-2 bg-accent-600 text-white rounded-lg text-xs font-medium hover:bg-accent-700">
                  Reserve {amenity.name}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* MY RESERVATIONS */}
      {view === 'my-reservations' && (
        <div className="space-y-3">
          {myReservations.length === 0 && (
            <div className="text-center py-8">
              <p className="text-ink-400">No reservations.</p>
              <button onClick={() => setView('all')} className="mt-2 text-accent-600 text-sm font-medium hover:underline">Browse amenities to make a reservation</button>
            </div>
          )}
          {myReservations.map(r => {
            const badge = STATUS_BADGE[r.status];
            return (
              <div key={r.id} className="rounded-xl border border-ink-100 p-4 hover:border-accent-200 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg">{store.configs.find(c => c.id === r.amenityId)?.icon || ''}</span>
                      <h4 className="text-sm font-bold text-ink-900">{r.amenityName}</h4>
                      <span className={`text-[10px] px-2 py-0.5 rounded ${badge.bg} ${badge.text} font-semibold`}>{badge.label}</span>
                      {r.recurringGroupId && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">Recurring</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-ink-400">
                      <span>{r.date}</span>
                      <span>{formatTime(r.startTime)} - {formatTime(r.endTime)}</span>
                    </div>
                    {r.notes && <p className="text-xs text-ink-500 mt-1.5">{r.notes}</p>}
                    {(r.fee > 0 || r.deposit > 0) && (
                      <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                        {r.fee > 0 && <span className="text-violet-600">Fee: ${r.fee}</span>}
                        {r.deposit > 0 && <span className="text-amber-600">Deposit: ${r.deposit}</span>}
                        {r.invoiceId && <span className="text-ink-400">Invoice: {r.invoiceId}</span>}
                      </div>
                    )}
                    {r.status === 'denied' && r.denialReason && (
                      <p className="text-xs text-red-600 mt-1.5">Reason: {r.denialReason}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {r.recurringGroupId && (r.status === 'active' || r.status === 'pending_approval') && (
                      <button onClick={() => store.cancelRecurringGroup(r.recurringGroupId!)} className="text-red-500 hover:text-red-700 text-xs font-medium px-3 py-1 rounded-lg hover:bg-red-50">
                        Cancel All Future
                      </button>
                    )}
                    {(r.status === 'active' || r.status === 'pending_approval') && (
                      <button onClick={() => store.cancelReservation(r.id)} className="text-red-500 hover:text-red-700 text-xs font-medium px-3 py-1 rounded-lg hover:bg-red-50">
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* NOTIFICATIONS */}
      {view === 'notifications' && (
        <div className="space-y-3">
          {store.notifications.length === 0 && (
            <p className="text-center text-ink-400 py-8">No notifications yet.</p>
          )}
          {store.notifications.map(n => {
            const isRead = n.readBy.includes(user.id);
            return (
              <div
                key={n.id}
                className={`rounded-xl border p-4 transition-colors cursor-pointer ${isRead ? 'border-ink-100 bg-white' : 'border-accent-300 bg-accent-50 bg-opacity-30'}`}
                onClick={() => { if (!isRead) store.markNotificationRead(n.id, user.id); }}
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg mt-0.5">{store.configs.find(c => c.id === n.amenityId)?.icon || ''}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {!isRead && <span className="w-2 h-2 rounded-full bg-accent-500 shrink-0" />}
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-mist-100 text-ink-600 font-medium">{n.amenityName}</span>
                      <span className="text-[10px] text-ink-400">{timeAgo(n.sentAt)}</span>
                    </div>
                    <p className="text-xs text-ink-700 mt-1.5 leading-relaxed">{n.message}</p>
                    <p className="text-[10px] text-ink-400 mt-1.5">Sent by {n.sentByName}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CALENDAR */}
      {view === 'calendar' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <button onClick={() => { const d = new Date(calWeekBase); d.setDate(d.getDate() - 7); setCalWeekBase(d); }} className="px-2 py-1 rounded border border-ink-200 text-ink-600 hover:bg-mist-50 text-sm">&larr;</button>
              <button onClick={() => setCalWeekBase(new Date())} className="px-3 py-1 rounded border border-ink-200 text-ink-600 hover:bg-mist-50 text-sm font-medium">Today</button>
              <button onClick={() => { const d = new Date(calWeekBase); d.setDate(d.getDate() + 7); setCalWeekBase(d); }} className="px-2 py-1 rounded border border-ink-200 text-ink-600 hover:bg-mist-50 text-sm">&rarr;</button>
              <span className="text-sm font-medium text-ink-700 ml-2">
                {new Date(weekDates[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(weekDates[6]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            <select value={calFilter} onChange={e => setCalFilter(e.target.value)} className="px-3 py-1.5 border border-ink-200 rounded-lg text-sm bg-white">
              <option value="all">All Amenities</option>
              {reservableAmenities.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
            </select>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-[10px] text-ink-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-sage-200 inline-block" /> Active</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-200 inline-block" /> Pending</span>
          </div>

          {/* Calendar Grid */}
          <div className="border border-ink-100 rounded-xl overflow-hidden">
            {/* Header row */}
            <div className="grid grid-cols-[80px_repeat(7,1fr)] bg-mist-50 border-b border-ink-100">
              <div className="p-2 text-[10px] font-medium text-ink-400 text-center">Time</div>
              {weekDates.map((d, i) => {
                const dt = new Date(d + 'T12:00:00');
                const isToday = d === new Date().toISOString().split('T')[0];
                return (
                  <div key={d} className={`p-2 text-center border-l border-ink-100 ${isToday ? 'bg-accent-50' : ''}`}>
                    <div className="text-[10px] font-medium text-ink-500">{DAY_LABELS[i]}</div>
                    <div className={`text-xs font-bold ${isToday ? 'text-accent-700' : 'text-ink-700'}`}>{dt.getDate()}</div>
                  </div>
                );
              })}
            </div>
            {/* Time rows */}
            {calHours.map(hour => (
              <div key={hour} className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-ink-50 min-h-[40px]">
                <div className="p-1 text-[10px] text-ink-400 text-right pr-2 pt-1">{formatTime(hour)}</div>
                {weekDates.map(date => {
                  const hourNum = parseInt(hour);
                  const nextHour = `${String(hourNum + 1).padStart(2, '0')}:00`;
                  const slotRes = calReservations.filter(r =>
                    r.date === date &&
                    r.startTime < nextHour &&
                    r.endTime > hour
                  );
                  return (
                    <div
                      key={date}
                      className="border-l border-ink-50 relative cursor-pointer hover:bg-mist-50 min-h-[40px]"
                      onClick={() => {
                        if (slotRes.length === 0) {
                          const amenity = calFilter !== 'all'
                            ? store.configs.find(c => c.id === calFilter)
                            : reservableAmenities[0];
                          if (amenity) openReserveModal(amenity, date, hour);
                        }
                      }}
                    >
                      {slotRes.map(r => {
                        const isStart = r.startTime === hour || r.startTime > hour && r.startTime < nextHour;
                        if (!isStart) return null;
                        return (
                          <div
                            key={r.id}
                            className={`absolute inset-x-0.5 top-0.5 rounded px-1 py-0.5 text-[9px] leading-tight truncate cursor-pointer z-10 ${
                              r.status === 'pending_approval' ? 'bg-amber-200 text-amber-800' : 'bg-sage-200 text-sage-800'
                            }`}
                            onClick={e => { e.stopPropagation(); setDetailPopover(r); }}
                            title={`${r.amenityName}: ${formatTime(r.startTime)}-${formatTime(r.endTime)} (${r.reservedByName})`}
                          >
                            {r.amenityName.substring(0, 12)}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* APPROVALS (Board/PM only) */}
      {view === 'approvals' && isBoard && (
        <div className="space-y-3">
          {pendingApprovals.length === 0 && (
            <p className="text-center text-ink-400 py-8">No pending approvals.</p>
          )}
          {pendingApprovals.map(r => (
            <div key={r.id} className="rounded-xl border border-amber-200 bg-amber-50 bg-opacity-30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg">{store.configs.find(c => c.id === r.amenityId)?.icon || ''}</span>
                    <h4 className="text-sm font-bold text-ink-900">{r.amenityName}</h4>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">Pending Approval</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-ink-500">
                    <span>{r.date}</span>
                    <span>{formatTime(r.startTime)} - {formatTime(r.endTime)}</span>
                    <span>Unit {r.reservedByUnit}</span>
                    <span>{r.reservedByName}</span>
                  </div>
                  {r.notes && <p className="text-xs text-ink-500 mt-1.5">{r.notes}</p>}
                  {(r.fee > 0 || r.deposit > 0) && (
                    <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                      {r.fee > 0 && <span className="text-violet-600">Fee: ${r.fee}</span>}
                      {r.deposit > 0 && <span className="text-amber-600">Deposit: ${r.deposit}</span>}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleApprove(r)} className="px-3 py-1.5 bg-sage-600 text-white rounded-lg text-xs font-medium hover:bg-sage-700">Approve</button>
                  <button onClick={() => { setDenyModal(r); setDenyReason(''); }} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700">Deny</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CONFIGURE MODAL */}
      {configModal && (
        <Modal title={`Configure ${configModal.name}`} subtitle="Manage features, pricing, rules & approval" onClose={() => setConfigModal(null)} onSave={handleSaveConfig} saveLabel="Save Configuration">
          <div className="space-y-5">
            {/* Basic toggles */}
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-ink-500 uppercase tracking-wider">Features</p>
              <label className="flex items-center justify-between p-3 rounded-lg border border-ink-100 cursor-pointer hover:bg-mist-50">
                <div>
                  <p className="text-sm font-medium text-ink-900">Reservable</p>
                  <p className="text-[11px] text-ink-400 mt-0.5">Allow residents to book time slots</p>
                </div>
                <input type="checkbox" checked={cfgReservable} onChange={e => setCfgReservable(e.target.checked)} className="w-5 h-5 rounded text-accent-600" />
              </label>
              <label className="flex items-center justify-between p-3 rounded-lg border border-ink-100 cursor-pointer hover:bg-mist-50">
                <div>
                  <p className="text-sm font-medium text-ink-900">Notifications</p>
                  <p className="text-[11px] text-ink-400 mt-0.5">Enable sending announcements about this amenity</p>
                </div>
                <input type="checkbox" checked={cfgNotifEnabled} onChange={e => setCfgNotifEnabled(e.target.checked)} className="w-5 h-5 rounded text-accent-600" />
              </label>
            </div>

            {/* Pricing */}
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-ink-500 uppercase tracking-wider">Pricing</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-ink-500">Reservation Fee ($)</label>
                  <input type="number" min={0} value={cfgFee} onChange={e => setCfgFee(Number(e.target.value))} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white mt-1" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-ink-500">Deposit Amount ($)</label>
                  <input type="number" min={0} value={cfgDeposit} onChange={e => setCfgDeposit(Number(e.target.value))} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white mt-1" />
                </div>
              </div>
            </div>

            {/* Rules */}
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-ink-500 uppercase tracking-wider">Rules</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-ink-500">Max Duration</label>
                  <select value={cfgMaxDuration} onChange={e => setCfgMaxDuration(Number(e.target.value))} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white mt-1">
                    {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-ink-500">Max Advance Booking</label>
                  <select value={cfgMaxAdvance} onChange={e => setCfgMaxAdvance(Number(e.target.value))} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white mt-1">
                    {ADVANCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-ink-500">Capacity</label>
                <input type="number" min={0} value={cfgCapacity} onChange={e => setCfgCapacity(Number(e.target.value))} placeholder="0 = unlimited" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white mt-1" />
              </div>
            </div>

            {/* Operating Hours */}
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-ink-500 uppercase tracking-wider">Operating Hours</p>
              <label className="flex items-center justify-between p-3 rounded-lg border border-ink-100 cursor-pointer hover:bg-mist-50">
                <div>
                  <p className="text-sm font-medium text-ink-900">Set Operating Hours</p>
                  <p className="text-[11px] text-ink-400 mt-0.5">Restrict reservations to specific hours</p>
                </div>
                <input type="checkbox" checked={cfgHoursEnabled} onChange={e => setCfgHoursEnabled(e.target.checked)} className="w-5 h-5 rounded text-accent-600" />
              </label>
              {cfgHoursEnabled && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-medium text-ink-500">Open</label>
                    <select value={cfgOpen} onChange={e => setCfgOpen(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white mt-1">
                      {HOUR_OPTIONS.map(h => <option key={h} value={h}>{formatTime(h)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-ink-500">Close</label>
                    <select value={cfgClose} onChange={e => setCfgClose(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white mt-1">
                      {HOUR_OPTIONS.map(h => <option key={h} value={h}>{formatTime(h)}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Usage Rules */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-ink-500 uppercase tracking-wider">Usage Rules</p>
              <textarea value={cfgUsageRules} onChange={e => setCfgUsageRules(e.target.value)} placeholder="Rules displayed to residents when booking..." rows={3} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white" />
            </div>

            {/* Approval */}
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-ink-500 uppercase tracking-wider">Approval</p>
              <label className="flex items-center justify-between p-3 rounded-lg border border-ink-100 cursor-pointer hover:bg-mist-50">
                <div>
                  <p className="text-sm font-medium text-ink-900">Require Board Approval</p>
                  <p className="text-[11px] text-ink-400 mt-0.5">Reservations require board/PM approval before confirming</p>
                </div>
                <input type="checkbox" checked={cfgRequiresApproval} onChange={e => setCfgRequiresApproval(e.target.checked)} className="w-5 h-5 rounded text-accent-600" />
              </label>
            </div>
          </div>
        </Modal>
      )}

      {/* RESERVE MODAL */}
      {reserveModal && (
        <Modal
          title={`Reserve ${reserveModal.name}`}
          subtitle="Select a date and time for your reservation"
          onClose={() => setReserveModal(null)}
          onSave={handleReserve}
          saveLabel={reserveModal.requiresApproval ? 'Submit for Approval' : 'Confirm Reservation'}
          saveColor="bg-accent-600 hover:bg-accent-700"
        >
          <div className="space-y-4">
            {/* Rules & policies info */}
            {(reserveModal.operatingHours || reserveModal.maxDurationMinutes > 0 || reserveModal.usageRules) && (
              <div className="bg-mist-50 rounded-lg p-3 space-y-1.5 border border-mist-200">
                <p className="text-[10px] font-bold text-ink-500 uppercase tracking-wider">Rules & Policies</p>
                {reserveModal.operatingHours && (
                  <p className="text-xs text-ink-600">Operating Hours: {formatTime(reserveModal.operatingHours.open)} - {formatTime(reserveModal.operatingHours.close)}</p>
                )}
                {reserveModal.maxDurationMinutes > 0 && (
                  <p className="text-xs text-ink-600">Max Duration: {reserveModal.maxDurationMinutes / 60} hours</p>
                )}
                {reserveModal.maxAdvanceDays > 0 && (
                  <p className="text-xs text-ink-600">Max Advance Booking: {reserveModal.maxAdvanceDays} days</p>
                )}
                {reserveModal.capacity > 0 && (
                  <p className="text-xs text-ink-600">Capacity: {reserveModal.capacity} people</p>
                )}
                {reserveModal.usageRules && (
                  <p className="text-xs text-ink-600">{reserveModal.usageRules}</p>
                )}
              </div>
            )}

            {reserveModal.requiresApproval && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-700 font-medium">This amenity requires board/PM approval. Your reservation will be submitted for review.</p>
              </div>
            )}

            <div>
              <label className="text-[10px] font-medium text-ink-500 uppercase tracking-wider">Date</label>
              <input type="date" value={resDate} onChange={e => setResDate(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-medium text-ink-500 uppercase tracking-wider">Start Time</label>
                <select value={resStart} onChange={e => setResStart(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white mt-1">
                  {TIME_SLOTS.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-medium text-ink-500 uppercase tracking-wider">End Time</label>
                <select value={resEnd} onChange={e => setResEnd(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white mt-1">
                  {TIME_SLOTS.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium text-ink-500 uppercase tracking-wider">Notes (optional)</label>
              <textarea value={resNotes} onChange={e => setResNotes(e.target.value)} placeholder="Purpose of reservation, expected guests, etc." rows={3} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white mt-1" />
            </div>

            {/* Recurring section */}
            <div className="border-t border-ink-100 pt-4 space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm font-medium text-ink-900">Make Recurring</span>
                <input type="checkbox" checked={resRecurring} onChange={e => setResRecurring(e.target.checked)} className="w-5 h-5 rounded text-accent-600" />
              </label>
              {resRecurring && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-medium text-ink-500">Frequency</label>
                    <select value={resFrequency} onChange={e => setResFrequency(e.target.value as RecurringPattern['frequency'])} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white mt-1">
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Biweekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-ink-500">End Date</label>
                    <input type="date" value={resEndDate} onChange={e => setResEndDate(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white mt-1" />
                  </div>
                </div>
              )}
            </div>

            {/* Fee summary */}
            {(reserveModal.reservationFee > 0 || reserveModal.depositAmount > 0) && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-3">
                <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wider mb-1">Fee Summary</p>
                <div className="flex items-center gap-2 text-sm text-violet-800">
                  {reserveModal.reservationFee > 0 && <span>Reservation Fee: ${reserveModal.reservationFee}</span>}
                  {reserveModal.reservationFee > 0 && reserveModal.depositAmount > 0 && <span>+</span>}
                  {reserveModal.depositAmount > 0 && <span>Deposit: ${reserveModal.depositAmount}</span>}
                  <span className="font-bold ml-auto">Total: ${reserveModal.reservationFee + reserveModal.depositAmount}</span>
                </div>
              </div>
            )}

            {resError && <p className="text-xs text-red-600 font-medium">{resError}</p>}
            {resDate && existingForDate.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-ink-500 uppercase tracking-wider mb-2">Existing Reservations on {resDate}</p>
                <div className="space-y-1.5">
                  {existingForDate.map(r => (
                    <div key={r.id} className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <span className="text-[11px] text-amber-700 font-medium">{formatTime(r.startTime)} - {formatTime(r.endTime)}</span>
                      <span className="text-[10px] text-amber-600">{r.reservedByName} (Unit {r.reservedByUnit})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* SEND NOTIFICATION MODAL */}
      {showNotifModal && (
        <Modal title="Send Notification" subtitle="Notify residents about an amenity" onClose={() => setShowNotifModal(false)} onSave={handleSendNotification} saveLabel="Send Notification" saveColor="bg-accent-600 hover:bg-accent-700">
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-medium text-ink-500 uppercase tracking-wider">Amenity</label>
              <select value={notifAmenityId} onChange={e => setNotifAmenityId(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white mt-1">
                {notifEnabledAmenities.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-ink-500 uppercase tracking-wider">Message</label>
              <textarea value={notifMessage} onChange={e => setNotifMessage(e.target.value)} placeholder="Write your notification message..." rows={4} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white mt-1" />
            </div>
            <p className="text-[10px] text-ink-400">This notification will be sent to all residents.</p>
          </div>
        </Modal>
      )}

      {/* DENY MODAL */}
      {denyModal && (
        <Modal title="Deny Reservation" subtitle={`${denyModal.amenityName} - ${denyModal.reservedByName}`} onClose={() => setDenyModal(null)} onSave={handleDeny} saveLabel="Deny Reservation" saveColor="bg-red-600 hover:bg-red-700">
          <div className="space-y-4">
            <div className="bg-mist-50 rounded-lg p-3 text-xs text-ink-600 space-y-1">
              <p>Date: {denyModal.date}, {formatTime(denyModal.startTime)} - {formatTime(denyModal.endTime)}</p>
              <p>Unit: {denyModal.reservedByUnit}</p>
              {denyModal.notes && <p>Notes: {denyModal.notes}</p>}
            </div>
            <div>
              <label className="text-[10px] font-medium text-ink-500 uppercase tracking-wider">Reason for Denial</label>
              <textarea value={denyReason} onChange={e => setDenyReason(e.target.value)} placeholder="Explain why this reservation is being denied..." rows={3} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white mt-1" />
            </div>
          </div>
        </Modal>
      )}

      {/* DETAIL POPOVER (Calendar click) */}
      {detailPopover && (
        <Modal title="Reservation Details" onClose={() => setDetailPopover(null)}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">{store.configs.find(c => c.id === detailPopover.amenityId)?.icon || ''}</span>
              <h4 className="text-sm font-bold text-ink-900">{detailPopover.amenityName}</h4>
              {(() => { const b = STATUS_BADGE[detailPopover.status]; return <span className={`text-[10px] px-2 py-0.5 rounded ${b.bg} ${b.text} font-semibold`}>{b.label}</span>; })()}
            </div>
            <div className="text-xs text-ink-600 space-y-1">
              <p>Date: {detailPopover.date}</p>
              <p>Time: {formatTime(detailPopover.startTime)} - {formatTime(detailPopover.endTime)}</p>
              <p>Reserved by: {detailPopover.reservedByName} (Unit {detailPopover.reservedByUnit})</p>
              {detailPopover.notes && <p>Notes: {detailPopover.notes}</p>}
              {detailPopover.fee > 0 && <p>Fee: ${detailPopover.fee}</p>}
              {detailPopover.deposit > 0 && <p>Deposit: ${detailPopover.deposit}</p>}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
