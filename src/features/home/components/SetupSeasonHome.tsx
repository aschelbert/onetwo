// Day-one experience shown when tenant.status === 'onboarding'.
// Displays: sample data card, 4 setup milestones, invite card, plan card.

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenantContext } from '@/components/TenantProvider';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { canSetup } from '@/lib/ownership';
import { CheckCircle2, Circle, ChevronRight, Users, Sparkles, Trash2 } from 'lucide-react';
import type { MeInfo } from '@/components/TenantProvider';

interface SetupMilestone {
  id: string;
  title: string;
  description: string;
  navigateTo: string;
  complete: boolean;
}

interface Props {
  firstName: string;
  onLoadSample: () => void;
  onRemoveSample: () => void;
  sampleLoaded: boolean;
  loadingSample: boolean;
}

export default function SetupSeasonHome({ firstName, onLoadSample, onRemoveSample, sampleLoaded, loadingSample }: Props) {
  const tenant = useTenantContext();
  const building = useBuildingStore();
  const fin = useFinancialStore();
  const navigate = useNavigate();

  const me: MeInfo = tenant.me;
  const isSetupUser = canSetup(me);

  // 4 setup milestones with data predicates
  const milestones: SetupMilestone[] = useMemo(() => [
    {
      id: 'units_owners',
      title: 'Units and owners',
      description: 'Add your units with owner names and contact info.',
      navigateTo: '/building?tab=units',
      complete: tenant.totalUnits > 0,
    },
    {
      id: 'bylaws_board',
      title: 'Bylaws facts and board roles',
      description: 'Upload bylaws and assign board seats.',
      navigateTo: '/boardroom?tab=roles',
      complete: building.legalDocuments.some(d => d.name.toLowerCase().includes('bylaw')) && building.board.length >= 2,
    },
    {
      id: 'bank_balances',
      title: 'Bank accounts and opening balances',
      description: 'Connect or add your bank accounts with opening balances.',
      navigateTo: '/financial?tab=coa',
      complete: fin.chartOfAccounts.filter(a => a.type === 'asset' && a.name.toLowerCase().includes('bank')).length > 0,
    },
    {
      id: 'insurance_docs_vendors',
      title: 'Insurance, documents, vendors',
      description: 'Add insurance policies, key documents, and vendor contacts.',
      navigateTo: '/building?tab=insurance',
      complete: building.insurance.length > 0 && building.vendors.length > 0,
    },
  ], [tenant.totalUnits, building.legalDocuments, building.board, fin.chartOfAccounts, building.insurance, building.vendors]);

  const completedCount = milestones.filter(m => m.complete).length;

  return (
    <div className="space-y-6">
      {/* Welcome greeting */}
      <div className="bg-navy rounded-2xl p-6 md:p-8">
        <p className="text-xs font-semibold text-white/50 tracking-widest mb-2">
          SETUP SEASON
        </p>
        <h1 className="font-display text-xl md:text-2xl text-white leading-snug">
          Welcome, {firstName}. Let's set up {tenant.name}.
        </h1>
        <p className="text-sm text-white/60 mt-2">
          Complete these four milestones to get your building ready. You can do them in any order.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Sample data card */}
          {isSetupUser && (
            <div className="bg-white rounded-xl border border-ink-100 p-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-cyan/10 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-brand-cyan" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-ink-900">Sample building data</h3>
                  <p className="text-xs text-ink-500 mt-0.5">
                    {sampleLoaded
                      ? 'Sample data is loaded. Remove it when you\'re ready to enter your own.'
                      : 'Load sample units, board members, financials, and more to see how everything works.'}
                  </p>
                </div>
                {sampleLoaded ? (
                  <button
                    onClick={onRemoveSample}
                    disabled={loadingSample}
                    className="shrink-0 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                ) : (
                  <button
                    onClick={onLoadSample}
                    disabled={loadingSample}
                    className="shrink-0 px-3 py-1.5 text-xs font-medium text-accent-600 border border-accent-200 rounded-lg hover:bg-accent-50 disabled:opacity-50"
                  >
                    {loadingSample ? 'Loading...' : 'Load sample data'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Setup milestones */}
          <div className="bg-white rounded-xl border border-ink-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-ink-900">Setup milestones</h2>
              <span className="text-xs text-ink-400">{completedCount} of {milestones.length} complete</span>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 bg-ink-100 rounded-full mb-5 overflow-hidden">
              <div
                className="h-full bg-brand-cyan rounded-full transition-all duration-500"
                style={{ width: `${(completedCount / milestones.length) * 100}%` }}
              />
            </div>
            <div className="space-y-3">
              {milestones.map((ms) => (
                <button
                  key={ms.id}
                  onClick={() => navigate(ms.navigateTo)}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-ink-100 hover:border-ink-200 hover:bg-mist-50/50 transition-colors group"
                >
                  {ms.complete ? (
                    <CheckCircle2 className="w-5 h-5 text-brand-cyan shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-ink-300 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${ms.complete ? 'text-ink-400 line-through' : 'text-ink-900'}`}>
                      {ms.title}
                    </p>
                    <p className="text-xs text-ink-400 mt-0.5">{ms.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-ink-300 group-hover:text-ink-500 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Aside column */}
        <div className="space-y-4">
          {/* Invite card */}
          <div className="bg-white rounded-xl border border-ink-100 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-ink-400" />
              <h3 className="text-sm font-semibold text-ink-900">Invite your board</h3>
            </div>
            <p className="text-xs text-ink-500 mb-4">
              Invite other board members so they can help with setup and see the building dashboard.
            </p>
            <button
              onClick={() => navigate('/building?tab=contacts&invite=1')}
              className="w-full py-2 text-sm font-semibold text-accent-600 border border-accent-200 rounded-lg hover:bg-accent-50 transition-colors"
            >
              Send invites
            </button>
          </div>

          {/* Plan card */}
          <div className="bg-white rounded-xl border border-ink-100 p-5">
            <h3 className="text-sm font-semibold text-ink-900 mb-2">Your plan</h3>
            <p className="text-xs text-ink-500 mb-1">
              <span className="font-medium text-ink-700 capitalize">{tenant.tier.replace('_', ' ')}</span>
              {' · '}
              {tenant.billing.interval === 'annual' ? 'Annual' : 'Monthly'} billing
            </p>
            {tenant.billing.status === 'in_trial' && (
              <p className="text-xs text-brand-cyan font-medium">Free trial active</p>
            )}
            <button
              onClick={() => navigate('/subscription')}
              className="mt-3 text-xs font-medium text-accent-600 hover:underline"
            >
              Manage subscription
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
