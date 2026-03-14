'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Input, Select, FormGroup } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'

type Role = { id: string; name: string; icon: string | null }
type Plan = Record<string, unknown> & { id: string; name: string; slug: string; description: string | null; price_monthly: number; price_yearly: number; status: string; sort_order: number; color: string | null; stripe_product_id: string | null; stripe_sync_status: string; plan_role_availability: { role_id: string }[] }
type Tenancy = { id: string; subscription_id: string }

export function SubscriptionsClient({ plans, tenancies, roles, trialDays: initialTrialDays }: { plans: Plan[]; tenancies: Tenancy[]; roles: Role[]; trialDays: number }) {
  const router = useRouter()
  const [editing, setEditing] = useState<Plan | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', description: '', price_monthly: '', price_yearly: '', status: 'active', color: '#c42030', roles: [] as string[] })
  const [syncing, setSyncing] = useState<string | null>(null)
  const [trialDaysInput, setTrialDaysInput] = useState(initialTrialDays)
  const [trialDaysSaving, setTrialDaysSaving] = useState(false)
  const [trialDaysSaved, setTrialDaysSaved] = useState(initialTrialDays)

  function openEdit(plan: Plan) {
    setForm({
      name: plan.name, slug: plan.slug, description: plan.description || '',
      price_monthly: String(plan.price_monthly / 100), price_yearly: String(plan.price_yearly / 100),
      status: plan.status, color: plan.color || '#c42030',
      roles: plan.plan_role_availability.map(r => r.role_id),
    })
    setEditing(plan)
  }

  function openCreate() {
    setForm({ name: '', slug: '', description: '', price_monthly: '', price_yearly: '', status: 'active', color: '#c42030', roles: [] })
    setCreating(true)
  }

  async function handleSave() {
    const payload = {
      ...(editing ? { id: editing.id } : { id: form.slug }),
      name: form.name, slug: form.slug, description: form.description,
      price_monthly: Math.round(parseFloat(form.price_monthly) * 100),
      price_yearly: Math.round(parseFloat(form.price_yearly) * 100),
      status: form.status, color: form.color, roles: form.roles,
    }
    await fetch('/api/admin/subscriptions', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setEditing(null); setCreating(false); router.refresh()
  }

  async function handleSync(planId: string) {
    setSyncing(planId)
    await fetch('/api/admin/stripe-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_id: planId }),
    })
    setSyncing(null); router.refresh()
  }

  const isOpen = !!editing || creating

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="font-serif text-2xl font-bold">Subscription Plans</h2>
          <p className="text-sm text-gray-500 mt-1">Manage plans, pricing, and Stripe product links</p>
        </div>
        <Button onClick={openCreate}>+ Add Plan</Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {plans.map(s => {
          const tenCount = tenancies.filter(t => t.subscription_id === s.id).length
          const syncClass = s.stripe_sync_status === 'synced' ? 'bg-green-500' : s.stripe_sync_status === 'error' ? 'bg-red-500' : 'bg-amber-500'
          return (
            <div key={s.id} className="bg-white rounded-[10px] border border-gray-200 overflow-hidden hover:shadow-md transition-shadow" style={{ borderTop: `3px solid ${s.color || '#999'}` }}>
              <div className="p-5">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-serif text-lg font-bold">{s.name}</h3>
                  <Badge variant={s.status === 'active' ? 'green' : 'gray'}>{s.status}</Badge>
                </div>
                <p className="text-[0.82rem] text-gray-500 mb-4">{s.description}</p>
                <div className="flex gap-4 mb-4">
                  <div><span className="text-2xl font-bold">{formatCurrency(s.price_monthly)}</span><span className="text-xs text-gray-500">/mo</span></div>
                  <div className="pt-1"><span className="text-sm font-semibold">{formatCurrency(s.price_yearly)}</span><span className="text-[0.72rem] text-gray-500">/yr</span></div>
                </div>
                <div className="text-[0.78rem] text-gray-500 mb-2">{tenCount} tenancies · {s.plan_role_availability.length} roles</div>
                <div className="flex items-center gap-1.5 text-xs p-2 bg-gray-50 rounded-md mb-3">
                  <span className={`w-2 h-2 rounded-full ${syncClass}`} />
                  <span className="text-gray-600">Stripe: <code className="text-[0.7rem]">{s.stripe_product_id || 'Not linked'}</code></span>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="secondary" size="sm" onClick={() => openEdit(s)}>Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => handleSync(s.id)} disabled={syncing === s.id}>
                    {syncing === s.id ? 'Syncing...' : '↻ Sync'}
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Trial Settings */}
      <div className="mt-8 bg-white rounded-[10px] border border-gray-200 p-5">
        <h3 className="font-serif text-lg font-bold mb-1">Trial Settings</h3>
        <p className="text-sm text-gray-500 mb-4">Configure the default trial period for new tenancies. Changes apply to future sign-ups only.</p>
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Trial length (days)</label>
            <Input
              type="number"
              value={trialDaysInput}
              onChange={e => setTrialDaysInput(Math.max(0, Math.min(365, parseInt(e.target.value) || 0)))}
              className="w-24"
            />
          </div>
          <Button
            disabled={trialDaysSaving || trialDaysInput === trialDaysSaved}
            onClick={async () => {
              setTrialDaysSaving(true)
              const res = await fetch('/api/admin/subscriptions', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trial_days: trialDaysInput }),
              })
              setTrialDaysSaving(false)
              if (res.ok) { setTrialDaysSaved(trialDaysInput); router.refresh() }
            }}
          >
            {trialDaysSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Set to 0 to disable free trials. Maximum 365 days.</p>
      </div>

      <Dialog open={isOpen} onClose={() => { setEditing(null); setCreating(false) }} title={editing ? 'Edit Subscription Plan' : 'Add Subscription Plan'} size="lg"
        footer={<><Button variant="secondary" onClick={() => { setEditing(null); setCreating(false) }}>Cancel</Button><Button onClick={handleSave}>Save Plan</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Plan Name"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Compliance Pro" /></FormGroup>
          <FormGroup label="Slug"><Input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="e.g. compliance-pro" /></FormGroup>
        </div>
        <FormGroup label="Description"><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></FormGroup>
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Monthly Price ($)"><Input type="number" value={form.price_monthly} onChange={e => setForm({ ...form, price_monthly: e.target.value })} /></FormGroup>
          <FormGroup label="Yearly Price ($)"><Input type="number" value={form.price_yearly} onChange={e => setForm({ ...form, price_yearly: e.target.value })} /></FormGroup>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Status">
            <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option>
            </Select>
          </FormGroup>
          <FormGroup label="Brand Color"><Input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} /></FormGroup>
        </div>
        <FormGroup label="Available to Roles">
          <div className="flex gap-3 flex-wrap">
            {roles.map(r => (
              <label key={r.id} className="flex items-center gap-1.5 text-[0.82rem] cursor-pointer">
                <input type="checkbox" checked={form.roles.includes(r.id)} onChange={e => {
                  setForm({ ...form, roles: e.target.checked ? [...form.roles, r.id] : form.roles.filter(x => x !== r.id) })
                }} /> {r.icon} {r.name}
              </label>
            ))}
          </div>
        </FormGroup>
      </Dialog>
    </div>
  )
}
