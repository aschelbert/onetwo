'use client'
import { StatCard } from '@/components/admin/stat-card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDateTime } from '@/lib/utils'

type Plan = { id: string; name: string; color: string | null; price_monthly: number; price_yearly: number }
type Tenancy = { id: string; name: string; status: string; subscription_id: string; billing_cycle: string; board_members: number; residents: number; managers: number; staff: number; subscription_plans: { name: string; color: string | null; price_monthly: number; price_yearly: number } | null }
type AuditEntry = { id: number; action: string; actor: string; description: string | null; created_at: string; entity_type: string }
type WebhookEvent = { id: string; type: string; status: string; amount_cents: number | null; created_at: string; tenancies: { name: string } | null }

export function DashboardClient({ tenancies, plans, recentAudit, recentWebhooks, roles }: {
  tenancies: Tenancy[]
  plans: Plan[]
  recentAudit: AuditEntry[]
  recentWebhooks: WebhookEvent[]
  roles: { id: string; name: string; icon: string | null }[]
}) {
  const active = tenancies.filter(t => t.status === 'active').length
  const trial = tenancies.filter(t => t.status === 'trial').length
  const totalUsers = tenancies.reduce((a, t) => a + t.board_members + t.residents + t.managers + t.staff, 0)
  const mrr = tenancies
    .filter(t => t.status === 'active')
    .reduce((sum, t) => {
      const plan = plans.find(p => p.id === t.subscription_id)
      if (!plan) return sum
      const monthly = t.billing_cycle === 'yearly' ? Math.round(plan.price_yearly / 12) : plan.price_monthly
      return sum + monthly
    }, 0)

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Active Tenancies" value={active} sub={`${trial} in trial`} />
        <StatCard label="Total Users" value={totalUsers} sub={`across ${tenancies.length} tenancies`} />
        <StatCard label="MRR" value={formatCurrency(mrr)} sub="monthly recurring revenue" />
        <StatCard label="Modules" value={8} sub="in product catalog" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {/* Subscription Mix */}
        <div className="bg-white rounded-[10px] border border-gray-200 p-3 md:p-5">
          <h3 className="font-serif text-base font-bold mb-3">Subscription Mix</h3>
          {plans.map(s => {
            const cnt = tenancies.filter(t => t.subscription_id === s.id && (t.status === 'active' || t.status === 'trial')).length
            return (
              <div key={s.id} className="flex justify-between items-center py-1.5 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: s.color || '#999' }} />
                  <span className="text-sm">{s.name}</span>
                </div>
                <Badge variant="gray">{cnt} tenancies</Badge>
              </div>
            )
          })}
        </div>

        {/* Recent Webhook Events */}
        <div className="bg-white rounded-[10px] border border-gray-200 p-3 md:p-5">
          <h3 className="font-serif text-base font-bold mb-3">Recent Stripe Events</h3>
          {recentWebhooks.length === 0 ? (
            <p className="text-sm text-gray-400">No webhook events yet</p>
          ) : (
            recentWebhooks.map(e => (
              <div key={e.id} className={`p-2 pl-3 border-l-[3px] mb-2 rounded-r-md text-[0.8rem] ${e.status === 'processed' ? 'border-l-green-500 bg-green-50/50' : e.status === 'failed' ? 'border-l-red-500 bg-red-50/50' : 'border-l-gray-200 bg-gray-50'}`}>
                <div className="flex justify-between">
                  <strong className="text-xs">{e.type}</strong>
                  <Badge variant={e.status === 'processed' ? 'green' : e.status === 'failed' ? 'red' : 'gray'}>{e.status}</Badge>
                </div>
                <div className="text-gray-500 text-[0.72rem] mt-0.5">
                  {e.tenancies?.name || 'Unknown'} {e.amount_cents ? `· ${formatCurrency(e.amount_cents)}` : ''}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Roles Summary */}
        <div className="bg-white rounded-[10px] border border-gray-200 p-3 md:p-5">
          <h3 className="font-serif text-base font-bold mb-3">User Roles</h3>
          {roles.map(r => (
            <div key={r.id} className="py-2 border-b border-gray-100">
              <div className="flex justify-between text-sm mb-1">
                <span>{r.icon} {r.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Audit */}
      {recentAudit.length > 0 && (
        <div className="bg-white rounded-[10px] border border-gray-200 p-3 md:p-5">
          <h3 className="font-serif text-base font-bold mb-3">Recent Activity</h3>
          {recentAudit.map(a => (
            <div key={a.id} className="flex items-center gap-3 py-2 border-b border-gray-100 text-sm">
              <Badge variant={a.action.includes('created') ? 'green' : a.action.includes('updated') ? 'blue' : 'gray'}>{a.action}</Badge>
              <span className="text-gray-600 flex-1">{a.description}</span>
              <span className="text-xs text-gray-400">{formatDateTime(a.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
