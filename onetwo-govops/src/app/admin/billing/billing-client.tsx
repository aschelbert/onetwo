'use client'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDateTime } from '@/lib/utils'

type Event = { id: string; type: string; status: string; amount_cents: number | null; created_at: string; tenancies: { name: string } | null; payload: unknown }

export function BillingClient({ events }: { events: Event[] }) {
  return (
    <div>
      <h2 className="font-serif text-2xl font-bold mb-1">Billing Events</h2>
      <p className="text-sm text-gray-500 mb-6">Stripe webhook events log</p>
      {events.length === 0 ? (
        <div className="bg-white rounded-[10px] border border-gray-200 p-12 text-center text-gray-400">
          No webhook events recorded yet. Events will appear here once Stripe webhooks are configured.
        </div>
      ) : (
        <div className="bg-white rounded-[10px] border border-gray-200 overflow-x-auto">
          <table className="w-full text-[0.82rem]">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200 whitespace-nowrap">Timestamp</th>
                <th className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200 whitespace-nowrap">Event Type</th>
                <th className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200 whitespace-nowrap">Tenancy</th>
                <th className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200 whitespace-nowrap">Amount</th>
                <th className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200 whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 border-b border-gray-100 text-gray-500">{formatDateTime(e.created_at)}</td>
                  <td className="px-3 py-2.5 border-b border-gray-100 font-medium">{e.type}</td>
                  <td className="px-3 py-2.5 border-b border-gray-100">{e.tenancies?.name || '—'}</td>
                  <td className="px-3 py-2.5 border-b border-gray-100">{e.amount_cents ? formatCurrency(e.amount_cents) : '—'}</td>
                  <td className="px-3 py-2.5 border-b border-gray-100"><Badge variant={e.status === 'processed' ? 'green' : e.status === 'failed' ? 'red' : 'amber'}>{e.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
