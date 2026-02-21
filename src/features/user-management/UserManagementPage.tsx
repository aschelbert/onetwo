import { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { getInitials } from '@/lib/formatters';
import Modal from '@/components/ui/Modal';

export default function UserManagementPage() {
  const { buildingMembers: members, buildingInvites: invites, inviteMember, removeMember, revokeInvite } = useAuthStore();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'RESIDENT', unit: '' });

  const roleLabel = (r: string) => r === 'BOARD_MEMBER' ? 'Board Member' : r === 'PROPERTY_MANAGER' ? 'Property Manager' : 'Resident';
  const roleBadge = (r: string) => r === 'BOARD_MEMBER' ? 'bg-sage-100 text-sage-700' : r === 'PROPERTY_MANAGER' ? 'bg-accent-100 text-accent-700' : 'bg-mist-100 text-ink-600';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink-900">User Management</h2>
          <p className="text-sm text-ink-500">{members.length} members · {invites.length} pending invites</p>
        </div>
        <button onClick={() => setShowInvite(true)} className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 font-medium">+ Invite Member</button>
      </div>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
          <h3 className="font-display text-lg font-bold text-ink-900 mb-3">Pending Invitations</h3>
          <div className="space-y-2">
            {invites.map(inv => (
              <div key={inv.code} className="bg-white rounded-lg p-4 border border-yellow-100 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`pill px-2 py-0.5 rounded ${roleBadge(inv.role)}`}>{roleLabel(inv.role)}</span>
                    {inv.unit && <span className="text-xs text-ink-400">Unit {inv.unit}</span>}
                  </div>
                  <p className="text-sm text-ink-700">{inv.email}</p>
                  <p className="text-xs text-ink-400 font-mono">{inv.code}</p>
                </div>
                <button onClick={() => revokeInvite(inv.code)} className="px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-xs font-medium hover:bg-red-200">Revoke</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Members List */}
      <div className="bg-white rounded-xl shadow-sm border border-ink-100">
        <div className="border-b px-5 py-4"><h3 className="font-display text-lg font-bold text-ink-900">All Members</h3></div>
        <div className="divide-y divide-ink-50">
          {members.map(m => (
            <div key={m.id} className="p-4 flex items-center justify-between hover:bg-mist-50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-ink-900 flex items-center justify-center shrink-0">
                  <span className="text-white font-bold text-sm">{getInitials(m.name)}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-ink-900">{m.name}</p>
                    <span className={`pill px-2 py-0.5 rounded text-xs ${roleBadge(m.role)}`}>{roleLabel(m.role)}</span>
                    {m.unit && <span className="text-xs text-ink-400">Unit {m.unit}</span>}
                  </div>
                  <p className="text-xs text-ink-500">{m.email}</p>
                </div>
              </div>
              <button onClick={() => { if (confirm(`Remove ${m.name}?`)) removeMember(m.id); }} className="text-xs text-red-400 hover:text-red-600">Remove</button>
            </div>
          ))}
        </div>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <Modal title="Invite Member" subtitle="Send an invitation code to join the building" onClose={() => setShowInvite(false)} onSave={() => {
          if (!inviteForm.email) { alert('Email required'); return; }
          inviteMember(inviteForm.email, inviteForm.role as any, inviteForm.unit || undefined);
          setInviteForm({ email: '', role: 'RESIDENT', unit: '' });
          setShowInvite(false);
        }} saveLabel="Send Invite">
          <div className="space-y-4">
            <div><label className="block text-sm font-medium text-ink-700 mb-1">Email Address *</label><input type="email" value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" placeholder="person@example.com" /></div>
            <div><label className="block text-sm font-medium text-ink-700 mb-1">Role *</label>
              <select value={inviteForm.role} onChange={e => setInviteForm({ ...inviteForm, role: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg">
                <option value="RESIDENT">Resident</option>
                <option value="BOARD_MEMBER">Board Member</option>
                <option value="PROPERTY_MANAGER">Property Manager</option>
              </select>
            </div>
            <div><label className="block text-sm font-medium text-ink-700 mb-1">Unit Number (optional)</label><input value={inviteForm.unit} onChange={e => setInviteForm({ ...inviteForm, unit: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" placeholder="e.g., 204" /></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
