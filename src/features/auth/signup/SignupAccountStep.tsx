// Step 3: Account creation — name, email, password, "I am" role chips

import type { SignupState } from './useSignupState';
import type { BoardRoleKey } from '@/types/auth';
import { BOARD_ROLE_LABELS } from '@/types/auth';

interface Props {
  state: SignupState;
  set: <K extends keyof SignupState>(key: K, value: SignupState[K]) => void;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
  onBack: () => void;
}

const I_AM_ROLES: { value: SignupState['iAmRole']; label: string; desc: string }[] = [
  { value: 'board_member', label: 'Board member', desc: 'I serve on the board' },
  { value: 'resident', label: 'Unit owner', desc: 'I own a unit here' },
  { value: 'property_manager', label: 'Property manager', desc: 'I manage this building' },
];

const BOARD_SEATS: { key: BoardRoleKey; label: string }[] = [
  { key: 'president', label: 'President' },
  { key: 'vice_president', label: 'Vice President' },
  { key: 'treasurer', label: 'Treasurer' },
  { key: 'secretary', label: 'Secretary' },
  { key: 'member_at_large', label: 'Member at Large' },
];

export default function SignupAccountStep({ state, set, canSubmit, submitting, onSubmit, onBack }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">First Name</label>
          <input
            value={state.firstName}
            onChange={e => set('firstName', e.target.value)}
            className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm"
            placeholder="First"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Last Name</label>
          <input
            value={state.lastName}
            onChange={e => set('lastName', e.target.value)}
            className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm"
            placeholder="Last"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-ink-700 mb-1">Email</label>
        <input
          type="email"
          value={state.email}
          onChange={e => set('email', e.target.value)}
          className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-ink-700 mb-1">Password</label>
        <input
          type="password"
          value={state.password}
          onChange={e => set('password', e.target.value)}
          className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm"
          placeholder="At least 6 characters"
        />
      </div>

      {/* "I am" role chips */}
      <div>
        <label className="block text-sm font-medium text-ink-700 mb-2">I am a...</label>
        <div className="flex flex-wrap gap-2">
          {I_AM_ROLES.map(r => (
            <button
              key={r.value}
              type="button"
              onClick={() => {
                set('iAmRole', r.value);
                // Reset roleKey when switching away from board_member
                if (r.value !== 'board_member') set('roleKey', null);
                else if (!state.roleKey) set('roleKey', 'president');
              }}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                state.iAmRole === r.value
                  ? 'bg-accent-50 border-accent-400 text-accent-700'
                  : 'bg-white border-ink-200 text-ink-600 hover:border-ink-300'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Board seat selector (only for board members) */}
      {state.iAmRole === 'board_member' && (
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-2">My board seat</label>
          <div className="flex flex-wrap gap-2">
            {BOARD_SEATS.map(s => (
              <button
                key={s.key}
                type="button"
                onClick={() => set('roleKey', s.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  state.roleKey === s.key
                    ? 'bg-ink-100 border-ink-400 text-ink-800'
                    : 'bg-white border-ink-200 text-ink-500 hover:border-ink-300'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={!canSubmit || submitting}
        className="w-full py-3.5 bg-accent-600 text-white rounded-xl font-semibold text-sm hover:bg-accent-700 disabled:opacity-50"
      >
        {submitting ? 'Setting up your building...' : 'Start My Free Trial'}
      </button>

      <p className="text-center text-xs text-ink-400">
        By continuing, you agree to our Terms of Service and Privacy Policy.
      </p>

      <div className="text-center">
        <button onClick={onBack} className="text-sm text-ink-400 hover:text-ink-600">&larr; Back</button>
      </div>
    </div>
  );
}
