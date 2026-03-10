import { useState, useEffect } from 'react';
import { useAmenitiesStore, type AmenityConfig } from '@/store/useAmenitiesStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import Modal from '@/components/ui/Modal';

type SubView = 'all' | 'my-reservations' | 'notifications';

const TIME_SLOTS: string[] = [];
for (let h = 7; h <= 21; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`);
}
TIME_SLOTS.push('22:00');

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

export default function AmenitiesTab() {
  const store = useAmenitiesStore();
  const user = useAuthStore(s => s.currentUser);
  const currentRole = useAuthStore(s => s.currentRole);
  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';
  const buildingAmenities = useBuildingStore(s => s.details.amenities);

  // Sync amenity configs from building amenities list
  useEffect(() => {
    if (buildingAmenities.length > 0) {
      store.initializeFromBuilding(buildingAmenities);
    }
  }, [buildingAmenities]);

  const [view, setView] = useState<SubView>('all');
  const [configModal, setConfigModal] = useState<AmenityConfig | null>(null);
  const [reserveModal, setReserveModal] = useState<AmenityConfig | null>(null);
  const [showNotifModal, setShowNotifModal] = useState(false);

  // Reserve form state
  const [resDate, setResDate] = useState('');
  const [resStart, setResStart] = useState('09:00');
  const [resEnd, setResEnd] = useState('10:00');
  const [resNotes, setResNotes] = useState('');
  const [resError, setResError] = useState('');

  // Notification form state
  const [notifAmenityId, setNotifAmenityId] = useState('');
  const [notifMessage, setNotifMessage] = useState('');

  // Config form state
  const [cfgReservable, setCfgReservable] = useState(false);
  const [cfgNotifEnabled, setCfgNotifEnabled] = useState(false);

  const myReservations = store.getReservationsForUser(user.id);
  const unreadCount = store.getUnreadCount(user.id);
  const notifEnabledAmenities = store.configs.filter(c => c.notificationEnabled);

  const openConfigModal = (amenity: AmenityConfig) => {
    setCfgReservable(amenity.reservable);
    setCfgNotifEnabled(amenity.notificationEnabled);
    setConfigModal(amenity);
  };

  const handleSaveConfig = () => {
    if (!configModal) return;
    store.updateConfig(configModal.id, { reservable: cfgReservable, notificationEnabled: cfgNotifEnabled });
    setConfigModal(null);
  };

  const openReserveModal = (amenity: AmenityConfig) => {
    setResDate('');
    setResStart('09:00');
    setResEnd('10:00');
    setResNotes('');
    setResError('');
    setReserveModal(amenity);
  };

  const handleReserve = () => {
    if (!reserveModal || !resDate) { setResError('Please select a date'); return; }
    if (resStart >= resEnd) { setResError('End time must be after start time'); return; }
    const result = store.addReservation({
      amenityId: reserveModal.id,
      amenityName: reserveModal.name,
      date: resDate,
      startTime: resStart,
      endTime: resEnd,
      reservedBy: user.id,
      reservedByName: user.name,
      reservedByUnit: user.linkedUnits?.[0] || user.unitNumber || '',
      notes: resNotes,
    });
    if (!result) { setResError('Time conflict — this slot overlaps with an existing reservation'); return; }
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

  const existingForDate = reserveModal
    ? store.getReservationsForAmenity(reserveModal.id, resDate || undefined)
    : [];

  const SUB_TABS: { id: SubView; label: string; badge?: number }[] = [
    { id: 'all', label: 'All Amenities' },
    { id: 'my-reservations', label: 'My Reservations', badge: myReservations.length || undefined },
    { id: 'notifications', label: 'Notifications', badge: unreadCount || undefined },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-display text-lg font-bold text-ink-900">🏢 Amenities</h3>
          <p className="text-xs text-ink-400 mt-1">Reserve spaces, manage amenities & receive notifications</p>
        </div>
        {isBoard && (
          <button onClick={openNotifModal} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800">
            + Send Notification
          </button>
        )}
      </div>

      {/* Sub-nav */}
      <div className="flex gap-1 bg-mist-50 rounded-lg p-1">
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setView(t.id)} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${view === t.id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}>
            {t.label}
            {t.badge ? <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {/* ═══ ALL AMENITIES ═══ */}
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
                    ⚙️
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {amenity.reservable && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-100 text-accent-700 font-semibold">📅 Reservable</span>
                )}
                {amenity.notificationEnabled && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-sage-100 text-sage-700 font-semibold">🔔 Notifications</span>
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

      {/* ═══ MY RESERVATIONS ═══ */}
      {view === 'my-reservations' && (
        <div className="space-y-3">
          {myReservations.length === 0 && (
            <div className="text-center py-8">
              <p className="text-ink-400">No active reservations.</p>
              <button onClick={() => setView('all')} className="mt-2 text-accent-600 text-sm font-medium hover:underline">Browse amenities to make a reservation →</button>
            </div>
          )}
          {myReservations.map(r => (
            <div key={r.id} className="rounded-xl border border-ink-100 p-4 hover:border-accent-200 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{store.configs.find(c => c.id === r.amenityId)?.icon || '🏢'}</span>
                    <h4 className="text-sm font-bold text-ink-900">{r.amenityName}</h4>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-sage-100 text-sage-700 font-semibold">Active</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-ink-400">
                    <span>📅 {r.date}</span>
                    <span>🕐 {formatTime(r.startTime)} – {formatTime(r.endTime)}</span>
                  </div>
                  {r.notes && <p className="text-xs text-ink-500 mt-1.5">{r.notes}</p>}
                </div>
                <button onClick={() => store.cancelReservation(r.id)} className="text-red-500 hover:text-red-700 text-xs font-medium px-3 py-1 rounded-lg hover:bg-red-50">
                  Cancel
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ NOTIFICATIONS ═══ */}
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
                  <span className="text-lg mt-0.5">{store.configs.find(c => c.id === n.amenityId)?.icon || '🔔'}</span>
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

      {/* ═══ CONFIGURE MODAL ═══ */}
      {configModal && (
        <Modal title={`Configure ${configModal.name}`} subtitle="Toggle features for this amenity" onClose={() => setConfigModal(null)} onSave={handleSaveConfig} saveLabel="Save Configuration">
          <div className="space-y-4">
            <label className="flex items-center justify-between p-3 rounded-lg border border-ink-100 cursor-pointer hover:bg-mist-50">
              <div>
                <p className="text-sm font-medium text-ink-900">📅 Reservable</p>
                <p className="text-[11px] text-ink-400 mt-0.5">Allow residents to book time slots</p>
              </div>
              <input type="checkbox" checked={cfgReservable} onChange={e => setCfgReservable(e.target.checked)} className="w-5 h-5 rounded text-accent-600" />
            </label>
            <label className="flex items-center justify-between p-3 rounded-lg border border-ink-100 cursor-pointer hover:bg-mist-50">
              <div>
                <p className="text-sm font-medium text-ink-900">🔔 Notifications</p>
                <p className="text-[11px] text-ink-400 mt-0.5">Enable sending announcements about this amenity</p>
              </div>
              <input type="checkbox" checked={cfgNotifEnabled} onChange={e => setCfgNotifEnabled(e.target.checked)} className="w-5 h-5 rounded text-accent-600" />
            </label>
          </div>
        </Modal>
      )}

      {/* ═══ RESERVE MODAL ═══ */}
      {reserveModal && (
        <Modal title={`Reserve ${reserveModal.name}`} subtitle="Select a date and time for your reservation" onClose={() => setReserveModal(null)} onSave={handleReserve} saveLabel="Confirm Reservation" saveColor="bg-accent-600 hover:bg-accent-700">
          <div className="space-y-4">
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
            {resError && <p className="text-xs text-red-600 font-medium">{resError}</p>}
            {resDate && existingForDate.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-ink-500 uppercase tracking-wider mb-2">Existing Reservations on {resDate}</p>
                <div className="space-y-1.5">
                  {existingForDate.map(r => (
                    <div key={r.id} className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <span className="text-[11px] text-amber-700 font-medium">{formatTime(r.startTime)} – {formatTime(r.endTime)}</span>
                      <span className="text-[10px] text-amber-600">· {r.reservedByName} (Unit {r.reservedByUnit})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ═══ SEND NOTIFICATION MODAL ═══ */}
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
    </div>
  );
}
