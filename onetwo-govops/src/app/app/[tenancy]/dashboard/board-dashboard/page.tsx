'use client'

import { useTenant } from '@/lib/tenant-context'
import { PageHeader } from '@/components/PageHeader'
import { AlertBar } from '@/components/AlertBar'
import { KpiCard } from '@/components/KpiCard'

export default function BoardDashboard() {
  const { user, tenancy } = useTenant()
  const firstName = user.display_name.split(' ')[0]
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle={`${tenancy.name} · ${today}`}
        grades={[
          { value: '--', label: 'Building' },
          { value: '--', label: 'Compliance' },
        ]}
      />

      <AlertBar
        badge="Fiduciary"
        message="Complete your reserve study review to stay compliant with state requirements."
        linkText="Review now"
        onLinkClick={() => {}}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Collection Rate" value="--%" sub="Monthly expected" variant="ok" />
        <KpiCard label="Reserve Funding" value="--%" sub="Funded" variant="warn" />
        <KpiCard label="Compliance Score" value="--%" sub="Grade pending" variant="warn" />
        <KpiCard label="Open Cases" value="--" sub="Urgent/high" variant="default" />
      </div>

      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-[#929da8]">Dashboard modules are coming soon.</p>
      </div>
    </div>
  )
}
