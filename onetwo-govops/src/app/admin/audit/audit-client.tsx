'use client'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/utils'

type AuditEntry = { id: number; action: string; actor: string; entity_type: string; entity_id: string; description: string | null; created_at: string; metadata: unknown }

const actionBadge = (action: string): 'green' | 'blue' | 'amber' | 'red' | 'purple' | 'gray' => {
  if (action.includes('created')) return 'green'
  if (action.includes('updated') || action.includes('changed')) return 'blue'
  if (action.includes('deleted') || action.includes('archived')) return 'red'
  if (action.includes('stripe')) return 'purple'
  return 'gray'
}

export function AuditClient({ entries }: { entries: AuditEntry[] }) {
  return (
    <div>
      <h2 className="font-serif text-2xl font-bold mb-1">Audit Log</h2>
      <p className="text-sm text-gray-500 mb-6">All admin actions are recorded here</p>
      {entries.length === 0 ? (
        <div className="bg-white rounded-[10px] border border-gray-200 p-12 text-center text-gray-400">
          No audit entries yet. Actions will be logged as you manage the platform.
        </div>
      ) : (
        <div className="bg-white rounded-[10px] border border-gray-200 overflow-hidden">
          <table className="w-full text-[0.82rem]">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200">Timestamp</th>
                <th className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200">Action</th>
                <th className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200">Actor</th>
                <th className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200">Entity</th>
                <th className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200">Description</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 border-b border-gray-100 text-gray-500 whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                  <td className="px-3 py-2.5 border-b border-gray-100"><Badge variant={actionBadge(e.action)}>{e.action}</Badge></td>
                  <td className="px-3 py-2.5 border-b border-gray-100">{e.actor}</td>
                  <td className="px-3 py-2.5 border-b border-gray-100"><Badge variant="gray">{e.entity_type}</Badge> <span className="text-xs text-gray-400">{e.entity_id}</span></td>
                  <td className="px-3 py-2.5 border-b border-gray-100 text-gray-600">{e.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
