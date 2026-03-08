'use client'

import { useState, useTransition } from 'react'
import { StepShell } from '../shared/StepShell'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { TabBar, TabButton } from '@/components/ui/tabs'
import { Input, Select, FormGroup } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, X, Check } from 'lucide-react'
import {
  seedDefaultChartOfAccounts,
  upsertChartOfAccount,
  deleteChartOfAccount,
  upsertBudgetCategory,
  deleteBudgetCategory,
  upsertReserveItem,
  deleteReserveItem,
  saveFinancialSettings,
  updateChecklistStep,
} from '@/app/app/onboarding/[tenancy]/actions'
import type { ChartOfAccountEntry, BudgetCategory, ReserveItem } from '@/types/onboarding'

type TabId = 'accounts' | 'budget' | 'reserves'

const ACCOUNT_TYPES = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'expense', label: 'Expense' },
]

interface Props {
  tenancyId: string
  tenancySlug: string
  initialAccounts: ChartOfAccountEntry[]
  initialCategories: BudgetCategory[]
  initialReserves: ReserveItem[]
  initialSettings: any
}

export function Step5FinancialSetup({
  tenancyId,
  tenancySlug,
  initialAccounts,
  initialCategories,
  initialReserves,
  initialSettings,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('accounts')
  const [accounts, setAccounts] = useState(initialAccounts)
  const [categories, setCategories] = useState(initialCategories)
  const [reserves, setReserves] = useState(initialReserves)
  const [editingAccount, setEditingAccount] = useState<ChartOfAccountEntry | null>(null)
  const [editingCategory, setEditingCategory] = useState<BudgetCategory | null>(null)
  const [editingReserve, setEditingReserve] = useState<ReserveItem | null>(null)
  const [, startTransition] = useTransition()

  const handleLoadDefaults = async () => {
    await seedDefaultChartOfAccounts(tenancyId)
    window.location.reload()
  }

  // ─── Chart of Accounts ─────────────────────────

  const handleSaveAccount = async (entry: ChartOfAccountEntry) => {
    await upsertChartOfAccount(tenancyId, entry)
    if (entry.id) {
      setAccounts(prev => prev.map(a => a.id === entry.id ? entry : a))
    } else {
      setAccounts(prev => [...prev, { ...entry, id: crypto.randomUUID() }])
    }
    setEditingAccount(null)
  }

  const handleDeleteAccount = async (id: string) => {
    await deleteChartOfAccount(id)
    setAccounts(prev => prev.filter(a => a.id !== id))
  }

  // ─── Budget Categories ─────────────────────────

  const handleSaveCategory = async (cat: BudgetCategory) => {
    await upsertBudgetCategory(tenancyId, cat)
    if (cat.id) {
      setCategories(prev => prev.map(c => c.id === cat.id ? cat : c))
    } else {
      setCategories(prev => [...prev, { ...cat, id: crypto.randomUUID() }])
    }
    setEditingCategory(null)
  }

  const handleDeleteCategory = async (id: string) => {
    await deleteBudgetCategory(id)
    setCategories(prev => prev.filter(c => c.id !== id))
  }

  // ─── Reserve Items ─────────────────────────────

  const handleSaveReserve = async (item: ReserveItem) => {
    await upsertReserveItem(tenancyId, item)
    if (item.id) {
      setReserves(prev => prev.map(r => r.id === item.id ? item : r))
    } else {
      setReserves(prev => [...prev, { ...item, id: crypto.randomUUID() }])
    }
    setEditingReserve(null)
  }

  const handleDeleteReserve = async (id: string) => {
    await deleteReserveItem(id)
    setReserves(prev => prev.filter(r => r.id !== id))
  }

  const handleSave = async () => {
    await updateChecklistStep(tenancyId, 'financial_setup_done', true)
  }

  return (
    <StepShell
      stepNumber={5}
      totalSteps={8}
      title="Financial Setup"
      description="Configure chart of accounts, budget categories, and reserve items."
      required={false}
      tenancySlug={tenancySlug}
      onSave={handleSave}
    >
      <TabBar>
        <TabButton active={activeTab === 'accounts'} onClick={() => setActiveTab('accounts')}>
          Chart of Accounts ({accounts.length})
        </TabButton>
        <TabButton active={activeTab === 'budget'} onClick={() => setActiveTab('budget')}>
          Budget ({categories.length})
        </TabButton>
        <TabButton active={activeTab === 'reserves'} onClick={() => setActiveTab('reserves')}>
          Reserves ({reserves.length})
        </TabButton>
      </TabBar>

      {/* Chart of Accounts Tab */}
      {activeTab === 'accounts' && (
        <Card>
          <CardHeader>
            <span className="text-[14px] font-semibold text-[#1a1f25]">Chart of Accounts</span>
            <div className="flex items-center gap-2">
              {accounts.length === 0 && (
                <Button size="xs" variant="secondary" onClick={handleLoadDefaults}>
                  Load Defaults
                </Button>
              )}
              <Button size="xs" variant="secondary" onClick={() => setEditingAccount({
                account_number: '', name: '', account_type: 'expense', sub_type: null, parent_id: null,
              })}>
                <Plus size={13} /> Add
              </Button>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {accounts.length === 0 && !editingAccount && (
              <p className="text-[13px] text-[#929da8] text-center py-6">
                No accounts yet. Click &ldquo;Load Defaults&rdquo; for a standard HOA chart of accounts.
              </p>
            )}

            {accounts.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-[#f8f9fa] border-b border-[#e6e8eb]">
                      <th className="px-3 py-2 text-left text-[#6e7b8a] font-semibold">Number</th>
                      <th className="px-3 py-2 text-left text-[#6e7b8a] font-semibold">Name</th>
                      <th className="px-3 py-2 text-left text-[#6e7b8a] font-semibold">Type</th>
                      <th className="px-3 py-2 text-center text-[#6e7b8a] font-semibold w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map(a => (
                      <tr key={a.id} className="border-b border-[#f8f9fa] hover:bg-[#f8f9fa]">
                        <td className="px-3 py-2 text-[#1a1f25] font-medium">{a.account_number}</td>
                        <td className="px-3 py-2 text-[#45505a]">{a.name}</td>
                        <td className="px-3 py-2 text-[#6e7b8a] capitalize">{a.account_type}</td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => a.id && handleDeleteAccount(a.id)} className="text-[#929da8] hover:text-[#d12626] p-1">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {editingAccount && (
              <div className="p-4">
                <AccountForm account={editingAccount} onSave={handleSaveAccount} onCancel={() => setEditingAccount(null)} />
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Budget Tab */}
      {activeTab === 'budget' && (
        <Card>
          <CardHeader>
            <span className="text-[14px] font-semibold text-[#1a1f25]">Budget Categories</span>
            <Button size="xs" variant="secondary" onClick={() => setEditingCategory({
              name: '', budgeted_amount: 0,
            })}>
              <Plus size={13} /> Add
            </Button>
          </CardHeader>
          <CardBody className="p-0">
            {categories.length === 0 && !editingCategory && (
              <p className="text-[13px] text-[#929da8] text-center py-6">No budget categories yet.</p>
            )}

            {categories.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-[#f8f9fa] border-b border-[#e6e8eb]">
                      <th className="px-3 py-2 text-left text-[#6e7b8a] font-semibold">Category</th>
                      <th className="px-3 py-2 text-right text-[#6e7b8a] font-semibold">Budgeted Amount</th>
                      <th className="px-3 py-2 text-center text-[#6e7b8a] font-semibold w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map(c => (
                      <tr key={c.id} className="border-b border-[#f8f9fa] hover:bg-[#f8f9fa]">
                        <td className="px-3 py-2 text-[#1a1f25]">{c.name}</td>
                        <td className="px-3 py-2 text-right text-[#45505a]">
                          ${c.budgeted_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => c.id && handleDeleteCategory(c.id)} className="text-[#929da8] hover:text-[#d12626] p-1">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-[#f8f9fa] font-semibold">
                      <td className="px-3 py-2 text-[#1a1f25]">Total</td>
                      <td className="px-3 py-2 text-right text-[#1a1f25]">
                        ${categories.reduce((s, c) => s + c.budgeted_amount, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {editingCategory && (
              <div className="p-4">
                <CategoryForm category={editingCategory} onSave={handleSaveCategory} onCancel={() => setEditingCategory(null)} />
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Reserves Tab */}
      {activeTab === 'reserves' && (
        <Card>
          <CardHeader>
            <span className="text-[14px] font-semibold text-[#1a1f25]">Reserve Items</span>
            <Button size="xs" variant="secondary" onClick={() => setEditingReserve({
              name: '', estimated_cost: 0, current_funding: 0,
              useful_life: null, years_remaining: null, is_contingency: false,
            })}>
              <Plus size={13} /> Add
            </Button>
          </CardHeader>
          <CardBody className="p-0">
            {reserves.length === 0 && !editingReserve && (
              <p className="text-[13px] text-[#929da8] text-center py-6">No reserve items yet.</p>
            )}

            {reserves.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-[#f8f9fa] border-b border-[#e6e8eb]">
                      <th className="px-3 py-2 text-left text-[#6e7b8a] font-semibold">Item</th>
                      <th className="px-3 py-2 text-right text-[#6e7b8a] font-semibold">Est. Cost</th>
                      <th className="px-3 py-2 text-right text-[#6e7b8a] font-semibold">Funded</th>
                      <th className="px-3 py-2 text-right text-[#6e7b8a] font-semibold">Years Left</th>
                      <th className="px-3 py-2 text-center text-[#6e7b8a] font-semibold w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {reserves.map(r => (
                      <tr key={r.id} className="border-b border-[#f8f9fa] hover:bg-[#f8f9fa]">
                        <td className="px-3 py-2 text-[#1a1f25]">{r.name}</td>
                        <td className="px-3 py-2 text-right text-[#45505a]">
                          ${r.estimated_cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-right text-[#45505a]">
                          ${r.current_funding.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-right text-[#45505a]">
                          {r.years_remaining ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => r.id && handleDeleteReserve(r.id)} className="text-[#929da8] hover:text-[#d12626] p-1">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {editingReserve && (
              <div className="p-4">
                <ReserveForm item={editingReserve} onSave={handleSaveReserve} onCancel={() => setEditingReserve(null)} />
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </StepShell>
  )
}

// ─── Inline forms ────────────────────────────────────────────────────────────

function AccountForm({
  account,
  onSave,
  onCancel,
}: {
  account: ChartOfAccountEntry
  onSave: (a: ChartOfAccountEntry) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState(account)
  const [saving, setSaving] = useState(false)

  return (
    <div className="p-3 bg-[#f8f9fa] rounded-lg border border-[#e6e8eb]">
      <div className="grid grid-cols-3 gap-4">
        <FormGroup label="Account Number *">
          <Input value={form.account_number} onChange={e => setForm(p => ({ ...p, account_number: e.target.value }))} placeholder="e.g. 5000" />
        </FormGroup>
        <FormGroup label="Name *">
          <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        </FormGroup>
        <FormGroup label="Type">
          <Select value={form.account_type} onChange={e => setForm(p => ({ ...p, account_type: e.target.value }))}>
            {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </FormGroup>
      </div>
      <div className="flex justify-end gap-2 mt-2">
        <Button variant="ghost" size="sm" onClick={onCancel}><X size={13} /> Cancel</Button>
        <Button variant="primary" size="sm" disabled={!form.account_number || !form.name || saving} onClick={async () => {
          setSaving(true); await onSave(form); setSaving(false)
        }}>
          <Check size={13} /> {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

function CategoryForm({
  category,
  onSave,
  onCancel,
}: {
  category: BudgetCategory
  onSave: (c: BudgetCategory) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState(category)
  const [saving, setSaving] = useState(false)

  return (
    <div className="p-3 bg-[#f8f9fa] rounded-lg border border-[#e6e8eb]">
      <div className="grid grid-cols-2 gap-4">
        <FormGroup label="Category Name *">
          <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        </FormGroup>
        <FormGroup label="Budgeted Amount ($)">
          <Input type="number" value={form.budgeted_amount} onChange={e => setForm(p => ({ ...p, budgeted_amount: parseFloat(e.target.value) || 0 }))} min={0} step="0.01" />
        </FormGroup>
      </div>
      <div className="flex justify-end gap-2 mt-2">
        <Button variant="ghost" size="sm" onClick={onCancel}><X size={13} /> Cancel</Button>
        <Button variant="primary" size="sm" disabled={!form.name || saving} onClick={async () => {
          setSaving(true); await onSave(form); setSaving(false)
        }}>
          <Check size={13} /> {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

function ReserveForm({
  item,
  onSave,
  onCancel,
}: {
  item: ReserveItem
  onSave: (r: ReserveItem) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState(item)
  const [saving, setSaving] = useState(false)

  return (
    <div className="p-3 bg-[#f8f9fa] rounded-lg border border-[#e6e8eb]">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <FormGroup label="Item Name *">
          <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Roof Replacement" />
        </FormGroup>
        <FormGroup label="Estimated Cost ($)">
          <Input type="number" value={form.estimated_cost} onChange={e => setForm(p => ({ ...p, estimated_cost: parseFloat(e.target.value) || 0 }))} min={0} step="0.01" />
        </FormGroup>
        <FormGroup label="Current Funding ($)">
          <Input type="number" value={form.current_funding} onChange={e => setForm(p => ({ ...p, current_funding: parseFloat(e.target.value) || 0 }))} min={0} step="0.01" />
        </FormGroup>
        <FormGroup label="Useful Life (years)">
          <Input type="number" value={form.useful_life ?? ''} onChange={e => setForm(p => ({ ...p, useful_life: e.target.value ? parseInt(e.target.value) : null }))} min={0} />
        </FormGroup>
        <FormGroup label="Years Remaining">
          <Input type="number" value={form.years_remaining ?? ''} onChange={e => setForm(p => ({ ...p, years_remaining: e.target.value ? parseInt(e.target.value) : null }))} min={0} />
        </FormGroup>
      </div>
      <div className="flex justify-end gap-2 mt-2">
        <Button variant="ghost" size="sm" onClick={onCancel}><X size={13} /> Cancel</Button>
        <Button variant="primary" size="sm" disabled={!form.name || saving} onClick={async () => {
          setSaving(true); await onSave(form); setSaving(false)
        }}>
          <Check size={13} /> {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
