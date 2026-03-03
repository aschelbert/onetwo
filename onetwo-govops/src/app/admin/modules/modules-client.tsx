'use client'
import React from 'react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TabBar, TabButton } from '@/components/ui/tabs'
import { ChevronDown, ChevronRight } from 'lucide-react'

type Module = { id: string; name: string; slug: string; sort_order: number }
type Submodule = { id: string; name: string; description: string | null; module_id: string; is_leaf: boolean; impl_status: string; sort_order: number }
type Feature = { id: string; name: string; description: string | null; submodule_id: string; impl_status: string; sort_order: number }
type Entitlement = { atom_type: string; atom_id: string; plan_id: string; inclusion: string }
type RolePerm = { atom_type: string; atom_id: string; role_id: string; access_level: string }
type Plan = { id: string; name: string; color: string | null }
type Role = { id: string; name: string; icon: string | null }

const implBadge: Record<string, 'green' | 'amber' | 'gray'> = { implemented: 'green', future: 'amber', tbd: 'gray' }

export function ModulesClient({ modules, submodules, features, entitlements, rolePermissions, plans, roles }: {
  modules: Module[]; submodules: Submodule[]; features: Feature[]; entitlements: Entitlement[]; rolePermissions: RolePerm[]; plans: Plan[]; roles: Role[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'catalog' | 'permissions'>('catalog')
  const [expanded, setExpanded] = useState<Set<string>>(new Set(modules.map(m => m.id)))
  const [pendingEntChanges, setPendingEntChanges] = useState<Entitlement[]>([])
  const [pendingRoleChanges, setPendingRoleChanges] = useState<RolePerm[]>([])

  function toggle(id: string) {
    const next = new Set(expanded)
    next.has(id) ? next.delete(id) : next.add(id)
    setExpanded(next)
  }

  function getInclusion(atomType: string, atomId: string, planId: string) {
    const pending = pendingEntChanges.find(e => e.atom_type === atomType && e.atom_id === atomId && e.plan_id === planId)
    if (pending) return pending.inclusion
    const ent = entitlements.find(e => e.atom_type === atomType && e.atom_id === atomId && e.plan_id === planId)
    return ent?.inclusion || 'not_included'
  }

  function cycleInclusion(atomType: string, atomId: string, planId: string) {
    const current = getInclusion(atomType, atomId, planId)
    const next = current === 'included' ? 'not_included' : current === 'not_included' ? 'tbd' : 'included'
    setPendingEntChanges(prev => {
      const filtered = prev.filter(e => !(e.atom_type === atomType && e.atom_id === atomId && e.plan_id === planId))
      return [...filtered, { atom_type: atomType, atom_id: atomId, plan_id: planId, inclusion: next }]
    })
  }

  function getAccess(atomType: string, atomId: string, roleId: string) {
    const pending = pendingRoleChanges.find(r => r.atom_type === atomType && r.atom_id === atomId && r.role_id === roleId)
    if (pending) return pending.access_level
    const rp = rolePermissions.find(r => r.atom_type === atomType && r.atom_id === atomId && r.role_id === roleId)
    return rp?.access_level || 'no_access'
  }

  function cycleAccess(atomType: string, atomId: string, roleId: string) {
    const current = getAccess(atomType, atomId, roleId)
    const next = current === 'contributor' ? 'reader' : current === 'reader' ? 'no_access' : 'contributor'
    setPendingRoleChanges(prev => {
      const filtered = prev.filter(r => !(r.atom_type === atomType && r.atom_id === atomId && r.role_id === roleId))
      return [...filtered, { atom_type: atomType, atom_id: atomId, role_id: roleId, access_level: next }]
    })
  }

  async function savePermissions() {
    if (pendingEntChanges.length) {
      await fetch('/api/admin/entitlements', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates: pendingEntChanges }) })
    }
    if (pendingRoleChanges.length) {
      await fetch('/api/admin/role-permissions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates: pendingRoleChanges }) })
    }
    setPendingEntChanges([]); setPendingRoleChanges([]); router.refresh()
  }

  const inclusionDot = (val: string) => val === 'included' ? 'bg-green-500' : val === 'tbd' ? 'bg-amber-400' : 'bg-gray-300'
  const accessColor = (val: string) => val === 'contributor' ? 'bg-green-100 text-green-800' : val === 'reader' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-400'

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="font-serif text-2xl font-bold">Module Registry</h2>
          <p className="text-sm text-gray-500 mt-1">{modules.length} modules · {submodules.length} submodules · {features.length} features</p>
        </div>
        {tab === 'permissions' && (pendingEntChanges.length > 0 || pendingRoleChanges.length > 0) && (
          <Button onClick={savePermissions}>Save {pendingEntChanges.length + pendingRoleChanges.length} Changes</Button>
        )}
      </div>

      <TabBar>
        <TabButton active={tab === 'catalog'} onClick={() => setTab('catalog')}>Catalog</TabButton>
        <TabButton active={tab === 'permissions'} onClick={() => setTab('permissions')}>Permissions Matrix</TabButton>
      </TabBar>

      {tab === 'catalog' && (
        <div className="space-y-3">
          {modules.map(m => {
            const mSubs = submodules.filter(sm => sm.module_id === m.id)
            const isExpanded = expanded.has(m.id)
            return (
              <div key={m.id} className="bg-white rounded-[10px] border border-gray-200 overflow-hidden">
                <button onClick={() => toggle(m.id)} className="w-full flex items-center gap-3 px-5 py-4 text-left bg-transparent border-none cursor-pointer hover:bg-gray-50">
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <h3 className="font-serif text-base font-bold flex-1">{m.name}</h3>
                  <Badge variant="gray">{mSubs.length} submodules</Badge>
                </button>
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {mSubs.map(sm => {
                      const smFeatures = features.filter(f => f.submodule_id === sm.id)
                      return (
                        <div key={sm.id}>
                          <div className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-100">
                            <span className="text-sm font-semibold flex-1">{sm.name}</span>
                            {sm.description && <span className="text-xs text-gray-400">{sm.description}</span>}
                            <Badge variant={implBadge[sm.impl_status] || 'gray'}>{sm.impl_status}</Badge>
                            <Badge variant="gray">{sm.is_leaf ? 'leaf' : `${smFeatures.length} features`}</Badge>
                          </div>
                          {!sm.is_leaf && smFeatures.map(f => (
                            <div key={f.id} className="flex items-center gap-3 px-5 pl-10 py-2 border-b border-gray-50 text-sm">
                              <span className="flex-1 text-gray-600">{f.name}</span>
                              <Badge variant={implBadge[f.impl_status] || 'gray'}>{f.impl_status}</Badge>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'permissions' && (
        <div className="bg-white rounded-[10px] border border-gray-200 overflow-x-auto">
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-xs text-blue-700">
            Click plan dots to cycle: <span className="font-bold">included → not included → tbd</span>. Click role cells to cycle: <span className="font-bold">contributor → reader → no access</span>.
          </div>
          <table className="w-full min-w-[900px] border-collapse text-[0.78rem]">
            <thead>
              <tr>
                <th className="text-left p-2 bg-gray-50 font-semibold text-gray-700 text-[0.7rem] uppercase tracking-wider border border-gray-200 min-w-[200px]">Atom</th>
                <th className="p-2 bg-gray-50 font-semibold text-gray-700 text-[0.7rem] uppercase border border-gray-200">Impl</th>
                {plans.map(p => <th key={p.id} className="p-2 bg-gray-50 font-semibold text-[0.7rem] uppercase border border-gray-200 text-center" style={{ color: p.color || '#666' }}>{p.name}</th>)}
                {roles.map(r => <th key={r.id} className="p-2 bg-gray-50 font-semibold text-gray-700 text-[0.7rem] uppercase border border-gray-200 text-center">{r.icon} {r.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {modules.map(mod => {
                const mSubs = submodules.filter(sm => sm.module_id === mod.id)
                return (
                  <React.Fragment key={mod.id}>
                    <tr><td colSpan={2 + plans.length + roles.length} className="bg-gray-900 text-white font-bold text-xs uppercase tracking-wider p-2 border border-gray-200">{mod.name}</td></tr>
                    {mSubs.map(sm => (
                      <React.Fragment key={sm.id}>
                        <tr>
                          <td className="p-2 border border-gray-200 bg-gray-50 font-medium">{sm.name}</td>
                          <td className="p-2 border border-gray-200 text-center"><Badge variant={implBadge[sm.impl_status] || 'gray'}>{sm.impl_status}</Badge></td>
                          {plans.map(p => {
                            const val = getInclusion('submodule', sm.id, p.id)
                            return <td key={p.id} className="p-2 border border-gray-200 text-center cursor-pointer hover:bg-gray-50" onClick={() => cycleInclusion('submodule', sm.id, p.id)}><span className={`inline-block w-3 h-3 rounded-full ${inclusionDot(val)}`} title={val} /></td>
                          })}
                          {roles.map(r => {
                            const val = getAccess('submodule', sm.id, r.id)
                            return <td key={r.id} className="p-2 border border-gray-200 text-center cursor-pointer hover:bg-gray-50" onClick={() => cycleAccess('submodule', sm.id, r.id)}><span className={`inline-block px-1.5 py-0.5 rounded text-[0.65rem] font-semibold ${accessColor(val)}`}>{val === 'contributor' ? 'C' : val === 'reader' ? 'R' : '—'}</span></td>
                          })}
                        </tr>
                        {!sm.is_leaf && features.filter(f => f.submodule_id === sm.id).map(f => (
                          <tr key={f.id}>
                            <td className="p-2 pl-6 border border-gray-200 bg-gray-50 text-gray-600">↳ {f.name}</td>
                            <td className="p-2 border border-gray-200 text-center"><Badge variant={implBadge[f.impl_status] || 'gray'}>{f.impl_status}</Badge></td>
                            {plans.map(p => {
                              const val = getInclusion('feature', f.id, p.id)
                              return <td key={p.id} className="p-2 border border-gray-200 text-center cursor-pointer hover:bg-gray-50" onClick={() => cycleInclusion('feature', f.id, p.id)}><span className={`inline-block w-3 h-3 rounded-full ${inclusionDot(val)}`} title={val} /></td>
                            })}
                            {roles.map(r => {
                              const val = getAccess('feature', f.id, r.id)
                              return <td key={r.id} className="p-2 border border-gray-200 text-center cursor-pointer hover:bg-gray-50" onClick={() => cycleAccess('feature', f.id, r.id)}><span className={`inline-block px-1.5 py-0.5 rounded text-[0.65rem] font-semibold ${accessColor(val)}`}>{val === 'contributor' ? 'C' : val === 'reader' ? 'R' : '—'}</span></td>
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
