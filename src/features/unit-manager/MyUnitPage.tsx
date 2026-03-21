import { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt, getOrdinalSuffix } from '@/lib/formatters';
import MyBalanceTab from './tabs/MyBalanceTab';
import MyDocumentsTab from './tabs/MyDocumentsTab';
import MyMoveHistoryTab from './tabs/MyMoveHistoryTab';

type MyUnitTab = 'balance' | 'documents' | 'moves';

export default function MyUnitPage() {
  const { currentUser } = useAuthStore();
  const store = useFinancialStore();
  const { units, hoaDueDay } = store;

  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MyUnitTab>('balance');

  const linkedUnits = currentUser?.linkedUnits || [];
  const myUnits = units.filter(u => linkedUnits.includes(u.number));
  const allUnits = units;

  // Unit linking
  const [showLinkModal, setShowLinkModal] = useState(false);
  const { updateProfile } = useAuthStore();

  const handleLinkUnit = (unitNum: string, isPrimary: boolean) => {
    const newLinked = [...linkedUnits, unitNum];
    updateProfile({ linkedUnits: newLinked });
    if (isPrimary && currentUser) {
      store.updateUnit(unitNum, {
        owner: currentUser.name,
        email: currentUser.email,
        phone: currentUser.phone || '',
        status: 'ACTIVE',
      });
    }
  };
  const handleUnlinkUnit = (unitNum: string) => {
    const newLinked = linkedUnits.filter(n => n !== unitNum);
    updateProfile({ linkedUnits: newLinked });
  };

  if (myUnits.length === 0) {
    return (
      <div className="max-w-xl mx-auto text-center py-16">
        <div className="text-6xl mb-4">🏠</div>
        <h2 className="font-display text-2xl font-bold text-ink-900 mb-2">No Unit Linked</h2>
        <p className="text-ink-500 mb-6">Select your unit(s) from the list below to view assessments, payment history, and manage your HOA account.</p>
        <div className="bg-white rounded-xl border border-ink-100 shadow-sm max-w-md mx-auto">
          <div className="border-b px-5 py-3"><h3 className="text-sm font-bold text-ink-800">Available Units</h3></div>
          <div className="max-h-64 overflow-y-auto divide-y divide-ink-50">
            {allUnits.length === 0 ? (
              <p className="p-4 text-sm text-ink-400">No units configured yet. Contact your board administrator.</p>
            ) : allUnits.map(u => (
              <div key={u.number} className="flex items-center justify-between px-5 py-3 hover:bg-mist-50">
                <div>
                  <p className="text-sm font-semibold text-ink-900">Unit {u.number}</p>
                  <p className="text-xs text-ink-400">{u.owner} · {u.status}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleLinkUnit(u.number, true)} className="px-3 py-1.5 bg-accent-600 text-white rounded-lg text-xs font-medium hover:bg-accent-700">Link as Primary</button>
                  <button onClick={() => handleLinkUnit(u.number, false)} className="px-3 py-1.5 bg-ink-100 text-ink-600 rounded-lg text-xs font-medium hover:bg-ink-200">Link as Co-owner</button>
                </div>
              </div>
            ))}
          </div>
        </div>
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

  const TABS: { id: MyUnitTab; label: string }[] = [
    { id: 'balance', label: 'Balance & Payments' },
    { id: 'documents', label: 'My Documents' },
    { id: 'moves', label: 'Move History' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">My Unit{myUnits.length > 1 ? 's' : ''}</h1>
            <p className="text-accent-100 text-sm mt-1">{currentUser?.name} · {myUnits.length} unit{myUnits.length !== 1 ? 's' : ''} · Due {hoaDueDay}{getOrdinalSuffix(hoaDueDay)} monthly</p>
          </div>
          <button onClick={() => setShowLinkModal(true)} className="px-4 py-2 bg-white bg-opacity-20 text-white rounded-lg text-sm font-medium hover:bg-opacity-30">+ Link Unit</button>
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
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${isDelinquent ? 'bg-red-100 text-red-700' : activeUnit.status === 'FOR_SALE' ? 'bg-yellow-100 text-yellow-700' : activeUnit.status === 'UNDER_CONTRACT' ? 'bg-blue-100 text-blue-700' : activeUnit.status === 'TRANSFER_PENDING' ? 'bg-purple-100 text-purple-700' : 'bg-sage-100 text-sage-700'}`}>
                  {isDelinquent ? 'Delinquent' : activeUnit.status === 'FOR_SALE' ? 'For Sale' : activeUnit.status === 'UNDER_CONTRACT' ? 'Under Contract' : activeUnit.status === 'TRANSFER_PENDING' ? 'Transfer Pending' : 'Active'}
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

      {/* Tab Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-ink-100 overflow-hidden">
        <div className="border-b px-5 flex gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all ${activeTab === t.id ? 'border-accent-500 text-accent-700' : 'border-transparent text-ink-400 hover:text-ink-600'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-5">
          {activeTab === 'balance' && <MyBalanceTab activeUnit={activeUnit} />}
          {activeTab === 'documents' && <MyDocumentsTab activeUnit={activeUnit} />}
          {activeTab === 'moves' && <MyMoveHistoryTab activeUnit={activeUnit} />}
        </div>
      </div>

      {/* Link Unit Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowLinkModal(false)}>
          <div className="bg-white rounded-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="border-b p-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-ink-900">Link a Unit</h2>
                <p className="text-xs text-ink-400 mt-1">Primary: your name, email & phone auto-populate as unit contact. Co-owner: link only.</p>
              </div>
              <button onClick={() => setShowLinkModal(false)} className="text-ink-400 hover:text-ink-600 text-xl">✕</button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-ink-50">
              {allUnits.filter(u => !linkedUnits.includes(u.number)).length === 0 ? (
                <p className="p-5 text-sm text-ink-400 text-center">All units are already linked to your account.</p>
              ) : allUnits.filter(u => !linkedUnits.includes(u.number)).map(u => (
                <div key={u.number} className="flex items-center justify-between px-5 py-3 hover:bg-mist-50">
                  <div>
                    <p className="text-sm font-semibold text-ink-900">Unit {u.number}</p>
                    <p className="text-xs text-ink-400">{u.owner} · {u.status}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { handleLinkUnit(u.number, true); setShowLinkModal(false); }} className="px-3 py-1.5 bg-accent-600 text-white rounded-lg text-xs font-medium hover:bg-accent-700">Primary</button>
                    <button onClick={() => { handleLinkUnit(u.number, false); setShowLinkModal(false); }} className="px-3 py-1.5 bg-ink-100 text-ink-600 rounded-lg text-xs font-medium hover:bg-ink-200">Co-owner</button>
                  </div>
                </div>
              ))}
            </div>
            {linkedUnits.length > 0 && (
              <div className="border-t p-4">
                <p className="text-xs font-semibold text-ink-500 uppercase mb-2">Currently Linked</p>
                <div className="flex flex-wrap gap-2">
                  {linkedUnits.map(num => (
                    <span key={num} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-mist-50 border border-mist-200 rounded-lg text-xs text-ink-700">
                      Unit {num}
                      <button onClick={() => handleUnlinkUnit(num)} className="text-red-400 hover:text-red-600 font-bold">×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
