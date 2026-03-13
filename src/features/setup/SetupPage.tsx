import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenantContext } from '@/components/TenantProvider';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { SETUP_STEPS, type CompletionContext, type StepConfig } from './setup-steps';

type StepStatus = 'complete' | 'active' | 'pending';

interface StepState {
  config: StepConfig;
  status: StepStatus;
  completedCount: number;
  totalCount: number;
}

export default function SetupPage() {
  const tenant = useTenantContext();
  const building = useBuildingStore();
  const financial = useFinancialStore();
  const navigate = useNavigate();

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
    coaCount: 0,
    budgetCount: 0,
    reserveCount: financial.reserveItems?.length ?? 0,
    userCount: 0,
    hasRoledUsers: false,
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

  // Active step
  const firstActive = steps.find(s => s.status === 'active');
  const [activeStep, setActiveStep] = useState(firstActive?.config.stepNumber ?? 1);
  const [goingLive, setGoingLive] = useState(false);

  const handleGoLive = useCallback(async () => {
    setGoingLive(true);
    await tenant.updateOnboardingStep('goLive', true);
    navigate('/dashboard');
  }, [tenant, navigate]);

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-t-xl p-6 text-white shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Setup Hub</h1>
            <p className="text-accent-200 text-sm mt-1">{tenant.name} · {pct}% complete</p>
          </div>
          <div className="text-center bg-white bg-opacity-10 rounded-lg px-5 py-2">
            <p className="text-[10px] text-accent-200">Progress</p>
            <p className="text-lg font-bold">{completedSubTasks}/{totalSubTasks}</p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-4 w-full h-2 bg-white bg-opacity-20 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#10b981' : '#fff' }}
          />
        </div>
      </div>

      {/* Two-column layout */}
      <div className="bg-white border-x border-b border-ink-100 rounded-b-xl">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]">
          {/* Sidebar - Step Rail */}
          <div className="border-r border-ink-100 p-4">
            <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide mb-3 px-2">Steps</p>
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[17px] top-[20px] bottom-[20px] w-0.5 bg-ink-100" />

              <div className="space-y-0.5">
                {steps.map(step => (
                  <button
                    key={step.config.stepNumber}
                    onClick={() => setActiveStep(step.config.stepNumber)}
                    className={`relative flex items-center gap-3 w-full text-left py-2.5 px-2 rounded-lg transition-colors ${
                      step.config.stepNumber === activeStep
                        ? 'bg-accent-50 border-l-2 border-accent-600 pl-1.5'
                        : 'hover:bg-mist-50'
                    }`}
                  >
                    {/* Status dot */}
                    <div className="relative z-10 shrink-0">
                      {step.status === 'complete' ? (
                        <div className="w-[34px] h-[34px] rounded-full bg-sage-500 flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : step.status === 'active' ? (
                        <div className="w-[34px] h-[34px] rounded-full border-[2.5px] border-accent-600 flex items-center justify-center bg-white">
                          <div className="w-3 h-3 rounded-full bg-accent-600" />
                        </div>
                      ) : (
                        <div className="w-[34px] h-[34px] rounded-full border-[1.5px] border-ink-200 bg-white" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className={`text-[12px] font-semibold truncate ${
                        step.status === 'complete'
                          ? 'text-sage-700'
                          : step.config.stepNumber === activeStep
                            ? 'text-accent-700'
                            : 'text-ink-600'
                      }`}>
                        {step.config.title}
                      </p>
                      <p className="text-[10px] text-ink-400">
                        {step.completedCount}/{step.totalCount} tasks
                      </p>
                    </div>

                    {step.config.required && step.status !== 'complete' && (
                      <span className="text-[9px] font-bold text-accent-600 uppercase shrink-0">Req</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main content - Active step */}
          <div className="p-6">
            {steps.map(step => {
              if (step.config.stepNumber !== activeStep) return null;
              const isReview = step.config.stepNumber === 6;

              return (
                <div key={step.config.stepNumber}>
                  {/* Step header */}
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-lg font-bold text-ink-900">{step.config.title}</h2>
                    {step.config.required && step.status !== 'complete' && (
                      <span className="text-[10px] font-bold text-accent-600 bg-accent-50 px-2 py-0.5 rounded">Required</span>
                    )}
                    {step.status === 'complete' && (
                      <span className="text-[10px] font-bold text-sage-700 bg-sage-50 px-2 py-0.5 rounded">Complete</span>
                    )}
                  </div>
                  <p className="text-sm text-ink-500 mb-5">{step.config.description}</p>

                  {isReview ? (
                    /* Review & Go Live */
                    <div className="space-y-4">
                      {/* Progress summary */}
                      <div className="bg-mist-50 rounded-xl p-5 space-y-3">
                        <h3 className="text-sm font-bold text-ink-700 mb-3">Setup Progress</h3>
                        {steps.filter(s => s.config.stepNumber !== 6).map(s => (
                          <div key={s.config.stepNumber} className="flex items-center gap-3">
                            {s.status === 'complete' ? (
                              <div className="w-5 h-5 rounded-full bg-sage-500 flex items-center justify-center shrink-0">
                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full border-[1.5px] border-ink-200 shrink-0" />
                            )}
                            <span className={`text-sm flex-1 ${s.status === 'complete' ? 'text-sage-700' : 'text-ink-600'}`}>
                              {s.config.title}
                            </span>
                            {s.config.required && s.status !== 'complete' && (
                              <span className="text-[10px] font-bold text-accent-600">Required</span>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Go Live button */}
                      {allRequiredComplete ? (
                        <div className="bg-sage-50 border border-sage-200 rounded-xl p-6 text-center">
                          <div className="w-12 h-12 rounded-full bg-sage-100 flex items-center justify-center mx-auto mb-3">
                            <span className="text-2xl">🚀</span>
                          </div>
                          <h3 className="text-base font-bold text-ink-900 mb-1">Ready to Go Live</h3>
                          <p className="text-sm text-ink-500 mb-4">All required steps are complete. Launch your building portal.</p>
                          <button
                            onClick={handleGoLive}
                            disabled={goingLive}
                            className="px-8 py-3 bg-accent-600 text-white rounded-xl text-sm font-bold hover:bg-accent-700 transition-all disabled:opacity-50"
                          >
                            {goingLive ? 'Launching...' : 'Go Live'}
                          </button>
                        </div>
                      ) : (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
                          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
                            <span className="text-2xl">⚠</span>
                          </div>
                          <h3 className="text-base font-bold text-ink-900 mb-1">Not Ready Yet</h3>
                          <p className="text-sm text-ink-500">Complete all required steps before going live.</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Regular step — sub-task rows */
                    <div className="space-y-1">
                      {step.config.subTasks.map(st => {
                        const done = st.checkComplete(completionCtx);
                        return (
                          <div
                            key={st.id}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${
                              done ? 'bg-sage-50' : st.navigateTo ? 'hover:bg-mist-50 cursor-pointer' : ''
                            }`}
                            onClick={() => {
                              if (!done && st.navigateTo) navigate(st.navigateTo);
                            }}
                          >
                            {done ? (
                              <div className="w-6 h-6 rounded-full bg-sage-500 flex items-center justify-center shrink-0">
                                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            ) : (
                              <div className="w-6 h-6 rounded-full border-2 border-ink-200 shrink-0" />
                            )}

                            <span className={`text-sm flex-1 ${done ? 'text-ink-400 line-through' : 'text-ink-700 font-medium'}`}>
                              {st.label}
                            </span>

                            {!done && st.navigateTo && (
                              <span className="text-xs text-accent-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                Start →
                              </span>
                            )}
                            {done && st.navigateTo && (
                              <span className="text-xs text-ink-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); navigate(st.navigateTo!); }}>
                                View →
                              </span>
                            )}
                          </div>
                        );
                      })}

                      {/* Continue button */}
                      {step.status !== 'complete' && (
                        <div className="mt-4 flex justify-end">
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
                            className="px-6 py-2.5 bg-accent-600 text-white rounded-xl text-sm font-semibold hover:bg-accent-700 transition-all"
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
    </div>
  );
}
