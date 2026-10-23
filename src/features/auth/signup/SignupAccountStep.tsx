// Step 3: Account creation — matches signup-reference.html step 3
// Name, email, password (min 16, strong), role chips, PM seat auto-enable, legal footer.

import type { SignupState } from './useSignupState';
import type { PlanPickerValue } from '@/features/subscription/PlanPicker';
import { isValidName, isValidEmail, passwordErrors } from '@/lib/validation';

interface Props {
  state: SignupState;
  set: <K extends keyof SignupState>(key: K, value: SignupState[K]) => void;
  setPlanPicker: (v: PlanPickerValue) => void;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
  onBack: () => void;
}

type IAmValue = 'board' | 'owner' | 'pm' | 'other';

const I_AM_OPTIONS: { value: IAmValue; label: string }[] = [
  { value: 'board', label: 'On the board' },
  { value: 'owner', label: 'A unit owner' },
  { value: 'pm', label: 'A property manager' },
  { value: 'other', label: 'Something else' },
];

function chipToRole(v: IAmValue | null): SignupState['iAmRole'] {
  if (v === 'board') return 'board_member';
  if (v === 'owner') return 'resident';
  if (v === 'pm') return 'property_manager';
  if (v === 'other') return 'other';
  return null;
}

function roleToChip(r: SignupState['iAmRole']): IAmValue | null {
  if (r === 'board_member') return 'board';
  if (r === 'resident') return 'owner';
  if (r === 'property_manager') return 'pm';
  if (r === 'other') return 'other';
  return null;
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'inherit', fontSize: 16, padding: '12px 14px',
  border: '1.5px solid #c9d2dc', borderRadius: 10, background: '#ffffff',
  color: '#0D1B2E', width: '100%', boxSizing: 'border-box', minHeight: 48,
};

const chipStyle = (on: boolean): React.CSSProperties => ({
  minHeight: 44, padding: '0 16px', borderRadius: 999,
  border: '1.5px solid', borderColor: on ? '#0D1B2E' : '#c9d2dc',
  background: on ? '#0D1B2E' : '#ffffff',
  color: on ? '#ffffff' : '#0D1B2E',
  fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer',
});

export default function SignupAccountStep({ state, set, setPlanPicker, canSubmit, submitting, onSubmit, onBack }: Props) {
  const selectedChip = roleToChip(state.iAmRole);

  const handleRoleClick = (v: IAmValue) => {
    const newChip = selectedChip === v ? null : v;
    const newRole = chipToRole(newChip);
    set('iAmRole', newRole);

    // Reset roleKey when not board
    if (newRole !== 'board_member') {
      set('roleKey', null);
    }

    // PM auto-enables PM seat
    if (newRole === 'property_manager') {
      setPlanPicker({ ...state.planPicker, pmSeat: true });
    }
  };

  const cardNote = 'No card is needed today.';

  const firstNameTouched = state.firstName.length > 0;
  const lastNameTouched = state.lastName.length > 0;
  const emailTouched = state.email.length > 0;
  const pwErrors = passwordErrors(state.password);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Title */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em', margin: 0 }}>
          Create your account
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: '#4b5a6b', margin: 0 }}>
          Anyone can start a building. Invite the board, the owners or your manager from inside.
        </p>
      </div>

      {/* Names (2-col) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }} className="signup-name-cols">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#2b3a4b' }}>First name</label>
          <input
            value={state.firstName}
            onChange={e => set('firstName', e.target.value)}
            autoComplete="given-name"
            autoFocus
            style={inputStyle}
          />
          {firstNameTouched && !isValidName(state.firstName) && (
            <span style={{ fontSize: 12, color: '#D62839' }}>Letters only</span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#2b3a4b' }}>Last name</label>
          <input
            value={state.lastName}
            onChange={e => set('lastName', e.target.value)}
            autoComplete="family-name"
            style={inputStyle}
          />
          {lastNameTouched && !isValidName(state.lastName) && (
            <span style={{ fontSize: 12, color: '#D62839' }}>Letters only</span>
          )}
        </div>
      </div>

      {/* Email */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#2b3a4b' }}>Email</label>
        <input
          type="email"
          value={state.email}
          onChange={e => set('email', e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          style={inputStyle}
        />
        {emailTouched && !isValidEmail(state.email) && (
          <span style={{ fontSize: 12, color: '#D62839' }}>Enter a valid email</span>
        )}
      </div>

      {/* Password */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#2b3a4b' }}>Password</label>
        <input
          type="password"
          value={state.password}
          onChange={e => set('password', e.target.value)}
          placeholder="16+ chars, upper, lower, number, special"
          autoComplete="new-password"
          style={inputStyle}
        />
        {state.password.length > 0 && (
          <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 12, lineHeight: 1.8 }}>
            {['At least 16 characters', 'One uppercase letter', 'One lowercase letter', 'One number', 'One special character'].map(req => {
              const met = !pwErrors.includes(req);
              return (
                <li key={req} style={{ color: met ? '#16a34a' : '#D62839' }}>
                  {req}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* I am (optional) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#2b3a4b' }}>I am (optional)</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {I_AM_OPTIONS.map(r => (
            <button
              key={r.value}
              type="button"
              onClick={() => handleRoleClick(r.value)}
              style={chipStyle(selectedChip === r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: '#4b5a6b', margin: 0 }}>
          It sets your starting role; you can change it later.
        </p>
        {state.iAmRole === 'property_manager' && (
          <p style={{ fontSize: 12, color: '#155E75', margin: 0 }}>
            You are the property manager seat on this building, so the seat is added to your plan.
          </p>
        )}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            minHeight: 48, padding: '0 22px', borderRadius: 10, fontWeight: 600, fontSize: 16,
            border: '1.5px solid #c9d2dc', cursor: 'pointer', fontFamily: 'inherit',
            background: '#ffffff', color: '#0D1B2E',
          }}
        >
          Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            minHeight: 48, padding: '0 22px', borderRadius: 10, fontWeight: 600, fontSize: 16,
            border: 0, cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
            background: canSubmit && !submitting ? '#D62839' : '#e3e8ee',
            color: canSubmit && !submitting ? '#ffffff' : '#8fa0b3',
          }}
        >
          {submitting ? 'Starting your building...' : 'Start my building'}
        </button>
      </div>

      {/* Legal footer */}
      <p style={{ fontSize: 12, lineHeight: 1.5, color: '#4b5a6b', margin: 0 }}>
        We will email you a confirmation link. {cardNote} By continuing you agree to the{' '}
        <a href="/terms" style={{ color: '#155E75' }}>Terms</a> and{' '}
        <a href="/privacy" style={{ color: '#155E75' }}>Privacy Policy</a>.
      </p>

      <style>{`
        @media (max-width: 760px) {
          .signup-name-cols { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
