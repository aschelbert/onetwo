import { useState } from 'react';
import { useTabParam } from '@/hooks/useTabParam';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { getInitials } from '@/lib/formatters';
import Modal from '@/components/ui/Modal';
import TheUnitsTab from './tabs/TheUnitsTab';
import LegalBylawsTab from './tabs/LegalBylawsTab';
import InsuranceTab from './tabs/InsuranceTab';
import VendorsTab from './tabs/VendorsTab';

import MailingSettingsTab from './tabs/MailingSettingsTab';
import FeeScheduleTab from './tabs/FeeScheduleTab';

const TABS = ['details','contacts','units','legal','insurance','vendors','fees','mailing'] as const;
const TAB_LABELS: Record<string, string> = { details:'Building Details', contacts:'Contacts', units:'The Units', legal:'Legal & Bylaws', insurance:'Insurance', vendors:'Vendors', fees:'Fee Schedule', mailing:'Mailing' };

function Field({ label, value, onChange, type = 'text', placeholder = '' }: { label: string; value: string; onChange: (val: string) => void; type?: string; placeholder?: string }) {
  return (
    <div><label className="block text-xs font-medium text-ink-700 mb-1">{label}</label><input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder={placeholder} /></div>
  );
}

type ModalState = null | 'addBoard' | 'editBoard' | 'editMgmt' | 'addCounsel' | 'editCounsel' | 'editAddress' | 'editDetails' | 'addDoc' | 'editDoc' | 'addIns' | 'editIns' | 'addVendor' | 'editVendor';

export default function BuildingPage() {
  const store = useBuildingStore();
  const { currentRole } = useAuthStore();
  const finStore = useFinancialStore();
  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';
  const [tab, setTab] = useTabParam<typeof TABS[number]>('tab', 'details', [...TABS]);
  const visibleTabs = isBoard ? TABS : TABS.filter(t => t !== 'units' && t !== 'mailing');
  const [modal, setModal] = useState<ModalState>(null);
  const [editId, setEditId] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});
  const f = (key: string) => form[key] || '';
  const sf = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));
  const resetForm = () => setForm({});
  const openEdit = (type: ModalState, id: string, data: Record<string, string>) => { setEditId(id); setForm(data); setModal(type); };

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
  const hc = overallHealth >= 80 ? 'sage' : overallHealth >= 60 ? 'yellow' : 'red';

  return (
    <div className="space-y-0">
      {/* Building header — dark gradient, rounded-t only */}
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-t-xl p-8 text-white shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold">🏢 {store.name}</h2>
            <p className="text-accent-200 text-sm mt-1">{store.address.street}, {store.address.city}, {store.address.state} {store.address.zip}</p>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-white">{hGrade}</div>
            <div className="text-accent-200 text-xs">Health {overallHealth}%</div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[
            { label: 'Legal & Bylaws', score: legalScore, detail: `${currentDocs}/${totalDocs}`, tab: 'legal' as typeof TABS[number] },
            { label: 'Insurance', score: insScore, detail: `${activePolicies}/${totalPolicies}`, tab: 'insurance' as typeof TABS[number] },
            { label: 'Governance', score: govScore, detail: `Board ${store.board.length}`, tab: 'contacts' as typeof TABS[number] },
            (() => {
              const occupiedUnits = finStore.units;
              const delinqUnits = occupiedUnits.filter(u => u.balance > 0);
              const delinqRate = occupiedUnits.length > 0 ? Math.round((delinqUnits.length / occupiedUnits.length) * 100) : 0;
              return { label: 'Delinquency Rate', score: 100 - delinqRate, detail: `${delinqUnits.length}/${occupiedUnits.length} units`, tab: 'units' as typeof TABS[number], displayScore: delinqRate };
            })(),
          ].map(m => (
            <div key={m.label} className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 text-center cursor-pointer hover:bg-opacity-20" onClick={() => setTab(m.tab)}>
              <p className="text-[11px] text-accent-100 leading-tight">{m.label}</p>
              <p className={`text-sm font-bold mt-1 ${m.label === 'Delinquency Rate' ? ((m as any).displayScore <= 10 ? 'text-green-300' : (m as any).displayScore <= 25 ? 'text-yellow-300' : 'text-red-300') : (m.score >= 80 ? 'text-green-300' : m.score >= 60 ? 'text-yellow-300' : 'text-red-300')}`}>{m.label === 'Delinquency Rate' ? `${(m as any).displayScore}%` : `${m.score}%`}</p>
              <p className="text-[10px] text-accent-300">{m.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tab Nav */}
      <div className="bg-white border-x border-ink-100 border-b overflow-x-auto">
        <div className="flex min-w-max px-4">
          {visibleTabs.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-400 hover:text-ink-700'}`}>{TAB_LABELS[t]}</button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-b-xl border-x border-b border-ink-100 p-6">
          {/* CONTACTS */}
          {tab === 'contacts' && (<div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4"><h3 className="font-display text-xl font-bold text-ink-900">Board of Directors</h3><button onClick={() => { resetForm(); setModal('addBoard'); }} className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium">+ Add Member</button></div>
              <div className="space-y-3">{store.board.map(c => (
                <div key={c.id} className="bg-accent-50 rounded-xl p-5 border border-accent-200 hover:shadow-sm transition-all">
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-full bg-ink-900 flex items-center justify-center shrink-0"><span className="text-white font-bold text-lg">{getInitials(c.name)}</span></div>
                    <div className="flex-1"><h4 className="text-lg font-bold text-ink-900">{c.name}</h4><p className="text-sm text-accent-600 font-semibold">{c.role}</p><p className="text-xs text-ink-500">Term: {c.term}</p><div className="flex gap-4 mt-2 text-sm text-ink-700"><span>✉ {c.email}</span><span>☎ {c.phone}</span></div></div>
                    <div className="flex gap-2"><button onClick={() => openEdit('editBoard', c.id, { name: c.name, role: c.role, email: c.email, phone: c.phone, term: c.term })} className="text-xs text-accent-600 hover:text-accent-700 font-medium">Edit</button><button onClick={() => { if (confirm(`Remove ${c.name}?`)) store.removeBoardMember(c.id); }} className="text-xs text-red-400 hover:text-red-600">Remove</button></div>
                  </div>
                </div>
              ))}</div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-4"><h3 className="font-display text-xl font-bold text-ink-900">Property Management</h3><button onClick={() => { setForm({ company: store.management.company, contact: store.management.contact, title: store.management.title, email: store.management.email, phone: store.management.phone, emergency: store.management.emergency, address: store.management.address, hours: store.management.hours }); setModal('editMgmt'); }} className="text-sm text-accent-600 font-medium hover:text-accent-700">Edit</button></div>
              <div className="bg-sage-50 rounded-xl p-5 border border-sage-200"><h4 className="text-lg font-bold text-ink-900">{store.management.company}</h4><p className="text-sm text-sage-600 font-semibold">{store.management.contact} — {store.management.title}</p><div className="grid grid-cols-2 gap-3 mt-3 text-sm"><div><span className="text-ink-400">Email:</span> <span className="text-ink-700">{store.management.email}</span></div><div><span className="text-ink-400">Phone:</span> <span className="text-ink-700">{store.management.phone}</span></div><div><span className="text-ink-400">Emergency:</span> <span className="text-red-600 font-semibold">{store.management.emergency}</span></div><div><span className="text-ink-400">Hours:</span> <span className="text-ink-700">{store.management.hours}</span></div></div></div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-4"><h3 className="font-display text-xl font-bold text-ink-900">Legal Counsel</h3><button onClick={() => { resetForm(); setModal('addCounsel'); }} className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium">+ Add Counsel</button></div>
              {store.legalCounsel.map(c => (<div key={c.id} className="bg-mist-50 rounded-xl p-5 border border-mist-200 mb-3"><div className="flex items-center justify-between"><div><h4 className="text-lg font-bold text-ink-900">{c.firm}</h4><p className="text-sm text-ink-600">{c.attorney} · {c.specialty}</p><div className="flex gap-4 mt-2 text-sm text-ink-700"><span>✉ {c.email}</span><span>☎ {c.phone}</span></div></div><div className="flex gap-2"><button onClick={() => openEdit('editCounsel', c.id, { firm: c.firm, attorney: c.attorney, email: c.email, phone: c.phone, specialty: c.specialty })} className="text-xs text-accent-600 font-medium">Edit</button><button onClick={() => { if (confirm('Remove?')) store.removeLegalCounsel(c.id); }} className="text-xs text-red-400 hover:text-red-600">Remove</button></div></div></div>))}
            </div>
          </div>)}

          {/* THE UNITS (combined units + payments) */}
          {tab === 'units' && isBoard && <TheUnitsTab />}
          {tab === 'details' && (<div className="space-y-6">
            <div className="bg-mist-50 rounded-xl p-5 border border-mist-200">
              <div className="flex items-center justify-between mb-4"><h3 className="font-display text-xl font-bold text-ink-900">Property Details</h3><div className="flex gap-2"><button onClick={() => { setForm({ street: store.address.street, city: store.address.city, state: store.address.state, zip: store.address.zip }); setModal('editAddress'); }} className="text-sm text-accent-600 font-medium">Edit Address</button><button onClick={() => { setForm({ yearBuilt: store.details.yearBuilt, totalUnits: String(store.details.totalUnits), floors: String(store.details.floors), type: store.details.type, sqft: store.details.sqft, lotSize: store.details.lotSize, parking: store.details.parking, architect: store.details.architect, contractor: store.details.contractor, amenities: store.details.amenities.join(', '), entityType: store.details.entityType, fiscalYearEnd: store.details.fiscalYearEnd || '12-31' }); setModal('editDetails'); }} className="text-sm text-accent-600 font-medium">Edit Details</button></div></div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{([['Year Built', store.details.yearBuilt], ['Units', store.details.totalUnits], ['Floors', store.details.floors], ['Type', store.details.type], ['Sq Footage', store.details.sqft], ['Lot Size', store.details.lotSize], ['Parking', store.details.parking], ['Entity', store.details.entityType === 'incorporated' ? 'Incorporated' : 'Unincorporated'], ['Fiscal Year End', (() => { const fye = store.details.fiscalYearEnd || '12-31'; const [m, d] = fye.split('-'); const dt = new Date(2000, parseInt(m) - 1, parseInt(d)); return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }); })()]] as [string, string|number][]).map(([label, val]) => (<div key={label} className="bg-white rounded-lg p-3"><p className="text-xs text-ink-500 mb-1">{label}</p><p className="text-sm font-bold text-ink-900">{val}</p></div>))}</div>
            </div>
            <div><p className="text-sm font-bold text-ink-900 mb-2">Building Team</p><p className="text-sm text-ink-500"><strong>Architect:</strong> {store.details.architect}</p><p className="text-sm text-ink-500"><strong>Contractor:</strong> {store.details.contractor}</p></div>
            <div><p className="text-sm font-bold text-ink-900 mb-2">Amenities</p><div className="flex flex-wrap gap-2">{store.details.amenities.map(a => <span key={a} className="px-3 py-1 bg-accent-100 text-accent-700 rounded-full text-xs font-medium">✓ {a}</span>)}</div></div>
          </div>)}

          {/* LEGAL */}
          {tab === 'legal' && (
            <LegalBylawsTab
              store={store}
              isBoard={isBoard}
              openAdd={() => { resetForm(); setModal('addDoc'); }}
              openEdit={(id, data) => openEdit('editDoc', id, data)}
            />
          )}

          {/* INSURANCE */}
          {tab === 'insurance' && (
            <InsuranceTab
              store={store}
              isBoard={isBoard}
              openAdd={() => { resetForm(); setModal('addIns'); }}
              openEdit={(id, data) => openEdit('editIns', id, data)}
            />
          )}

          {/* VENDORS */}
          {tab === 'vendors' && <VendorsTab />}

          {/* FEE SCHEDULE */}
          {tab === 'fees' && <FeeScheduleTab />}

          {/* MAILING */}
          {tab === 'mailing' && isBoard && <MailingSettingsTab />}
        </div>

      {/* MODALS */}
      {(modal === 'addBoard' || modal === 'editBoard') && (<Modal title={modal === 'addBoard' ? 'Add Board Member' : 'Edit Board Member'} onClose={() => { setModal(null); resetForm(); }} onSave={() => { if (!f('name') || !f('role')) { alert('Name and role required'); return; } const data = { name: f('name'), role: f('role'), email: f('email'), phone: f('phone'), term: f('term') }; if (modal === 'addBoard') store.addBoardMember(data); else store.updateBoardMember(editId, data); setModal(null); resetForm(); }}><div className="space-y-3"><Field label="Full Name *" value={f('name')} onChange={v => sf('name', v)} placeholder="Jane Doe" /><div><label className="block text-xs font-medium text-ink-700 mb-1">Board Role *</label><select value={f('role')} onChange={e => sf('role', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="">Select...</option>{['President','Vice President','Treasurer','Secretary','Member at Large'].map(r => <option key={r}>{r}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><Field label="Email" value={f('email')} onChange={v => sf('email', v)} type="email" /><Field label="Phone" value={f('phone')} onChange={v => sf('phone', v)} /></div><Field label="Term" value={f('term')} onChange={v => sf('term', v)} placeholder="Jan 2025 – Dec 2026" /></div></Modal>)}

      {modal === 'editMgmt' && (<Modal title="Edit Property Management" onClose={() => { setModal(null); resetForm(); }} onSave={() => { store.updateManagement({ company: f('company'), contact: f('contact'), title: f('title'), email: f('email'), phone: f('phone'), emergency: f('emergency'), address: f('address'), hours: f('hours') }); setModal(null); resetForm(); }}><div className="space-y-3"><Field label="Company Name" value={f('company')} onChange={v => sf('company', v)} /><div className="grid grid-cols-2 gap-3"><Field label="Contact" value={f('contact')} onChange={v => sf('contact', v)} /><Field label="Title" value={f('title')} onChange={v => sf('title', v)} /></div><div className="grid grid-cols-2 gap-3"><Field label="Email" value={f('email')} onChange={v => sf('email', v)} type="email" /><Field label="Phone" value={f('phone')} onChange={v => sf('phone', v)} /></div><div className="grid grid-cols-2 gap-3"><Field label="Emergency" value={f('emergency')} onChange={v => sf('emergency', v)} /><Field label="Hours" value={f('hours')} onChange={v => sf('hours', v)} /></div><Field label="Address" value={f('address')} onChange={v => sf('address', v)} /></div></Modal>)}

      {(modal === 'addCounsel' || modal === 'editCounsel') && (<Modal title={modal === 'addCounsel' ? 'Add Legal Counsel' : 'Edit Legal Counsel'} onClose={() => { setModal(null); resetForm(); }} onSave={() => { if (!f('firm') || !f('attorney')) { alert('Firm and attorney required'); return; } const data = { firm: f('firm'), attorney: f('attorney'), email: f('email'), phone: f('phone'), specialty: f('specialty') }; if (modal === 'addCounsel') store.addLegalCounsel(data); else store.updateLegalCounsel(editId, data); setModal(null); resetForm(); }}><div className="space-y-3"><Field label="Firm Name *" value={f('firm')} onChange={v => sf('firm', v)} /><Field label="Attorney *" value={f('attorney')} onChange={v => sf('attorney', v)} /><div className="grid grid-cols-2 gap-3"><Field label="Email" value={f('email')} onChange={v => sf('email', v)} type="email" /><Field label="Phone" value={f('phone')} onChange={v => sf('phone', v)} /></div><Field label="Specialty" value={f('specialty')} onChange={v => sf('specialty', v)} placeholder="HOA / Condominium Law" /></div></Modal>)}

      {modal === 'editAddress' && (<Modal title="Edit Building Address" onClose={() => { setModal(null); resetForm(); }} onSave={() => { store.updateAddress({ street: f('street'), city: f('city'), state: f('state'), zip: f('zip') }); setModal(null); resetForm(); }}><div className="space-y-3"><Field label="Street" value={f('street')} onChange={v => sf('street', v)} /><div className="grid grid-cols-3 gap-3"><Field label="City" value={f('city')} onChange={v => sf('city', v)} /><Field label="State" value={f('state')} onChange={v => sf('state', v)} /><Field label="ZIP" value={f('zip')} onChange={v => sf('zip', v)} /></div></div></Modal>)}

      {modal === 'editDetails' && (<Modal title="Edit Building Details" onClose={() => { setModal(null); resetForm(); }} onSave={() => { store.updateDetails({ yearBuilt: f('yearBuilt'), totalUnits: parseInt(f('totalUnits')) || 0, floors: parseInt(f('floors')) || 0, type: f('type'), sqft: f('sqft'), lotSize: f('lotSize'), parking: f('parking'), architect: f('architect'), contractor: f('contractor'), amenities: f('amenities').split(',').map(a => a.trim()).filter(Boolean), entityType: (f('entityType') || 'incorporated') as 'incorporated' | 'unincorporated', fiscalYearEnd: f('fiscalYearEnd') || '12-31' }); setModal(null); resetForm(); }}><div className="space-y-3"><div className="grid grid-cols-3 gap-3"><Field label="Year Built" value={f('yearBuilt')} onChange={v => sf('yearBuilt', v)} /><Field label="Total Units" value={f('totalUnits')} onChange={v => sf('totalUnits', v)} type="number" /><Field label="Floors" value={f('floors')} onChange={v => sf('floors', v)} type="number" /></div><div className="grid grid-cols-2 gap-3"><Field label="Type" value={f('type')} onChange={v => sf('type', v)} /><Field label="Sq Footage" value={f('sqft')} onChange={v => sf('sqft', v)} /></div><div className="grid grid-cols-2 gap-3"><Field label="Lot Size" value={f('lotSize')} onChange={v => sf('lotSize', v)} /><Field label="Parking" value={f('parking')} onChange={v => sf('parking', v)} /></div><div className="grid grid-cols-2 gap-3"><Field label="Architect" value={f('architect')} onChange={v => sf('architect', v)} /><Field label="Contractor" value={f('contractor')} onChange={v => sf('contractor', v)} /></div><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Entity Type</label><select value={f('entityType') || 'incorporated'} onChange={e => sf('entityType', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="incorporated">Incorporated</option><option value="unincorporated">Unincorporated</option></select></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Fiscal Year End</label><select value={f('fiscalYearEnd') || '12-31'} onChange={e => sf('fiscalYearEnd', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="01-31">January 31</option><option value="02-28">February 28</option><option value="03-31">March 31</option><option value="04-30">April 30</option><option value="05-31">May 31</option><option value="06-30">June 30</option><option value="07-31">July 31</option><option value="08-31">August 31</option><option value="09-30">September 30</option><option value="10-31">October 31</option><option value="11-30">November 30</option><option value="12-31">December 31</option></select></div></div><Field label="Amenities (comma-separated)" value={f('amenities')} onChange={v => sf('amenities', v)} /></div></Modal>)}

      {(modal === 'addDoc' || modal === 'editDoc') && (<Modal title={modal === 'addDoc' ? 'Add Document' : 'Edit Document'} onClose={() => { setModal(null); resetForm(); }} onSave={() => { if (!f('name')) { alert('Name required'); return; } const data = { name: f('name'), version: f('version'), size: f('size'), status: (f('status') || 'current') as 'current' | 'review-due' }; if (modal === 'addDoc') store.addLegalDocument(data); else store.updateLegalDocument(editId, data); setModal(null); resetForm(); }}><div className="space-y-3"><Field label="Document Name *" value={f('name')} onChange={v => sf('name', v)} /><div className="grid grid-cols-2 gap-3"><Field label="Version" value={f('version')} onChange={v => sf('version', v)} placeholder="1.0" /><Field label="File Size" value={f('size')} onChange={v => sf('size', v)} placeholder="1.2 MB" /></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Status</label><select value={f('status') || 'current'} onChange={e => sf('status', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="current">Current</option><option value="review-due">Review Due</option></select></div>{modal === 'editDoc' && (() => { const doc = store.legalDocuments.find(d => d.id === editId); if (!doc) return null; return (<div className="border-t pt-3"><label className="block text-xs font-medium text-ink-700 mb-2">Attachments</label>{doc.attachments.length > 0 && (<div className="space-y-1.5 mb-2">{doc.attachments.map((att, i) => (<div key={i} className="flex items-center justify-between py-1.5 px-3 bg-mist-50 border border-mist-100 rounded-lg"><div className="flex items-center gap-2"><span className="text-accent-500 text-sm">📎</span><span className="text-xs font-medium text-ink-700">{att.name}</span><span className="text-[10px] text-ink-400">{att.size} · {att.uploadedAt}</span></div><button type="button" onClick={() => store.removeLegalDocAttachment(editId, i)} className="text-[10px] text-red-400 hover:text-red-600">Remove</button></div>))}</div>)}<button type="button" onClick={() => { const name = prompt('File name (e.g., Bylaws_v3.pdf):'); if (name) { const size = prompt('File size (e.g., 2.4 MB):') || '1.0 MB'; store.addLegalDocAttachment(editId, { name, size, type: 'application/pdf' }); } }} className="w-full py-2 border-2 border-dashed border-ink-200 rounded-lg text-xs text-ink-500 hover:border-accent-300 hover:text-accent-600">+ Attach File</button></div>); })()}</div></Modal>)}

      {(modal === 'addIns' || modal === 'editIns') && (<Modal title={modal === 'addIns' ? 'Add Insurance Policy' : 'Edit Policy'} onClose={() => { setModal(null); resetForm(); }} onSave={() => { if (!f('type') || !f('carrier')) { alert('Type and carrier required'); return; } const data = { type: f('type'), carrier: f('carrier'), coverage: f('coverage'), premium: f('premium'), expires: f('expires'), policyNum: f('policyNum') }; if (modal === 'addIns') store.addInsurance(data); else store.updateInsurance(editId, data); setModal(null); resetForm(); }}><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><Field label="Policy Type *" value={f('type')} onChange={v => sf('type', v)} placeholder="General Liability" /><Field label="Policy #" value={f('policyNum')} onChange={v => sf('policyNum', v)} /></div><div className="grid grid-cols-2 gap-3"><Field label="Carrier *" value={f('carrier')} onChange={v => sf('carrier', v)} /><Field label="Coverage" value={f('coverage')} onChange={v => sf('coverage', v)} /></div><div className="grid grid-cols-2 gap-3"><Field label="Premium" value={f('premium')} onChange={v => sf('premium', v)} placeholder="$8,500/yr" /><Field label="Expires" value={f('expires')} onChange={v => sf('expires', v)} type="date" /></div>{modal === 'editIns' && (() => { const pol = store.insurance.find(p => p.id === editId); if (!pol) return null; return (<div className="border-t pt-3"><label className="block text-xs font-medium text-ink-700 mb-2">Policy Documents</label>{pol.attachments.length > 0 && (<div className="space-y-1.5 mb-2">{pol.attachments.map((att, i) => (<div key={i} className="flex items-center justify-between py-1.5 px-3 bg-mist-50 border border-mist-100 rounded-lg"><div className="flex items-center gap-2"><span className="text-accent-500 text-sm">📎</span><span className="text-xs font-medium text-ink-700">{att.name}</span><span className="text-[10px] text-ink-400">{att.size} · {att.uploadedAt}</span></div><button type="button" onClick={() => store.removeInsuranceAttachment(editId, i)} className="text-[10px] text-red-400 hover:text-red-600">Remove</button></div>))}</div>)}<button type="button" onClick={() => { const name = prompt('File name (e.g., GL_Policy_2026.pdf):'); if (name) { const size = prompt('File size (e.g., 2.1 MB):') || '1.0 MB'; store.addInsuranceAttachment(editId, { name, size, type: 'application/pdf' }); } }} className="w-full py-2 border-2 border-dashed border-ink-200 rounded-lg text-xs text-ink-500 hover:border-accent-300 hover:text-accent-600">+ Attach Policy Document</button></div>); })()}</div></Modal>)}

      {(modal === 'addVendor' || modal === 'editVendor') && (<Modal title={modal === 'addVendor' ? 'Add Vendor' : 'Edit Vendor'} onClose={() => { setModal(null); resetForm(); }} onSave={() => { if (!f('name') || !f('service')) { alert('Name and service required'); return; } if (modal === 'addVendor') store.addVendor({ name: f('name'), service: f('service'), contact: f('contact'), phone: f('phone'), email: f('email'), contract: f('contract'), status: 'active' }); else store.updateVendor(editId, { name: f('name'), service: f('service'), contact: f('contact'), phone: f('phone'), email: f('email'), contract: f('contract') }); setModal(null); resetForm(); }}><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><Field label="Company Name *" value={f('name')} onChange={v => sf('name', v)} /><Field label="Service *" value={f('service')} onChange={v => sf('service', v)} placeholder="Plumbing" /></div><div className="grid grid-cols-2 gap-3"><Field label="Contact Person" value={f('contact')} onChange={v => sf('contact', v)} /><Field label="Phone" value={f('phone')} onChange={v => sf('phone', v)} /></div><div className="grid grid-cols-2 gap-3"><Field label="Email" value={f('email')} onChange={v => sf('email', v)} type="email" /><Field label="Contract" value={f('contract')} onChange={v => sf('contract', v)} placeholder="On-call" /></div></div></Modal>)}
    </div>
  );
}

