import { useState } from 'react';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { getInitials } from '@/lib/formatters';
import Modal from '@/components/ui/Modal';
import UnitsManager from './tabs/UnitsManager';
import LegalBylawsTab from './tabs/LegalBylawsTab';
import InsuranceTab from './tabs/InsuranceTab';
import PaymentsManager from './tabs/PaymentsManager';

const TABS = ['details','contacts','units','payments','legal','insurance','vendors'] as const;
const TAB_LABELS: Record<string, string> = { details:'Building Details', contacts:'Contacts', units:'Units', payments:'Payments', legal:'Legal & Bylaws', insurance:'Insurance', vendors:'Vendors' };

type ModalState = null | 'addBoard' | 'editBoard' | 'editMgmt' | 'addCounsel' | 'editCounsel' | 'editAddress' | 'editDetails' | 'addDoc' | 'editDoc' | 'addIns' | 'editIns' | 'addVendor' | 'editVendor';

export default function BuildingPage() {
  const store = useBuildingStore();
  const { currentRole } = useAuthStore();
  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';
  const [tab, setTab] = useState<typeof TABS[number]>('details');
  const visibleTabs = isBoard ? TABS : TABS.filter(t => !['units','payments'].includes(t));
  const [modal, setModal] = useState<ModalState>(null);
  const [editId, setEditId] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});
  const f = (key: string) => form[key] || '';
  const sf = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));
  const resetForm = () => setForm({});
  const openEdit = (type: ModalState, id: string, data: Record<string, string>) => { setEditId(id); setForm(data); setModal(type); };

  const Field = ({ label, k, type = 'text', placeholder = '' }: { label: string; k: string; type?: string; placeholder?: string }) => (
    <div><label className="block text-xs font-medium text-ink-700 mb-1">{label}</label><input type={type} value={f(k)} onChange={e => sf(k, e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder={placeholder} /></div>
  );

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
            { label: 'Legal & Bylaws', score: legalScore, detail: `${currentDocs}/${totalDocs} current`, tab: 'legal' as typeof TABS[number] },
            { label: 'Insurance', score: insScore, detail: `${activePolicies}/${totalPolicies} active`, tab: 'insurance' as typeof TABS[number] },
            { label: 'Governance', score: govScore, detail: `Board ${store.board.length} · Vendors ${store.vendors.filter(v => v.status === 'active').length}`, tab: 'contacts' as typeof TABS[number] },
            { label: 'Documentation', score: totalDocs > 0 ? Math.round(((docsWithFiles + policiesWithDocs) / (totalDocs + totalPolicies)) * 100) : 0, detail: `${docsWithFiles + policiesWithDocs}/${totalDocs + totalPolicies} have files`, tab: 'legal' as typeof TABS[number] },
          ].map(m => (
            <div key={m.label} className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 cursor-pointer hover:bg-opacity-20" onClick={() => setTab(m.tab)}>
              <p className="text-xs text-accent-200 font-medium">{m.label}</p>
              <p className={`text-lg font-bold ${m.score >= 80 ? 'text-green-300' : m.score >= 60 ? 'text-yellow-300' : 'text-red-300'}`}>{m.score}%</p>
              <div className="mt-1.5 h-1.5 bg-white bg-opacity-20 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${m.score >= 80 ? 'bg-green-400' : m.score >= 60 ? 'bg-yellow-400' : 'bg-red-400'}`} style={{ width: `${m.score}%` }} />
              </div>
              <p className="text-[10px] text-accent-300 mt-1">{m.detail}</p>
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

          {/* UNITS */}
          {tab === 'units' && <UnitsManager />}

          {/* DETAILS */}
          {tab === 'details' && (<div className="space-y-6">
            <div className="bg-mist-50 rounded-xl p-5 border border-mist-200">
              <div className="flex items-center justify-between mb-4"><h3 className="font-display text-xl font-bold text-ink-900">Property Details</h3><div className="flex gap-2"><button onClick={() => { setForm({ street: store.address.street, city: store.address.city, state: store.address.state, zip: store.address.zip }); setModal('editAddress'); }} className="text-sm text-accent-600 font-medium">Edit Address</button><button onClick={() => { setForm({ yearBuilt: store.details.yearBuilt, totalUnits: String(store.details.totalUnits), floors: String(store.details.floors), type: store.details.type, sqft: store.details.sqft, lotSize: store.details.lotSize, parking: store.details.parking, architect: store.details.architect, contractor: store.details.contractor, amenities: store.details.amenities.join(', ') }); setModal('editDetails'); }} className="text-sm text-accent-600 font-medium">Edit Details</button></div></div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{([['Year Built', store.details.yearBuilt], ['Units', store.details.totalUnits], ['Floors', store.details.floors], ['Type', store.details.type], ['Sq Footage', store.details.sqft], ['Lot Size', store.details.lotSize], ['Parking', store.details.parking]] as [string, string|number][]).map(([label, val]) => (<div key={label} className="bg-white rounded-lg p-3"><p className="text-xs text-ink-500 mb-1">{label}</p><p className="text-sm font-bold text-ink-900">{val}</p></div>))}</div>
            </div>
            <div><p className="text-sm font-bold text-ink-900 mb-2">Building Team</p><p className="text-sm text-ink-500"><strong>Architect:</strong> {store.details.architect}</p><p className="text-sm text-ink-500"><strong>Contractor:</strong> {store.details.contractor}</p></div>
            <div><p className="text-sm font-bold text-ink-900 mb-2">Amenities</p><div className="flex flex-wrap gap-2">{store.details.amenities.map(a => <span key={a} className="px-3 py-1 bg-accent-100 text-accent-700 rounded-full text-xs font-medium">✓ {a}</span>)}</div></div>
          </div>)}

          {/* PAYMENTS (board/mgmt only) */}
          {tab === 'payments' && isBoard && <PaymentsManager />}

          {/* LEGAL */}
          {tab === 'legal' && (
            <LegalBylawsTab
              store={store}
              openAdd={() => { resetForm(); setModal('addDoc'); }}
              openEdit={(id, data) => openEdit('editDoc', id, data)}
            />
          )}

          {/* INSURANCE */}
          {tab === 'insurance' && (
            <InsuranceTab
              store={store}
              openAdd={() => { resetForm(); setModal('addIns'); }}
              openEdit={(id, data) => openEdit('editIns', id, data)}
            />
          )}

          {/* VENDORS */}
          {tab === 'vendors' && (<div className="space-y-3">
            <div className="flex items-center justify-between mb-4"><h3 className="font-display text-xl font-bold text-ink-900">Preferred Vendors</h3><button onClick={() => { resetForm(); setModal('addVendor'); }} className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium">+ Add Vendor</button></div>
            {store.vendors.map(v => (<div key={v.id} className={`bg-white border rounded-xl p-4 hover:shadow-sm transition-all ${v.status === 'inactive' ? 'opacity-50 border-ink-100' : 'border-ink-100'}`}><div className="flex items-center justify-between"><div><div className="flex items-center gap-2"><h4 className="font-bold text-ink-900">{v.name}</h4><span className={`pill px-2 py-0.5 rounded text-xs ${v.status === 'active' ? 'bg-sage-100 text-sage-700' : 'bg-ink-100 text-ink-500'}`}>{v.status}</span></div><p className="text-sm text-accent-600">{v.service}</p><p className="text-xs text-ink-500">{v.contact} · {v.phone} · {v.email}</p><p className="text-xs text-ink-400 mt-1">{v.contract}</p></div><div className="flex gap-2"><button onClick={() => store.toggleVendorStatus(v.id)} className={`text-xs font-medium ${v.status === 'active' ? 'text-yellow-600' : 'text-sage-600'}`}>{v.status === 'active' ? 'Deactivate' : 'Activate'}</button><button onClick={() => openEdit('editVendor', v.id, { name: v.name, service: v.service, contact: v.contact, phone: v.phone, email: v.email, contract: v.contract })} className="text-xs text-accent-600 font-medium">Edit</button><button onClick={() => { if (confirm('Remove?')) store.removeVendor(v.id); }} className="text-xs text-red-400 hover:text-red-600">Remove</button></div></div></div>))}
          </div>)}
        </div>

      {/* MODALS */}
      {(modal === 'addBoard' || modal === 'editBoard') && (<Modal title={modal === 'addBoard' ? 'Add Board Member' : 'Edit Board Member'} onClose={() => { setModal(null); resetForm(); }} onSave={() => { if (!f('name') || !f('role')) { alert('Name and role required'); return; } const data = { name: f('name'), role: f('role'), email: f('email'), phone: f('phone'), term: f('term') }; if (modal === 'addBoard') store.addBoardMember(data); else store.updateBoardMember(editId, data); setModal(null); resetForm(); }}><div className="space-y-3"><Field label="Full Name *" k="name" placeholder="Jane Doe" /><div><label className="block text-xs font-medium text-ink-700 mb-1">Board Role *</label><select value={f('role')} onChange={e => sf('role', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="">Select...</option>{['President','Vice President','Treasurer','Secretary','Member at Large'].map(r => <option key={r}>{r}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><Field label="Email" k="email" type="email" /><Field label="Phone" k="phone" /></div><Field label="Term" k="term" placeholder="Jan 2025 – Dec 2026" /></div></Modal>)}

      {modal === 'editMgmt' && (<Modal title="Edit Property Management" onClose={() => { setModal(null); resetForm(); }} onSave={() => { store.updateManagement({ company: f('company'), contact: f('contact'), title: f('title'), email: f('email'), phone: f('phone'), emergency: f('emergency'), address: f('address'), hours: f('hours') }); setModal(null); resetForm(); }}><div className="space-y-3"><Field label="Company Name" k="company" /><div className="grid grid-cols-2 gap-3"><Field label="Contact" k="contact" /><Field label="Title" k="title" /></div><div className="grid grid-cols-2 gap-3"><Field label="Email" k="email" type="email" /><Field label="Phone" k="phone" /></div><div className="grid grid-cols-2 gap-3"><Field label="Emergency" k="emergency" /><Field label="Hours" k="hours" /></div><Field label="Address" k="address" /></div></Modal>)}

      {(modal === 'addCounsel' || modal === 'editCounsel') && (<Modal title={modal === 'addCounsel' ? 'Add Legal Counsel' : 'Edit Legal Counsel'} onClose={() => { setModal(null); resetForm(); }} onSave={() => { if (!f('firm') || !f('attorney')) { alert('Firm and attorney required'); return; } const data = { firm: f('firm'), attorney: f('attorney'), email: f('email'), phone: f('phone'), specialty: f('specialty') }; if (modal === 'addCounsel') store.addLegalCounsel(data); else store.updateLegalCounsel(editId, data); setModal(null); resetForm(); }}><div className="space-y-3"><Field label="Firm Name *" k="firm" /><Field label="Attorney *" k="attorney" /><div className="grid grid-cols-2 gap-3"><Field label="Email" k="email" type="email" /><Field label="Phone" k="phone" /></div><Field label="Specialty" k="specialty" placeholder="HOA / Condominium Law" /></div></Modal>)}

      {modal === 'editAddress' && (<Modal title="Edit Building Address" onClose={() => { setModal(null); resetForm(); }} onSave={() => { store.updateAddress({ street: f('street'), city: f('city'), state: f('state'), zip: f('zip') }); setModal(null); resetForm(); }}><div className="space-y-3"><Field label="Street" k="street" /><div className="grid grid-cols-3 gap-3"><Field label="City" k="city" /><Field label="State" k="state" /><Field label="ZIP" k="zip" /></div></div></Modal>)}

      {modal === 'editDetails' && (<Modal title="Edit Building Details" onClose={() => { setModal(null); resetForm(); }} onSave={() => { store.updateDetails({ yearBuilt: f('yearBuilt'), totalUnits: parseInt(f('totalUnits')) || 0, floors: parseInt(f('floors')) || 0, type: f('type'), sqft: f('sqft'), lotSize: f('lotSize'), parking: f('parking'), architect: f('architect'), contractor: f('contractor'), amenities: f('amenities').split(',').map(a => a.trim()).filter(Boolean) }); setModal(null); resetForm(); }}><div className="space-y-3"><div className="grid grid-cols-3 gap-3"><Field label="Year Built" k="yearBuilt" /><Field label="Total Units" k="totalUnits" type="number" /><Field label="Floors" k="floors" type="number" /></div><div className="grid grid-cols-2 gap-3"><Field label="Type" k="type" /><Field label="Sq Footage" k="sqft" /></div><div className="grid grid-cols-2 gap-3"><Field label="Lot Size" k="lotSize" /><Field label="Parking" k="parking" /></div><div className="grid grid-cols-2 gap-3"><Field label="Architect" k="architect" /><Field label="Contractor" k="contractor" /></div><Field label="Amenities (comma-separated)" k="amenities" /></div></Modal>)}

      {(modal === 'addDoc' || modal === 'editDoc') && (<Modal title={modal === 'addDoc' ? 'Add Document' : 'Edit Document'} onClose={() => { setModal(null); resetForm(); }} onSave={() => { if (!f('name')) { alert('Name required'); return; } const data = { name: f('name'), version: f('version'), size: f('size'), status: (f('status') || 'current') as 'current' | 'review-due' }; if (modal === 'addDoc') store.addLegalDocument(data); else store.updateLegalDocument(editId, data); setModal(null); resetForm(); }}><div className="space-y-3"><Field label="Document Name *" k="name" /><div className="grid grid-cols-2 gap-3"><Field label="Version" k="version" placeholder="1.0" /><Field label="File Size" k="size" placeholder="1.2 MB" /></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Status</label><select value={f('status') || 'current'} onChange={e => sf('status', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="current">Current</option><option value="review-due">Review Due</option></select></div>{modal === 'editDoc' && (() => { const doc = store.legalDocuments.find(d => d.id === editId); if (!doc) return null; return (<div className="border-t pt-3"><label className="block text-xs font-medium text-ink-700 mb-2">Attachments</label>{doc.attachments.length > 0 && (<div className="space-y-1.5 mb-2">{doc.attachments.map((att, i) => (<div key={i} className="flex items-center justify-between py-1.5 px-3 bg-mist-50 border border-mist-100 rounded-lg"><div className="flex items-center gap-2"><span className="text-accent-500 text-sm">📎</span><span className="text-xs font-medium text-ink-700">{att.name}</span><span className="text-[10px] text-ink-400">{att.size} · {att.uploadedAt}</span></div><button type="button" onClick={() => store.removeLegalDocAttachment(editId, i)} className="text-[10px] text-red-400 hover:text-red-600">Remove</button></div>))}</div>)}<button type="button" onClick={() => { const name = prompt('File name (e.g., Bylaws_v3.pdf):'); if (name) { const size = prompt('File size (e.g., 2.4 MB):') || '1.0 MB'; store.addLegalDocAttachment(editId, { name, size, type: 'application/pdf' }); } }} className="w-full py-2 border-2 border-dashed border-ink-200 rounded-lg text-xs text-ink-500 hover:border-accent-300 hover:text-accent-600">+ Attach File</button></div>); })()}</div></Modal>)}

      {(modal === 'addIns' || modal === 'editIns') && (<Modal title={modal === 'addIns' ? 'Add Insurance Policy' : 'Edit Policy'} onClose={() => { setModal(null); resetForm(); }} onSave={() => { if (!f('type') || !f('carrier')) { alert('Type and carrier required'); return; } const data = { type: f('type'), carrier: f('carrier'), coverage: f('coverage'), premium: f('premium'), expires: f('expires'), policyNum: f('policyNum') }; if (modal === 'addIns') store.addInsurance(data); else store.updateInsurance(editId, data); setModal(null); resetForm(); }}><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><Field label="Policy Type *" k="type" placeholder="General Liability" /><Field label="Policy #" k="policyNum" /></div><div className="grid grid-cols-2 gap-3"><Field label="Carrier *" k="carrier" /><Field label="Coverage" k="coverage" /></div><div className="grid grid-cols-2 gap-3"><Field label="Premium" k="premium" placeholder="$8,500/yr" /><Field label="Expires" k="expires" type="date" /></div>{modal === 'editIns' && (() => { const pol = store.insurance.find(p => p.id === editId); if (!pol) return null; return (<div className="border-t pt-3"><label className="block text-xs font-medium text-ink-700 mb-2">Policy Documents</label>{pol.attachments.length > 0 && (<div className="space-y-1.5 mb-2">{pol.attachments.map((att, i) => (<div key={i} className="flex items-center justify-between py-1.5 px-3 bg-mist-50 border border-mist-100 rounded-lg"><div className="flex items-center gap-2"><span className="text-accent-500 text-sm">📎</span><span className="text-xs font-medium text-ink-700">{att.name}</span><span className="text-[10px] text-ink-400">{att.size} · {att.uploadedAt}</span></div><button type="button" onClick={() => store.removeInsuranceAttachment(editId, i)} className="text-[10px] text-red-400 hover:text-red-600">Remove</button></div>))}</div>)}<button type="button" onClick={() => { const name = prompt('File name (e.g., GL_Policy_2026.pdf):'); if (name) { const size = prompt('File size (e.g., 2.1 MB):') || '1.0 MB'; store.addInsuranceAttachment(editId, { name, size, type: 'application/pdf' }); } }} className="w-full py-2 border-2 border-dashed border-ink-200 rounded-lg text-xs text-ink-500 hover:border-accent-300 hover:text-accent-600">+ Attach Policy Document</button></div>); })()}</div></Modal>)}

      {(modal === 'addVendor' || modal === 'editVendor') && (<Modal title={modal === 'addVendor' ? 'Add Vendor' : 'Edit Vendor'} onClose={() => { setModal(null); resetForm(); }} onSave={() => { if (!f('name') || !f('service')) { alert('Name and service required'); return; } if (modal === 'addVendor') store.addVendor({ name: f('name'), service: f('service'), contact: f('contact'), phone: f('phone'), email: f('email'), contract: f('contract'), status: 'active' }); else store.updateVendor(editId, { name: f('name'), service: f('service'), contact: f('contact'), phone: f('phone'), email: f('email'), contract: f('contract') }); setModal(null); resetForm(); }}><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><Field label="Company Name *" k="name" /><Field label="Service *" k="service" placeholder="Plumbing" /></div><div className="grid grid-cols-2 gap-3"><Field label="Contact Person" k="contact" /><Field label="Phone" k="phone" /></div><div className="grid grid-cols-2 gap-3"><Field label="Email" k="email" type="email" /><Field label="Contract" k="contract" placeholder="On-call" /></div></div></Modal>)}
    </div>
  );
}
