import { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt, getOrdinalSuffix } from '@/lib/formatters';
import { useNavigate } from 'react-router-dom';

type PayModal = null | 'setupRecurring';

export default function MyUnitPage() {
  const { currentUser } = useAuthStore();
  const store = useFinancialStore();
  const { units, hoaDueDay, recordUnitPayment, markSpecialAssessmentPaid, stripeConnectId, stripeOnboardingComplete } = store;
  const navigate = useNavigate();

  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [modal, setModal] = useState<PayModal>(null);
  const [recurringSetup, setRecurringSetup] = useState(false);

  const linkedUnits = currentUser?.linkedUnits || [];
  const myUnits = units.filter(u => linkedUnits.includes(u.number));
  const stripeReady = stripeConnectId && stripeOnboardingComplete;

  if (myUnits.length === 0) {
    return (
      <div className="max-w-xl mx-auto text-center py-16">
        <div className="text-6xl mb-4">🏠</div>
        <h2 className="font-display text-2xl font-bold text-ink-900 mb-2">No Unit Linked</h2>
        <p className="text-ink-500 mb-6">Link your unit in Account Settings to view your assessments, payment history, and manage your HOA account.</p>
        <button onClick={() => navigate('/account')} className="px-6 py-3 bg-accent-600 text-white rounded-lg font-medium hover:bg-accent-700">Go to My Account →</button>
      </div>
    );
  }

  const activeUnit = selectedUnit ? myUnits.find(u => u.number === selectedUnit) || myUnits[0] : myUnits[0];
  const unpaidFees = activeUnit.lateFees.filter(f => !f.waived);
  const totalLateFees = unpaidFees.reduce((s, f) => s + f.amount, 0);
  const unpaidSA = activeUnit.specialAssessments.filter(a => !a.paid);
  const totalSA = unpaidSA.reduce((s, a) => s + a.amount, 0);
  const totalOwed = activeUnit.balance + totalLateFees;
  const totalPaid = activeUnit.payments.reduce((s, p) => s + p.amount, 0);
  const isDelinquent = activeUnit.balance > 0;

  // Simulate Stripe Checkout for a payment
  const handleStripePayment = (amount: number, description: string, onSuccess: () => void) => {
    // In production: POST /api/stripe/create-checkout-session
    // which calls stripeClient.checkout.sessions.create({
    //   line_items: [{ price_data: { unit_amount: amount * 100, currency: 'usd',
    //     product_data: { name: description } }, quantity: 1 }],
    //   payment_intent_data: { application_fee_amount: Math.round(amount * 100 * 0.029) },
    //   mode: 'payment',
    //   success_url: `${window.location.origin}/my-unit?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    // }, { stripeAccount: stripeConnectId });
    // Then redirect: window.location.href = session.url
    if (confirm(`Stripe Checkout: Pay ${fmt(amount)} for "${description}"?\n\nIn production, this redirects to Stripe's hosted checkout page.`)) {
      onSuccess();
    }
  };

  const handleSetupRecurring = () => {
    // In production: POST /api/stripe/create-subscription-checkout
    // calls stripeClient.checkout.sessions.create({
    //   customer_account: stripeConnectId (connected account ID = customer ID for V2 accounts),
    //   mode: 'subscription',
    //   line_items: [{ price: MONTHLY_PRICE_ID, quantity: 1 }],
    //   success_url: `${window.location.origin}/my-unit?subscription=success`,
    //   cancel_url: `${window.location.origin}/my-unit`,
    // });
    setRecurringSetup(true);
    setModal(null);
    alert('Demo: Recurring payment enrolled.\n\nIn production, this creates a Stripe Subscription via hosted checkout.\nThe resident is redirected to Stripe to enter payment details, then back to the app.');
  };

  const handleManageBilling = () => {
    // In production: POST /api/stripe/create-billing-portal
    // calls stripeClient.billingPortal.sessions.create({
    //   customer_account: stripeConnectId,
    //   return_url: `${window.location.origin}/my-unit`,
    // });
    alert('Demo: Opens Stripe Billing Portal.\n\nIn production, this redirects to Stripe\'s customer portal where residents can:\n- Update payment method\n- View invoices & receipts\n- Cancel recurring payments');
  };

  const StripeIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/></svg>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">My Unit{myUnits.length > 1 ? 's' : ''}</h1>
            <p className="text-accent-100 text-sm mt-1">{currentUser?.name} · {myUnits.length} unit{myUnits.length !== 1 ? 's' : ''} · Due {hoaDueDay}{getOrdinalSuffix(hoaDueDay)} monthly</p>
          </div>
        </div>
      </div>

      {/* Unit selector */}
      {myUnits.length > 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-ink-600">Your Units:</span>
            {myUnits.map(u => (
              <button key={u.number} onClick={() => setSelectedUnit(u.number)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${(selectedUnit || myUnits[0].number) === u.number ? 'bg-ink-900 text-white shadow-md' : u.balance > 0 ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-ink-50 text-ink-700 hover:bg-ink-100'}`}>
                <span className="font-bold">{u.number}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Unit Detail Card */}
      <div className={`bg-white rounded-xl shadow-sm border ${isDelinquent ? 'border-red-200' : 'border-ink-100'} overflow-hidden`}>
        <div className="p-5">
          <div className="flex items-start gap-4">
            <div className={`w-16 h-16 rounded-xl ${isDelinquent ? 'bg-red-100' : 'bg-sage-100'} flex items-center justify-center`}>
              <span className={`text-2xl font-bold ${isDelinquent ? 'text-red-700' : 'text-sage-700'}`}>{activeUnit.number}</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-display text-xl font-bold text-ink-900">{activeUnit.owner}</h2>
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${isDelinquent ? 'bg-red-100 text-red-700' : activeUnit.status === 'VACANT' ? 'bg-ink-100 text-ink-500' : 'bg-sage-100 text-sage-700'}`}>
                  {isDelinquent ? 'Delinquent' : activeUnit.status}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-ink-500">
                {activeUnit.email && <span>✉ {activeUnit.email}</span>}
                {activeUnit.phone && <span>☎ {activeUnit.phone}</span>}
                {activeUnit.sqft > 0 && <span>{activeUnit.sqft} sqft</span>}
                {activeUnit.bedrooms > 0 && <span>{activeUnit.bedrooms}BR</span>}
                {activeUnit.parking && <span>P: {activeUnit.parking}</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-2xl font-bold ${isDelinquent ? 'text-red-600' : 'text-sage-600'}`}>{fmt(totalOwed + totalSA)}</p>
              <p className="text-xs text-ink-400">{isDelinquent ? 'total owed' : 'balance'}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-5 pt-0">
          <div className="bg-mist-50 rounded-lg p-3"><p className="text-xs text-ink-400 uppercase font-semibold">Monthly</p><p className="text-lg font-bold text-ink-900">{fmt(activeUnit.monthlyFee)}</p></div>
          <div className="bg-mist-50 rounded-lg p-3"><p className="text-xs text-ink-400 uppercase font-semibold">Paid YTD</p><p className="text-lg font-bold text-sage-600">{fmt(totalPaid)}</p></div>
          <div className={`${isDelinquent ? 'bg-red-50' : 'bg-mist-50'} rounded-lg p-3`}><p className={`text-xs ${isDelinquent ? 'text-red-500' : 'text-ink-400'} uppercase font-semibold`}>Balance</p><p className={`text-lg font-bold ${isDelinquent ? 'text-red-600' : 'text-ink-900'}`}>{fmt(activeUnit.balance)}</p></div>
          <div className="bg-mist-50 rounded-lg p-3"><p className="text-xs text-ink-400 uppercase font-semibold">Late Fees</p><p className={`text-lg font-bold ${totalLateFees > 0 ? 'text-yellow-600' : 'text-ink-900'}`}>{fmt(totalLateFees)}</p></div>
          <div className="bg-mist-50 rounded-lg p-3"><p className="text-xs text-ink-400 uppercase font-semibold">Assessments</p><p className={`text-lg font-bold ${totalSA > 0 ? 'text-amber-600' : 'text-ink-900'}`}>{fmt(totalSA)}</p></div>
        </div>
      </div>

      {/* ═══ Payments Section ═══ */}
      <div className="bg-white rounded-xl shadow-sm border border-ink-100 overflow-hidden">
        <div className="border-b px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StripeIcon className="w-5 h-5 text-indigo-600" />
            <h3 className="font-display text-lg font-semibold text-ink-800">Payments</h3>
          </div>
          {recurringSetup && <span className="px-2.5 py-1 rounded-full bg-sage-100 text-sage-700 text-xs font-semibold">⚡ AutoPay Enrolled</span>}
        </div>
        <div className="p-5 space-y-4">

          {/* Stripe not set up by building */}
          {!stripeReady && (
            <div className="bg-ink-50 rounded-xl p-5 border border-ink-100 text-center">
              <p className="text-ink-500 text-sm mb-1">Online payments are not yet enabled for this building.</p>
              <p className="text-xs text-ink-400">Contact your board or management company to set up Stripe Connect.</p>
            </div>
          )}

          {stripeReady && (
            <>
              {/* ── Current Balance / Pay Now ── */}
              <div className={`${isDelinquent ? 'bg-red-50 border-red-200' : 'bg-accent-50 border-accent-200'} border-2 rounded-xl p-5`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-ink-700">Current Balance</span>
                  <span className={`px-2.5 py-1 rounded-full ${isDelinquent ? 'bg-red-100 text-red-700' : 'bg-sage-100 text-sage-700'} text-xs font-semibold`}>
                    {isDelinquent ? '⚠ Past Due' : '✓ Current'}
                  </span>
                </div>
                <div className="bg-white rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-ink-500">Monthly Assessment</span><span className="font-medium">{fmt(activeUnit.monthlyFee)}</span></div>
                  {activeUnit.balance > activeUnit.monthlyFee && <div className="flex justify-between text-sm"><span className="text-ink-500">Past Due Balance</span><span className="font-medium text-red-600">{fmt(activeUnit.balance - activeUnit.monthlyFee)}</span></div>}
                  {totalLateFees > 0 && <div className="flex justify-between text-sm"><span className="text-ink-500">Late Fees</span><span className="font-medium text-red-600">{fmt(totalLateFees)}</span></div>}
                  {totalSA > 0 && <div className="flex justify-between text-sm"><span className="text-ink-500">Special Assessments</span><span className="font-medium text-amber-600">{fmt(totalSA)}</span></div>}
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between"><span className="font-semibold text-ink-900">Total Due</span><span className="font-display text-2xl font-bold text-ink-900">{fmt(totalOwed + totalSA)}</span></div>
                  </div>
                </div>

                {totalOwed + totalSA > 0 ? (
                  <button onClick={() => {
                    handleStripePayment(totalOwed + totalSA, `Unit ${activeUnit.number} — Full Balance`, () => {
                      recordUnitPayment(activeUnit.number, totalOwed, 'stripe');
                      unpaidSA.forEach(sa => markSpecialAssessmentPaid(activeUnit.number, sa.id));
                    });
                  }} className="w-full mt-3 py-3.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold text-base transition-all hover:shadow-md flex items-center justify-center gap-2">
                    <StripeIcon />
                    Pay {fmt(totalOwed + totalSA)} Now
                  </button>
                ) : (
                  <div className="text-center mt-3 py-3 text-sage-600 font-medium text-sm">✓ No balance due — you're all set!</div>
                )}
              </div>

              {/* ── Recurring Monthly Payment ── */}
              <div className={`rounded-xl border-2 p-5 ${recurringSetup ? 'bg-sage-50 border-sage-200' : 'bg-indigo-50 border-indigo-200'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-ink-900">⚡ Recurring Monthly Payment</h4>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {recurringSetup
                        ? `Enrolled — ${fmt(activeUnit.monthlyFee)}/mo charged automatically on the ${hoaDueDay}${getOrdinalSuffix(hoaDueDay)}`
                        : `Auto-pay ${fmt(activeUnit.monthlyFee)}/mo on the ${hoaDueDay}${getOrdinalSuffix(hoaDueDay)} of each month`
                      }
                    </p>
                  </div>
                </div>
                {!recurringSetup ? (
                  <button onClick={() => setModal('setupRecurring')} className="w-full mt-3 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold text-sm hover:bg-indigo-700 flex items-center justify-center gap-2">
                    <StripeIcon className="w-3.5 h-3.5" />
                    Set Up AutoPay
                  </button>
                ) : (
                  <div className="flex gap-2 mt-3">
                    <button onClick={handleManageBilling} className="flex-1 py-2.5 bg-white border border-ink-200 text-ink-700 rounded-lg font-medium text-sm hover:bg-ink-50">Manage Billing →</button>
                    <button onClick={() => { if (confirm('Cancel recurring payment?')) setRecurringSetup(false); }} className="px-4 py-2.5 bg-red-50 text-red-600 rounded-lg font-medium text-sm hover:bg-red-100 border border-red-200">Cancel</button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Outstanding Special Assessments ── */}
          {unpaidSA.length > 0 && (
            <div>
              <h4 className="text-xs text-amber-600 font-semibold uppercase mb-2">Special Assessments Due</h4>
              <div className="space-y-2">
                {unpaidSA.map(sa => (
                  <div key={sa.id} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-100 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-ink-900">{sa.reason}</p>
                      <p className="text-xs text-ink-400">{sa.date} · {fmt(sa.amount)}</p>
                    </div>
                    {stripeReady ? (
                      <button onClick={() => handleStripePayment(sa.amount, `Special Assessment: ${sa.reason}`, () => markSpecialAssessmentPaid(activeUnit.number, sa.id))} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 flex items-center gap-1.5">
                        <StripeIcon className="w-3 h-3" /> Pay {fmt(sa.amount)}
                      </button>
                    ) : (
                      <span className="text-xs text-amber-600 font-semibold">OUTSTANDING</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Outstanding Late Fees ── */}
          {unpaidFees.length > 0 && (
            <div>
              <h4 className="text-xs text-red-500 font-semibold uppercase mb-2">Late Fees & Fines</h4>
              <div className="space-y-2">
                {unpaidFees.map((lf, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-ink-900">{lf.reason}</p>
                      <p className="text-xs text-ink-400">{lf.date} · {fmt(lf.amount)}</p>
                    </div>
                    {stripeReady ? (
                      <button onClick={() => handleStripePayment(lf.amount, `Late Fee: ${lf.reason}`, () => recordUnitPayment(activeUnit.number, lf.amount, 'stripe'))} className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 flex items-center gap-1.5">
                        <StripeIcon className="w-3 h-3" /> Pay {fmt(lf.amount)}
                      </button>
                    ) : (
                      <span className="text-xs text-red-600 font-semibold">{fmt(lf.amount)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Paid Assessments ── */}
          {activeUnit.specialAssessments.filter(a => a.paid).length > 0 && (
            <div>
              <h4 className="text-xs text-ink-400 font-semibold uppercase mb-2">Completed Assessments</h4>
              <div className="space-y-1.5">
                {activeUnit.specialAssessments.filter(a => a.paid).map(sa => (
                  <div key={sa.id} className="flex items-center justify-between p-2.5 bg-sage-50 border border-sage-100 rounded-lg">
                    <div className="flex items-center gap-2"><span className="text-sage-500 text-xs">✓</span><span className="text-xs text-ink-700">{sa.reason}</span></div>
                    <div className="flex items-center gap-3"><span className="text-sm font-medium text-sage-600">{fmt(sa.amount)}</span><span className="text-[10px] text-ink-400">Paid {sa.paidDate}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Payment History ── */}
          {activeUnit.payments.length > 0 && (
            <div>
              <h4 className="text-xs text-ink-400 font-semibold uppercase mb-2">Payment History</h4>
              <div className="space-y-1.5">
                {[...activeUnit.payments].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((p, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 px-3 bg-white border border-ink-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-sage-500 text-xs">✓</span>
                      <span className="text-xs text-ink-700">{p.date}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${p.method === 'stripe' ? 'bg-indigo-100 text-indigo-600' : 'bg-ink-100 text-ink-500'}`}>
                        {p.method === 'stripe' ? 'Stripe' : p.method.toUpperCase()}
                      </span>
                      {p.note && <span className="text-xs text-ink-400">{p.note}</span>}
                    </div>
                    <span className="text-sm font-semibold text-ink-900">{fmt(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Setup Recurring Modal ── */}
      {modal === 'setupRecurring' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="border-b p-5">
              <div className="flex items-center gap-3">
                <StripeIcon className="w-6 h-6 text-indigo-600" />
                <div>
                  <h2 className="text-lg font-bold text-ink-900">Set Up Recurring Payment</h2>
                  <p className="text-xs text-ink-400">Stripe Subscription for monthly HOA assessments</p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-ink-600">Monthly Assessment</span>
                  <span className="text-lg font-bold text-ink-900">{fmt(activeUnit.monthlyFee)}/mo</span>
                </div>
                <div className="flex justify-between text-xs text-ink-400">
                  <span>Unit {activeUnit.number}</span>
                  <span>Billed on the {hoaDueDay}{getOrdinalSuffix(hoaDueDay)} of each month</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-ink-700 uppercase">How it works</h4>
                {[
                  { step: '1', text: 'You\'ll be redirected to Stripe\'s secure checkout page' },
                  { step: '2', text: 'Enter your card or bank account details' },
                  { step: '3', text: `${fmt(activeUnit.monthlyFee)} is charged automatically each month on the ${hoaDueDay}${getOrdinalSuffix(hoaDueDay)}` },
                  { step: '4', text: 'Manage or cancel anytime via the Billing Portal' },
                ].map(s => (
                  <div key={s.step} className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{s.step}</span>
                    <span className="text-sm text-ink-600">{s.text}</span>
                  </div>
                ))}
              </div>

              <div className="bg-sand-100 rounded-lg p-3 border border-ink-100">
                <p className="text-xs text-ink-500"><strong>Secure:</strong> Payment details are handled by Stripe and never stored on our servers.</p>
              </div>

              <div className="flex gap-3">
                <button onClick={handleSetupRecurring} className="flex-1 py-3 bg-indigo-600 text-white rounded-lg font-semibold text-sm hover:bg-indigo-700 flex items-center justify-center gap-2">
                  <StripeIcon /> Continue to Stripe →
                </button>
                <button onClick={() => setModal(null)} className="px-4 py-3 border border-ink-200 text-ink-600 rounded-lg font-medium text-sm hover:bg-ink-50">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
