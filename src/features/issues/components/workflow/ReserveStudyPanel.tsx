import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';

export function ReserveStudyPanel() {
  const { legalDocuments } = useBuildingStore();
  const fin = useFinancialStore();
  const recommended = fin.calculateRecommendedAnnualReserve();
  const currentContribution = fin.annualReserveContribution;
  const reserveStatus = fin.getReserveFundingStatus();

  const reserveStudy = legalDocuments.find(d =>
    d.name.toLowerCase().includes('reserve study') || d.name.toLowerCase().includes('reserve')
  );

  const gap = recommended - currentContribution;
  const onTrack = gap <= 0;

  const totalFunded = reserveStatus.reduce((sum: number, r: any) => sum + r.currentFunding, 0);
  const totalNeeded = reserveStatus.reduce((sum: number, r: any) => sum + r.estimatedCost, 0);

  // 3 scenarios
  const scenarios = [
    {
      label: 'Keep Current',
      annual: currentContribution,
      threeYearReserve: totalFunded + currentContribution * 3,
      status: onTrack ? 'On Track' : 'Underfunded',
      statusColor: onTrack ? 'text-sage-700 bg-sage-50' : 'text-red-600 bg-red-50',
      note: onTrack ? 'Contributions meet study recommendations' : `At this rate, reserves may deplete before major projects`,
    },
    {
      label: 'Increase to Recommended',
      annual: recommended,
      threeYearReserve: totalFunded + recommended * 3,
      status: 'On Track',
      statusColor: 'text-sage-700 bg-sage-50',
      note: 'Meets reserve study recommendation for full funding',
    },
    {
      label: 'Increase by 50% of Gap',
      annual: currentContribution + gap * 0.5,
      threeYearReserve: totalFunded + (currentContribution + gap * 0.5) * 3,
      status: 'Partial Improvement',
      statusColor: 'text-yellow-700 bg-yellow-50',
      note: 'Splits the difference — reduces risk while limiting assessment increase',
    },
  ];

  return (
    <div className="mt-3 bg-mist-50 border border-mist-200 rounded-lg p-4 space-y-4">
      <p className="text-xs font-bold text-accent-700 uppercase tracking-widest">Reserve Study Review</p>

      {/* Latest Reserve Study Document */}
      <div className="bg-white rounded-lg border border-ink-100 p-4">
        <p className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">Latest Reserve Study</p>
        {reserveStudy ? (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-semibold text-ink-900">{reserveStudy.name}</p>
              <p className="text-xs text-ink-500">{reserveStudy.version} · {reserveStudy.size}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${reserveStudy.status === 'current' ? 'bg-sage-100 text-sage-700' : 'bg-yellow-100 text-yellow-700'}`}>{reserveStudy.status}</span>
              {reserveStudy.attachments.length > 0 && (
                <span className="text-xs text-accent-600 font-medium">View Document →</span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-red-600">No reserve study found. Upload one in Building → Legal Documents.</p>
        )}
      </div>

      {/* Contribution Analysis */}
      <div className="bg-white rounded-lg border border-ink-100 p-4 space-y-3">
        <p className="text-xs font-bold text-ink-500 uppercase tracking-wider">Contribution Analysis</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-mist-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-ink-400 uppercase font-medium">Current Annual</p>
            <p className="text-sm font-bold text-ink-900">{fmt(currentContribution)}</p>
          </div>
          <div className="bg-mist-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-ink-400 uppercase font-medium">Recommended</p>
            <p className="text-sm font-bold text-accent-700">{fmt(recommended)}</p>
          </div>
          <div className="bg-mist-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-ink-400 uppercase font-medium">Gap</p>
            <p className={`text-sm font-bold ${gap > 0 ? 'text-red-600' : 'text-sage-700'}`}>{gap > 0 ? fmt(gap) : 'None'}</p>
          </div>
          <div className="bg-mist-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-ink-400 uppercase font-medium">On Track?</p>
            <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded ${onTrack ? 'bg-sage-100 text-sage-700' : 'bg-red-100 text-red-600'}`}>{onTrack ? 'Yes' : 'No'}</span>
          </div>
        </div>

        {/* Scenarios Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-ink-400 uppercase tracking-wider">
              <th className="text-left pb-2">Scenario</th>
              <th className="text-right pb-2">Annual Amount</th>
              <th className="text-right pb-2">3-Year Reserve</th>
              <th className="text-right pb-2">Status</th>
            </tr></thead>
            <tbody>
              {scenarios.map((sc, i) => (
                <tr key={i} className="border-t border-ink-50">
                  <td className="py-2 text-ink-700 font-medium">{sc.label}</td>
                  <td className="py-2 text-right text-ink-600">{fmt(sc.annual)}</td>
                  <td className="py-2 text-right text-ink-600">{fmt(sc.threeYearReserve)} <span className="text-ink-300">/ {fmt(totalNeeded)}</span></td>
                  <td className="py-2 text-right"><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${sc.statusColor}`}>{sc.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-ink-400 italic">Projections are simplified 3-year linear estimates. Actual reserve spending for capital projects will affect these numbers.</p>
      </div>
    </div>
  );
}
