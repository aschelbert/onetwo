import { useState } from 'react';
import { PLANS, CORE_INCLUDES, FACILITIES_ADDS, ON_CALL, PM_SEAT, SETUP, periodTotal, planPrice, pmSeatPrice, onCallPrice, PM_SEAT_LABEL, SETUP_LABEL } from '@/lib/tiers';
import type { PlanId, BillingInterval } from '@/lib/tiers';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

export interface PlanPickerValue {
  plan: PlanId | null;
  interval: BillingInterval;
  onCall: boolean;
  pmSeat: boolean;
  setup: boolean;
}

interface PlanPickerProps {
  value: PlanPickerValue;
  onChange: (v: PlanPickerValue) => void;
  showPmSeat?: boolean;
  requirePlan?: boolean;
}

export default function PlanPicker({ value, onChange, showPmSeat = true, requirePlan = false }: PlanPickerProps) {
  const [expanded, setExpanded] = useState(false);

  const set = (patch: Partial<PlanPickerValue>) => onChange({ ...value, ...patch });

  const total = value.plan !== null
    ? periodTotal({ plan: value.plan, onCall: value.onCall, pmSeat: value.pmSeat, interval: value.interval })
    : null;
  const setupCost = value.plan !== null && value.setup ? SETUP[value.plan] : 0;

  return (
    <div className="space-y-4">
      {/* Monthly / Annual toggle */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-lg border border-ink-200 p-0.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => set({ interval: 'monthly' })}
            className={`px-4 py-1.5 rounded-md transition-colors ${value.interval === 'monthly' ? 'bg-ink-900 text-white' : 'text-ink-500 hover:text-ink-700'}`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => set({ interval: 'annual' })}
            className={`px-4 py-1.5 rounded-md transition-colors ${value.interval === 'annual' ? 'bg-ink-900 text-white' : 'text-ink-500 hover:text-ink-700'}`}
          >
            Annual
          </button>
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-2 gap-3">
        {(['self_managed', 'facilities'] as PlanId[]).map(planId => {
          const plan = PLANS[planId];
          const isSelected = value.plan === planId;
          return (
            <button
              key={planId}
              type="button"
              onClick={() => set({ plan: planId })}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                isSelected ? 'border-accent-500 bg-accent-50' : 'border-ink-200 hover:border-ink-300'
              }`}
            >
              <p className="font-bold text-ink-900 text-sm">{plan.name}{planId === 'facilities' && (
                <span className="ml-1.5 text-[10px] bg-accent-100 text-accent-700 px-1.5 py-0.5 rounded-full font-semibold align-middle">Recommended</span>
              )}</p>
              <p className="text-lg font-bold text-accent-600 mt-1">
                ${planPrice(planId, value.interval)}<span className="text-xs font-normal text-ink-400">{value.interval === 'annual' ? '/yr' : '/mo'}</span>
              </p>
              <p className="text-xs text-ink-400 mt-1">{plan.tagline}</p>
            </button>
          );
        })}
      </div>

      {/* Feature list (collapsible) */}
      <div className="bg-ink-50 rounded-xl p-4">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full text-xs font-semibold text-ink-600"
        >
          <span>What&apos;s included</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {expanded && (
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-xs font-semibold text-ink-700 mb-1">Core (all plans)</p>
              <ul className="space-y-0.5">
                {CORE_INCLUDES.map((item, i) => (
                  <li key={i} className="text-xs text-ink-500 flex items-start gap-1.5">
                    <Check className="w-3 h-3 text-sage-500 mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {value.plan === 'facilities' && (
              <div>
                <p className="text-xs font-semibold text-ink-700 mb-1">Facilities adds</p>
                <ul className="space-y-0.5">
                  {FACILITIES_ADDS.map((item, i) => (
                    <li key={i} className="text-xs text-ink-500 flex items-start gap-1.5">
                      <Check className="w-3 h-3 text-accent-500 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add-ons */}
      {value.plan !== null && (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-ink-700">Add-ons</p>

        {/* On Call */}
        <label className="flex items-center justify-between p-3 rounded-xl border border-ink-200 cursor-pointer hover:border-ink-300 transition-colors">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={value.onCall}
              onChange={e => set({ onCall: e.target.checked })}
              className="rounded border-ink-300 text-accent-600 focus:ring-accent-500"
            />
            <div>
              <p className="text-sm font-medium text-ink-900">On Call</p>
              <p className="text-xs text-ink-400">{ON_CALL[value.plan!].hours} hours/mo with a dedicated advisor</p>
            </div>
          </div>
          <span className="text-sm font-semibold text-ink-700">
            ${onCallPrice(value.plan!, value.interval)}{value.interval === 'annual' ? '/yr' : '/mo'}
          </span>
        </label>

        {/* PM Seat */}
        {showPmSeat && (
          <label className="flex items-center justify-between p-3 rounded-xl border border-ink-200 cursor-pointer hover:border-ink-300 transition-colors">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={value.pmSeat}
                onChange={e => set({ pmSeat: e.target.checked })}
                className="rounded border-ink-300 text-accent-600 focus:ring-accent-500"
              />
              <div>
                <p className="text-sm font-medium text-ink-900">{PM_SEAT_LABEL}</p>
                <p className="text-xs text-ink-400">Property manager role access</p>
              </div>
            </div>
            <span className="text-sm font-semibold text-ink-700">
              ${pmSeatPrice(value.interval)}{value.interval === 'annual' ? '/yr' : '/mo'}
            </span>
          </label>
        )}

        {/* Setup */}
        <label className="flex items-center justify-between p-3 rounded-xl border border-ink-200 cursor-pointer hover:border-ink-300 transition-colors">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={value.setup}
              onChange={e => set({ setup: e.target.checked })}
              className="rounded border-ink-300 text-accent-600 focus:ring-accent-500"
            />
            <div>
              <p className="text-sm font-medium text-ink-900">{SETUP_LABEL}</p>
              <p className="text-xs text-ink-400">One-time onboarding with our team</p>
            </div>
          </div>
          <span className="text-sm font-semibold text-ink-700">
            ${SETUP[value.plan!]} <span className="text-xs font-normal text-ink-400">billed today</span>
          </span>
        </label>
      </div>
      )}

      {/* Running total */}
      <div className="bg-white rounded-xl border border-ink-200 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ink-700">{value.interval === 'annual' ? 'Annual total' : 'Monthly total'}</span>
          <span className="text-xl font-bold text-ink-900">{total !== null ? <>${total}<span className="text-sm font-normal text-ink-400">{value.interval === 'annual' ? '/yr' : '/mo'}</span></> : '—'}</span>
        </div>
        {setupCost > 0 && (
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-ink-400">+ billed today</span>
            <span className="text-sm font-semibold text-ink-600">${setupCost}</span>
          </div>
        )}
      </div>
    </div>
  );
}
