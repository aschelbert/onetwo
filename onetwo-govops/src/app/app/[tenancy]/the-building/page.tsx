import { PageHeader } from '@/components/PageHeader'
import { KpiCard } from '@/components/KpiCard'

export default function TheBuildingPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="The Building"
        subtitle="Property details, units, vendors, maintenance & compliance"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Legal & Bylaws" value="--%" sub="Documents" variant="warn" />
        <KpiCard label="Insurance" value="--%" sub="Policies" variant="warn" />
        <KpiCard label="Governance" value="--%" sub="Board members" variant="warn" />
        <KpiCard label="Delinquency Rate" value="--%" sub="Units" variant="ok" />
      </div>

      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-[#929da8]">The Building is coming soon.</p>
      </div>
    </div>
  )
}
