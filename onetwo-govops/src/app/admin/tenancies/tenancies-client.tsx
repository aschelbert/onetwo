'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Input, Select, FormGroup } from '@/components/ui/input'
import { formatDate } from '@/lib/utils'

type Plan = { id: string; name: string }
type Tenancy = Record<string, unknown> & {
  id: string; name: string; slug: string; address: string | null; units: number; subscription_id: string;
  status: string; billing_cycle: string; jurisdiction: string | null; board_members: number;
  residents: number; managers: number; staff: number; created_at: string; trial_ends_at: string | null;
  last_payment_at: string | null; stripe_customer_id: string | null; stripe_subscription_id: string | null;
  subscription_plans: { name: string; color: string | null } | null
}

const statusVariant: Record<string, 'green' | 'amber' | 'red' | 'gray'> = { active: 'green', trial: 'amber', suspended: 'red', churned: 'gray' }

export function TenanciesClient({ tenancies, plans }: { tenancies: Tenancy[]; plans: Plan[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<Tenancy | null>(null)
  const [creating, setCreating] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [form, setForm] = useState({ name: '', slug: '', address: '', units: '', subscription_id: '', status: 'active', billing_cycle: 'monthly', jurisdiction: '', board_members: '', residents: '', managers: '', staff: '' })

  const filtered = statusFilter === 'all' ? tenancies : tenancies.filter(t => t.status === statusFilter)

  function openEdit(t: Tenancy) {
    setForm({
      name: t.name, slug: t.slug, address: t.address || '', units: String(t.units),
      subscription_id: t.subscription_id, status: t.status, billing_cycle: t.billing_cycle,
      jurisdiction: t.jurisdiction || '', board_members: String(t.board_members),
      residents: String(t.residents), managers: String(t.managers), staff: String(t.staff),
    })
    setEditing(t)
  }

  function openCreate() {
    setForm({ name: '', slug: '', address: '', units: '', subscription_id: plans[0]?.id || '', status: 'trial', billing_cycle: 'monthly', jurisdiction: '', board_members: '0', residents: '0', managers: '0', staff: '0' })
    setCreating(true)
  }

  async function handleSave() {
    const payload = {
      ...(editing ? { id: editing.id } : {}),
      name: form.name, slug: form.slug, address: form.address, units: parseInt(form.units) || 0,
      subscription_id: form.subscription_id, status: form.status, billing_cycle: form.billing_cycle,
      jurisdiction: form.jurisdiction, board_members: parseInt(form.board_members) || 0,
      residents: parseInt(form.residents) || 0, managers: parseInt(form.managers) || 0, staff: parseInt(form.staff) || 0,
    }
    await fetch('/api/admin/tenancies', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setEditing(null); setCreating(false); router.refresh()
  }

  const isOpen = !!editing || creating

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <h2 className="font-serif text-2xl font-bold">Tenancies</h2>
          <p className="text-sm text-gray-500 mt-1">{tenancies.length} associations managed</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {['all', 'active', 'trial', 'suspended', 'churned'].map(s => (
            <Button key={s} variant={statusFilter === s ? 'primary' : 'secondary'} size="sm" onClick={() => setStatusFilter(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
          <Button onClick={openCreate}>+ Add Tenancy</Button>
        </div>
      </div>

      <div className="bg-white rounded-[10px] border border-gray-200 overflow-x-auto">
        <table className="w-full text-[0.82rem]">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200">Association</th>
              <th className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200">Plan</th>
              <th className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200">Status</th>
              <th className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200">Units</th>
              <th className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200">Users</th>
              <th className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200">Created</th>
              <th className="px-3 py-2.5 border-b-2 border-gray-200"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openEdit(t)}>
                <td className="px-3 py-2.5 border-b border-gray-100">
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-xs text-gray-400">{t.address}</div>
                </td>
                <td className="px-3 py-2.5 border-b border-gray-100">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: t.subscription_plans?.color || '#999' }} />
                    {t.subscription_plans?.name}
                  </div>
                </td>
                <td className="px-3 py-2.5 border-b border-gray-100"><Badge variant={statusVariant[t.status] || 'gray'}>{t.status}</Badge></td>
                <td className="px-3 py-2.5 border-b border-gray-100">{t.units}</td>
                <td className="px-3 py-2.5 border-b border-gray-100">{t.board_members + t.residents + t.managers + t.staff}</td>
                <td className="px-3 py-2.5 border-b border-gray-100 text-gray-500">{formatDate(t.created_at)}</td>
                <td className="px-3 py-2.5 border-b border-gray-100"><Button variant="ghost" size="xs">Edit</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={isOpen} onClose={() => { setEditing(null); setCreating(false) }} title={editing ? 'Edit Tenancy' : 'Add Tenancy'} size="lg"
        footer={<><Button variant="secondary" onClick={() => { setEditing(null); setCreating(false) }}>Cancel</Button><Button onClick={handleSave}>Save</Button></>}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormGroup label="Association Name"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></FormGroup>
          <FormGroup label="Slug"><Input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} /></FormGroup>
        </div>
        <FormGroup label="Address"><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></FormGroup>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormGroup label="Units"><Input type="number" value={form.units} onChange={e => setForm({ ...form, units: e.target.value })} /></FormGroup>
          <FormGroup label="Plan"><Select value={form.subscription_id} onChange={e => setForm({ ...form, subscription_id: e.target.value })}>{plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></FormGroup>
          <FormGroup label="Status"><Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="trial">Trial</option><option value="suspended">Suspended</option><option value="churned">Churned</option></Select></FormGroup>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormGroup label="Billing Cycle"><Select value={form.billing_cycle} onChange={e => setForm({ ...form, billing_cycle: e.target.value })}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></Select></FormGroup>
          <FormGroup label="Jurisdiction"><Input value={form.jurisdiction} onChange={e => setForm({ ...form, jurisdiction: e.target.value })} /></FormGroup>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <FormGroup label="Board Members"><Input type="number" value={form.board_members} onChange={e => setForm({ ...form, board_members: e.target.value })} /></FormGroup>
          <FormGroup label="Residents"><Input type="number" value={form.residents} onChange={e => setForm({ ...form, residents: e.target.value })} /></FormGroup>
          <FormGroup label="Managers"><Input type="number" value={form.managers} onChange={e => setForm({ ...form, managers: e.target.value })} /></FormGroup>
          <FormGroup label="Staff"><Input type="number" value={form.staff} onChange={e => setForm({ ...form, staff: e.target.value })} /></FormGroup>
        </div>
      </Dialog>
    </div>
  )
}
