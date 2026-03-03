'use client'
import { Badge } from '@/components/ui/badge'

type Role = {
  id: string; name: string; description: string | null; icon: string | null; sort_order: number;
  plan_role_availability: { plan_id: string; subscription_plans: { name: string; color: string | null } | null }[]
}

export function RolesClient({ roles }: { roles: Role[] }) {
  return (
    <div>
      <h2 className="font-serif text-2xl font-bold mb-1">User Roles</h2>
      <p className="text-sm text-gray-500 mb-6">{roles.length} system-defined roles</p>
      <div className="grid grid-cols-2 gap-4">
        {roles.map(r => (
          <div key={r.id} className="bg-white rounded-[10px] border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">{r.icon}</span>
              <div>
                <h3 className="font-serif text-lg font-bold">{r.name}</h3>
                <p className="text-sm text-gray-500">{r.description}</p>
              </div>
            </div>
            <div className="text-xs text-gray-500 mb-2">Available in plans:</div>
            <div className="flex gap-1.5 flex-wrap">
              {r.plan_role_availability.map(pra => (
                <span key={pra.plan_id} className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.65rem] font-semibold" style={{ background: `${pra.subscription_plans?.color || '#999'}20`, color: pra.subscription_plans?.color || '#999' }}>
                  {pra.subscription_plans?.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
