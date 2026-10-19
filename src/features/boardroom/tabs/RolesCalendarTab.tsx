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

export default function RolesCalendarTab() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read initial state from query params
  const initialSegment = (searchParams.get('segment') as View) || 'roles';
  const initialRole = (searchParams.get('role') as BoardRoleKey) || 'president';

  const [view, setView] = useState<View>(initialSegment);
  const [selectedRole, setSelectedRole] = useState<BoardRoleKey>(initialRole);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeRecipient, setComposeRecipient] = useState<string | undefined>();

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
    </div>
  );
}
