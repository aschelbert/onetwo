import type { ReportType } from '@/lib/services/reports';
import { fmt } from '@/lib/formatters';

interface Props {
  type: ReportType;
  snapshot: Record<string, any>;
}

function formatPeriodHeader(period: { start: string; end: string } | undefined): string | null {
  if (!period) return null;
  const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmtDate(period.start)} – ${fmtDate(period.end)}`;
}

export default function SalesPackageRenderer({ type, snapshot }: Props) {
  const data = snapshot.data;
  const period = snapshot.period;
  if (!data) return <p className="text-sm text-ink-400">No data available.</p>;

  if (type === 'resale_certificate') return <ResaleCertificate data={data} period={period} />;
  if (type === 'budget_summary') return <BudgetSummary data={data} period={period} />;
  if (type === 'reserve_study_summary') return <ReserveStudySummary data={data} period={period} />;
  if (type === 'insurance_certificate') return <InsuranceCertificate data={data} />;
  if (type === 'association_info_sheet') return <AssociationInfoSheet data={data} />;
  return <p className="text-sm text-ink-400">Unknown sales package report type.</p>;
}

function ResaleCertificate({ data, period }: { data: any; period?: { start: string; end: string } }) {
  const periodText = formatPeriodHeader(period);
  return (
    <div className="space-y-4">
      <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl overflow-hidden">
        <div className="bg-indigo-900 text-white px-5 py-3">
          <h3 className="font-display text-lg font-bold">Resale / Estoppel Certificate</h3>
          <p className="text-xs text-indigo-200">{data.buildingName} — Generated {data.generatedDate}{periodText ? ` — ${periodText}` : ''}</p>
        </div>
        <div className="p-5 space-y-4 text-sm">
          {data.unit ? (
            <div className="grid grid-cols-2 gap-3 bg-white rounded-lg p-4 border border-indigo-100">
              <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Unit</p><p className="text-sm font-bold text-ink-900">Unit {data.unit.number}</p></div>
              <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Owner</p><p className="text-sm text-ink-700">{data.unit.owner}</p></div>
              <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Monthly Assessment</p><p className="text-sm font-bold text-ink-900">{fmt(data.unit.monthlyFee)}</p></div>
              <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Outstanding Balance</p><p className={`text-sm font-bold ${data.unit.balance > 0 ? 'text-red-600' : 'text-sage-600'}`}>{fmt(data.unit.balance)}</p></div>
            </div>
          ) : (
            <p className="text-sm text-red-500">Unit not found.</p>
          )}

          <div className="grid grid-cols-2 gap-3 bg-white rounded-lg p-4 border border-indigo-100">
            <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Total Units</p><p className="text-sm text-ink-700">{data.association.totalUnits}</p></div>
            <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Collection Rate</p><p className="text-sm text-ink-700">{data.association.collectionRate}%</p></div>
            <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Reserve Balance</p><p className="text-sm text-ink-700">{fmt(data.association.reserveBalance)}</p></div>
            <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Monthly Revenue</p><p className="text-sm text-ink-700">{fmt(data.association.monthlyRevenue)}</p></div>
          </div>

          <div className="bg-white rounded-lg p-4 border border-indigo-100 space-y-2">
            <div className="flex justify-between"><span className="text-ink-500">Pending Litigation</span><span className="font-medium">{data.pendingLitigation ? 'Yes' : 'None'}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">Special Assessments</span><span className="font-medium">{data.specialAssessments.length > 0 ? `${data.specialAssessments.length} active` : 'None'}</span></div>
          </div>

          {data.association.management?.company && (
            <div className="bg-white rounded-lg p-4 border border-indigo-100">
              <p className="text-[10px] text-ink-400 uppercase font-semibold mb-1">Management Company</p>
              <p className="text-sm font-medium text-ink-900">{data.association.management.company}</p>
              <p className="text-xs text-ink-500">{data.association.management.contact} · {data.association.management.email}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BudgetSummary({ data, period }: { data: any; period?: { start: string; end: string } }) {
  const periodText = formatPeriodHeader(period);
  return (
    <div className="bg-white border border-ink-100 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-ink-100">
        <h3 className="font-display text-base font-bold text-ink-900">Budget Summary — FY {data.fiscalYear}{periodText ? ` — ${periodText}` : ''}</h3>
        <p className="text-xs text-ink-400">{data.buildingName} · {data.unitCount} units · Avg fee: {fmt(data.avgMonthlyFee)}/mo</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-400 uppercase tracking-wide border-b border-ink-100 bg-mist-50">
              <th className="px-5 py-2">Category</th><th className="px-3 py-2 text-right">Budget</th><th className="px-3 py-2 text-right">Actual</th><th className="px-3 py-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {data.categories.map((b: any) => (
              <tr key={b.id} className="border-b border-ink-50">
                <td className="px-5 py-2 font-medium text-ink-900">{b.name}</td>
                <td className="px-3 py-2 text-right text-ink-500">{fmt(b.budgeted)}</td>
                <td className="px-3 py-2 text-right font-medium">{fmt(b.actual)}</td>
                <td className="px-3 py-2 text-right"><span className={`px-2 py-0.5 rounded text-xs ${b.pct > 100 ? 'bg-red-100 text-red-700' : 'bg-sage-100 text-sage-700'}`}>{b.pct}%</span></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-ink-200 font-bold">
              <td className="px-5 py-2">Total</td>
              <td className="px-3 py-2 text-right">{fmt(data.totalBudgeted)}</td>
              <td className="px-3 py-2 text-right">{fmt(data.totalActual)}</td>
              <td className="px-3 py-2 text-right">{data.totalBudgeted > 0 ? Math.round((data.totalActual / data.totalBudgeted) * 100) : 0}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function ReserveStudySummary({ data, period }: { data: any; period?: { start: string; end: string } }) {
  const overallPct = data.totalRequired > 0 ? Math.round((data.totalFunding / data.totalRequired) * 100) : 0;
  return (
    <div className="bg-white border border-ink-100 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-ink-100">
        <h3 className="font-display text-base font-bold text-ink-900">Reserve Study Summary{period ? ` — ${formatPeriodHeader(period)}` : ''}</h3>
        <p className="text-xs text-ink-400">{data.buildingName} · {overallPct}% funded overall · {fmt(data.annualContribution)}/yr contribution</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-400 uppercase tracking-wide border-b border-ink-100 bg-mist-50">
              <th className="px-5 py-2">Component</th><th className="px-3 py-2 text-right">Current</th><th className="px-3 py-2 text-right">Required</th><th className="px-3 py-2 text-right">% Funded</th><th className="px-3 py-2 text-right">Yrs Left</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item: any, i: number) => (
              <tr key={i} className="border-b border-ink-50">
                <td className="px-5 py-2 font-medium text-ink-900">{item.name}</td>
                <td className="px-3 py-2 text-right">{fmt(item.currentFunding)}</td>
                <td className="px-3 py-2 text-right text-ink-500">{fmt(item.estimatedCost)}</td>
                <td className="px-3 py-2 text-right"><span className={`font-semibold ${item.pctFunded >= 70 ? 'text-sage-700' : item.pctFunded >= 40 ? 'text-amber-600' : 'text-red-600'}`}>{item.pctFunded}%</span></td>
                <td className="px-3 py-2 text-right text-ink-500">{item.yearsRemaining}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-ink-200 font-bold">
              <td className="px-5 py-2">Total</td>
              <td className="px-3 py-2 text-right">{fmt(data.totalFunding)}</td>
              <td className="px-3 py-2 text-right">{fmt(data.totalRequired)}</td>
              <td className="px-3 py-2 text-right">{overallPct}%</td>
              <td className="px-3 py-2 text-right">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function InsuranceCertificate({ data }: { data: any }) {
  return (
    <div className="bg-white border border-ink-100 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-ink-100">
        <h3 className="font-display text-base font-bold text-ink-900">Insurance Certificate</h3>
        <p className="text-xs text-ink-400">{data.buildingName} · {data.address.street}, {data.address.city}, {data.address.state} {data.address.zip}</p>
      </div>
      <div className="divide-y divide-ink-50">
        {data.policies.map((p: any, i: number) => (
          <div key={i} className="p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-ink-900">{p.type}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${p.active ? 'bg-sage-100 text-sage-700' : 'bg-red-100 text-red-700'}`}>{p.active ? 'Active' : 'Expired'}</span>
              </div>
              <p className="text-xs text-ink-500 mt-0.5">{p.carrier} · Policy #{p.policyNum} · Coverage: {p.coverage} · Premium: {p.premium}</p>
            </div>
            <span className="text-xs text-ink-400">Exp: {p.expires}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssociationInfoSheet({ data }: { data: any }) {
  return (
    <div className="bg-white border border-ink-100 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-ink-100">
        <h3 className="font-display text-base font-bold text-ink-900">Association Information Sheet</h3>
      </div>
      <div className="p-5 space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3 bg-mist-50 rounded-lg p-4 border border-mist-200">
          <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Name</p><p className="font-bold text-ink-900">{data.buildingName}</p></div>
          <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Address</p><p className="text-ink-700">{data.address.street}, {data.address.city}, {data.address.state} {data.address.zip}</p></div>
          <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Units</p><p className="text-ink-700">{data.unitCount} · {data.details.type} · {data.details.floors} floors</p></div>
          <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Year Built</p><p className="text-ink-700">{data.details.yearBuilt}</p></div>
        </div>

        {data.management?.company && (
          <div>
            <h4 className="text-xs font-bold text-ink-400 uppercase tracking-wider mb-2">Management Company</h4>
            <div className="bg-mist-50 rounded-lg p-3 border border-mist-200">
              <p className="font-medium text-ink-900">{data.management.company}</p>
              <p className="text-xs text-ink-500 mt-0.5">{data.management.contact} · {data.management.email} · {data.management.phone}</p>
            </div>
          </div>
        )}

        {data.board.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-ink-400 uppercase tracking-wider mb-2">Board of Directors</h4>
            <div className="space-y-1">
              {data.board.map((b: any, i: number) => (
                <div key={i} className="flex items-center justify-between bg-mist-50 rounded-lg px-3 py-2 border border-mist-200">
                  <div><span className="font-medium text-ink-900">{b.name}</span><span className="text-ink-400 ml-2 text-xs">{b.role}</span></div>
                  {b.email && <span className="text-xs text-ink-400">{b.email}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {data.legalCounsel.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-ink-400 uppercase tracking-wider mb-2">Legal Counsel</h4>
            {data.legalCounsel.map((l: any, i: number) => (
              <div key={i} className="bg-mist-50 rounded-lg p-3 border border-mist-200">
                <p className="font-medium text-ink-900">{l.firm} — {l.attorney}</p>
                <p className="text-xs text-ink-500 mt-0.5">{l.email} · {l.phone}</p>
              </div>
            ))}
          </div>
        )}

        {data.amenities.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-ink-400 uppercase tracking-wider mb-2">Amenities</h4>
            <div className="flex flex-wrap gap-1.5">
              {data.amenities.map((a: string) => <span key={a} className="text-xs bg-mist-50 border border-mist-200 rounded-lg px-2.5 py-1 text-ink-600">{a}</span>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
