import { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useUndoableAction } from '@/hooks/useUndoableAction';
import { getInitials } from '@/lib/formatters';
import { supabase } from '@/lib/supabase';
import type { BoardRoleKey } from '@/types/auth';
import { BOARD_ROLE_LABELS } from '@/types/auth';
import Modal from '@/components/ui/Modal';

function Field({ label, value, onChange, type = 'text', placeholder = '' }: { label: string; value: string; onChange: (val: string) => void; type?: string; placeholder?: string }) {
  return (
    <div><label className="block text-xs font-medium text-ink-700 mb-1">{label}</label><input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder={placeholder} /></div>
  );
}

export default function UserManagementPage() {
  const store = useBuildingStore();
  const { currentRole, buildingMembers, buildingInvites, revokeInvite } = useAuthStore();
  const { run: runUndoable } = useUndoableAction();
  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';

  const [inviteForm, setInviteForm] = useState({ email: '', role: 'resident', unit: '', roleKey: '' });
  const [inviteSending, setInviteSending] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Security filter: hide PLATFORM_ADMIN entries from non-admin users
  const visibleMembers = currentRole === 'PLATFORM_ADMIN'
    ? buildingMembers
    : buildingMembers.filter(m => m.role !== 'PLATFORM_ADMIN');

  const handleInvite = async () => {
    if (!inviteForm.email || inviteSending) return;
    setInviteSending(true);
    try {
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/send-invite`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({
              email: inviteForm.email,
              role: inviteForm.role,
              unit: inviteForm.unit || undefined,
              roleKey: inviteForm.role === 'board_member' && inviteForm.roleKey ? inviteForm.roleKey : undefined,
              senderName: store.board.find(m => m.email === useAuthStore.getState().currentUser.email)?.name || useAuthStore.getState().currentUser.name,
            }),
          },
        );
      }
      setInviteForm({ email: '', role: 'resident', unit: '', roleKey: '' });
      setShowInviteModal(false);
    } finally {
      setInviteSending(false);
    }
  };

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="rounded-t-xl p-8 text-white shadow-sm" style={{ background: 'linear-gradient(to right, rgb(21, 94, 117), #991b1b)' }}>
        <h2 className="font-display text-2xl font-bold">User Management</h2>
        <p className="text-accent-200 text-sm mt-1">{visibleMembers.length} members · {buildingInvites.filter(inv => inv.status === 'pending').length} pending invitations</p>
      </div>

      <div className="bg-white rounded-b-xl border-x border-b border-ink-100 p-6 space-y-6">
        {/* Invite button */}
        {isBoard && (
          <div className="flex items-center justify-end">
            <button onClick={() => { setInviteForm({ email: '', role: 'resident', unit: '', roleKey: '' }); setShowInviteModal(true); }} className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium">+ Invite User</button>
          </div>
        )}

        {/* Pending invites */}
        {buildingInvites.filter(inv => inv.status === 'pending').length > 0 && (
          <div>
            <h3 className="font-display text-lg font-bold text-ink-900 mb-3">Pending Invitations</h3>
            <div className="space-y-2">
              {buildingInvites.filter(inv => inv.status === 'pending').map(inv => (
                <div key={inv.id} className="flex items-center justify-between bg-mist-50 border border-mist-200 rounded-lg p-4">
                  <div>
                    <p className="text-sm font-medium text-ink-900">{inv.email}</p>
                    <p className="text-xs text-ink-500">{inv.role}{inv.unit ? ` -- Unit ${inv.unit}` : ''} -- Code: {inv.code}</p>
                  </div>
                  {isBoard && (
                    <button onClick={() => {
                      revokeInvite(inv.id);
                      runUndoable({ label: `Revoked invite for ${inv.email}`, undo: () => {}, commit: () => {} });
                    }} className="text-xs text-red-400 hover:text-red-600">Revoke</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {buildingInvites.filter(inv => inv.status === 'pending').length === 0 && (
          <div>
            <h3 className="font-display text-lg font-bold text-ink-900 mb-3">Pending Invitations</h3>
            <p className="text-sm text-ink-400">No pending invitations.</p>
          </div>
        )}

        {/* Current members */}
        <div>
          <h3 className="font-display text-lg font-bold text-ink-900 mb-3">Current Members ({visibleMembers.length})</h3>
          <div className="space-y-2">
            {visibleMembers.map(m => (
              <div key={m.id} className="flex items-center justify-between bg-white border border-ink-100 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-ink-900 flex items-center justify-center shrink-0"><span className="text-white font-bold text-xs">{getInitials(m.name)}</span></div>
                  <div>
                    <p className="text-sm font-medium text-ink-900">{m.name}</p>
                    <p className="text-xs text-ink-500">{m.email} {m.unit ? `-- Unit ${m.unit}` : ''}</p>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-lg font-semibold bg-ink-100 text-ink-600">{m.role}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <Modal title="Invite User" onClose={() => setShowInviteModal(false)} onSave={handleInvite}>
          <div className="space-y-3">
            <Field label="Email *" value={inviteForm.email} onChange={v => setInviteForm(p => ({ ...p, email: v }))} type="email" placeholder="user@example.com" />
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Role *</label>
              <select value={inviteForm.role} onChange={e => setInviteForm(p => ({ ...p, role: e.target.value, roleKey: '' }))} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                <option value="resident">Resident</option>
                <option value="board_member">Board Member</option>
                <option value="property_manager">Property Manager</option>
                <option value="staff">Staff</option>
              </select>
            </div>
            {inviteForm.role === 'board_member' && (
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Board Seat</label>
                <select value={inviteForm.roleKey} onChange={e => setInviteForm(p => ({ ...p, roleKey: e.target.value }))} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                  <option value="">Let them pick</option>
                  {(Object.entries(BOARD_ROLE_LABELS) as [BoardRoleKey, string][]).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            )}
            <Field label="Unit (optional)" value={inviteForm.unit} onChange={v => setInviteForm(p => ({ ...p, unit: v }))} placeholder="101" />
          </div>
        </Modal>
      )}
    </div>
  );
}
