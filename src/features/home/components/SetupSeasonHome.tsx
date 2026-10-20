// Day-one experience shown when tenant.status === 'onboarding'.
// Matches day-one-reference.html: choice card, milestones, invite card, plan card.

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenantContext } from '@/components/TenantProvider';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { canSetup } from '@/lib/ownership';
import { PLANS, planPrice } from '@/lib/tiers';
import type { PlanId } from '@/lib/tiers';
import type { MeInfo } from '@/components/TenantProvider';

interface SetupMilestone {
  id: string;
  title: string;
  role: string;
  time: string;
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
      role: 'President',
      time: '20 min',
      navigateTo: '/building?tab=units',
      complete: tenant.totalUnits > 0,
    },
    {
      id: 'bylaws_board',
      title: 'Bylaws facts and board roles',
      role: 'Secretary',
      time: '15 min',
      navigateTo: '/boardroom?tab=roles',
      complete: building.legalDocuments.some(d => d.name.toLowerCase().includes('bylaw')) && building.board.length >= 2,
    },
    {
      id: 'bank_balances',
      title: 'Bank accounts and opening balances',
      role: 'Treasurer',
      time: '30 min',
      navigateTo: '/financial?tab=coa',
      complete: fin.chartOfAccounts.filter(a => a.type === 'asset' && a.name.toLowerCase().includes('bank')).length > 0,
    },
    {
      id: 'insurance_docs_vendors',
      title: 'Insurance, documents, vendors',
      role: 'Any board member',
      time: '20 min',
      navigateTo: '/building?tab=insurance',
      complete: building.insurance.length > 0 && building.vendors.length > 0,
    },
  ], [tenant.totalUnits, building.legalDocuments, building.board, fin.chartOfAccounts, building.insurance, building.vendors]);

  const completedCount = milestones.filter(m => m.complete).length;

  // First incomplete milestone is "Next"
  const nextMilestoneIdx = milestones.findIndex(m => !m.complete);

  // Plan info
  const planId = (tenant.tier === 'facilities' ? 'facilities' : 'self_managed') as PlanId;
  const planName = PLANS[planId].name;
  const interval = (tenant.billing.interval || 'monthly') as 'monthly' | 'annual';
  const price = planPrice(planId, interval);

  const setupFee = planId === 'facilities' ? 599 : 299;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Season header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#155E75' }}>
            Setup Season
          </span>
          <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em', margin: 0 }}>
            Welcome, {firstName}. Let's set up {tenant.name}.
          </h1>
          <p style={{ fontSize: 15, color: '#4b5a6b', margin: 0 }}>
            Four milestones before the building goes live. Most boards finish in an afternoon.
          </p>
        </div>
        <div style={{
          background: '#ffffff', border: '1px solid #e3e8ee', borderRadius: 14,
          padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4b5a6b' }}>
              Board Health
            </span>
            <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 34, fontWeight: 700, lineHeight: 1, color: '#8fa0b3' }}>
              &ndash;&ndash;
            </span>
          </div>
          <p style={{ fontSize: 12, maxWidth: 160, lineHeight: 1.4, color: '#4b5a6b', margin: 0 }}>
            Scores once the units and the first close are in.
          </p>
        </div>
      </div>

      {/* Choice card: sample vs real */}
      {isSetupUser && (
        <div
          style={{
            background: '#ffffff', border: '1px solid #e3e8ee', borderRadius: 14,
            padding: 0, overflow: 'hidden',
            display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          }}
          className="setup-choice-cols"
        >
          <div style={{ padding: 26, display: 'flex', flexDirection: 'column', gap: 12, borderRight: '1px solid #e3e8ee' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700,
              background: '#eef2f7', color: '#0D1B2E', alignSelf: 'flex-start',
            }}>
              Look around first
            </span>
            <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 600, margin: 0 }}>
              Load a sample building
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: '#4b5a6b', margin: 0 }}>
              Fill {tenant.name} with sample data: 12 units, a year of books, two open cases and a half-finished
              runbook, so every screen has something on it. Every sample row is marked and comes out with one click
              when you are ready.
            </p>
            {sampleLoaded ? (
              <button
                type="button"
                onClick={onRemoveSample}
                disabled={loadingSample}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  minHeight: 44, padding: '0 18px', borderRadius: 10, fontWeight: 600, fontSize: 15,
                  border: '1.5px solid #c9d2dc', cursor: 'pointer', fontFamily: 'inherit',
                  background: '#ffffff', color: '#0D1B2E', alignSelf: 'flex-start',
                  opacity: loadingSample ? 0.5 : 1,
                }}
              >
                Remove sample data
              </button>
            ) : (
              <button
                type="button"
                onClick={onLoadSample}
                disabled={loadingSample}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  minHeight: 44, padding: '0 18px', borderRadius: 10, fontWeight: 600, fontSize: 15,
                  border: '1.5px solid #c9d2dc', cursor: 'pointer', fontFamily: 'inherit',
                  background: '#ffffff', color: '#0D1B2E', alignSelf: 'flex-start',
                  opacity: loadingSample ? 0.5 : 1,
                }}
              >
                {loadingSample ? 'Loading...' : 'Add sample data'}
              </button>
            )}
          </div>
          <div style={{ padding: 26, display: 'flex', flexDirection: 'column', gap: 12, background: '#f4fbf9' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700,
              background: '#155E75', color: '#ffffff', alignSelf: 'flex-start',
            }}>
              Recommended
            </span>
            <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 600, margin: 0 }}>
              Set up for real
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: '#4b5a6b', margin: 0 }}>
              Start with your unit roster and bylaws facts. The first milestone takes about twenty minutes
              and your Board Health score appears as soon as it is done.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  const ms = milestones.find(m => !m.complete);
                  if (ms) navigate(ms.navigateTo);
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  minHeight: 44, padding: '0 18px', borderRadius: 10, fontWeight: 600, fontSize: 15,
                  border: 0, cursor: 'pointer', fontFamily: 'inherit',
                  background: '#0D1B2E', color: '#ffffff', alignSelf: 'flex-start',
                }}
              >
                Start milestone 1
              </button>
              <a
                href="/subscription?setup=1"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  minHeight: 44, padding: '0 18px', borderRadius: 10, fontWeight: 600, fontSize: 15,
                  border: '1.5px solid #c9d2dc', cursor: 'pointer', fontFamily: 'inherit',
                  background: '#ffffff', color: '#0D1B2E', textDecoration: 'none',
                }}
              >
                Book Setup with us, ${setupFee}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Main grid */}
      <div
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 22 }}
        className="setup-main-cols"
      >
        {/* Left: Milestones */}
        <div style={{
          background: '#ffffff', border: '1px solid #e3e8ee', borderRadius: 14,
          padding: 22, display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 18, fontWeight: 600, margin: 0 }}>
              Setup milestones
            </h2>
            <span style={{ fontSize: 13, color: '#4b5a6b' }}>{completedCount} of {milestones.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {milestones.map((ms, i) => {
              const isNext = i === nextMilestoneIdx;
              return (
                <button
                  key={ms.id}
                  type="button"
                  onClick={() => navigate(ms.navigateTo)}
                  style={{
                    display: 'flex', gap: 12, alignItems: 'center',
                    padding: '14px 16px', border: '1px solid #e3e8ee', borderRadius: 12,
                    background: '#ffffff', cursor: 'pointer', fontFamily: 'inherit',
                    textAlign: 'left', color: '#0D1B2E', width: '100%', boxSizing: 'border-box',
                  }}
                >
                  {ms.complete ? (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                      background: '#ecfeff', color: '#155E75',
                    }}>
                      &#10003;
                    </span>
                  ) : isNext ? (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                      background: '#fff0f1', color: '#D62839',
                    }}>
                      Next
                    </span>
                  ) : (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                      background: '#eef2f7', color: '#4b5a6b',
                    }}>
                      {i + 1}
                    </span>
                  )}
                  <span style={{ fontWeight: 600, flex: 1 }}>{ms.title}</span>
                  <span style={{ fontSize: 12, color: '#4b5a6b' }}>{ms.role} &middot; {ms.time}</span>
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: '#4b5a6b', margin: 0 }}>
            Finish all four and Setup Season ends. The building moves into Budget Season, where the year is.
          </p>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* Invite card */}
          <div style={{
            background: '#ffffff', border: '1px solid #e3e8ee', borderRadius: 14,
            padding: 22, display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 18, fontWeight: 600, margin: 0 }}>
              Invite your neighbors and board
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: '#4b5a6b', margin: 0 }}>
              Milestones go faster with the treasurer doing the treasurer's. Each invite lands in their inbox with
              their role already set, and the first board member to accept takes the president seat unless you pick someone else.
            </p>
            <button
              type="button"
              onClick={() => navigate('/building?tab=contacts&invite=1')}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                minHeight: 44, padding: '0 18px', borderRadius: 10, fontWeight: 600, fontSize: 15,
                border: '1.5px solid #c9d2dc', cursor: 'pointer', fontFamily: 'inherit',
                background: '#ffffff', color: '#0D1B2E', alignSelf: 'flex-start',
              }}
            >
              Send invites
            </button>
          </div>

          {/* Plan card */}
          <div style={{
            background: '#0D1B2E', border: '1px solid #0D1B2E', borderRadius: 14,
            padding: 22, display: 'flex', flexDirection: 'column', gap: 10, color: '#ffffff',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#A5F3FC' }}>
              Your plan
            </span>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 20, fontWeight: 600 }}>
                {planName}
              </span>
              <span style={{ fontSize: 14, color: '#c7d2de' }}>
                ${price} after trial
              </span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: '#c7d2de', margin: 0 }}>
              Everything is on during the trial, including Plus Facilities features, so you can see what your building needs.
            </p>
            <a
              href="/subscription"
              style={{ color: '#A5F3FC', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
            >
              Manage plan and billing
            </a>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .setup-choice-cols { grid-template-columns: 1fr !important; }
          .setup-main-cols { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
