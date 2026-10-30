import { useBuildingStore } from '@/store/useBuildingStore';
import type { InsurancePolicy } from '@/store/useBuildingStore';

/** Required and recommended insurance policies for condominiums.
 *  Based on DC Code, Fannie Mae/Freddie Mac requirements, and industry best practices. */
const REQUIRED_POLICIES = [
  { key: 'gl', name: 'General Liability', required: true, legalRef: 'DC Code § 29-1135.06', desc: 'Covers bodily injury and property damage in common areas. Minimum $1M/$2M recommended.', minCoverage: '$1,000,000' },
  { key: 'property', name: 'Property / Hazard', required: true, legalRef: 'DC Code § 29-1135.06', desc: 'Covers the building structure, common elements, and fixtures at 100% replacement cost.', minCoverage: 'Full Replacement' },
  { key: 'do', name: 'Directors & Officers (D&O)', required: true, legalRef: 'Best Practice / Fannie Mae', desc: 'Protects board members from personal liability for decisions made in their official capacity.', minCoverage: '$1,000,000' },
  { key: 'fidelity', name: 'Fidelity Bond', required: true, legalRef: 'DC Code § 29-1135.06', desc: 'Covers theft or misappropriation of association funds by employees, board members, or management.', minCoverage: '3 months assessments' },
  { key: 'workers-comp', name: 'Workers Compensation', required: true, legalRef: 'DC Workers Comp Act', desc: 'Required if the association has any employees. Covers workplace injuries and illnesses.', minCoverage: 'Statutory' },
  { key: 'umbrella', name: 'Umbrella / Excess Liability', required: false, legalRef: 'Best Practice', desc: 'Provides additional coverage above primary policy limits. Recommended $5M-$10M.', minCoverage: '$5,000,000' },
  { key: 'flood', name: 'Flood Insurance', required: false, legalRef: 'FEMA / Lender Req', desc: 'Required if building is in a FEMA-designated flood zone. Recommended for all properties.', minCoverage: 'Varies' },
  { key: 'earthquake', name: 'Earthquake Insurance', required: false, legalRef: 'Best Practice', desc: 'Covers damage from seismic events. Not common in DC but may be required by lenders.', minCoverage: 'Varies' },
  { key: 'cyber', name: 'Cyber Liability', required: false, legalRef: 'Best Practice', desc: 'Covers data breaches, ransomware, and cyber incidents affecting owner personal data.', minCoverage: '$500,000' },
  { key: 'equipment', name: 'Equipment Breakdown', required: false, legalRef: 'Best Practice', desc: 'Covers mechanical/electrical breakdown of elevators, HVAC, boilers, and building systems.', minCoverage: 'Varies' },
];

function matchPolicy(policies: InsurancePolicy[], name: string): InsurancePolicy | undefined {
  const ln = name.toLowerCase();
  return policies.find(p => {
    const pt = p.type.toLowerCase();
    if (ln.includes('d&o') || ln.includes('directors')) return pt.includes('d&o') || pt.includes('directors');
    if (ln.includes('general liability')) return pt.includes('general liability');
    if (ln.includes('property') || ln.includes('hazard')) return pt.includes('property') || pt.includes('hazard');
    if (ln.includes('fidelity')) return pt.includes('fidelity');
    if (ln.includes('workers')) return pt.includes('workers') || pt.includes('worker');
    if (ln.includes('umbrella')) return pt.includes('umbrella') || pt.includes('excess');
    if (ln.includes('flood')) return pt.includes('flood');
    if (ln.includes('earthquake')) return pt.includes('earthquake') || pt.includes('seismic');
    if (ln.includes('cyber')) return pt.includes('cyber');
    if (ln.includes('equipment')) return pt.includes('equipment') || pt.includes('breakdown');
    return false;
  });
}

function isExpiringSoon(expires: string): boolean {
  const expDate = new Date(expires);
  const now = new Date();
  const daysLeft = Math.floor((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return daysLeft <= 60 && daysLeft > 0;
}

function isExpired(expires: string): boolean {
  return new Date(expires) < new Date();
}

interface Props {
  store: ReturnType<typeof useBuildingStore.getState>;
  openAdd: () => void;
  openEdit: (id: string, data: Record<string, string>) => void;
  isBoard: boolean;
}

export default function InsuranceTab({ store, openAdd, openEdit, isBoard }: Props) {
  const policies = store.insurance;
  const state = store.address.state;

  // Compliance scoring
  const requiredPolicies = REQUIRED_POLICIES.filter(r => r.required);
  const optionalPolicies = REQUIRED_POLICIES.filter(r => !r.required);

  const reqPresent = requiredPolicies.filter(r => {
    const p = matchPolicy(policies, r.name);
    return p && !isExpired(p.expires);
  });
  const optPresent = optionalPolicies.filter(r => {
    const p = matchPolicy(policies, r.name);
    return p && !isExpired(p.expires);
  });
  const expiringSoon = policies.filter(p => isExpiringSoon(p.expires));
  const expired = policies.filter(p => isExpired(p.expires));

  const reqScore = requiredPolicies.length > 0 ? Math.round((reqPresent.length / requiredPolicies.length) * 100) : 100;
  const optScore = optionalPolicies.length > 0 ? Math.round((optPresent.length / optionalPolicies.length) * 100) : 100;
  const overallScore = Math.round(reqScore * 0.8 + optScore * 0.2);
  const grade = overallScore >= 90 ? 'A' : overallScore >= 80 ? 'B' : overallScore >= 70 ? 'C' : overallScore >= 60 ? 'D' : 'F';
  const gc = overallScore >= 80 ? 'sage' : overallScore >= 60 ? 'yellow' : 'red';

  const totalPremium = policies.reduce((s, p) => {
    const num = parseFloat(p.premium.replace(/[^0-9.]/g, ''));
    return s + (isNaN(num) ? 0 : num);
  }, 0);

  return (
    <div className="space-y-5">
      {/* Compliance header */}
      <div className={`bg-gradient-to-br from-${gc}-50 to-${gc}-100 border-2 border-${gc}-200 rounded-xl p-5`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-display text-xl font-bold text-ink-900">🛡️ Insurance Compliance</h3>
            <p className="text-sm text-ink-500 mt-0.5">Based on <strong>{state}</strong> condominium law, Fannie Mae, and industry standards</p>
          </div>
          <div className="text-center">
            <div className={`text-4xl font-bold text-${gc}-600`}>{grade}</div>
            <p className={`text-sm font-bold text-${gc}-600`}>{overallScore}%</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg p-3 border border-ink-100">
            <p className="text-xs text-ink-400">Required Policies</p>
            <p className="text-lg font-bold text-ink-900">{reqPresent.length}<span className="text-sm font-normal text-ink-400">/{requiredPolicies.length}</span></p>
            <div className="mt-1.5 h-2 bg-ink-100 rounded-full overflow-hidden">
              <div className={`h-full bg-${gc}-500 rounded-full`} style={{ width: `${reqScore}%` }} />
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-ink-100">
            <p className="text-xs text-ink-400">Optional Coverage</p>
            <p className="text-lg font-bold text-ink-900">{optPresent.length}<span className="text-sm font-normal text-ink-400">/{optionalPolicies.length}</span></p>
            <div className="mt-1.5 h-2 bg-ink-100 rounded-full overflow-hidden">
              <div className="h-full bg-accent-400 rounded-full" style={{ width: `${optScore}%` }} />
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-ink-100">
            <p className="text-xs text-ink-400">Expiring Soon</p>
            <p className={`text-lg font-bold ${expiringSoon.length > 0 ? 'text-yellow-600' : 'text-sage-600'}`}>{expiringSoon.length}</p>
            <p className="text-[11px] text-ink-400 mt-1">within 60 days</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-ink-100">
            <p className="text-xs text-ink-400">Annual Premium</p>
            <p className="text-lg font-bold text-ink-900">${totalPremium.toLocaleString()}</p>
            <p className="text-[11px] text-ink-400 mt-1">total coverage cost</p>
          </div>
        </div>
      </div>

      {/* Required policies */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider">Required Coverage</h4>
          <span className="text-xs text-ink-400">{state} law & lending requirements</span>
        </div>
        <div className="space-y-2">
          {requiredPolicies.map(req => {
            const pol = matchPolicy(policies, req.name);
            const present = !!pol;
            const exp = pol ? isExpired(pol.expires) : false;
            const expSoon = pol ? isExpiringSoon(pol.expires) : false;
            const statusColor = !present || exp ? 'red' : expSoon ? 'yellow' : 'sage';
            return (
              <div key={req.key} className={`rounded-xl border p-4 transition-all ${statusColor === 'sage' ? 'border-sage-200 bg-sage-50 bg-opacity-40' : statusColor === 'yellow' ? 'border-yellow-200 bg-yellow-50 bg-opacity-40' : 'border-red-200 bg-red-50 bg-opacity-40'}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-sm font-bold ${statusColor === 'sage' ? 'bg-sage-500 text-white' : statusColor === 'yellow' ? 'bg-yellow-500 text-white' : 'bg-red-200 text-red-600'}`}>
                    {statusColor === 'sage' ? '✓' : statusColor === 'yellow' ? '!' : '✗'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-ink-900">{req.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-semibold uppercase">Required</span>
                      <span className="text-[10px] text-ink-400 font-mono">{req.legalRef}</span>
                    </div>
                    <p className="text-xs text-ink-500 mt-0.5">{req.desc}</p>
                    <p className="text-[11px] text-ink-400 mt-0.5">Min coverage: <strong>{req.minCoverage}</strong></p>
                    {pol && (
                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        {exp && <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-red-100 text-red-700">⚠ EXPIRED</span>}
                        {expSoon && !exp && <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-yellow-100 text-yellow-700">Expiring Soon</span>}
                        {!exp && !expSoon && <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-sage-100 text-sage-700">✓ Active</span>}
                        <span className="text-[11px] text-ink-400">{pol.carrier} · {pol.coverage} · Exp {pol.expires}{pol.attachments && pol.attachments.length > 0 ? ` · 📎 ${pol.attachments.length} file${pol.attachments.length > 1 ? 's' : ''}` : ' · ⚠ No doc attached'}</span>
                        <button onClick={() => openEdit(pol.id, { type: pol.type, carrier: pol.carrier, coverage: pol.coverage, premium: pol.premium, expires: pol.expires, policyNum: pol.policyNum })} className="text-[11px] text-accent-600 font-medium hover:text-accent-700">Edit</button>
                        <button onClick={() => { if (confirm('Remove?')) store.removeInsurance(pol.id); }} className="text-[11px] text-red-400 hover:text-red-600">Remove</button>
                      </div>
                    )}
                    {!pol && (
                      <button onClick={openAdd} className="mt-2 text-xs text-accent-600 font-medium hover:text-accent-700">+ Add this policy</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Optional policies */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider">Recommended / Optional Coverage</h4>
        </div>
        <div className="space-y-2">
          {optionalPolicies.map(req => {
            const pol = matchPolicy(policies, req.name);
            const present = !!pol;
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
                    </div>
                    <p className="text-xs text-ink-500 mt-0.5">{req.desc}</p>
                    {pol && (
                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        <span className="text-[11px] text-ink-400">{pol.carrier} · {pol.coverage} · {pol.premium} · Exp {pol.expires}{pol.attachments && pol.attachments.length > 0 ? ` · 📎 ${pol.attachments.length}` : ''}</span>
                        <button onClick={() => openEdit(pol.id, { type: pol.type, carrier: pol.carrier, coverage: pol.coverage, premium: pol.premium, expires: pol.expires, policyNum: pol.policyNum })} className="text-[11px] text-accent-600 font-medium hover:text-accent-700">Edit</button>
                        <button onClick={() => { if (confirm('Remove?')) store.removeInsurance(pol.id); }} className="text-[11px] text-red-400 hover:text-red-600">Remove</button>
                      </div>
                    )}
                    {!pol && (
                      <button onClick={openAdd} className="mt-2 text-xs text-ink-400 font-medium hover:text-accent-600">+ Add this policy</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom / additional policies */}
      {(() => {
        const knownTypes = REQUIRED_POLICIES.map(r => r.name.toLowerCase());
        const custom = policies.filter(p => !REQUIRED_POLICIES.some(r => matchPolicy([p], r.name)));
        if (custom.length === 0) return null;
        return (
          <div>
            <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider mb-3">Additional Policies</h4>
            <div className="space-y-2">
              {custom.map(pol => (
                <div key={pol.id} className="rounded-xl border border-ink-100 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-ink-900 text-sm">{pol.type}</h4>
                      <div className="flex gap-3 text-xs text-ink-500 mt-1">
                        <span>{pol.carrier}</span><span>{pol.coverage}</span><span>{pol.premium}</span><span>Exp {pol.expires}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isExpired(pol.expires) && <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-red-100 text-red-700">EXPIRED</span>}
                      {isExpiringSoon(pol.expires) && !isExpired(pol.expires) && <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-yellow-100 text-yellow-700">Expiring</span>}
                      <button onClick={() => openEdit(pol.id, { type: pol.type, carrier: pol.carrier, coverage: pol.coverage, premium: pol.premium, expires: pol.expires, policyNum: pol.policyNum })} className="text-xs text-accent-600 font-medium">Edit</button>
                      <button onClick={() => { if (confirm('Remove?')) store.removeInsurance(pol.id); }} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <button onClick={openAdd} className="w-full py-3 border-2 border-dashed border-ink-200 rounded-xl text-sm text-ink-500 hover:border-accent-300 hover:text-accent-600 transition-colors font-medium">
        + Add Additional Policy
      </button>
    </div>
  );
}
