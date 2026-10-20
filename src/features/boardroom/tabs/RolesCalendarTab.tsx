/**
 * RolesCalendarTab — Combined Roles + Calendar tab.
 * Uses SegmentedControl to switch between Role Charters (per role) and the
 * Governance Calendar view.
 */

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SegmentedControl from '@/components/ui/SegmentedControl';
import RoleCharter from '@/features/boardroom/components/RoleCharter';
import GovernanceCalendar from '@/features/boardroom/components/GovernanceCalendar';
import ComposeDrawer from '@/features/boardroom/components/ComposeDrawer';
import Modal from '@/components/ui/Modal';
import { useTenantContext } from '@/components/TenantProvider';
import { useBuildingStore } from '@/store/useBuildingStore';
import { supabase, isBackendEnabled } from '@/lib/supabase';
import { BOARD_ROLE_LABELS, type BoardRoleKey } from '@/types/auth';

type View = 'roles' | 'calendar';

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: 'roles', label: 'Role Charters' },
  { value: 'calendar', label: 'Calendar' },
];

const ROLE_OPTIONS: BoardRoleKey[] = [
  'president',
  'vice_president',
  'treasurer',
  'secretary',
  'member_at_large',
];

type SeatModalMode = null | 'change' | 'reassign';

export default function RolesCalendarTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tenant = useTenantContext();
  const { board, updateBoardMember } = useBuildingStore();

  // Read initial state from query params
  const initialSegment = (searchParams.get('segment') as View) || 'roles';
  const initialRole = (searchParams.get('role') as BoardRoleKey) || 'president';

  const [view, setView] = useState<View>(initialSegment);
  const [selectedRole, setSelectedRole] = useState<BoardRoleKey>(initialRole);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeRecipient, setComposeRecipient] = useState<string | undefined>();

  // Seat management state
  const [seatModal, setSeatModal] = useState<SeatModalMode>(null);
  const [seatSaving, setSeatSaving] = useState(false);

  const myRoleKey = tenant.me.roleKey;
  const isPresident = myRoleKey === 'president';

  const handleViewChange = (v: View) => {
    setView(v);
    setSearchParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        if (v === 'roles') {
          updated.delete('segment');
        } else {
          updated.set('segment', v);
        }
        return updated;
      },
      { replace: true },
    );
  };

  const handleRoleChange = (r: BoardRoleKey) => {
    setSelectedRole(r);
    setSearchParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        if (r === 'president') {
          updated.delete('role');
        } else {
          updated.set('role', r);
        }
        return updated;
      },
      { replace: true },
    );
  };

  const handleCompose = (recipientName: string) => {
    setComposeRecipient(recipientName);
    setComposeOpen(true);
  };

  // ── Seat management ──

  const handleChangeSeat = () => setSeatModal('change');
  const handleReassign = () => setSeatModal('reassign');

  /** Execute a seat swap: move `memberId` to `newRoleKey`, swapping with current holder if any */
  const executeSeatChange = async (memberId: string, newRoleKey: BoardRoleKey) => {
    setSeatSaving(true);
    try {
      const member = board.find((m) => m.id === memberId);
      const oldRoleKey = member?.roleKey || null;
      const currentHolder = board.find((m) => m.roleKey === newRoleKey && m.id !== memberId);

      // 1. Update local store — swap the two members
      updateBoardMember(memberId, { roleKey: newRoleKey, role: BOARD_ROLE_LABELS[newRoleKey] });
      if (currentHolder && oldRoleKey) {
        updateBoardMember(currentHolder.id, { roleKey: oldRoleKey, role: BOARD_ROLE_LABELS[oldRoleKey] });
      } else if (currentHolder) {
        updateBoardMember(currentHolder.id, { roleKey: undefined, role: '' });
      }

      // 2. Update DB if backend is enabled
      if (isBackendEnabled && supabase && tenant.id) {
        await supabase
          .from('board_members')
          .update({ role_key: newRoleKey, role: BOARD_ROLE_LABELS[newRoleKey] })
          .eq('id', memberId)
          .eq('tenant_id', tenant.id);

        if (currentHolder) {
          await supabase
            .from('board_members')
            .update({ role_key: oldRoleKey || null, role: oldRoleKey ? BOARD_ROLE_LABELS[oldRoleKey] : '' })
            .eq('id', currentHolder.id)
            .eq('tenant_id', tenant.id);
        }

        // Update tenant_users by email match
        if (member?.email) {
          await supabase
            .from('tenant_users')
            .update({ role_key: newRoleKey })
            .eq('tenant_id', tenant.id)
            .ilike('email', member.email);
        }
        if (currentHolder?.email) {
          await supabase
            .from('tenant_users')
            .update({ role_key: oldRoleKey || null })
            .eq('tenant_id', tenant.id)
            .ilike('email', currentHolder.email);
        }

        // 3. Settle ownership
        await supabase.rpc('settle_ownership', { p_tenant_id: tenant.id });
      }
    } catch (err) {
      console.error('Seat change failed:', err);
    } finally {
      setSeatSaving(false);
      setSeatModal(null);
    }
  };

  const boardMembers = board.filter((m) => m.roleKey || m.role);

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={handleViewChange} />

      {/* Roles view */}
      {view === 'roles' && (
        <div className="space-y-4">
          {/* Role selector chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {ROLE_OPTIONS.map((r) => (
              <button
                key={r}
                onClick={() => handleRoleChange(r)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  selectedRole === r
                    ? 'bg-navy text-white'
                    : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                }`}
              >
                {BOARD_ROLE_LABELS[r]}
              </button>
            ))}
          </div>

          {/* Role charter */}
          <RoleCharter
            roleKey={selectedRole}
            onCompose={handleCompose}
            myRoleKey={myRoleKey}
            isPresident={isPresident}
            onChangeSeat={handleChangeSeat}
            onReassign={handleReassign}
          />
        </div>
      )}

      {/* Calendar view */}
      {view === 'calendar' && <GovernanceCalendar />}

      {/* ComposeDrawer */}
      <ComposeDrawer
        open={composeOpen}
        onClose={() => {
          setComposeOpen(false);
          setComposeRecipient(undefined);
        }}
        prefillRecipient={composeRecipient}
      />

      {/* Seat change modal — pick a new role */}
      {seatModal === 'change' && (
        <Modal title="Change my seat" onClose={() => setSeatModal(null)}>
          <p className="text-sm text-ink-600 mb-4">
            Select a new board seat. If the seat is already occupied, you'll swap roles with the current holder.
          </p>
          <div className="space-y-2">
            {ROLE_OPTIONS.filter((r) => r !== myRoleKey).map((r) => {
              const holder = board.find((m) => m.roleKey === r);
              const me = board.find((m) => m.roleKey === myRoleKey);
              return (
                <button
                  key={r}
                  disabled={seatSaving}
                  onClick={() => me && executeSeatChange(me.id, r)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-ink-200 hover:border-navy hover:bg-mist-50 transition-colors text-left disabled:opacity-50"
                >
                  <div>
                    <p className="text-sm font-medium text-ink-900">{BOARD_ROLE_LABELS[r]}</p>
                    {holder ? (
                      <p className="text-xs text-ink-500 mt-0.5">
                        Currently: {holder.name} (will swap to {myRoleKey ? BOARD_ROLE_LABELS[myRoleKey] : 'unassigned'})
                      </p>
                    ) : (
                      <p className="text-xs text-ink-400 mt-0.5">Vacant</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Modal>
      )}

      {/* Reassign modal — pick a board member for this seat */}
      {seatModal === 'reassign' && (
        <Modal title={`Reassign ${BOARD_ROLE_LABELS[selectedRole]}`} onClose={() => setSeatModal(null)}>
          <p className="text-sm text-ink-600 mb-4">
            Select a board member to assign as {BOARD_ROLE_LABELS[selectedRole]}.
            {board.find((m) => m.roleKey === selectedRole) && ' The current holder will swap seats or be unassigned.'}
          </p>
          <div className="space-y-2">
            {boardMembers.filter((m) => m.roleKey !== selectedRole).map((m) => (
              <button
                key={m.id}
                disabled={seatSaving}
                onClick={() => executeSeatChange(m.id, selectedRole)}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-ink-200 hover:border-navy hover:bg-mist-50 transition-colors text-left disabled:opacity-50"
              >
                <div>
                  <p className="text-sm font-medium text-ink-900">{m.name}</p>
                  <p className="text-xs text-ink-500 mt-0.5">
                    {m.roleKey ? BOARD_ROLE_LABELS[m.roleKey] : 'No seat assigned'}
                  </p>
                </div>
              </button>
            ))}
            {boardMembers.filter((m) => m.roleKey !== selectedRole).length === 0 && (
              <p className="text-center text-ink-400 py-4 text-sm">No other board members available.</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
