import { useBuildingStore } from '@/store/useBuildingStore';
import { fmt } from '@/lib/formatters';

function parseContractInfo(contract: string): { amount: number; period: 'monthly' | 'annual' | 'on-call' } {
  const lower = contract.toLowerCase();
  if (lower.includes('on-call') || lower.includes('on call')) return { amount: 0, period: 'on-call' };
  const match = contract.match(/\$[\d,]+(?:\.\d{2})?/);
  const amount = match ? parseFloat(match[0].replace(/[$,]/g, '')) : 0;
  if (lower.includes('/mo') || lower.includes('month')) return { amount, period: 'monthly' };
  return { amount, period: 'annual' };
}

function annualize(info: { amount: number; period: 'monthly' | 'annual' | 'on-call' }): number {
  if (info.period === 'monthly') return info.amount * 12;
  if (info.period === 'annual') return info.amount;
  return 0;
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function expiryBadge(days: number) {
  if (days < 0) return { label: 'Expired', color: 'bg-red-100 text-red-700' };
  if (days < 90) return { label: 'Expires Soon', color: 'bg-red-100 text-red-700' };
  if (days < 180) return { label: 'Upcoming', color: 'bg-yellow-100 text-yellow-700' };
  return { label: 'Current', color: 'bg-sage-100 text-sage-700' };
}

export function ContractRenewalPanel() {
  const { vendors, insurance } = useBuildingStore();
  const activeVendors = vendors.filter(v => v.status === 'active');

  return (
    <div className="mt-3 bg-mist-50 border border-mist-200 rounded-lg p-4 space-y-4">
      <p className="text-xs font-bold text-accent-700 uppercase tracking-widest">Contract & Renewal Status</p>

      {/* Vendor Contracts */}
      <div className="bg-white rounded-lg border border-ink-100 p-4">
        <p className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">Vendor Contracts</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-ink-400 uppercase tracking-wider">
              <th className="text-left pb-2">Vendor</th>
              <th className="text-left pb-2">Service</th>
              <th className="text-left pb-2">Contract</th>
              <th className="text-right pb-2">Annual Cost</th>
              <th className="text-left pb-2">Status</th>
            </tr></thead>
            <tbody>
              {activeVendors.map(v => {
                const info = parseContractInfo(v.contract);
                const annual = annualize(info);
                return (
                  <tr key={v.id} className="border-t border-ink-50">
                    <td className="py-2 text-ink-700 font-medium">{v.name}</td>
                    <td className="py-2 text-ink-600">{v.service}</td>
                    <td className="py-2 text-ink-500">{v.contract}</td>
                    <td className="py-2 text-right text-ink-600">{annual > 0 ? fmt(annual) : '—'}</td>
                    <td className="py-2"><span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sage-100 text-sage-700">Active</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Insurance Policies */}
      <div className="bg-white rounded-lg border border-ink-100 p-4">
        <p className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">Insurance Policies</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-ink-400 uppercase tracking-wider">
              <th className="text-left pb-2">Policy</th>
              <th className="text-left pb-2">Carrier</th>
              <th className="text-left pb-2">Premium</th>
              <th className="text-left pb-2">Expires</th>
              <th className="text-right pb-2">Days Left</th>
              <th className="text-left pb-2">Status</th>
            </tr></thead>
            <tbody>
              {insurance.map(p => {
                const days = daysUntil(p.expires);
                const badge = expiryBadge(days);
                return (
                  <tr key={p.id} className="border-t border-ink-50">
                    <td className="py-2 text-ink-700 font-medium">{p.type}</td>
                    <td className="py-2 text-ink-600">{p.carrier}</td>
                    <td className="py-2 text-ink-600">{p.premium}</td>
                    <td className="py-2 text-ink-600">{p.expires}</td>
                    <td className={`py-2 text-right font-medium ${days < 90 ? 'text-red-600' : 'text-ink-600'}`}>{days}</td>
                    <td className="py-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badge.color}`}>{badge.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
