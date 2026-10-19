// Dark sidebar summary rail — shows building info, plan, and pricing alongside the wizard

import type { SignupState } from './useSignupState';
import { PLANS, planPrice, onCallPrice, pmSeatPrice, SETUP } from '@/lib/tiers';
import { trialEndDate } from '@/lib/signup';

interface Props {
  state: SignupState;
  trialDays: number;
}

export default function SignupSummary({ state, trialDays }: Props) {
  const plan = state.planPicker.plan;
  const endDate = trialEndDate(trialDays);
  const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="bg-ink-900 text-white rounded-2xl p-6 space-y-5">
      {/* Building */}
      <div>
        <p className="text-xs text-ink-400 uppercase tracking-wider mb-1">Building</p>
        <p className="font-semibold text-lg leading-tight">
          {state.buildingName || 'Your building'}
        </p>
        {state.addressResult?.fullAddress && (
          <p className="text-xs text-ink-300 mt-0.5">{state.addressResult.fullAddress}</p>
        )}
        {state.totalUnits !== '' && (
          <p className="text-xs text-ink-400 mt-0.5">{state.totalUnits} units</p>
        )}
      </div>

      {/* Plan */}
      {plan && (
        <div>
          <p className="text-xs text-ink-400 uppercase tracking-wider mb-1">Plan</p>
          <p className="font-semibold">{PLANS[plan].name}</p>
          <p className="text-sm text-ink-300">
            ${planPrice(plan, state.planPicker.interval)}
            <span className="text-xs text-ink-400">{state.planPicker.interval === 'annual' ? '/yr' : '/mo'}</span>
          </p>

          {/* Add-ons */}
          {(state.planPicker.onCall || state.planPicker.pmSeat || state.planPicker.setup) && (
            <div className="mt-2 space-y-1">
              {state.planPicker.onCall && (
                <div className="flex justify-between text-xs text-ink-300">
                  <span>On Call</span>
                  <span>${onCallPrice(plan, state.planPicker.interval)}{state.planPicker.interval === 'annual' ? '/yr' : '/mo'}</span>
                </div>
              )}
              {state.planPicker.pmSeat && (
                <div className="flex justify-between text-xs text-ink-300">
                  <span>PM Seat</span>
                  <span>${pmSeatPrice(state.planPicker.interval)}{state.planPicker.interval === 'annual' ? '/yr' : '/mo'}</span>
                </div>
              )}
              {state.planPicker.setup && (
                <div className="flex justify-between text-xs text-ink-300">
                  <span>Setup</span>
                  <span>${SETUP[plan]} today</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Trial */}
      <div className="border-t border-ink-700 pt-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-sage-400" />
          <span className="text-sm font-medium">{trialDays}-day free trial</span>
        </div>
        <p className="text-xs text-ink-400 mt-1">
          Trial ends {endStr}. {!state.planPicker.setup ? 'No card required.' : ''}
        </p>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 pt-2">
        {(['building', 'plan', 'account'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              state.step === s
                ? 'bg-white text-ink-900'
                : (['building', 'plan', 'account'].indexOf(state.step) > i
                  ? 'bg-sage-500 text-white'
                  : 'bg-ink-700 text-ink-400')
            }`}>
              {['building', 'plan', 'account'].indexOf(state.step) > i ? '✓' : i + 1}
            </div>
            {i < 2 && <div className="w-6 h-px bg-ink-700" />}
          </div>
        ))}
      </div>
    </div>
  );
}
