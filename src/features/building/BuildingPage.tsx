import { useState } from 'react';
import { useTabParam } from '@/hooks/useTabParam';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useUndoableAction } from '@/hooks/useUndoableAction';
import { getInitials, fmt } from '@/lib/formatters';
import { Building2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import TheUnitsTab from './tabs/TheUnitsTab';
import UnitsManager from './tabs/UnitsManager';
import LegalBylawsTab from './tabs/LegalBylawsTab';
import InsuranceTab from './tabs/InsuranceTab';
import VendorsTab from './tabs/VendorsTab';
import AssetsTab from './tabs/AssetsTab';
import MailingSettingsTab from './tabs/MailingSettingsTab';
import FeeScheduleTab from './tabs/FeeScheduleTab';
import RoleCharter from '@/features/boardroom/components/RoleCharter';
import { BOARD_ROLE_LABELS, type BoardRoleKey } from '@/types/auth';

const TABS = ['settings', 'guidelines', 'people', 'docs', 'vendors'] as const;
type TabId = typeof TABS[number];
const TAB_LABELS: Record<TabId, string> = {
  people: 'People & Units',
  docs: 'Documents & Insurance',
  vendors: 'Vendors & Assets',
  guidelines: 'Association Guidelines',
  settings: 'Building Profile',
};

// Sub-tabs within People & Units
type PeopleSubTab = 'units' | 'board';
// Sub-tabs within Docs & Insurance
type DocsSubTab = 'legal' | 'insurance';
// Sub-tabs within Vendors & Assets
type VendorsSubTab = 'vendors' | 'assets';
// Sub-tabs within Association Guidelines
type GuidelinesSubTab = 'bylaws' | 'fees' | 'roles';
// Sub-tabs within Settings
type SettingsSubTab = 'details' | 'mailing';

function Field({ label, value, onChange, type = 'text', placeholder = '' }: { label: string; value: string; onChange: (val: string) => void; type?: string; placeholder?: string }) {
  return (
    <div><label className="block text-xs font-medium text-ink-700 mb-1">{label}</label><input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder={placeholder} /></div>
  );
}

type ModalState = null | 'addBoard' | 'editBoard' | 'editMgmt' | 'addCounsel' | 'editCounsel' | 'editAddress' | 'editDetails' | 'addDoc' | 'editDoc' | 'addIns' | 'editIns' | 'addVendor' | 'editVendor' | 'addMaint' | 'editMaint' | 'addAsset' | 'editAsset' | 'autoMaintVendor';

export default function BuildingPage() {
  const store = useBuildingStore();
  const { currentRole } = useAuthStore();
  const finStore = useFinancialStore();
  const { run: runUndoable } = useUndoableAction();
  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';

  const [tab, setTab] = useTabParam<TabId>('tab', 'people', [...TABS]);
  const [modal, setModal] = useState<ModalState>(null);
  const [editId, setEditId] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});
  const f = (key: string) => form[key] || '';
  const sf = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));
  const [maintAssetId, setMaintAssetId] = useState<string | null>(null);
  const [pendingAutoMaintAssetId, setPendingAutoMaintAssetId] = useState<string | null>(null);
  const [autoMaintVendor, setAutoMaintVendor] = useState('');
  const resetForm = () => setForm({});
  const openEdit = (type: ModalState, id: string, data: Record<string, string>) => { setEditId(id); setForm(data); setModal(type); };

  // Sub-tab states
  const [peopleSubTab, setPeopleSubTab] = useState<PeopleSubTab>('units');
  const [docsSubTab, setDocsSubTab] = useState<DocsSubTab>('legal');
  const [vendorsSubTab, setVendorsSubTab] = useState<VendorsSubTab>('vendors');
  const [guidelinesSubTab, setGuidelinesSubTab] = useState<GuidelinesSubTab>('bylaws');
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>('details');
  const [whoDoesWhatRole, setWhoDoesWhatRole] = useState<BoardRoleKey>('president');

  // ─── Building Compliance Health ───
  const totalDocs = store.legalDocuments.length;
  const currentDocs = store.legalDocuments.filter(d => d.status === 'current').length;
  const docsWithFiles = store.legalDocuments.filter(d => d.attachments && d.attachments.length > 0).length;
  const legalScore = totalDocs > 0 ? Math.round(((currentDocs / totalDocs) * 60) + ((docsWithFiles / totalDocs) * 40)) : 0;

  const totalPolicies = store.insurance.length;
  const activePolicies = store.insurance.filter(p => new Date(p.expires) > new Date()).length;
  const policiesWithDocs = store.insurance.filter(p => p.attachments && p.attachments.length > 0).length;
  const insScore = totalPolicies > 0 ? Math.round(((activePolicies / totalPolicies) * 70) + ((policiesWithDocs / totalPolicies) * 30)) : 0;

  const hasBoard = store.board.length >= 3;
  const hasMgmt = !!store.management.company;
  const hasCounsel = store.legalCounsel.length > 0;
  const hasVendors = store.vendors.filter(v => v.status === 'active').length >= 3;
  const govScore = Math.round(([hasBoard, hasMgmt, hasCounsel, hasVendors].filter(Boolean).length / 4) * 100);

  const overallHealth = Math.round(legalScore * 0.35 + insScore * 0.35 + govScore * 0.30);
  const hGrade = overallHealth >= 90 ? 'A' : overallHealth >= 80 ? 'B' : overallHealth >= 70 ? 'C' : overallHealth >= 60 ? 'D' : 'F';

  return (
    <div className="space-y-0">
      {/* Building header */}
      <div className="rounded-t-xl p-8 text-white shadow-sm" style={{ background: 'linear-gradient(to right, rgb(21, 94, 117), #991b1b)' }}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Building2 size={28} className="text-white/80" />
            <h2 className="font-display text-2xl font-bold">{store.name}</h2>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-white">{hGrade}</div>
            <div className="text-accent-200 text-xs">Health {overallHealth}%</div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5">
          {[
            { label: 'Legal & Bylaws', score: legalScore, detail: `${currentDocs}/${totalDocs}`, tab: 'docs' as TabId },
            { label: 'Insurance', score: insScore, detail: `${activePolicies}/${totalPolicies}`, tab: 'docs' as TabId },
            { label: 'Governance', score: govScore, detail: `Board ${store.board.length}`, tab: 'people' as TabId },
            (() => {
              const occupiedUnits = finStore.units;
              const delinqUnits = occupiedUnits.filter(u => u.balance > 0);
              const delinqRate = occupiedUnits.length > 0 ? Math.round((delinqUnits.length / occupiedUnits.length) * 100) : 0;
              return { label: 'Delinquency Rate', score: 100 - delinqRate, detail: `${delinqUnits.length}/${occupiedUnits.length} units`, tab: 'people' as TabId, displayScore: delinqRate };
            })(),
          ].map(m => (
            <div key={m.label} className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 text-center cursor-pointer hover:bg-opacity-20" onClick={() => setTab(m.tab)}>
              <p className="text-[11px] text-accent-100 leading-tight">{m.label}</p>
              <p className={`text-sm font-bold mt-1 ${m.label === 'Delinquency Rate' ? ((m as any).displayScore <= 10 ? 'text-green-300' : (m as any).displayScore <= 25 ? 'text-yellow-300' : 'text-red-300') : (m.score >= 80 ? 'text-green-300' : m.score >= 60 ? 'text-yellow-300' : 'text-red-300')}`}>{m.label === 'Delinquency Rate' ? `${(m as any).displayScore}%` : `${m.score}%`}</p>
              <p className="text-[10px] text-accent-300">{m.detail}</p>
            </div>
          ))}
          <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 text-center cursor-pointer hover:bg-opacity-20" onClick={() => { setTab('guidelines'); setGuidelinesSubTab('fees'); }}>
            <p className="text-[11px] text-accent-100 leading-tight">Monthly Due Day</p>
            <p className="text-sm font-bold mt-1 text-white">{finStore.hoaDueDay}{finStore.hoaDueDay === 1 ? 'st' : finStore.hoaDueDay === 2 ? 'nd' : finStore.hoaDueDay === 3 ? 'rd' : 'th'}</p>
            <p className="text-[10px] text-accent-300">of each month</p>
          </div>
        </div>
      </div>

      {/* Tab Nav */}
      <div className="bg-white border-x border-ink-100 border-b overflow-x-auto">
        <div className="flex min-w-max px-4">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-400 hover:text-ink-700'}`}>{TAB_LABELS[t]}</button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-b-xl border-x border-b border-ink-100 p-6">

        {/* ─── PEOPLE & UNITS ─── */}
        {tab === 'people' && (
          <div className="space-y-4">
            {/* Sub-tab pills */}
            {isBoard && (
              <div className="flex gap-2 flex-wrap mb-2">
                {([
                  ['units', 'Units'],
                  ['board', 'Board & Contacts'],
                ] as [PeopleSubTab, string][]).map(([id, label]) => (
                  <button key={id} onClick={() => setPeopleSubTab(id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${peopleSubTab === id ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}>{label}</button>
                ))}
              </div>
            )}

            {peopleSubTab === 'units' && isBoard && <TheUnitsTab variant="building" />}

            {peopleSubTab === 'board' && (
              <div className="space-y-6">
                {/* Board of Directors */}
                <div>
                  <div className="flex items-center justify-between mb-4"><h3 className="font-display text-xl font-bold text-ink-900">Board of Directors</h3><button onClick={() => { resetForm(); setModal('addBoard'); }} className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium">+ Add Member</button></div>
                  <div className="space-y-3">{store.board.map(c => (
                    <div key={c.id} className="bg-accent-50 rounded-xl p-5 border border-accent-200 hover:shadow-sm transition-all">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-full bg-ink-900 flex items-center justify-center shrink-0"><span className="text-white font-bold text-lg">{getInitials(c.name)}</span></div>
                        <div className="flex-1"><h4 className="text-lg font-bold text-ink-900">{c.name}</h4><p className="text-sm text-accent-600 font-semibold">{c.role}</p><p className="text-xs text-ink-500">Term: {c.term}</p><div className="flex gap-4 mt-2 text-sm text-ink-700"><span>{c.email}</span><span>{c.phone}</span></div></div>
                        <div className="flex gap-2">
                          <button onClick={() => openEdit('editBoard', c.id, { name: c.name, role: c.role, email: c.email, phone: c.phone, term: c.term })} className="text-xs text-accent-600 hover:text-accent-700 font-medium">Edit</button>
                          <button onClick={() => {
                            const member = c;
                            store.removeBoardMember(member.id);
                            runUndoable({
                              label: `Removed ${member.name}`,
                              undo: () => store.addBoardMember({ name: member.name, role: member.role, email: member.email, phone: member.phone, term: member.term }),
                              commit: () => {},
                            });
                          }} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                        </div>
                      </div>
                    </div>
                  ))}</div>
                </div>

                {/* Property Management */}
                <div>
                  <div className="flex items-center justify-between mb-4"><h3 className="font-display text-xl font-bold text-ink-900">Property Management</h3><button onClick={() => { setForm({ company: store.management.company, contact: store.management.contact, title: store.management.title, email: store.management.email, phone: store.management.phone, emergency: store.management.emergency, address: store.management.address, hours: store.management.hours }); setModal('editMgmt'); }} className="text-sm text-accent-600 font-medium hover:text-accent-700">Edit</button></div>
                  <div className="bg-sage-50 rounded-xl p-5 border border-sage-200"><h4 className="text-lg font-bold text-ink-900">{store.management.company}</h4><p className="text-sm text-sage-600 font-semibold">{store.management.contact} -- {store.management.title}</p><div className="grid grid-cols-2 gap-3 mt-3 text-sm"><div><span className="text-ink-400">Email:</span> <span className="text-ink-700">{store.management.email}</span></div><div><span className="text-ink-400">Phone:</span> <span className="text-ink-700">{store.management.phone}</span></div><div><span className="text-ink-400">Emergency:</span> <span className="text-red-600 font-semibold">{store.management.emergency}</span></div><div><span className="text-ink-400">Hours:</span> <span className="text-ink-700">{store.management.hours}</span></div></div></div>
                </div>

                {/* Legal Counsel */}
                <div>
                  <div className="flex items-center justify-between mb-4"><h3 className="font-display text-xl font-bold text-ink-900">Legal Counsel</h3><button onClick={() => { resetForm(); setModal('addCounsel'); }} className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium">+ Add Counsel</button></div>
                  {store.legalCounsel.map(c => (
                    <div key={c.id} className="bg-mist-50 rounded-xl p-5 border border-mist-200 mb-3">
                      <div className="flex items-center justify-between">
                        <div><h4 className="text-lg font-bold text-ink-900">{c.firm}</h4><p className="text-sm text-ink-600">{c.attorney} -- {c.specialty}</p><div className="flex gap-4 mt-2 text-sm text-ink-700"><span>{c.email}</span><span>{c.phone}</span></div></div>
                        <div className="flex gap-2">
                          <button onClick={() => openEdit('editCounsel', c.id, { firm: c.firm, attorney: c.attorney, email: c.email, phone: c.phone, specialty: c.specialty })} className="text-xs text-accent-600 font-medium">Edit</button>
                          <button onClick={() => {
                            const counsel = c;
                            store.removeLegalCounsel(counsel.id);
                            runUndoable({
                              label: `Removed ${counsel.firm}`,
                              undo: () => store.addLegalCounsel({ firm: counsel.firm, attorney: counsel.attorney, email: counsel.email, phone: counsel.phone, specialty: counsel.specialty }),
                              commit: () => {},
                            });
                          }} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Residents see board contacts only */}
            {!isBoard && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-display text-xl font-bold text-ink-900 mb-4">Board of Directors</h3>
                  <div className="space-y-3">{store.board.map(c => (
                    <div key={c.id} className="bg-accent-50 rounded-xl p-5 border border-accent-200">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-full bg-ink-900 flex items-center justify-center shrink-0"><span className="text-white font-bold text-lg">{getInitials(c.name)}</span></div>
                        <div className="flex-1"><h4 className="text-lg font-bold text-ink-900">{c.name}</h4><p className="text-sm text-accent-600 font-semibold">{c.role}</p><div className="flex gap-4 mt-2 text-sm text-ink-700"><span>{c.email}</span><span>{c.phone}</span></div></div>
                      </div>
                    </div>
                  ))}</div>
                </div>
                {store.management.company && (
                  <div>
                    <h3 className="font-display text-xl font-bold text-ink-900 mb-4">Property Management</h3>
                    <div className="bg-sage-50 rounded-xl p-5 border border-sage-200"><h4 className="text-lg font-bold text-ink-900">{store.management.company}</h4><p className="text-sm text-sage-600 font-semibold">{store.management.contact}</p><div className="grid grid-cols-2 gap-3 mt-3 text-sm"><div><span className="text-ink-400">Phone:</span> <span className="text-ink-700">{store.management.phone}</span></div><div><span className="text-ink-400">Emergency:</span> <span className="text-red-600 font-semibold">{store.management.emergency}</span></div></div></div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── DOCUMENTS & INSURANCE ─── */}
        {tab === 'docs' && (
          <div className="space-y-4">
            <div className="flex gap-2 mb-2">
              {([['legal', 'Legal & Bylaws'], ['insurance', 'Insurance']] as [DocsSubTab, string][]).map(([id, label]) => (
                <button key={id} onClick={() => setDocsSubTab(id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${docsSubTab === id ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}>{label}</button>
              ))}
            </div>
            {docsSubTab === 'legal' && (
              <LegalBylawsTab
                store={store}
                isBoard={isBoard}
                openAdd={() => { resetForm(); setModal('addDoc'); }}
                openEdit={(id, data) => openEdit('editDoc', id, data)}
              />
            )}
            {docsSubTab === 'insurance' && (
              <InsuranceTab
                store={store}
                isBoard={isBoard}
                openAdd={() => { resetForm(); setModal('addIns'); }}
                openEdit={(id, data) => openEdit('editIns', id, data)}
              />
            )}
          </div>
        )}

        {/* ─── VENDORS & ASSETS ─── */}
        {tab === 'vendors' && (
          <div className="space-y-4">
            <div className="flex gap-2 mb-2">
              {([['vendors', 'Vendors'], ['assets', 'Assets']] as [VendorsSubTab, string][]).map(([id, label]) => (
                <button key={id} onClick={() => setVendorsSubTab(id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${vendorsSubTab === id ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}>{label}</button>
              ))}
            </div>
            {vendorsSubTab === 'vendors' && <VendorsTab />}
            {vendorsSubTab === 'assets' && (
              <AssetsTab
                store={store}
                isBoard={isBoard}
                openAdd={() => { resetForm(); setModal('addAsset'); }}
                openEdit={(id, data) => openEdit('editAsset', id, data)}
                openAddMaint={(assetId) => { resetForm(); setMaintAssetId(assetId); setModal('addMaint'); }}
                openEditMaint={(id, data) => openEdit('editMaint', id, data)}
                navigateToTab={() => setVendorsSubTab('vendors')}
              />
            )}
          </div>
        )}

        {/* ─── ASSOCIATION GUIDELINES ─── */}
        {tab === 'guidelines' && (
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap mb-2">
              {([
                ['roles', 'Who Does What'],
                ['bylaws', 'Bylaws & Governance'],
                ['fees', 'Fee Schedule'],
              ] as [GuidelinesSubTab, string][]).map(([id, label]) => (
                <button key={id} onClick={() => setGuidelinesSubTab(id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${guidelinesSubTab === id ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}>{label}</button>
              ))}
            </div>

            {guidelinesSubTab === 'bylaws' && (
              <div className="space-y-4">
                <h3 className="font-display text-xl font-bold text-ink-900">Bylaws & Governance Facts</h3>
                <p className="text-xs text-ink-500">These values come from your bylaws and are used for meeting scheduling, spending approvals, and compliance tracking. Edit them in the Building Details or through the relevant setting screens.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-white border border-ink-100 rounded-lg p-3"><p className="text-xs text-ink-500 mb-1">Spending Limit</p><p className="text-sm font-bold text-ink-900">$5,000</p></div>
                  <div className="bg-white border border-ink-100 rounded-lg p-3"><p className="text-xs text-ink-500 mb-1">Quorum</p><p className="text-sm font-bold text-ink-900">25%</p></div>
                  <div className="bg-white border border-ink-100 rounded-lg p-3"><p className="text-xs text-ink-500 mb-1">Fiscal Year Start</p><p className="text-sm font-bold text-ink-900">January</p></div>
                  <div className="bg-white border border-ink-100 rounded-lg p-3"><p className="text-xs text-ink-500 mb-1">Annual Meeting Month</p><p className="text-sm font-bold text-ink-900">April</p></div>
                  <div className="bg-white border border-ink-100 rounded-lg p-3"><p className="text-xs text-ink-500 mb-1">Meeting Cadence</p><p className="text-sm font-bold text-ink-900">Monthly</p></div>
                  <div className="bg-white border border-ink-100 rounded-lg p-3"><p className="text-xs text-ink-500 mb-1">Board Notice</p><p className="text-sm font-bold text-ink-900">48 hours</p></div>
                </div>
              </div>
            )}
            {guidelinesSubTab === 'fees' && <FeeScheduleTab />}
            {guidelinesSubTab === 'roles' && (
              <div>
                <div className="mb-4">
                  <h3 className="font-display text-lg font-bold text-ink-900">Who Does What</h3>
                  <p className="text-xs text-ink-400 mt-0.5">Board member responsibilities and task assignments</p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mb-4">
                  {(['president', 'vice_president', 'treasurer', 'secretary', 'member_at_large'] as BoardRoleKey[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setWhoDoesWhatRole(r)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                        whoDoesWhatRole === r
                          ? 'bg-navy text-white'
                          : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                      }`}
                    >
                      {BOARD_ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
                <RoleCharter roleKey={whoDoesWhatRole} readOnly />
              </div>
            )}
          </div>
        )}

        {/* ─── SETTINGS ─── */}
        {tab === 'settings' && (
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap mb-2">
              {([
                ['details', 'Building Details'],
                ['mailing', 'Mailing'],
              ] as [SettingsSubTab, string][]).map(([id, label]) => (
                <button key={id} onClick={() => setSettingsSubTab(id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${settingsSubTab === id ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}>{label}</button>
              ))}
            </div>

            {settingsSubTab === 'details' && (
              <div className="space-y-6">
                {/* Address */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-display text-xl font-bold text-ink-900">Building Address</h3>
                    <button onClick={() => { setForm({ street: store.address.street, city: store.address.city, state: store.address.state, zip: store.address.zip }); setModal('editAddress'); }} className="text-sm text-accent-600 font-medium hover:text-accent-700">Edit</button>
                  </div>
                  <div className="bg-mist-50 rounded-xl p-5 border border-mist-200">
                    <div className="bg-white rounded-lg p-3"><p className="text-xs text-ink-500 mb-1">Address</p><p className="text-sm font-bold text-ink-900">{store.address.street}, {store.address.city}, {store.address.state} {store.address.zip}</p></div>
                  </div>
                </div>
                {/* Building Details */}
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xl font-bold text-ink-900">Building Details</h3>
                  <button onClick={() => { setForm({ yearBuilt: store.details.yearBuilt, totalUnits: String(store.details.totalUnits), floors: String(store.details.floors), type: store.details.type, sqft: store.details.sqft, lotSize: store.details.lotSize, parking: store.details.parking, architect: store.details.architect, contractor: store.details.contractor, amenities: store.details.amenities.join(', '), entityType: store.details.entityType, fiscalYearEnd: store.details.fiscalYearEnd || '12-31' }); setModal('editDetails'); }} className="text-sm text-accent-600 font-medium hover:text-accent-700">Edit</button>
                </div>
                <div className="bg-mist-50 rounded-xl p-5 border border-mist-200">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{([['Year Built', store.details.yearBuilt], ['Units', store.details.totalUnits], ['Floors', store.details.floors], ['Type', store.details.type], ['Sq Footage', store.details.sqft], ['Lot Size', store.details.lotSize], ['Parking', store.details.parking], ['Entity', store.details.entityType === 'incorporated' ? 'Incorporated' : 'Unincorporated'], ['Fiscal Year End', (() => { const fye = store.details.fiscalYearEnd || '12-31'; const [m, d] = fye.split('-'); const dt = new Date(2000, parseInt(m) - 1, parseInt(d)); return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }); })()]] as [string, string|number][]).map(([label, val]) => (<div key={label} className="bg-white rounded-lg p-3"><p className="text-xs text-ink-500 mb-1">{label}</p><p className="text-sm font-bold text-ink-900">{val}</p></div>))}</div>
                </div>
                <div><p className="text-sm font-bold text-ink-900 mb-2">Building Team</p><p className="text-sm text-ink-500"><strong>Architect:</strong> {store.details.architect}</p><p className="text-sm text-ink-500"><strong>Contractor:</strong> {store.details.contractor}</p></div>
                <div><p className="text-sm font-bold text-ink-900 mb-2">Amenities</p><div className="flex flex-wrap gap-2">{store.details.amenities.map(a => <span key={a} className="px-3 py-1 bg-accent-100 text-accent-700 rounded-full text-xs font-medium">{a}</span>)}</div></div>
              </div>
            )}

            {settingsSubTab === 'mailing' && isBoard && <MailingSettingsTab />}
          </div>
        )}
      </div>

      {/* ─── MODALS ─── */}

      {(modal === 'addBoard' || modal === 'editBoard') && (<Modal title={modal === 'addBoard' ? 'Add Board Member' : 'Edit Board Member'} onClose={() => { setModal(null); resetForm(); }} onSave={() => { if (!f('name') || !f('role')) return; const data = { name: f('name'), role: f('role'), email: f('email'), phone: f('phone'), term: f('term') }; if (modal === 'addBoard') store.addBoardMember(data); else store.updateBoardMember(editId, data); setModal(null); resetForm(); }}><div className="space-y-3"><Field label="Full Name *" value={f('name')} onChange={v => sf('name', v)} placeholder="Jane Doe" /><div><label className="block text-xs font-medium text-ink-700 mb-1">Board Role *</label><select value={f('role')} onChange={e => sf('role', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="">Select...</option>{['President','Vice President','Treasurer','Secretary','Member at Large'].map(r => <option key={r}>{r}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><Field label="Email" value={f('email')} onChange={v => sf('email', v)} type="email" /><Field label="Phone" value={f('phone')} onChange={v => sf('phone', v)} /></div><Field label="Term" value={f('term')} onChange={v => sf('term', v)} placeholder="Jan 2025 - Dec 2026" /></div></Modal>)}

      {modal === 'editMgmt' && (<Modal title="Edit Property Management" onClose={() => { setModal(null); resetForm(); }} onSave={() => { store.updateManagement({ company: f('company'), contact: f('contact'), title: f('title'), email: f('email'), phone: f('phone'), emergency: f('emergency'), address: f('address'), hours: f('hours') }); setModal(null); resetForm(); }}><div className="space-y-3"><Field label="Company Name" value={f('company')} onChange={v => sf('company', v)} /><div className="grid grid-cols-2 gap-3"><Field label="Contact" value={f('contact')} onChange={v => sf('contact', v)} /><Field label="Title" value={f('title')} onChange={v => sf('title', v)} /></div><div className="grid grid-cols-2 gap-3"><Field label="Email" value={f('email')} onChange={v => sf('email', v)} type="email" /><Field label="Phone" value={f('phone')} onChange={v => sf('phone', v)} /></div><div className="grid grid-cols-2 gap-3"><Field label="Emergency" value={f('emergency')} onChange={v => sf('emergency', v)} /><Field label="Hours" value={f('hours')} onChange={v => sf('hours', v)} /></div><Field label="Address" value={f('address')} onChange={v => sf('address', v)} /></div></Modal>)}

      {(modal === 'addCounsel' || modal === 'editCounsel') && (<Modal title={modal === 'addCounsel' ? 'Add Legal Counsel' : 'Edit Legal Counsel'} onClose={() => { setModal(null); resetForm(); }} onSave={() => { if (!f('firm') || !f('attorney')) return; const data = { firm: f('firm'), attorney: f('attorney'), email: f('email'), phone: f('phone'), specialty: f('specialty') }; if (modal === 'addCounsel') store.addLegalCounsel(data); else store.updateLegalCounsel(editId, data); setModal(null); resetForm(); }}><div className="space-y-3"><Field label="Firm Name *" value={f('firm')} onChange={v => sf('firm', v)} /><Field label="Attorney *" value={f('attorney')} onChange={v => sf('attorney', v)} /><div className="grid grid-cols-2 gap-3"><Field label="Email" value={f('email')} onChange={v => sf('email', v)} type="email" /><Field label="Phone" value={f('phone')} onChange={v => sf('phone', v)} /></div><Field label="Specialty" value={f('specialty')} onChange={v => sf('specialty', v)} placeholder="HOA / Condominium Law" /></div></Modal>)}

      {modal === 'editAddress' && (<Modal title="Edit Building Address" onClose={() => { setModal(null); resetForm(); }} onSave={() => { store.updateAddress({ street: f('street'), city: f('city'), state: f('state'), zip: f('zip') }); setModal(null); resetForm(); }}><div className="space-y-3"><Field label="Street" value={f('street')} onChange={v => sf('street', v)} /><div className="grid grid-cols-3 gap-3"><Field label="City" value={f('city')} onChange={v => sf('city', v)} /><Field label="State" value={f('state')} onChange={v => sf('state', v)} /><Field label="ZIP" value={f('zip')} onChange={v => sf('zip', v)} /></div></div></Modal>)}

      {modal === 'editDetails' && (<Modal title="Edit Building Details" onClose={() => { setModal(null); resetForm(); }} onSave={() => { store.updateDetails({ yearBuilt: f('yearBuilt'), totalUnits: parseInt(f('totalUnits')) || 0, floors: parseInt(f('floors')) || 0, type: f('type'), sqft: f('sqft'), lotSize: f('lotSize'), parking: f('parking'), architect: f('architect'), contractor: f('contractor'), amenities: f('amenities').split(',').map(a => a.trim()).filter(Boolean), entityType: (f('entityType') || 'incorporated') as 'incorporated' | 'unincorporated', fiscalYearEnd: f('fiscalYearEnd') || '12-31' }); setModal(null); resetForm(); }}><div className="space-y-3"><div className="grid grid-cols-3 gap-3"><Field label="Year Built" value={f('yearBuilt')} onChange={v => sf('yearBuilt', v)} /><Field label="Total Units" value={f('totalUnits')} onChange={v => sf('totalUnits', v)} type="number" /><Field label="Floors" value={f('floors')} onChange={v => sf('floors', v)} type="number" /></div><div className="grid grid-cols-2 gap-3"><Field label="Type" value={f('type')} onChange={v => sf('type', v)} /><Field label="Sq Footage" value={f('sqft')} onChange={v => sf('sqft', v)} /></div><div className="grid grid-cols-2 gap-3"><Field label="Lot Size" value={f('lotSize')} onChange={v => sf('lotSize', v)} /><Field label="Parking" value={f('parking')} onChange={v => sf('parking', v)} /></div><div className="grid grid-cols-2 gap-3"><Field label="Architect" value={f('architect')} onChange={v => sf('architect', v)} /><Field label="Contractor" value={f('contractor')} onChange={v => sf('contractor', v)} /></div><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Entity Type</label><select value={f('entityType') || 'incorporated'} onChange={e => sf('entityType', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="incorporated">Incorporated</option><option value="unincorporated">Unincorporated</option></select></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Fiscal Year End</label><select value={f('fiscalYearEnd') || '12-31'} onChange={e => sf('fiscalYearEnd', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="01-31">January 31</option><option value="02-28">February 28</option><option value="03-31">March 31</option><option value="04-30">April 30</option><option value="05-31">May 31</option><option value="06-30">June 30</option><option value="07-31">July 31</option><option value="08-31">August 31</option><option value="09-30">September 30</option><option value="10-31">October 31</option><option value="11-30">November 30</option><option value="12-31">December 31</option></select></div></div><Field label="Amenities (comma-separated)" value={f('amenities')} onChange={v => sf('amenities', v)} /></div></Modal>)}

      {(modal === 'addDoc' || modal === 'editDoc') && (<Modal title={modal === 'addDoc' ? 'Add Document' : 'Edit Document'} onClose={() => { setModal(null); resetForm(); }} onSave={() => { if (!f('name')) return; const data = { name: f('name'), version: f('version'), size: f('size'), status: (f('status') || 'current') as 'current' | 'review-due' }; if (modal === 'addDoc') store.addLegalDocument(data); else store.updateLegalDocument(editId, data); setModal(null); resetForm(); }}><div className="space-y-3"><Field label="Document Name *" value={f('name')} onChange={v => sf('name', v)} /><div className="grid grid-cols-2 gap-3"><Field label="Version" value={f('version')} onChange={v => sf('version', v)} placeholder="1.0" /><Field label="File Size" value={f('size')} onChange={v => sf('size', v)} placeholder="1.2 MB" /></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Status</label><select value={f('status') || 'current'} onChange={e => sf('status', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="current">Current</option><option value="review-due">Review Due</option></select></div></div></Modal>)}

      {(modal === 'addIns' || modal === 'editIns') && (<Modal title={modal === 'addIns' ? 'Add Insurance Policy' : 'Edit Policy'} onClose={() => { setModal(null); resetForm(); }} onSave={() => { if (!f('type') || !f('carrier')) return; const data = { type: f('type'), carrier: f('carrier'), coverage: f('coverage'), premium: f('premium'), expires: f('expires'), policyNum: f('policyNum') }; if (modal === 'addIns') store.addInsurance(data); else store.updateInsurance(editId, data); setModal(null); resetForm(); }}><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><Field label="Policy Type *" value={f('type')} onChange={v => sf('type', v)} placeholder="General Liability" /><Field label="Policy #" value={f('policyNum')} onChange={v => sf('policyNum', v)} /></div><div className="grid grid-cols-2 gap-3"><Field label="Carrier *" value={f('carrier')} onChange={v => sf('carrier', v)} /><Field label="Coverage" value={f('coverage')} onChange={v => sf('coverage', v)} /></div><div className="grid grid-cols-2 gap-3"><Field label="Premium" value={f('premium')} onChange={v => sf('premium', v)} placeholder="$8,500/yr" /><Field label="Expires" value={f('expires')} onChange={v => sf('expires', v)} type="date" /></div></div></Modal>)}

      {(modal === 'addMaint' || modal === 'editMaint') && (<Modal title={modal === 'addMaint' ? 'Add Maintenance Task' : 'Edit Maintenance Task'} onClose={() => { setModal(null); resetForm(); setMaintAssetId(null); }} onSave={() => { if (!f('task') || !f('category')) return; const data = { task: f('task'), category: f('category'), frequency: f('frequency') || 'quarterly', vendor: f('vendor'), lastCompleted: f('lastCompleted'), nextDue: f('nextDue'), estimatedCost: f('estimatedCost'), notes: f('notes'), status: (f('status') || 'on-track') as 'on-track' | 'due-soon' | 'overdue' | 'completed' }; if (modal === 'addMaint') { store.addMaintenanceSchedule(data); if (maintAssetId) { const newMs = useBuildingStore.getState().maintenanceSchedules; const newMsId = newMs[newMs.length - 1]?.id; if (newMsId) store.linkScheduleToAsset(maintAssetId, newMsId); } } else { store.updateMaintenanceSchedule(editId, data); } setModal(null); resetForm(); setMaintAssetId(null); }}><div className="space-y-3"><Field label="Task Name *" value={f('task')} onChange={v => sf('task', v)} placeholder="HVAC Filter Replacement" /><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Category *</label><select value={f('category')} onChange={e => sf('category', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="">Select...</option>{['HVAC','Elevator','Fire Safety','Plumbing','Electrical','General'].map(c => <option key={c}>{c}</option>)}{store.details.amenities.filter(a => !['HVAC','Elevator','Fire Safety','Plumbing','Electrical','General'].some(b => b.toLowerCase() === a.toLowerCase())).map(a => <option key={a}>{a}</option>)}</select></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Frequency</label><select value={f('frequency') || 'quarterly'} onChange={e => sf('frequency', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="semi-annual">Semi-Annual</option><option value="annual">Annual</option></select></div></div><Field label="Vendor" value={f('vendor')} onChange={v => sf('vendor', v)} placeholder="Assigned vendor name" /><div className="grid grid-cols-2 gap-3"><Field label="Last Completed" value={f('lastCompleted')} onChange={v => sf('lastCompleted', v)} type="date" /><Field label="Next Due" value={f('nextDue')} onChange={v => sf('nextDue', v)} type="date" /></div><div className="grid grid-cols-2 gap-3"><Field label="Estimated Cost" value={f('estimatedCost')} onChange={v => sf('estimatedCost', v)} placeholder="$450" /><div><label className="block text-xs font-medium text-ink-700 mb-1">Status</label><select value={f('status') || 'on-track'} onChange={e => sf('status', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="on-track">On Track</option><option value="due-soon">Due Soon</option><option value="overdue">Overdue</option><option value="completed">Completed</option></select></div></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Notes</label><textarea value={f('notes')} onChange={e => sf('notes', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={2} placeholder="Additional details..." /></div></div></Modal>)}

      {(modal === 'addAsset' || modal === 'editAsset') && (<Modal title={modal === 'addAsset' ? 'Add Building Asset' : 'Edit Asset'} wide onClose={() => { setModal(null); resetForm(); }} onSave={() => { if (!f('name') || !f('category')) return; const data = { name: f('name'), category: f('category') as import('@/store/useBuildingStore').AssetCategory, location: f('location'), condition: (f('condition') || 'Good') as import('@/store/useBuildingStore').AssetCondition, installedDate: f('installedDate'), originalCost: parseFloat(f('originalCost')) || 0, usefulLifeYears: parseInt(f('usefulLifeYears')) || 20, remainingLifeYears: parseInt(f('remainingLifeYears')) || 20, replacementCostToday: parseFloat(f('replacementCostToday')) || 0, inflationRate: parseFloat(f('inflationRate')) || 3, criticality: f('criticality') || 'Medium', annualMaintenanceCost: parseFloat(f('annualMaintenanceCost')) || 0, annualOperatingCost: parseFloat(f('annualOperatingCost')) || 0, parentAssetId: f('parentAssetId') || null, reserveItemId: f('reserveItemId') || '', maintenanceScheduleIds: [], workOrderIds: [], vendorIds: [], insurancePolicyIds: [], amenityConfigId: '', glAccountNum: '', budgetCategoryId: f('budgetCategoryId') || '', spendingApprovalIds: [], conditionHistory: [], warranties: [], notes: f('notes'), insuredValue: parseFloat(f('insuredValue')) || 0 }; if (modal === 'addAsset') { store.addAsset(data); const maintCost = parseFloat(f('annualMaintenanceCost')) || 0; if (maintCost > 0) { const newAssets = useBuildingStore.getState().assets; const newAssetId = newAssets[newAssets.length - 1]?.id; if (newAssetId) { setPendingAutoMaintAssetId(newAssetId); setAutoMaintVendor(''); setModal('autoMaintVendor'); resetForm(); return; } } } else { store.updateAsset(editId, data); } setModal(null); resetForm(); }}><div className="space-y-3"><div className="border-b border-ink-100 pb-1"><h4 className="text-sm font-bold text-ink-800">Asset Identification</h4></div><Field label="Asset Name *" value={f('name')} onChange={v => sf('name', v)} placeholder="Pool & Deck Area" /><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Category *</label><select value={f('category')} onChange={e => sf('category', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="">Select...</option>{['Mechanical','Amenity','Safety','Technology','Common Area','Landscaping'].map(c => <option key={c}>{c}</option>)}</select></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Condition</label><select value={f('condition') || 'Good'} onChange={e => sf('condition', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="Excellent">Excellent</option><option value="Good">Good</option><option value="Fair">Fair</option><option value="Poor">Poor</option><option value="Critical">Critical</option></select></div></div><Field label="Location" value={f('location')} onChange={v => sf('location', v)} placeholder="Floor 1 - East Wing" /><div className="border-b border-ink-100 pb-1 mt-5"><h4 className="text-sm font-bold text-ink-800">Lifecycle & Valuation</h4></div><div className="grid grid-cols-2 gap-3"><Field label="Installed Date" value={f('installedDate')} onChange={v => sf('installedDate', v)} type="date" /><Field label="Original Cost ($)" value={f('originalCost')} onChange={v => sf('originalCost', v)} type="number" /></div><div className="grid grid-cols-3 gap-3"><Field label="Useful Life (yrs)" value={f('usefulLifeYears')} onChange={v => sf('usefulLifeYears', v)} type="number" /><Field label="Remaining Life (yrs)" value={f('remainingLifeYears')} onChange={v => sf('remainingLifeYears', v)} type="number" /><Field label="Replacement Cost ($)" value={f('replacementCostToday')} onChange={v => sf('replacementCostToday', v)} type="number" /></div><Field label="Inflation Rate (%)" value={f('inflationRate') || '3'} onChange={v => sf('inflationRate', v)} type="number" /><div className="border-b border-ink-100 pb-1 mt-5"><h4 className="text-sm font-bold text-ink-800">Financial</h4></div><div className="grid grid-cols-3 gap-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Criticality</label><select value={f('criticality') || 'Medium'} onChange={e => sf('criticality', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option><option value="Critical">Critical</option></select></div><Field label="Insured Value ($)" value={f('insuredValue')} onChange={v => sf('insuredValue', v)} type="number" /></div><div className="grid grid-cols-2 gap-3"><Field label="Annual Maintenance Budget ($)" value={f('annualMaintenanceCost')} onChange={v => sf('annualMaintenanceCost', v)} type="number" /><Field label="Est. Annual Operating Cost ($)" value={f('annualOperatingCost')} onChange={v => sf('annualOperatingCost', v)} type="number" /></div><div className="border-b border-ink-100 pb-1 mt-5"><h4 className="text-sm font-bold text-ink-800">Relationships</h4></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Parent Asset</label><select value={f('parentAssetId')} onChange={e => sf('parentAssetId', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="">None (top-level asset)</option>{store.assets.filter(a => !a.parentAssetId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Reserve Item</label><select value={f('reserveItemId')} onChange={e => sf('reserveItemId', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="">None</option>{finStore.reserveItems.map(r => <option key={r.id} value={r.id}>{r.name} ({fmt(r.estimatedCost)})</option>)}</select></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Budget Category</label><select value={f('budgetCategoryId')} onChange={e => sf('budgetCategoryId', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="">None</option>{finStore.budgetCategories.map(c => <option key={c.id} value={c.id}>{c.name} ({fmt(c.budgeted)})</option>)}</select></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Notes</label><textarea value={f('notes')} onChange={e => sf('notes', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={2} placeholder="Additional details..." /></div></div></Modal>)}

      {/* Auto-Maintenance Vendor Prompt */}
      {modal === 'autoMaintVendor' && pendingAutoMaintAssetId && (() => {
        const asset = store.assets.find(a => a.id === pendingAutoMaintAssetId);
        if (!asset) return null;
        const activeVendors = store.vendors.filter(v => v.status === 'active');
        const costFmt = '$' + asset.annualMaintenanceCost.toLocaleString();
        return (
          <Modal
            title="Create Maintenance Schedule"
            subtitle={`This asset has a maintenance budget of ${costFmt}/year. Create an annual schedule?`}
            onClose={() => { setModal(null); setPendingAutoMaintAssetId(null); setAutoMaintVendor(''); }}
            footer={
              <>
                <button onClick={() => { setModal(null); setPendingAutoMaintAssetId(null); setAutoMaintVendor(''); }} className="px-4 py-2 text-ink-700 hover:text-ink-900 font-medium">Skip</button>
                <button onClick={() => {
                  const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                  const vendorName = autoMaintVendor ? activeVendors.find(v => v.id === autoMaintVendor)?.name || '' : '';
                  store.addMaintenanceSchedule({
                    task: `Annual Maintenance - ${asset.name}`,
                    category: 'General',
                    frequency: 'annual',
                    vendor: vendorName,
                    lastCompleted: '',
                    nextDue: nextYear,
                    estimatedCost: costFmt,
                    notes: `Auto-created annual maintenance schedule for ${asset.name}`,
                    status: 'on-track',
                  });
                  const newMs = useBuildingStore.getState().maintenanceSchedules;
                  const newMsId = newMs[newMs.length - 1]?.id;
                  if (newMsId) store.linkScheduleToAsset(pendingAutoMaintAssetId, newMsId);
                  if (autoMaintVendor) {
                    const currentVendorIds = new Set(asset.vendorIds);
                    if (!currentVendorIds.has(autoMaintVendor)) {
                      store.updateAsset(pendingAutoMaintAssetId, { vendorIds: [...asset.vendorIds, autoMaintVendor] });
                    }
                  }
                  setModal(null);
                  setPendingAutoMaintAssetId(null);
                  setAutoMaintVendor('');
                }} className="px-6 py-2 bg-ink-900 text-white rounded-lg font-medium hover:bg-ink-800">Create Schedule</button>
              </>
            }
          >
            <div className="space-y-3">
              <div className="bg-mist-50 border border-mist-200 rounded-lg p-3">
                <p className="text-sm text-ink-700"><strong>{asset.name}</strong></p>
                <p className="text-xs text-ink-500 mt-1">Annual maintenance budget: <strong className="text-ink-700">{costFmt}</strong></p>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Assign Vendor (optional)</label>
                <select value={autoMaintVendor} onChange={e => setAutoMaintVendor(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                  <option value="">No vendor</option>
                  {activeVendors.map(v => <option key={v.id} value={v.id}>{v.name} - {v.service}</option>)}
                </select>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
