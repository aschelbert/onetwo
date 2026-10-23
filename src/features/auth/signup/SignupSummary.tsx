// Dark sidebar summary rail — matches signup-reference.html right column.
// Shows building info, plan, add-ons, due today/after trial, "What happens next" card.

import type { SignupState } from './useSignupState';
import type { PlanId } from '@/lib/tiers';
import { PLANS, planPrice, onCallPrice, pmSeatPrice } from '@/lib/tiers';
import { trialEndDate } from '@/lib/signup';

interface Props {
  state: SignupState;
  trialDays: number;
}

function money(n: number) {
  return '$' + n.toLocaleString('en-US');
}

export default function SignupSummary({ state, trialDays }: Props) {
  const plan = state.planPicker.plan as PlanId | null;
  const interval = state.planPicker.interval;
  const ann = interval === 'annual';
  const per = ann ? '/yr' : '/mo';
  const perLong = ann ? ' a year' : ' a month';

  const pricePlan = plan ? planPrice(plan, interval) : 0;
  const priceOnCall = plan ? onCallPrice(plan, interval) : 0;
  const pricePm = pmSeatPrice(interval);

  const recurring = pricePlan
    + (state.planPicker.onCall ? priceOnCall : 0)
    + (state.planPicker.pmSeat ? pricePm : 0);

  const buildingName = state.buildingName.trim();
  const units = state.totalUnits;

  return (
    <>
      {/* Dark card */}
      <div style={{
        background: '#0D1B2E', color: '#ffffff', borderRadius: 16, padding: 22,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <span style={{
          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: '#A5F3FC',
        }}>
          Your {trialDays} day trial
        </span>

        {/* Line items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
          {buildingName && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{buildingName}</span>
              <span>{units ? `${units} units` : ''}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: plan ? '#ffffff' : '#8fa0b3' }}>
              {plan ? PLANS[plan].name : 'Plan'}
            </span>
            <span style={{ color: plan ? '#ffffff' : '#8fa0b3' }}>
              {plan ? `${money(pricePlan)}${per}` : 'not chosen yet'}
            </span>
          </div>
          {state.planPicker.onCall && plan && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>On Call</span>
              <span>{money(priceOnCall)}{per}</span>
            </div>
          )}
          {state.planPicker.pmSeat && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>PM seat</span>
              <span>{money(pricePm)}{per}</span>
            </div>
          )}
        </div>

        {/* Due today */}
        <div style={{
          borderTop: '1px solid #243b53', paddingTop: 12,
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <span style={{ fontWeight: 600 }}>Due today</span>
          <span style={{
            fontFamily: "'Fraunces', Georgia, serif", fontSize: 28, fontWeight: 700, color: '#A5F3FC',
          }}>
            {money(0)}
          </span>
        </div>

        {/* After trial */}
        <p style={{ fontSize: 13, lineHeight: 1.5, color: '#c7d2de', margin: 0 }}>
          After {trialDays} days:{' '}
          {plan ? `${money(recurring)}${perLong}, before tax` : 'the plan you choose'}.
        </p>
      </div>

      {/* What happens next card */}
      <div style={{
        background: '#ffffff', borderRadius: 16, padding: 18,
        display: 'flex', flexDirection: 'column', gap: 8,
        border: '1px solid #e3e8ee',
      }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>What happens next</span>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: '#4b5a6b', margin: 0 }}>
          You land in your own building in Setup Season. Add your units and bylaws facts,
          or load a sample building to look around first. Invite the board, the owners or
          your manager whenever you like.
        </p>
      </div>
    </>
  );
}
