import { PageHeader } from '@/components/PageHeader'
import { AssociationTeamNav } from '@/components/association-team/AssociationTeamNav'

export default function AssociationTeamLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageHeader
        title="Association Team"
        subtitle="Manage property operations, staff performance, and task tracking"
      />
      <div className="mt-4">
        <AssociationTeamNav />
      </div>
      {children}
    </div>
  )
}
