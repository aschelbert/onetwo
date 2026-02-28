import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useTenantContext } from '@/components/TenantProvider';
import { supabase, isBackendEnabled } from '@/lib/supabase';
import { getInitials } from '@/lib/formatters';
import Modal from '@/components/ui/Modal';

interface TenantUser {
  id: string;
  user_id: string;
  role: string;
  unit: string | null;
  board_title: string | null;
  status: string;
  created_at: string;
  email?: string;
  name?: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  unit: string | null;
  code: string;
  invited_by_name: string;
  status: string;
  created_at: string;
  expires_at: string;
}

interface BulkInvitee {
  email: string;
  role: string;
  unit: string;
}

const roleLabel = (r: string) =>
  r === 'board_member' || r === 'BOARD_MEMBER' ? 'Board Member' :
  r === 'property_manager' || r === 'PROPERTY_MANAGER' ? 'Property Manager' : 'Resident';

const roleBadge = (r: string) =>
  r === 'board_member' || r === 'BOARD_MEMBER' ? 'bg-sage-100 text-sage-700' :
  r === 'property_manager' || r === 'PROPERTY_MANAGER' ? 'bg-accent-100 text-accent-700' : 'bg-mist-100 text-ink-600';

export default function UserManagementPage() {
  const { currentUser, buildingMembers, buildingInvites, inviteMember, removeMember, revokeInvite } = useAuthStore();
  const units = useFinancialStore(s => s.units);
  const tenant = useTenantContext();
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'resident', unit: '' });
  const [bulkText, setBulkText] = useState('');
  const [bulkRole, setBulkRole] = useState('resident');
  const [sending, setSending] = useState(false);

  // Load tenant users and invitations from Supabase
  useEffect(() => {
    if (!tenant.isDemo && isBackendEnabled && supabase) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [tenant.id]);

  const loadData = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      // Get tenant users with their auth info
      const { data: tuData } = await supabase
        .from('tenant_users')
        .select('id, user_id, role, unit, board_title, status, created_at, name, email')
        .eq('tenant_id', tenant.id);

      if (tuData) {
        setUsers(tuData);
      }

      // Get pending invitations
      const { data: invData } = await supabase
        .from('invitations')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });

      if (invData) setInvitations(invData);
    } catch (err) {
      console.warn('Failed to load users:', err);
    }
    setLoading(false);
  };

  // Send a single invite via Edge Function
  const handleSendInvite = async () => {
    if (!inviteForm.email) { alert('Email is required'); return; }

    if (tenant.isDemo || !isBackendEnabled || !supabase) {
      // Demo mode fallback
      inviteMember(inviteForm.email, inviteForm.role.toUpperCase() as any, inviteForm.unit || undefined);
      setInviteForm({ email: '', role: 'resident', unit: '' });
      setShowInvite(false);
      return;
    }

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { alert('Not authenticated'); setSending(false); return; }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            email: inviteForm.email,
            role: inviteForm.role,
            unit: inviteForm.unit || null,
            senderName: currentUser.name,
          }),
        }
      );

      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        const inv = data.invitations?.[0];
        if (inv?.sent) {
          alert(`Invitation sent to ${inv.email}`);
        } else if (inv?.code) {
          alert(`Invitation created (code: ${inv.code}). ${inv.error || 'Email delivery pending.'}`);
        }
        setInviteForm({ email: '', role: 'resident', unit: '' });
        setShowInvite(false);
        loadData();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to send invite');
    }
    setSending(false);
  };

  // Send bulk invites
  const handleBulkInvite = async () => {
    const lines = bulkText.trim().split('\n').filter(l => l.trim());
    if (!lines.length) { alert('Enter at least one email address'); return; }

    // Parse lines: "email, unit" or just "email"
    const invitees: BulkInvitee[] = lines.map(line => {
      const parts = line.split(',').map(s => s.trim());
      return {
        email: parts[0],
        role: bulkRole,
        unit: parts[1] || '',
      };
    }).filter(i => i.email.includes('@'));

    if (!invitees.length) { alert('No valid email addresses found'); return; }

    if (tenant.isDemo || !isBackendEnabled || !supabase) {
      invitees.forEach(i => inviteMember(i.email, bulkRole.toUpperCase() as any, i.unit || undefined));
      setBulkText('');
      setShowBulk(false);
      return;
    }

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { alert('Not authenticated'); setSending(false); return; }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            invitees,
            senderName: currentUser.name,
          }),
        }
      );

      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        alert(`${data.sent || 0} of ${data.total} invitations sent successfully.`);
        setBulkText('');
        setShowBulk(false);
        loadData();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to send invites');
    }
    setSending(false);
  };

  // Revoke invitation
  const handleRevoke = async (invId: string, code: string) => {
    if (!confirm('Revoke this invitation?')) return;

    if (tenant.isDemo || !isBackendEnabled || !supabase) {
      revokeInvite(code);
      return;
    }

    await supabase.from('invitations').update({ status: 'revoked' }).eq('id', invId);
    loadData();
  };

  // Resend invitation email
  const handleResend = async (inv: Invitation) => {
    if (tenant.isDemo || !isBackendEnabled || !supabase) {
      alert('Resend is not available in demo mode.');
      return;
    }

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { alert('Not authenticated'); setSending(false); return; }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            email: inv.email,
            role: inv.role,
            unit: inv.unit || null,
            senderName: currentUser.name,
            resendCode: inv.code,
          }),
        }
      );

      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        alert(`Invitation resent to ${inv.email}`);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to resend');
    }
    setSending(false);
  };

  // For demo mode, show the original Zustand-based data
  const displayMembers = tenant.isDemo ? buildingMembers.filter(m => m.role !== 'PLATFORM_ADMIN') : users;
  const displayInvites = tenant.isDemo ? buildingInvites : invitations.filter(i => i.status === 'pending');
  const pendingCount = displayInvites.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink-900">User Management</h2>
          <p className="text-sm text-ink-500">
            {displayMembers.length} member{displayMembers.length !== 1 ? 's' : ''}
            {pendingCount > 0 && ` · ${pendingCount} pending invite${pendingCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowBulk(true)} className="px-4 py-2 border border-ink-200 text-ink-700 rounded-lg hover:bg-ink-50 font-medium text-sm">Bulk Invite</button>
          <button onClick={() => setShowInvite(true)} className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 font-medium text-sm">+ Invite Member</button>
        </div>
      </div>

      {loading && (
        <div className="text-center py-8">
          <div className="w-6 h-6 border-2 border-ink-300 border-t-ink-900 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-ink-400">Loading members...</p>
        </div>
      )}

      {/* Pending Invites */}
      {pendingCount > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
          <h3 className="font-display text-lg font-bold text-ink-900 mb-3">Pending Invitations</h3>
          <div className="space-y-2">
            {tenant.isDemo ? buildingInvites.map(inv => (
              <div key={inv.code} className="bg-white rounded-lg p-4 border border-yellow-100 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`pill px-2 py-0.5 rounded text-xs ${roleBadge(inv.role)}`}>{roleLabel(inv.role)}</span>
                    {inv.unit && <span className="text-xs text-ink-400">Unit {inv.unit}</span>}
                  </div>
                  <p className="text-sm text-ink-700">{inv.email}</p>
                  <p className="text-xs text-ink-400 font-mono">{inv.code}</p>
                </div>
                <button onClick={() => revokeInvite(inv.code)} className="px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-xs font-medium hover:bg-red-200">Revoke</button>
              </div>
            )) : invitations.filter(i => i.status === 'pending').map(inv => (
              <div key={inv.id} className="bg-white rounded-lg p-4 border border-yellow-100 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`pill px-2 py-0.5 rounded text-xs ${roleBadge(inv.role)}`}>{roleLabel(inv.role)}</span>
                    {inv.unit && <span className="text-xs text-ink-400">Unit {inv.unit}</span>}
                  </div>
                  <p className="text-sm text-ink-700">{inv.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-ink-400 font-mono">{inv.code}</p>
                    <span className="text-xs text-ink-300">·</span>
                    <p className="text-xs text-ink-400">by {inv.invited_by_name}</p>
                    <span className="text-xs text-ink-300">·</span>
                    <p className="text-xs text-ink-400">expires {new Date(inv.expires_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleResend(inv)} disabled={sending} className="px-3 py-1.5 bg-accent-100 text-accent-700 rounded-lg text-xs font-medium hover:bg-accent-200 disabled:opacity-50">{sending ? '...' : 'Resend'}</button>
                  <button onClick={() => handleRevoke(inv.id, inv.code)} className="px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-xs font-medium hover:bg-red-200">Revoke</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Members List */}
      {!loading && (
        <div className="bg-white rounded-xl shadow-sm border border-ink-100">
          <div className="border-b px-5 py-4"><h3 className="font-display text-lg font-bold text-ink-900">Members</h3></div>
          <div className="divide-y divide-ink-50">
            {tenant.isDemo ? buildingMembers.filter(m => m.role !== 'PLATFORM_ADMIN').map(m => (
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
            )) : users.map(u => (
              <div key={u.id} className="p-4 flex items-center justify-between hover:bg-mist-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-ink-900 flex items-center justify-center shrink-0">
                    <span className="text-white font-bold text-sm">{getInitials(u.name || u.email || '?')}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-ink-900">{u.name || u.email || u.user_id.slice(0, 8)}</p>
                      <span className={`pill px-2 py-0.5 rounded text-xs ${roleBadge(u.role)}`}>{roleLabel(u.role)}</span>
                      {u.board_title && <span className="text-xs text-ink-400">{u.board_title}</span>}
                      {u.unit && <span className="text-xs text-ink-400">Unit {u.unit}</span>}
                    </div>
                    <p className="text-xs text-ink-500">{u.email || 'Joined ' + new Date(u.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                {u.user_id !== currentUser.id && (
                  <button className="text-xs text-red-400 hover:text-red-600">Remove</button>
                )}
              </div>
            ))}
            {!tenant.isDemo && users.length === 0 && !loading && (
              <div className="p-8 text-center">
                <p className="text-ink-400 text-sm">No members yet. Invite your first member to get started.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Single Invite Modal */}
      {showInvite && (
        <Modal title="Invite Member" subtitle={`Send an invitation to join ${tenant.name}`} onClose={() => setShowInvite(false)} onSave={handleSendInvite} saveLabel={sending ? 'Sending...' : 'Send Invitation'}>
          <div className="space-y-4">
            <div><label className="block text-sm font-medium text-ink-700 mb-1">Email Address *</label>
              <input type="email" value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" placeholder="person@example.com" /></div>
            <div><label className="block text-sm font-medium text-ink-700 mb-1">Role *</label>
              <select value={inviteForm.role} onChange={e => setInviteForm({ ...inviteForm, role: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg">
                <option value="resident">Resident</option>
                <option value="board_member">Board Member</option>
                <option value="property_manager">Property Manager</option>
              </select>
            </div>
            <div><label className="block text-sm font-medium text-ink-700 mb-1">Unit Number (optional)</label>
              <select value={inviteForm.unit} onChange={e => setInviteForm({ ...inviteForm, unit: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg">
                <option value="">Select unit...</option>
                {units.map(u => <option key={u.number} value={u.number}>Unit {u.number}</option>)}
              </select></div>
            <div className="bg-mist-50 border border-mist-200 rounded-lg p-3">
              <p className="text-xs text-ink-500">An email will be sent from <strong>noreply@getonetwo.com</strong> with reply-to set to <strong>{currentUser.email}</strong>. The recipient will receive a unique invitation code and link to join {tenant.name}.</p>
            </div>
          </div>
        </Modal>
      )}

      {/* Bulk Invite Modal */}
      {showBulk && (
        <Modal title="Bulk Invite" subtitle={`Invite multiple people to ${tenant.name}`} onClose={() => setShowBulk(false)} onSave={handleBulkInvite} saveLabel={sending ? `Sending...` : 'Send All Invitations'}>
          <div className="space-y-4">
            <div><label className="block text-sm font-medium text-ink-700 mb-1">Role for all invitees</label>
              <select value={bulkRole} onChange={e => setBulkRole(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg">
                <option value="resident">Resident</option>
                <option value="board_member">Board Member</option>
                <option value="property_manager">Property Manager</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Email addresses (one per line)</label>
              <textarea value={bulkText} onChange={e => setBulkText(e.target.value)}
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm font-mono h-40"
                placeholder={"alice@example.com, 101\nbob@example.com, 204\ncarol@example.com"} />
              <p className="text-xs text-ink-400 mt-1">Format: <span className="font-mono">email</span> or <span className="font-mono">email, unit</span> — one per line</p>
            </div>
            <div className="bg-mist-50 border border-mist-200 rounded-lg p-3">
              <p className="text-xs text-ink-500">
                {bulkText.trim().split('\n').filter(l => l.trim() && l.includes('@')).length} invitation{bulkText.trim().split('\n').filter(l => l.trim() && l.includes('@')).length !== 1 ? 's' : ''} will be sent.
                Each person receives a unique code and link.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

