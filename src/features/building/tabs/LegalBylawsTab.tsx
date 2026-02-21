import { useBuildingStore } from '@/store/useBuildingStore';
import type { LegalDocument } from '@/store/useBuildingStore';

/** Required governing documents based on DC condominium law and common HOA best practices.
 *  The `required` flag indicates whether the document is legally required (true) or recommended best practice (false).
 *  `legalRef` cites the relevant statute or standard. */
const REQUIRED_DOCS = [
  { key: 'bylaws', name: 'Condominium Bylaws', required: true, legalRef: 'DC Code § 29-1105.02', desc: 'Governs the internal affairs of the association. Must be recorded with the deed.' },
  { key: 'ccrs', name: 'CC&Rs / Declaration', required: true, legalRef: 'DC Code § 29-1105.01', desc: 'Covenants, conditions, and restrictions that bind all unit owners.' },
  { key: 'master-deed', name: 'Master Deed / Plat', required: true, legalRef: 'DC Code § 29-1103', desc: 'Legal instrument creating the condominium. Filed with the recorder of deeds.' },
  { key: 'articles', name: 'Articles of Incorporation', required: true, legalRef: 'DC Code § 29-1101', desc: 'Establishes the association as a legal entity.' },
  { key: 'rules', name: 'Rules & Regulations', required: true, legalRef: 'DC Code § 29-1105.02(a)(10)', desc: 'Day-to-day rules adopted by the board. Must be consistent with bylaws and CC&Rs.' },
  { key: 'collection', name: 'Collection Policy', required: true, legalRef: 'DC Code § 29-1135.03', desc: 'Written policy for assessment collection, late fees, and lien procedures.' },
  { key: 'reserve-study', name: 'Reserve Study', required: true, legalRef: 'DC Code § 29-1135.03(b)', desc: 'Professional analysis of building component lifespans and funding needs. Update every 3-5 years.' },
  { key: 'arch-standards', name: 'Architectural Standards', required: false, legalRef: 'Best Practice', desc: 'Guidelines for unit modifications, renovations, and alterations.' },
  { key: 'pet-policy', name: 'Pet Policy', required: false, legalRef: 'Best Practice', desc: 'Rules governing pet ownership, breeds, and common area access.' },
  { key: 'move-in-out', name: 'Move-In/Move-Out Policy', required: false, legalRef: 'Best Practice', desc: 'Procedures, deposits, scheduling, and damage responsibilities for moves.' },
  { key: 'conflict-policy', name: 'Conflict of Interest Policy', required: false, legalRef: 'DC Code § 29-406.70', desc: 'Requires board members to disclose and manage conflicts of interest.' },
  { key: 'doc-retention', name: 'Document Retention Policy', required: false, legalRef: 'Best Practice', desc: 'Specifies how long to retain financial, legal, and administrative records (typically 7+ years).' },
  { key: 'emergency-plan', name: 'Emergency Preparedness Plan', required: false, legalRef: 'Best Practice', desc: 'Evacuation routes, emergency contacts, and disaster response procedures.' },
];

function matchDoc(docs: LegalDocument[], key: string, name: string): LegalDocument | undefined {
  // Match by partial name — flexible enough to handle variations
  const lowerName = name.toLowerCase();
  return docs.find(d => d.name.toLowerCase().includes(lowerName.split('/')[0].trim().toLowerCase().replace('condominium ', '').replace(' policy', '')));
}

interface Props {
  store: ReturnType<typeof useBuildingStore.getState>;
  openAdd: () => void;
  openEdit: (id: string, data: Record<string, string>) => void;
}

export default function LegalBylawsTab({ store, openAdd, openEdit }: Props) {
  const docs = store.legalDocuments;
  const state = store.address.state;

  // Compute compliance
  const requiredDocs = REQUIRED_DOCS.filter(r => r.required);
  const optionalDocs = REQUIRED_DOCS.filter(r => !r.required);
  const requiredPresent = requiredDocs.filter(r => matchDoc(docs, r.key, r.name));
  const requiredCurrent = requiredDocs.filter(r => {
    const d = matchDoc(docs, r.key, r.name);
    return d && d.status === 'current';
  });
  const optPresent = optionalDocs.filter(r => matchDoc(docs, r.key, r.name));

  const reqScore = requiredDocs.length > 0 ? Math.round((requiredCurrent.length / requiredDocs.length) * 100) : 100;
  const optScore = optionalDocs.length > 0 ? Math.round((optPresent.length / optionalDocs.length) * 100) : 100;
  const overallScore = Math.round(reqScore * 0.8 + optScore * 0.2);
  const grade = overallScore >= 90 ? 'A' : overallScore >= 80 ? 'B' : overallScore >= 70 ? 'C' : overallScore >= 60 ? 'D' : 'F';
  const gc = overallScore >= 80 ? 'sage' : overallScore >= 60 ? 'yellow' : 'red';

  return (
    <div className="space-y-5">
      {/* Compliance header */}
      <div className={`bg-gradient-to-br from-${gc}-50 to-${gc}-100 border-2 border-${gc}-200 rounded-xl p-5`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-display text-xl font-bold text-ink-900">📜 Legal & Bylaws Compliance</h3>
            <p className="text-sm text-ink-500 mt-0.5">Based on <strong>{state}</strong> condominium law and HOA best practices</p>
          </div>
          <div className="text-center">
            <div className={`text-4xl font-bold text-${gc}-600`}>{grade}</div>
            <p className={`text-sm font-bold text-${gc}-600`}>{overallScore}%</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-lg p-3 border border-ink-100">
            <p className="text-xs text-ink-400">Required Documents</p>
            <p className="text-lg font-bold text-ink-900">{requiredCurrent.length}<span className="text-sm font-normal text-ink-400">/{requiredDocs.length}</span></p>
            <div className="mt-1.5 h-2 bg-ink-100 rounded-full overflow-hidden">
              <div className={`h-full bg-${gc}-500 rounded-full`} style={{ width: `${reqScore}%` }} />
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-ink-100">
            <p className="text-xs text-ink-400">Optional / Best Practice</p>
            <p className="text-lg font-bold text-ink-900">{optPresent.length}<span className="text-sm font-normal text-ink-400">/{optionalDocs.length}</span></p>
            <div className="mt-1.5 h-2 bg-ink-100 rounded-full overflow-hidden">
              <div className="h-full bg-accent-400 rounded-full" style={{ width: `${optScore}%` }} />
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-ink-100">
            <p className="text-xs text-ink-400">Review Due</p>
            <p className={`text-lg font-bold ${docs.filter(d => d.status === 'review-due').length > 0 ? 'text-yellow-600' : 'text-sage-600'}`}>
              {docs.filter(d => d.status === 'review-due').length}
            </p>
            <p className="text-[11px] text-ink-400 mt-1">documents need attention</p>
          </div>
        </div>
      </div>

      {/* Required documents */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider">Required by Law</h4>
          <span className="text-xs text-ink-400">{state} Condominium Act</span>
        </div>
        <div className="space-y-2">
          {requiredDocs.map(req => {
            const doc = matchDoc(docs, req.key, req.name);
            const present = !!doc;
            const current = doc?.status === 'current';
            return (
              <div key={req.key} className={`rounded-xl border p-4 transition-all ${present ? (current ? 'border-sage-200 bg-sage-50 bg-opacity-40' : 'border-yellow-200 bg-yellow-50 bg-opacity-40') : 'border-red-200 bg-red-50 bg-opacity-40'}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-sm font-bold ${present ? (current ? 'bg-sage-500 text-white' : 'bg-yellow-500 text-white') : 'bg-red-200 text-red-600'}`}>
                    {present ? (current ? '✓' : '!') : '✗'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-ink-900">{req.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-semibold uppercase">Required</span>
                      <span className="text-[10px] text-ink-400 font-mono">{req.legalRef}</span>
                    </div>
                    <p className="text-xs text-ink-500 mt-0.5">{req.desc}</p>
                    {doc && (
                      <div className="flex items-center gap-3 mt-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${doc.status === 'current' ? 'bg-sage-100 text-sage-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {doc.status === 'current' ? '✓ Current' : '⚠ Review Due'}
                        </span>
                        <span className="text-[11px] text-ink-400">{doc.version} · {doc.size}{doc.attachments && doc.attachments.length > 0 ? ` · 📎 ${doc.attachments.length} file${doc.attachments.length > 1 ? 's' : ''}` : ' · ⚠ No file attached'}</span>
                        <button onClick={() => openEdit(doc.id, { name: doc.name, version: doc.version, size: doc.size, status: doc.status })} className="text-[11px] text-accent-600 font-medium hover:text-accent-700">Edit</button>
                        <button onClick={() => { if (confirm('Remove?')) store.removeLegalDocument(doc.id); }} className="text-[11px] text-red-400 hover:text-red-600">Remove</button>
                      </div>
                    )}
                    {!doc && (
                      <button onClick={openAdd} className="mt-2 text-xs text-accent-600 font-medium hover:text-accent-700">+ Add this document</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Optional / Best Practice documents */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider">Recommended / Best Practice</h4>
        </div>
        <div className="space-y-2">
          {optionalDocs.map(req => {
            const doc = matchDoc(docs, req.key, req.name);
            const present = !!doc;
            return (
              <div key={req.key} className={`rounded-xl border p-4 transition-all ${present ? 'border-sage-200 bg-white' : 'border-ink-100 bg-white'}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-sm font-bold ${present ? 'bg-sage-500 text-white' : 'bg-ink-100 text-ink-400'}`}>
                    {present ? '✓' : '○'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-ink-900">{req.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-100 text-ink-500 font-semibold uppercase">Optional</span>
                      {req.legalRef !== 'Best Practice' && <span className="text-[10px] text-ink-400 font-mono">{req.legalRef}</span>}
                    </div>
                    <p className="text-xs text-ink-500 mt-0.5">{req.desc}</p>
                    {doc && (
                      <div className="flex items-center gap-3 mt-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${doc.status === 'current' ? 'bg-sage-100 text-sage-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {doc.status === 'current' ? '✓ Current' : '⚠ Review Due'}
                        </span>
                        <span className="text-[11px] text-ink-400">{doc.version} · {doc.size}{doc.attachments && doc.attachments.length > 0 ? ` · 📎 ${doc.attachments.length} file${doc.attachments.length > 1 ? 's' : ''}` : ' · ⚠ No file attached'}</span>
                        <button onClick={() => openEdit(doc.id, { name: doc.name, version: doc.version, size: doc.size, status: doc.status })} className="text-[11px] text-accent-600 font-medium hover:text-accent-700">Edit</button>
                        <button onClick={() => { if (confirm('Remove?')) store.removeLegalDocument(doc.id); }} className="text-[11px] text-red-400 hover:text-red-600">Remove</button>
                      </div>
                    )}
                    {!doc && (
                      <button onClick={openAdd} className="mt-2 text-xs text-ink-400 font-medium hover:text-accent-600">+ Add this document</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Additional custom documents */}
      {(() => {
        const knownNames = REQUIRED_DOCS.map(r => r.name.toLowerCase().replace('condominium ', '').replace(' policy', '').split('/')[0].trim());
        const custom = docs.filter(d => !knownNames.some(kn => d.name.toLowerCase().includes(kn)));
        if (custom.length === 0) return null;
        return (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider">Additional Documents</h4>
            </div>
            <div className="space-y-2">
              {custom.map(doc => (
                <div key={doc.id} className="rounded-xl border border-ink-100 bg-white p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-accent-500">📄</span>
                    <div>
                      <h4 className="font-bold text-ink-900 text-sm">{doc.name}</h4>
                      <p className="text-xs text-ink-500">{doc.version} · {doc.size}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${doc.status === 'current' ? 'bg-sage-100 text-sage-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {doc.status === 'current' ? '✓ Current' : '⚠ Review Due'}
                    </span>
                    <button onClick={() => openEdit(doc.id, { name: doc.name, version: doc.version, size: doc.size, status: doc.status })} className="text-xs text-accent-600 font-medium">Edit</button>
                    <button onClick={() => { if (confirm('Remove?')) store.removeLegalDocument(doc.id); }} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Add custom document button */}
      <button onClick={openAdd} className="w-full py-3 border-2 border-dashed border-ink-200 rounded-xl text-sm text-ink-500 hover:border-accent-300 hover:text-accent-600 transition-colors font-medium">
        + Add Additional Document
      </button>
    </div>
  );
}
