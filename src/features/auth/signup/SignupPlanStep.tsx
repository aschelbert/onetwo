// Step 2: Plan selection — custom UI matching signup-reference.html
// Does NOT use the PlanPicker component (still used by SubscriptionPage).

import type { SignupState } from './useSignupState';
import type { PlanPickerValue } from '@/features/subscription/PlanPicker';
import type { PlanId, BillingInterval } from '@/lib/tiers';
import { PLANS, planPrice, onCallPrice, pmSeatPrice, SETUP } from '@/lib/tiers';
import { recommendPlan } from '@/lib/signup';

interface Props {
  state: SignupState;
  setPlanPicker: (v: PlanPickerValue) => void;
  trialDays: number;
  canAdvance: boolean;
  onNext: () => void;
  onBack: () => void;
}

const CHECK_SVG = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);

function money(n: number) {
  return '$' + n.toLocaleString('en-US');
}

export default function SignupPlanStep({ state, setPlanPicker, trialDays, canAdvance, onNext, onBack }: Props) {
  const pp = state.planPicker;
  const plan = pp.plan;
  const interval = pp.interval;
  const ann = interval === 'annual';
  const per = ann ? ' a year' : ' a month';
  const fa = plan === 'facilities';

  const recommendFa = state.amenities.some(a =>
    ['elevator', 'pool', 'staff_on_payroll'].includes(a),
  );

  // Prices
  const smPrice = ann ? PLANS.self_managed.annual : PLANS.self_managed.monthly;
  const faPrice = ann ? PLANS.facilities.annual : PLANS.facilities.monthly;
  const oncallPrice = plan ? onCallPrice(plan as PlanId, interval) : onCallPrice('self_managed', interval);
  const pmPrice = pmSeatPrice(interval);
  const setupFee = plan ? SETUP[plan as PlanId] : SETUP.self_managed;

  const update = (patch: Partial<PlanPickerValue>) => {
    setPlanPicker({ ...pp, ...patch });
  };

  const toggleInterval = (iv: BillingInterval) => update({ interval: iv });
  const selectPlan = (p: PlanId) => update({ plan: p });
  const toggleOnCall = () => update({ onCall: !pp.onCall });
  const togglePm = () => {
    if (state.iAmRole === 'property_manager') return;
    update({ pmSeat: !pp.pmSeat });
  };
  const toggleSetup = () => update({ setup: !pp.setup });

  const planCardStyle = (selected: boolean): React.CSSProperties => ({
    border: `1.5px solid ${selected ? '#0D1B2E' : '#c9d2dc'}`,
    borderRadius: 16,
    padding: 22,
    background: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    textAlign: 'left',
    fontFamily: 'inherit',
    color: '#0D1B2E',
    boxShadow: selected ? '0 0 0 3px rgba(13,27,46,.12)' : 'none',
    width: '100%',
    boxSizing: 'border-box',
  });

  const optStyle = (on: boolean): React.CSSProperties => ({
    display: 'flex',
    gap: 14,
    alignItems: 'flex-start',
    padding: 16,
    border: `1.5px solid ${on ? '#155E75' : '#e3e8ee'}`,
    borderRadius: 12,
    background: on ? '#f4fbf9' : '#ffffff',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
    color: '#0D1B2E',
    width: '100%',
    boxSizing: 'border-box',
  });

  const boxStyle = (on: boolean): React.CSSProperties => ({
    width: 22,
    height: 22,
    borderRadius: 6,
    border: '2px solid #155E75',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 'none',
    background: on ? '#155E75' : '#ffffff',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Title */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em', margin: 0 }}>
          Pick your plan
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: '#4b5a6b', margin: 0 }}>
          Everything is included in both. Choose one to continue; nothing is billed until your trial ends.
        </p>
      </div>

      {/* Billing toggle */}
      <div
        style={{
          display: 'inline-flex',
          border: '1px solid #c9d2dc',
          borderRadius: 999,
          padding: 4,
          background: '#f4f6f9',
          alignSelf: 'flex-start',
        }}
        role="group"
        aria-label="Billing interval"
      >
        <button
          type="button"
          onClick={() => toggleInterval('monthly')}
          style={{
            minHeight: 40, padding: '0 16px', borderRadius: 999, border: 0,
            background: !ann ? '#0D1B2E' : 'transparent',
            color: !ann ? '#ffffff' : '#4b5a6b',
            fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => toggleInterval('annual')}
          style={{
            minHeight: 40, padding: '0 16px', borderRadius: 999, border: 0,
            background: ann ? '#0D1B2E' : 'transparent',
            color: ann ? '#ffffff' : '#4b5a6b',
            fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Annual, two months free
        </button>
      </div>

      {/* Plan cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }} className="signup-plan-cols">
        {/* Self-Managed */}
        <button type="button" style={planCardStyle(plan === 'self_managed')} onClick={() => selectPlan('self_managed')} aria-pressed={plan === 'self_managed'}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 600 }}>Self-Managed</span>
            <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 700 }}>
              {money(smPrice)}
              <span style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, color: '#4b5a6b' }}>{per}</span>
            </span>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.45, color: '#4b5a6b', margin: 0 }}>
            The board runs the building. ONE two keeps it compliant. Books, runbook, meetings, playbooks, documents, 1099s.
          </p>
        </button>

        {/* Plus Facilities */}
        <button type="button" style={planCardStyle(plan === 'facilities')} onClick={() => selectPlan('facilities')} aria-pressed={plan === 'facilities'}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 600 }}>Plus Facilities</span>
            <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 700 }}>
              {money(faPrice)}
              <span style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, color: '#4b5a6b' }}>{per}</span>
            </span>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.45, color: '#4b5a6b', margin: 0 }}>
            Everything in Self-Managed, plus the inspection calendar, reserve study tools, bids, claims, amenities and a staff role.
          </p>
          {recommendFa && (
            <span style={{
              alignSelf: 'flex-start', padding: '4px 10px', borderRadius: 999,
              background: '#fff0f1', color: '#D62839', fontSize: 12, fontWeight: 700,
            }}>
              Recommended for your building
            </span>
          )}
        </button>
      </div>

      {/* Add-ons */}
      {plan && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#2b3a4b' }}>
            Add-ons for {PLANS[plan as PlanId].name}, free during your trial
          </span>

          {/* On Call */}
          <button type="button" style={optStyle(pp.onCall)} onClick={toggleOnCall}>
            <span style={boxStyle(pp.onCall)}>{CHECK_SVG}</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontWeight: 600 }}>
                On Call, {money(oncallPrice)}{per} after the trial
              </span>
              <span style={{ fontSize: 14, color: '#4b5a6b' }}>
                A named advisor who knows your building. Monthly call, replies within a business day, your budget reviewed before adoption.
              </span>
            </span>
          </button>

          {/* PM Seat */}
          <button
            type="button"
            style={{
              ...optStyle(pp.pmSeat),
              opacity: state.iAmRole === 'property_manager' ? 0.7 : 1,
              cursor: state.iAmRole === 'property_manager' ? 'default' : 'pointer',
            }}
            onClick={togglePm}
          >
            <span style={boxStyle(pp.pmSeat)}>{CHECK_SVG}</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontWeight: 600 }}>
                Property manager seat, {money(pmPrice)}{per} after the trial
              </span>
              <span style={{ fontSize: 14, color: '#4b5a6b' }}>
                Keeping a manager for operations? Give them a seat inside your records.
              </span>
            </span>
          </button>

          {/* Setup */}
          <button type="button" style={optStyle(pp.setup)} onClick={toggleSetup}>
            <span style={boxStyle(pp.setup)}>{CHECK_SVG}</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontWeight: 600 }}>
                Setup with us, {money(setupFee)} one-time, billed today
              </span>
              <span style={{ fontSize: 14, color: '#4b5a6b' }}>
                Guided onboarding and your first month closed with us, on a call. The one thing that is charged now, not after the trial.
              </span>
            </span>
          </button>
        </div>
      )}

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
          onClick={onNext}
          disabled={!canAdvance}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            minHeight: 48, padding: '0 22px', borderRadius: 10, fontWeight: 600, fontSize: 16,
            border: 0, cursor: canAdvance ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
            background: canAdvance ? '#D62839' : '#e3e8ee',
            color: canAdvance ? '#ffffff' : '#8fa0b3',
          }}
        >
          {canAdvance ? 'Continue' : 'Choose a plan to continue'}
        </button>
      </div>

      <style>{`
        @media (max-width: 760px) {
          .signup-plan-cols { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
