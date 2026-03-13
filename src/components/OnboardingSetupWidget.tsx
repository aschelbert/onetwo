import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenantContext } from './TenantProvider';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { SETUP_STEPS, type CompletionContext, type StepConfig } from '@/features/setup/setup-steps';

const DISMISS_KEY = 'onetwo_onboarding_dismissed';

type StepStatus = 'complete' | 'active' | 'pending';

interface StepState {
  config: StepConfig;
  status: StepStatus;
  completedCount: number;
  totalCount: number;
}

export default function OnboardingSetupWidget() {
  const tenant = useTenantContext();
  const building = useBuildingStore();
  const financial = useFinancialStore();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === 'true');
  const [expanded, setExpanded] = useState(false);

  // Build completion context from stores
  const completionCtx: CompletionContext = useMemo(() => ({
    onboarding: tenant.onboarding,
    boardCount: building.board?.length ?? 0,
    hasManagement: !!building.management?.company,
    counselCount: building.legalCounsel?.length ?? 0,
    docsCount: building.legalDocuments?.length ?? 0,
    hasBylawsRules: false,
    unitCount: financial.units?.length ?? 0,
    hasVotingPct: false,
    coaCount: financial.chartOfAccounts?.length ?? 0,
    glEntryCount: financial.generalLedger?.length ?? 0,
    budgetCount: financial.budgetCategories?.length ?? 0,
    reserveCount: financial.reserveItems?.length ?? 0,
    userCount: 0,
    hasRoledUsers: false,
    hasDetails: !!(building.details?.yearBuilt && building.details?.totalUnits),
    insuranceCount: building.insurance?.length ?? 0,
    vendorCount: building.vendors?.filter(v => v.status === 'active')?.length ?? 0,
  }), [tenant.onboarding, building, financial]);

  // Compute step states
  const steps: StepState[] = useMemo(() => {
    let firstIncompleteFound = false;
    return SETUP_STEPS.map(config => {
      const completedCount = config.subTasks.filter(st => st.checkComplete(completionCtx)).length;
      const totalCount = config.subTasks.length;
      const isComplete = completedCount === totalCount;

      let status: StepStatus;
      if (isComplete) {
        status = 'complete';
      } else if (!firstIncompleteFound) {
        status = 'active';
        firstIncompleteFound = true;
      } else {
        status = 'pending';
      }

      return { config, status, completedCount, totalCount };
    });
  }, [completionCtx]);

  const totalSubTasks = steps.reduce((s, st) => s + st.totalCount, 0);
  const completedSubTasks = steps.reduce((s, st) => s + st.completedCount, 0);
  const pct = totalSubTasks > 0 ? Math.round((completedSubTasks / totalSubTasks) * 100) : 0;

  const allRequiredComplete = steps
    .filter(s => s.config.required && s.config.stepNumber !== 6)
    .every(s => s.status === 'complete');

  const firstActive = steps.find(s => s.status === 'active');
  const [activeStep, setActiveStep] = useState(firstActive?.config.stepNumber ?? 1);
  const [goingLive, setGoingLive] = useState(false);

  const handleGoLive = useCallback(async () => {
    setGoingLive(true);
    await tenant.updateOnboardingStep('goLive', true);
  }, [tenant]);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  };

  // Don't show for demo tenants, fully onboarded, or dismissed
  if (tenant.isDemo || tenant.onboarding.goLive || dismissed) return null;

  return (
    <div className="mb-5">
      {/* Collapsed pill */}
      <div
        className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-xl shadow-sm cursor-pointer overflow-hidden"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-4 px-5 py-3">
          {/* Icon */}
          <div className="w-8 h-8 rounded-lg bg-white bg-opacity-15 flex items-center justify-center shrink-0">
            <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">Set up your building</p>
            <p className="text-[11px] text-accent-200">{completedSubTasks}/{totalSubTasks} tasks complete · {firstActive ? firstActive.config.title : 'All done'}</p>
          </div>

          {/* Progress ring */}
          <div className="shrink-0 relative w-10 h-10">
            <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="white" strokeOpacity="0.2" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${pct * 0.974} 100`} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">{pct}%</span>
          </div>

          {/* Expand/collapse chevron */}
          <svg className={`w-4 h-4 text-accent-200 transition-transform duration-200 shrink-0 ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>

          {/* Dismiss */}
          <button
            onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
            className="text-accent-200 hover:text-white transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-5 pb-3">
          <div className="w-full h-1 bg-white bg-opacity-20 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#10b981' : '#fff' }}
            />
          </div>
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="bg-white border-x border-b border-ink-100 rounded-b-xl -mt-2 pt-2">
          <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr]">
            {/* Sidebar - Step Rail */}
            <div className="border-r border-ink-100 p-3">
              <div className="relative">
                <div className="absolute left-[14px] top-[16px] bottom-[16px] w-0.5 bg-ink-100" />
                <div className="space-y-0.5">
                  {steps.map(step => (
                    <button
                      key={step.config.stepNumber}
                      onClick={() => setActiveStep(step.config.stepNumber)}
                      className={`relative flex items-center gap-2 w-full text-left py-1.5 px-1.5 rounded-lg transition-colors ${
                        step.config.stepNumber === activeStep
                          ? 'bg-accent-50 border-l-2 border-accent-600 pl-1'
                          : 'hover:bg-mist-50'
                      }`}
                    >
                      <div className="relative z-10 shrink-0">
                        {step.status === 'complete' ? (
                          <div className="w-[28px] h-[28px] rounded-full bg-sage-500 flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        ) : step.status === 'active' ? (
                          <div className="w-[28px] h-[28px] rounded-full border-[2px] border-accent-600 flex items-center justify-center bg-white">
                            <div className="w-2 h-2 rounded-full bg-accent-600" />
                          </div>
                        ) : (
                          <div className="w-[28px] h-[28px] rounded-full border-[1.5px] border-ink-200 bg-white" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className={`text-[11px] font-semibold truncate ${
                          step.status === 'complete'
                            ? 'text-sage-700'
                            : step.config.stepNumber === activeStep
                              ? 'text-accent-700'
                              : 'text-ink-600'
                        }`}>
                          {step.config.title}
                        </p>
                        <p className="text-[9px] text-ink-400">{step.completedCount}/{step.totalCount}</p>
                      </div>

                      {step.config.required && step.status !== 'complete' && (
                        <span className="text-[8px] font-bold text-accent-600 uppercase shrink-0">Req</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Main content - Active step */}
            <div className="p-4">
              {steps.map(step => {
                if (step.config.stepNumber !== activeStep) return null;
                const isReview = step.config.stepNumber === 6;

                return (
                  <div key={step.config.stepNumber}>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-bold text-ink-900">{step.config.title}</h3>
                      {step.config.required && step.status !== 'complete' && (
                        <span className="text-[9px] font-bold text-accent-600 bg-accent-50 px-1.5 py-0.5 rounded">Required</span>
                      )}
                      {step.status === 'complete' && (
                        <span className="text-[9px] font-bold text-sage-700 bg-sage-50 px-1.5 py-0.5 rounded">Complete</span>
                      )}
                    </div>
                    <p className="text-xs text-ink-500 mb-3">{step.config.description}</p>

                    {isReview ? (
                      <div className="space-y-3">
                        <div className="bg-mist-50 rounded-lg p-3 space-y-2">
                          {steps.filter(s => s.config.stepNumber !== 6).map(s => (
                            <div key={s.config.stepNumber} className="flex items-center gap-2">
                              {s.status === 'complete' ? (
                                <div className="w-4 h-4 rounded-full bg-sage-500 flex items-center justify-center shrink-0">
                                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              ) : (
                                <div className="w-4 h-4 rounded-full border-[1.5px] border-ink-200 shrink-0" />
                              )}
                              <span className={`text-xs flex-1 ${s.status === 'complete' ? 'text-sage-700' : 'text-ink-600'}`}>
                                {s.config.title}
                              </span>
                              {s.config.required && s.status !== 'complete' && (
                                <span className="text-[9px] font-bold text-accent-600">Required</span>
                              )}
                            </div>
                          ))}
                        </div>

                        {allRequiredComplete ? (
                          <div className="bg-sage-50 border border-sage-200 rounded-lg p-4 text-center">
                            <p className="text-sm font-bold text-ink-900 mb-1">Ready to Complete Setup</p>
                            <p className="text-xs text-ink-500 mb-3">All required steps are done.</p>
                            <button
                              onClick={handleGoLive}
                              disabled={goingLive}
                              className="px-6 py-2 bg-accent-600 text-white rounded-lg text-xs font-bold hover:bg-accent-700 transition-all disabled:opacity-50"
                            >
                              {goingLive ? 'Completing...' : 'Complete Setup'}
                            </button>
                          </div>
                        ) : (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                            <p className="text-sm font-bold text-ink-900 mb-1">Not Ready Yet</p>
                            <p className="text-xs text-ink-500">Complete all required steps first.</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {step.config.subTasks.map(st => {
                          const done = st.checkComplete(completionCtx);
                          return (
                            <div
                              key={st.id}
                              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all group ${
                                done ? 'bg-sage-50' : st.navigateTo ? 'hover:bg-mist-50 cursor-pointer' : ''
                              }`}
                              onClick={() => { if (!done && st.navigateTo) navigate(st.navigateTo); }}
                            >
                              {done ? (
                                <div className="w-5 h-5 rounded-full bg-sage-500 flex items-center justify-center shrink-0">
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              ) : (
                                <div className="w-5 h-5 rounded-full border-2 border-ink-200 shrink-0" />
                              )}
                              <span className={`text-xs flex-1 ${done ? 'text-ink-400 line-through' : 'text-ink-700 font-medium'}`}>
                                {st.label}
                              </span>
                              {!done && st.navigateTo && (
                                <span className="text-[11px] text-accent-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">Start →</span>
                              )}
                              {done && st.navigateTo && (
                                <span className="text-[11px] text-ink-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                  onClick={(e) => { e.stopPropagation(); navigate(st.navigateTo!); }}>View →</span>
                              )}
                            </div>
                          );
                        })}

                        {step.status !== 'complete' && (
                          <div className="mt-3 flex justify-end">
                            <button
                              onClick={() => {
                                const firstIncomplete = step.config.subTasks.find(st => !st.checkComplete(completionCtx) && st.navigateTo);
                                if (firstIncomplete?.navigateTo) {
                                  navigate(firstIncomplete.navigateTo);
                                } else {
                                  const next = steps.find(s => s.config.stepNumber > step.config.stepNumber);
                                  if (next) setActiveStep(next.config.stepNumber);
                                }
                              }}
                              className="px-5 py-2 bg-accent-600 text-white rounded-lg text-xs font-semibold hover:bg-accent-700 transition-all"
                            >
                              Continue
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
