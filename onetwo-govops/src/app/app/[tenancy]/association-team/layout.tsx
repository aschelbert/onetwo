import { AssociationTeamNav } from '@/components/association-team/AssociationTeamNav'

export default function AssociationTeamLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-xl font-bold text-[#1a1f25] mb-1">Association Team</h1>
      <p className="text-sm text-[#929da8] mb-4">Manage property operations, staff performance, and task tracking</p>
      <AssociationTeamNav />
      {children}
    </div>
  )
}
