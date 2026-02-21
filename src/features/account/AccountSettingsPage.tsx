import { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { getInitials } from '@/lib/formatters';

export default function AccountSettingsPage() {
  const { currentUser, updateProfile } = useAuthStore();
  const [name, setName] = useState(currentUser?.name || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [saved, setSaved] = useState(false);
  const [linkUnit, setLinkUnit] = useState('');

  const handleSave = () => {
    updateProfile({ name, email, phone });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-ink-900 flex items-center justify-center shrink-0">
            <span className="text-white text-xl font-bold">{getInitials(currentUser?.name || '')}</span>
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold text-ink-900">Account Settings</h2>
            <p className="text-sm text-ink-500">{currentUser?.email}</p>
          </div>
        </div>
      </div>

      {/* Profile */}
      <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-6 space-y-4">
        <h3 className="font-display text-lg font-bold text-ink-900">Profile Information</h3>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Full Name</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg" />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Email Address</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg" />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Phone Number</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg" />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleSave} className="px-6 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 font-medium">Save Changes</button>
          {saved && <span className="text-sm text-sage-600 font-medium">✓ Saved</span>}
        </div>
      </div>

      {/* Linked Units */}
      <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-6 space-y-4">
        <h3 className="font-display text-lg font-bold text-ink-900">Linked Units</h3>
        <p className="text-sm text-ink-500">Units associated with your account for payments and notifications.</p>
        {currentUser?.linkedUnits && currentUser.linkedUnits.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {currentUser.linkedUnits.map(u => (
              <div key={u} className="bg-sage-50 border border-sage-200 rounded-lg px-4 py-2 flex items-center gap-2">
                <span className="font-bold text-ink-900">Unit {u}</span>
                <span className="pill px-1.5 py-0.5 rounded bg-sage-100 text-sage-700 text-xs">Linked</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-mist-50 rounded-lg p-4 text-center text-ink-400">No units linked yet</div>
        )}
        <div className="flex gap-2">
          <input value={linkUnit} onChange={e => setLinkUnit(e.target.value)} className="flex-1 px-3 py-2 border border-ink-200 rounded-lg" placeholder="Enter unit number (e.g., 204)" />
          <button onClick={() => { if (linkUnit) { updateProfile({ linkedUnits: [...(currentUser?.linkedUnits || []), linkUnit] }); setLinkUnit(''); } }} className="px-4 py-2 bg-accent-600 text-white rounded-lg hover:bg-accent-700 font-medium">Link Unit</button>
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-6 space-y-4">
        <h3 className="font-display text-lg font-bold text-ink-900">Notification Preferences</h3>
        {[
          { label: 'Payment reminders', desc: 'Receive reminders before assessment due dates', default: true },
          { label: 'Meeting notices', desc: 'Get notified about upcoming meetings and agenda changes', default: true },
          { label: 'Issue updates', desc: 'Status changes on issues you reported or upvoted', default: true },
          { label: 'Board announcements', desc: 'Community-wide announcements from the board', default: true },
          { label: 'Financial reports', desc: 'Monthly and quarterly financial summaries', default: false },
        ].map(n => (
          <div key={n.label} className="flex items-center justify-between py-2">
            <div><p className="text-sm font-medium text-ink-900">{n.label}</p><p className="text-xs text-ink-400">{n.desc}</p></div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" defaultChecked={n.default} className="sr-only peer" />
              <div className="w-11 h-6 bg-ink-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sage-500" />
            </label>
          </div>
        ))}
      </div>

      {/* Security */}
      <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-6 space-y-4">
        <h3 className="font-display text-lg font-bold text-ink-900">Security</h3>
        <button className="px-4 py-2 border border-ink-200 text-ink-700 rounded-lg hover:bg-mist-50 font-medium text-sm">Change Password</button>
        <button className="px-4 py-2 border border-ink-200 text-ink-700 rounded-lg hover:bg-mist-50 font-medium text-sm ml-3">Enable Two-Factor Authentication</button>
      </div>
    </div>
  );
}
