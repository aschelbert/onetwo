import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenantContext, type OnboardingState } from './TenantProvider';

const DISMISS_KEY = 'onetwo_onboarding_dismissed';

interface Step {
  key: keyof OnboardingState;
  label: string;
  path: string | null;
}

const STEPS: Step[] = [
  { key: 'buildingProfileComplete', label: 'Set up building profile', path: '/building' },
  { key: 'bylawsUploaded', label: 'Upload bylaws & documents', path: '/building' },
  { key: 'unitsConfigured', label: 'Configure units & fees', path: '/financial' },
  { key: 'financialSetupDone', label: 'Set up financials', path: '/financial' },
  { key: 'firstUserInvited', label: 'Invite board members', path: '/building' },
  { key: 'goLive', label: 'Review & go live', path: null },
];

export default function OnboardingSetupWidget() {
  const tenant = useTenantContext();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === 'true');
  const [goingLive, setGoingLive] = useState(false);

  // Don't show for demo tenants, fully onboarded, or dismissed
  if (tenant.isDemo || tenant.onboarding.goLive || dismissed) return null;

  const completed = STEPS.filter(s => tenant.onboarding[s.key]).length;
  const total = STEPS.length;
  const pct = Math.round((completed / total) * 100);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  };

  const handleGoLive = async () => {
    setGoingLive(true);
    await tenant.updateOnboardingStep('goLive', true);
    setGoingLive(false);
  };

  return (
    <div className="bg-white rounded-xl border border-ink-100 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent-50 flex items-center justify-center">
            <svg className="w-5 h-5 text-accent-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-ink-900">Set up your building</h2>
            <p className="text-xs text-ink-400">{completed} of {total} steps complete</p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-xs text-ink-400 hover:text-ink-600 font-medium transition-colors"
        >
          Dismiss
        </button>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-ink-100 rounded-full overflow-hidden mb-4">
        <div
          className="h-full rounded-full bg-accent-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Checklist */}
      <div className="space-y-1">
        {STEPS.map((step, idx) => {
          const done = tenant.onboarding[step.key];
          const isGoLive = step.key === 'goLive';

          return (
            <div
              key={step.key}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                done
                  ? 'bg-sage-50'
                  : isGoLive
                    ? ''
                    : 'hover:bg-mist-50 cursor-pointer'
              }`}
              onClick={() => {
                if (!done && step.path) navigate(step.path);
              }}
            >
              {/* Step number / check */}
              {done ? (
                <div className="w-6 h-6 rounded-full bg-sage-500 flex items-center justify-center shrink-0">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full border-2 border-ink-200 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-ink-400">{idx + 1}</span>
                </div>
              )}

              {/* Label */}
              <span className={`text-sm flex-1 ${done ? 'text-ink-400 line-through' : 'text-ink-700 font-medium'}`}>
                {step.label}
              </span>

              {/* Action */}
              {!done && isGoLive ? (
                <button
                  onClick={handleGoLive}
                  disabled={goingLive}
                  className="px-4 py-1.5 bg-accent-600 text-white rounded-lg text-xs font-semibold hover:bg-accent-700 transition-all disabled:opacity-50"
                >
                  {goingLive ? 'Activating...' : 'Go Live'}
                </button>
              ) : !done && step.path ? (
                <span className="text-xs text-accent-600 font-medium">Start →</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
