'use client'

import { useState, useCallback, useRef, useTransition } from 'react'
import { StepShell } from '../shared/StepShell'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Input, Select, FormGroup } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Edit2, X, Check } from 'lucide-react'
import {
  upsertBoardMember,
  deleteBoardMember,
  saveManagementInfo,
  upsertLegalCounsel,
  deleteLegalCounsel,
  updateChecklistStep,
} from '@/app/app/onboarding/[tenancy]/actions'
import type { BoardMember, ManagementInfo, LegalCounselData } from '@/types/onboarding'

const BOARD_ROLES = ['President', 'Vice President', 'Treasurer', 'Secretary', 'Member', 'Director']

interface Props {
  tenancyId: string
  tenancySlug: string
  initialBoardMembers: BoardMember[]
  initialManagementInfo: ManagementInfo | null
  initialLegalCounsel: LegalCounselData[]
}

export function Step2Governance({
  tenancyId,
  tenancySlug,
  initialBoardMembers,
  initialManagementInfo,
  initialLegalCounsel,
}: Props) {
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>(initialBoardMembers)
  const [mgmt, setMgmt] = useState<ManagementInfo>(initialManagementInfo || {
    company_name: '', contact_name: '', title: '', email: '', phone: '',
    emergency_phone: '', office_hours: '', after_hours_info: '',
  })
  const [counsel, setCounsel] = useState<LegalCounselData[]>(initialLegalCounsel)
  const [editingMember, setEditingMember] = useState<BoardMember | null>(null)
  const [editingCounsel, setEditingCounsel] = useState<LegalCounselData | null>(null)
  const [, startTransition] = useTransition()
  const mgmtDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // ─── Board Members ──────────────────────────────

  const emptyMember: BoardMember = { name: '', role: 'Member', email: '', phone: '', term_start: null, term_end: null }

  const handleSaveMember = async (member: BoardMember) => {
    await upsertBoardMember(tenancyId, member)
    // Refresh list
    if (member.id) {
      setBoardMembers(prev => prev.map(m => m.id === member.id ? member : m))
    } else {
      setBoardMembers(prev => [...prev, member])
    }
    setEditingMember(null)
  }

  const handleDeleteMember = async (id: string) => {
    await deleteBoardMember(id)
    setBoardMembers(prev => prev.filter(m => m.id !== id))
  }

  // ─── Management Info (debounced auto-save) ──────

  const handleMgmtChange = useCallback((updates: Partial<ManagementInfo>) => {
    setMgmt(prev => ({ ...prev, ...updates }))
    if (mgmtDebounceRef.current) clearTimeout(mgmtDebounceRef.current)
    mgmtDebounceRef.current = setTimeout(() => {
      startTransition(async () => {
        await saveManagementInfo(tenancyId, updates)
      })
    }, 800)
  }, [tenancyId])

  // ─── Legal Counsel ──────────────────────────────

  const emptyCounsel: LegalCounselData = { firm_name: '', attorney_name: '', email: '', phone: '', specialty: '' }

  const handleSaveCounsel = async (c: LegalCounselData) => {
    await upsertLegalCounsel(tenancyId, c)
    if (c.id) {
      setCounsel(prev => prev.map(x => x.id === c.id ? c : x))
    } else {
      setCounsel(prev => [...prev, c])
    }
    setEditingCounsel(null)
  }

  const handleDeleteCounsel = async (id: string) => {
    await deleteLegalCounsel(id)
    setCounsel(prev => prev.filter(x => x.id !== id))
  }

  const handleSave = async () => {
    if (mgmtDebounceRef.current) clearTimeout(mgmtDebounceRef.current)
    await saveManagementInfo(tenancyId, mgmt)
    await updateChecklistStep(tenancyId, 'governance_configured', true)
  }

  return (
    <StepShell
      stepNumber={2}
      totalSteps={8}
      title="Governance"
      description="Add board members, management company info, and legal counsel."
      required={false}
      tenancySlug={tenancySlug}
      onSave={handleSave}
    >
      <div className="space-y-5">
        {/* Board Members */}
        <Card>
          <CardHeader>
            <span className="text-[14px] font-semibold text-[#1a1f25]">Board Members</span>
            <Button size="xs" variant="secondary" onClick={() => setEditingMember({ ...emptyMember })}>
              <Plus size={13} /> Add
            </Button>
          </CardHeader>
          <CardBody>
            {boardMembers.length === 0 && !editingMember && (
              <p className="text-[13px] text-[#929da8] text-center py-4">No board members added yet.</p>
            )}
            {boardMembers.map(m => (
              <div key={m.id} className="flex items-center justify-between py-2 border-b border-[#f8f9fa] last:border-0">
                <div>
                  <span className="text-[13px] font-medium text-[#1a1f25]">{m.name}</span>
                  <span className="text-[11px] text-[#929da8] ml-2">{m.role}</span>
                  {m.email && <span className="text-[11px] text-[#6e7b8a] ml-2">{m.email}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditingMember(m)} className="text-[#929da8] hover:text-[#1a1f25] p-1">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => m.id && handleDeleteMember(m.id)} className="text-[#929da8] hover:text-[#d12626] p-1">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}

            {editingMember && (
              <MemberForm
                member={editingMember}
                onSave={handleSaveMember}
                onCancel={() => setEditingMember(null)}
              />
            )}
          </CardBody>
        </Card>

        {/* Management Info */}
        <Card>
          <CardHeader>
            <span className="text-[14px] font-semibold text-[#1a1f25]">Management Company</span>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-0">
              <FormGroup label="Company Name">
                <Input value={mgmt.company_name} onChange={e => handleMgmtChange({ company_name: e.target.value })} />
              </FormGroup>
              <FormGroup label="Contact Name">
                <Input value={mgmt.contact_name} onChange={e => handleMgmtChange({ contact_name: e.target.value })} />
              </FormGroup>
              <FormGroup label="Title">
                <Input value={mgmt.title} onChange={e => handleMgmtChange({ title: e.target.value })} />
              </FormGroup>
              <FormGroup label="Email">
                <Input type="email" value={mgmt.email} onChange={e => handleMgmtChange({ email: e.target.value })} />
              </FormGroup>
              <FormGroup label="Phone">
                <Input value={mgmt.phone} onChange={e => handleMgmtChange({ phone: e.target.value })} />
              </FormGroup>
              <FormGroup label="Emergency Phone">
                <Input value={mgmt.emergency_phone} onChange={e => handleMgmtChange({ emergency_phone: e.target.value })} />
              </FormGroup>
              <FormGroup label="Office Hours">
                <Input value={mgmt.office_hours} onChange={e => handleMgmtChange({ office_hours: e.target.value })} placeholder="e.g. Mon-Fri 9am-5pm" />
              </FormGroup>
              <FormGroup label="After Hours Info">
                <Input value={mgmt.after_hours_info} onChange={e => handleMgmtChange({ after_hours_info: e.target.value })} />
              </FormGroup>
            </div>
          </CardBody>
        </Card>

        {/* Legal Counsel */}
        <Card>
          <CardHeader>
            <span className="text-[14px] font-semibold text-[#1a1f25]">Legal Counsel</span>
            <Button size="xs" variant="secondary" onClick={() => setEditingCounsel({ ...emptyCounsel })}>
              <Plus size={13} /> Add
            </Button>
          </CardHeader>
          <CardBody>
            {counsel.length === 0 && !editingCounsel && (
              <p className="text-[13px] text-[#929da8] text-center py-4">No legal counsel added yet.</p>
            )}
            {counsel.map(c => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-[#f8f9fa] last:border-0">
                <div>
                  <span className="text-[13px] font-medium text-[#1a1f25]">{c.firm_name || c.attorney_name}</span>
                  {c.specialty && <span className="text-[11px] text-[#929da8] ml-2">{c.specialty}</span>}
                  {c.email && <span className="text-[11px] text-[#6e7b8a] ml-2">{c.email}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditingCounsel(c)} className="text-[#929da8] hover:text-[#1a1f25] p-1">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => c.id && handleDeleteCounsel(c.id)} className="text-[#929da8] hover:text-[#d12626] p-1">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}

            {editingCounsel && (
              <CounselForm
                counsel={editingCounsel}
                onSave={handleSaveCounsel}
                onCancel={() => setEditingCounsel(null)}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </StepShell>
  )
}

// ─── Inline forms ────────────────────────────────────────────────────────────

function MemberForm({
  member,
  onSave,
  onCancel,
}: {
  member: BoardMember
  onSave: (m: BoardMember) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState(member)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!form.name) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="mt-3 p-3 bg-[#f8f9fa] rounded-lg border border-[#e6e8eb]">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-0">
        <FormGroup label="Name *">
          <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        </FormGroup>
        <FormGroup label="Role">
          <Select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
            {BOARD_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </Select>
        </FormGroup>
        <FormGroup label="Email">
          <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
        </FormGroup>
        <FormGroup label="Phone">
          <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
        </FormGroup>
        <FormGroup label="Term Start">
          <Input type="date" value={form.term_start || ''} onChange={e => setForm(p => ({ ...p, term_start: e.target.value || null }))} />
        </FormGroup>
        <FormGroup label="Term End">
          <Input type="date" value={form.term_end || ''} onChange={e => setForm(p => ({ ...p, term_end: e.target.value || null }))} />
        </FormGroup>
      </div>
      <div className="flex justify-end gap-2 mt-2">
        <Button variant="ghost" size="sm" onClick={onCancel}><X size={13} /> Cancel</Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={!form.name || saving}>
          <Check size={13} /> {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

function CounselForm({
  counsel,
  onSave,
  onCancel,
}: {
  counsel: LegalCounselData
  onSave: (c: LegalCounselData) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState(counsel)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="mt-3 p-3 bg-[#f8f9fa] rounded-lg border border-[#e6e8eb]">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-0">
        <FormGroup label="Firm Name">
          <Input value={form.firm_name} onChange={e => setForm(p => ({ ...p, firm_name: e.target.value }))} />
        </FormGroup>
        <FormGroup label="Attorney Name">
          <Input value={form.attorney_name} onChange={e => setForm(p => ({ ...p, attorney_name: e.target.value }))} />
        </FormGroup>
        <FormGroup label="Email">
          <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
        </FormGroup>
        <FormGroup label="Phone">
          <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
        </FormGroup>
        <FormGroup label="Specialty" className="md:col-span-2">
          <Input value={form.specialty} onChange={e => setForm(p => ({ ...p, specialty: e.target.value }))} placeholder="e.g. HOA Law, Real Estate" />
        </FormGroup>
      </div>
      <div className="flex justify-end gap-2 mt-2">
        <Button variant="ghost" size="sm" onClick={onCancel}><X size={13} /> Cancel</Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>
          <Check size={13} /> {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
