// Step 2: Plan selection using the existing PlanPicker component

import PlanPicker from '@/features/subscription/PlanPicker';
import type { PlanPickerValue } from '@/features/subscription/PlanPicker';
import type { SignupState } from './useSignupState';
import { afterTrialText, dueToday } from '@/lib/signup';
import { DEFAULT_TRIAL_DAYS } from '@/lib/tiers';

interface Props {
  state: SignupState;
  setPlanPicker: (v: PlanPickerValue) => void;
  trialDays: number;
  canAdvance: boolean;
  onNext: () => void;
  onBack: () => void;
}

export default function SignupPlanStep({ state, setPlanPicker, trialDays, canAdvance, onNext, onBack }: Props) {
  const plan = state.planPicker.plan;
  const todayCost = plan ? dueToday(plan, state.planPicker.interval, state.planPicker.setup) : 0;

  return (
    <div className="space-y-4">
      <PlanPicker
        value={state.planPicker}
        onChange={setPlanPicker}
        showPmSeat={false}
      />

      {/* Trial messaging */}
      {plan && (
        <div className="bg-sage-50 border border-sage-200 rounded-xl p-4 text-center">
          <p className="text-sm font-semibold text-sage-800">
            {trialDays}-day free trial included
          </p>
          <p className="text-xs text-sage-600 mt-1">
            {afterTrialText(plan, state.planPicker.interval, state.planPicker.onCall, state.planPicker.pmSeat, trialDays)}
          </p>
          {todayCost > 0 && (
            <p className="text-xs text-ink-500 mt-1">
              Setup fee of ${todayCost} billed today (requires a card)
            </p>
          )}
          {todayCost === 0 && (
            <p className="text-xs text-ink-400 mt-1">
              No card required to start
            </p>
          )}
        </div>
      )}

      <button
        onClick={onNext}
        disabled={!canAdvance}
        className="w-full py-3.5 bg-ink-900 text-white rounded-xl font-semibold text-sm hover:bg-ink-800 disabled:opacity-50"
      >
        Continue
      </button>

      <div className="text-center">
        <button onClick={onBack} className="text-sm text-ink-400 hover:text-ink-600">&larr; Back</button>
      </div>
    </div>
  );
}
