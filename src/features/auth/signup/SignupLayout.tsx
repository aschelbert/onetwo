// Two-column layout shell for the 2-step signup wizard.
// Dark header with step indicator, white card left, dark summary sidebar right.

import type { ReactNode } from 'react';
import type { SignupState } from './useSignupState';
import SignupSummary from './SignupSummary';
import { PLANS, planPrice, onCallPrice, pmSeatPrice, SETUP } from '@/lib/tiers';

interface Props {
  state: SignupState;
  trialDays: number;
  children: ReactNode;
}

const STEPS = [
  { key: 'plan', label: '1 Your plan' },
  { key: 'details', label: '2 Your details' },
] as const;

const STEP_ORDER = ['plan', 'details'] as const;

export default function SignupLayout({ state, trialDays, children }: Props) {
  const currentIdx = STEP_ORDER.indexOf(state.step);

  // Mobile summary bar data
  const plan = state.planPicker.plan;
  const interval = state.planPicker.interval;
  const planName = plan ? PLANS[plan].name : null;
  const recurring = plan
    ? planPrice(plan, interval)
      + (state.planPicker.onCall ? onCallPrice(plan, interval) : 0)
      + (state.planPicker.pmSeat ? pmSeatPrice(interval) : 0)
    : 0;
  const per = interval === 'annual' ? ' a year' : ' a month';
  const dueToday = plan && state.planPicker.setup ? SETUP[plan] : 0;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#e4e6eb' }}>
      {/* ── Dark header ── */}
      <header
        style={{
          background: '#0D1B2E',
          minHeight: 58,
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: '#ffffff' }}>
          <img
            src="/onetwo-logo-mark.jpg"
            alt="ONE two"
            style={{ width: 30, height: 28, objectFit: 'cover', borderRadius: 5 }}
          />
          <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 700, fontSize: 19 }}>
            ONE <span style={{ fontWeight: 500 }}>two</span>
          </span>
        </a>

        {/* Step indicator — desktop */}
        <div
          className="hidden sm:flex"
          style={{ gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 600, color: '#8fa0b3' }}
        >
          {STEPS.map((s, i) => (
            <span key={s.key}>
              {i > 0 && <span style={{ margin: '0 4px' }}>&middot;</span>}
              <span
                style={{
                  color: i === currentIdx ? '#ffffff' : i < currentIdx ? '#A5F3FC' : '#8fa0b3',
                  fontWeight: i === currentIdx ? 600 : 500,
                }}
              >
                {s.label}
              </span>
            </span>
          ))}
        </div>

        <span style={{ fontSize: 13, color: '#8fa0b3' }}>
          Already have an account?{' '}
          <a href="/login" style={{ color: '#A5F3FC' }}>Log in</a>
        </span>
      </header>

      {/* ── Main content ── */}
      <main style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '48px 24px' }}>
        <div
          style={{
            width: '100%',
            maxWidth: 1040,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 300px',
            gap: 32,
            alignItems: 'start',
          }}
          className="signup-two-col"
        >
          {/* Left: white card */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: 18,
              padding: 36,
              boxShadow: '0 2px 6px rgba(13,27,46,.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: 28,
            }}
          >
            {/* Step indicator inside card (text version) */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 600, color: '#8fa0b3' }}>
              {STEPS.map((s, i) => (
                <span key={s.key}>
                  {i > 0 && <span style={{ margin: '0 2px' }}>&middot;</span>}
                  <span
                    style={{
                      color: i === currentIdx ? '#0D1B2E' : i < currentIdx ? '#155E75' : '#8fa0b3',
                      fontWeight: i === currentIdx ? 600 : 500,
                    }}
                  >
                    {s.label}
                  </span>
                </span>
              ))}
            </div>

            {/* Mobile summary bar */}
            <div
              className="signup-mobile-summary"
              style={{
                display: 'none',
                justifyContent: 'space-between',
                fontSize: 13,
                background: '#0D1B2E',
                color: '#ffffff',
                borderRadius: 10,
                padding: '10px 14px',
              }}
            >
              <span>
                {planName ? `${planName}, $${recurring.toLocaleString('en-US')}${per}` : 'Plan: not chosen yet'}
              </span>
              <span>Due today <b>${dueToday.toLocaleString('en-US')}</b></span>
            </div>

            {children}
          </div>

          {/* Right: summary sidebar — desktop only */}
          <aside
            className="signup-sidebar"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              position: 'sticky',
              top: 24,
            }}
          >
            <SignupSummary state={state} trialDays={trialDays} />
          </aside>
        </div>
      </main>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 760px) {
          .signup-two-col { grid-template-columns: 1fr !important; }
          .signup-sidebar { display: none !important; }
          .signup-mobile-summary { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
