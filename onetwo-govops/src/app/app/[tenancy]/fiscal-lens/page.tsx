import { PageHeader } from '@/components/PageHeader'
import { KpiCard } from '@/components/KpiCard'

export default function FiscalLensPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Fiscal Lens"
        subtitle="Double-entry general ledger, chart of accounts, budgets, reserves & reports"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Operating Cash" value="--" sub="Acct 1010" variant="default" />
        <KpiCard label="Reserve Fund" value="--" sub="% of goal" variant="warn" />
        <KpiCard label="Accounts Receivable" value="--" sub="Collection rate" variant="ok" />
        <KpiCard label="Net Income YTD" value="--" sub="Income · Expenses" variant="default" />
      </div>

      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-[#929da8]">Fiscal Lens is coming soon.</p>
      </div>
    </div>
  )
}
