'use client'

import { useState, useTransition } from 'react'
import { StepShell } from '../shared/StepShell'
import { CSVImporter } from '../shared/CSVImporter'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Input, FormGroup } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Edit2, X, Check, AlertTriangle } from 'lucide-react'
import {
  upsertUnit,
  deleteUnit,
  importUnitsFromCSV,
  updateChecklistStep,
} from '@/app/app/onboarding/[tenancy]/actions'
import type { UnitData } from '@/types/onboarding'

const CSV_HEADERS = ['number', 'owner', 'email', 'phone', 'monthly_fee', 'voting_pct', 'sqft', 'bedrooms', 'parking']

interface Props {
  tenancyId: string
  tenancySlug: string
  initialUnits: UnitData[]
}

export function Step4UnitRoster({ tenancyId, tenancySlug, initialUnits }: Props) {
  const [units, setUnits] = useState<UnitData[]>(initialUnits)
  const [editingUnit, setEditingUnit] = useState<UnitData | null>(null)
  const [, startTransition] = useTransition()

  const totalMonthly = units.reduce((sum, u) => sum + (u.monthly_fee || 0), 0)
  const totalVoting = units.reduce((sum, u) => sum + (u.voting_pct || 0), 0)
  const votingWarning = units.length > 0 && Math.abs(totalVoting - 100) > 0.01

  const emptyUnit: UnitData = {
    number: '', owner_name: '', email: '', phone: '',
    monthly_fee: null, voting_pct: null, status: 'occupied',
    balance: null, move_in_date: null, sqft: null, bedrooms: null, parking: '',
  }

  const handleSaveUnit = async (unit: UnitData) => {
    await upsertUnit(tenancyId, unit)
    if (unit.id) {
      setUnits(prev => prev.map(u => u.id === unit.id ? unit : u))
    } else {
      // Refresh will be needed for the server-generated id
      setUnits(prev => [...prev, { ...unit, id: crypto.randomUUID() }])
    }
    setEditingUnit(null)
  }

  const handleDeleteUnit = async (id: string) => {
    await deleteUnit(id)
    setUnits(prev => prev.filter(u => u.id !== id))
  }

  const handleCSVImport = async (csvText: string) => {
    const result = await importUnitsFromCSV(tenancyId, csvText)
    if (result.inserted > 0) {
      // Refresh by re-fetching would be ideal. For now, trigger router refresh.
      window.location.reload()
    }
    return result
  }

  const handleSave = async () => {
    if (units.length > 0) {
      await updateChecklistStep(tenancyId, 'units_configured', true)
    }
  }

  return (
    <StepShell
      stepNumber={4}
      totalSteps={8}
      title="Unit Roster"
      description="Add your units manually or import from a CSV file."
      required
      tenancySlug={tenancySlug}
      canProceed={units.length > 0}
      onSave={handleSave}
    >
      <div className="space-y-5">
        {/* Summary stats */}
        {units.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-[#e6e8eb] rounded-[10px] p-4 text-center">
              <p className="text-[22px] font-bold text-[#1a1f25]">{units.length}</p>
              <p className="text-[11px] text-[#929da8] font-medium">Units</p>
            </div>
            <div className="bg-white border border-[#e6e8eb] rounded-[10px] p-4 text-center">
              <p className="text-[22px] font-bold text-[#1a1f25]">
                ${totalMonthly.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-[#929da8] font-medium">Total Monthly</p>
            </div>
            <div className="bg-white border border-[#e6e8eb] rounded-[10px] p-4 text-center">
              <p className={`text-[22px] font-bold ${votingWarning ? 'text-[#d12626]' : 'text-[#1a1f25]'}`}>
                {totalVoting.toFixed(1)}%
              </p>
              <p className="text-[11px] text-[#929da8] font-medium">Voting Total</p>
            </div>
          </div>
        )}

        {votingWarning && (
          <div className="flex items-center gap-2 bg-[#fef9c3] text-[#a16207] rounded-lg px-3 py-2 text-[12px]">
            <AlertTriangle size={14} />
            <span>Voting percentages should total 100%. Currently at {totalVoting.toFixed(1)}%.</span>
          </div>
        )}

        {/* Manual add */}
        <Card>
          <CardHeader>
            <span className="text-[14px] font-semibold text-[#1a1f25]">Units ({units.length})</span>
            <Button size="xs" variant="secondary" onClick={() => setEditingUnit({ ...emptyUnit })}>
              <Plus size={13} /> Add Unit
            </Button>
          </CardHeader>
          <CardBody className="p-0">
            {units.length === 0 && !editingUnit && (
              <p className="text-[13px] text-[#929da8] text-center py-6">No units added yet. Add manually or import from CSV.</p>
            )}

            {units.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-[#f8f9fa] border-b border-[#e6e8eb]">
                      <th className="px-3 py-2 text-left text-[#6e7b8a] font-semibold">Unit</th>
                      <th className="px-3 py-2 text-left text-[#6e7b8a] font-semibold">Owner</th>
                      <th className="px-3 py-2 text-left text-[#6e7b8a] font-semibold">Email</th>
                      <th className="px-3 py-2 text-right text-[#6e7b8a] font-semibold">Monthly Fee</th>
                      <th className="px-3 py-2 text-right text-[#6e7b8a] font-semibold">Voting %</th>
                      <th className="px-3 py-2 text-center text-[#6e7b8a] font-semibold w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map(u => (
                      <tr key={u.id} className="border-b border-[#f8f9fa] hover:bg-[#f8f9fa]">
                        <td className="px-3 py-2 text-[#1a1f25] font-medium">{u.number}</td>
                        <td className="px-3 py-2 text-[#45505a]">{u.owner_name}</td>
                        <td className="px-3 py-2 text-[#6e7b8a]">{u.email}</td>
                        <td className="px-3 py-2 text-right text-[#45505a]">
                          {u.monthly_fee != null ? `$${u.monthly_fee.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-[#45505a]">
                          {u.voting_pct != null ? `${u.voting_pct}%` : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => setEditingUnit(u)} className="text-[#929da8] hover:text-[#1a1f25] p-1">
                              <Edit2 size={12} />
                            </button>
                            <button onClick={() => u.id && handleDeleteUnit(u.id)} className="text-[#929da8] hover:text-[#d12626] p-1">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {editingUnit && (
              <div className="p-4">
                <UnitForm
                  unit={editingUnit}
                  onSave={handleSaveUnit}
                  onCancel={() => setEditingUnit(null)}
                />
              </div>
            )}
          </CardBody>
        </Card>

        {/* CSV Import */}
        <Card>
          <CardHeader>
            <span className="text-[14px] font-semibold text-[#1a1f25]">Import from CSV</span>
          </CardHeader>
          <CardBody>
            <CSVImporter
              templateHeaders={CSV_HEADERS}
              onImport={handleCSVImport}
            />
          </CardBody>
        </Card>
      </div>
    </StepShell>
  )
}

function UnitForm({
  unit,
  onSave,
  onCancel,
}: {
  unit: UnitData
  onSave: (u: UnitData) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState(unit)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!form.number) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="p-3 bg-[#f8f9fa] rounded-lg border border-[#e6e8eb]">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-0">
        <FormGroup label="Unit Number *">
          <Input value={form.number} onChange={e => setForm(p => ({ ...p, number: e.target.value }))} />
        </FormGroup>
        <FormGroup label="Owner Name">
          <Input value={form.owner_name} onChange={e => setForm(p => ({ ...p, owner_name: e.target.value }))} />
        </FormGroup>
        <FormGroup label="Email">
          <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
        </FormGroup>
        <FormGroup label="Phone">
          <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
        </FormGroup>
        <FormGroup label="Monthly Fee ($)">
          <Input
            type="number"
            value={form.monthly_fee ?? ''}
            onChange={e => setForm(p => ({ ...p, monthly_fee: e.target.value ? parseFloat(e.target.value) : null }))}
            min={0}
            step="0.01"
          />
        </FormGroup>
        <FormGroup label="Voting %">
          <Input
            type="number"
            value={form.voting_pct ?? ''}
            onChange={e => setForm(p => ({ ...p, voting_pct: e.target.value ? parseFloat(e.target.value) : null }))}
            min={0}
            max={100}
            step="0.01"
          />
        </FormGroup>
        <FormGroup label="Sqft">
          <Input
            type="number"
            value={form.sqft ?? ''}
            onChange={e => setForm(p => ({ ...p, sqft: e.target.value ? parseInt(e.target.value) : null }))}
            min={0}
          />
        </FormGroup>
        <FormGroup label="Bedrooms">
          <Input
            type="number"
            value={form.bedrooms ?? ''}
            onChange={e => setForm(p => ({ ...p, bedrooms: e.target.value ? parseInt(e.target.value) : null }))}
            min={0}
          />
        </FormGroup>
      </div>
      <div className="flex justify-end gap-2 mt-2">
        <Button variant="ghost" size="sm" onClick={onCancel}><X size={13} /> Cancel</Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={!form.number || saving}>
          <Check size={13} /> {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
