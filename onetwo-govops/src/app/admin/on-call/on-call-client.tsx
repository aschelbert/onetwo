'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/input'
import { formatDate } from '@/lib/utils'
import type { OnCallRow } from '@/lib/on-call'

type ConsoleUser = { id: string; email: string; display_name: string | null }

const TH = 'text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200'
const TD = 'px-3 py-2.5 border-b border-gray-100 align-top'
const userLabel = (u: ConsoleUser) => u.display_name?.trim() || u.email

export function OnCallClient({ rows, users, currentUserId, opened, errors }: {
  rows: OnCallRow[]; users: ConsoleUser[]; currentUserId: string; opened: number; errors: string[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [picked, setPicked] = useState<Record<string, string>>({})

  const waiting = rows.filter(r => r.status === 'requested')
  const assigned = rows.filter(r => r.status === 'assigned')
  const byAdvisor = new Map<string, OnCallRow[]>()
  for (const r of assigned) {
    const key = r.advisor_email || 'unknown'
    byAdvisor.set(key, [...(byAdvisor.get(key) || []), r])
  }

  async function assign(tenantId: string, consoleUserId: string) {
    setBusy(tenantId); setError(null); setNotice(null)
    const res = await fetch('/api/admin/on-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId, console_user_id: consoleUserId }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setError(data.error || 'Assigning the advisor failed'); return }
    setNotice(data.noticePosted
      ? `${data.advisorName} is now the On Call advisor for ${data.building}. The building has been told.`
      : `${data.advisorName} is assigned to ${data.building}, but the notice to the building could not be posted: ${data.noticeError}`)
    router.refresh()
  }

  async function unassign(row: OnCallRow) {
    if (!confirm(`Remove ${row.advisor_name} as the On Call advisor for ${row.building}? The building goes back to waiting for an advisor.`)) return
    setBusy(row.tenant_id); setError(null); setNotice(null)
    const res = await fetch(`/api/admin/on-call?tenant_id=${encodeURIComponent(row.tenant_id)}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setError(data.error || 'Removing the advisor failed'); return }
    router.refresh()
  }

  const assignControls = (row: OnCallRow) => {
    const choice = picked[row.tenant_id] ?? currentUserId
    return (
      <div className="flex flex-wrap items-center gap-2 justify-end">
        <Select aria-label={`Advisor for ${row.building}`} value={choice} onChange={e => setPicked({ ...picked, [row.tenant_id]: e.target.value })} className="w-44">
          {users.map(u => <option key={u.id} value={u.id}>{u.id === currentUserId ? `Me (${userLabel(u)})` : userLabel(u)}</option>)}
        </Select>
        <Button size="sm" disabled={busy === row.tenant_id || !choice} onClick={() => assign(row.tenant_id, choice)}>
          {busy === row.tenant_id ? 'Saving…' : row.status === 'assigned' ? 'Reassign' : choice === currentUserId ? 'Assign myself' : 'Assign'}
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-serif text-2xl font-bold">On Call Advisors</h2>
        <p className="text-sm text-gray-500 mt-1">
          {rows.length} {rows.length === 1 ? 'building has' : 'buildings have'} the On Call add-on · {waiting.length} waiting for an advisor
        </p>
      </div>

      {opened > 0 && <p className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-md px-3 py-2 mb-4">Opened {opened} new support {opened === 1 ? 'thread' : 'threads'} for buildings waiting for an advisor.</p>}
      {notice && <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-md px-3 py-2 mb-4">{notice}</p>}
      {[...(error ? [error] : []), ...errors].map(e => <p key={e} role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">{e}</p>)}

      <h3 className="font-serif text-lg font-bold mb-3">Waiting for an advisor</h3>
      <div className="bg-white rounded-[10px] border border-gray-200 overflow-x-auto mb-8">
        <table className="w-full text-[0.82rem]">
          <thead><tr className="bg-gray-50"><th className={TH}>Building</th><th className={TH}>Plan</th><th className={TH}>Requested</th><th className={TH}>Support thread</th><th className={TH}></th></tr></thead>
          <tbody>
            {waiting.map(r => (
              <tr key={r.tenant_id}>
                <td className={TD}><div className="font-semibold">{r.building}</div><div className="text-xs text-gray-400">{r.slug}.getonetwo.com</div></td>
                <td className={TD}>{r.plan}<div className="text-xs text-gray-400">{r.subscription_status}</div></td>
                <td className={TD}>{formatDate(r.requested_at)}</td>
                <td className={TD}>{r.support_thread_id ? <Link href="/admin/support" className="text-blue-700 underline">Open in Support</Link> : <span className="text-gray-400">Not opened</span>}</td>
                <td className={TD}>{assignControls(r)}</td>
              </tr>
            ))}
            {waiting.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No building is waiting for an advisor.</td></tr>}
          </tbody>
        </table>
      </div>

      <h3 className="font-serif text-lg font-bold mb-3">Assigned</h3>
      <div className="bg-white rounded-[10px] border border-gray-200 overflow-x-auto mb-8">
        <table className="w-full text-[0.82rem]">
          <thead><tr className="bg-gray-50"><th className={TH}>Building</th><th className={TH}>Plan</th><th className={TH}>Advisor</th><th className={TH}>Assigned</th><th className={TH}></th></tr></thead>
          <tbody>
            {assigned.map(r => (
              <tr key={r.tenant_id}>
                <td className={TD}><div className="font-semibold">{r.building}</div><div className="text-xs text-gray-400">{r.slug}.getonetwo.com</div></td>
                <td className={TD}>{r.plan}<div className="text-xs text-gray-400">{r.subscription_status}</div></td>
                <td className={TD}><div className="font-semibold">{r.advisor_name}</div><div className="text-xs text-gray-400">{r.advisor_email}</div></td>
                <td className={TD}>{r.assigned_at ? formatDate(r.assigned_at) : '—'}<div className="text-xs text-gray-400">by {r.assigned_by || '—'}</div></td>
                <td className={TD}>
                  <div className="flex flex-wrap items-center gap-2 justify-end">
                    {assignControls(r)}
                    <Button size="sm" variant="ghost" disabled={busy === r.tenant_id} onClick={() => unassign(r)}>Remove</Button>
                  </div>
                </td>
              </tr>
            ))}
            {assigned.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No advisor is assigned yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <h3 className="font-serif text-lg font-bold mb-3">By advisor</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {users.map(u => {
          const theirs = byAdvisor.get(u.email) || []
          return (
            <div key={u.id} className="bg-white rounded-[10px] border border-gray-200 p-4">
              <div className="flex justify-between items-start mb-2">
                <div><div className="font-semibold">{userLabel(u)}</div><div className="text-xs text-gray-400">{u.email}</div></div>
                <Badge variant={theirs.length ? 'green' : 'gray'}>{theirs.length} {theirs.length === 1 ? 'building' : 'buildings'}</Badge>
              </div>
              {theirs.length ? <ul className="text-sm text-gray-700 space-y-0.5">{theirs.map(r => <li key={r.tenant_id}>{r.building}</li>)}</ul> : <p className="text-sm text-gray-400">Not an advisor for any building.</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
