'use client'
import React from 'react'
import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Select, FormGroup } from '@/components/ui/input'

type Plan = { id: string; name: string; color: string | null }
type Role = { id: string; name: string; icon: string | null }
type Result = { atom_type: string; atom_id: string; atom_name: string; module_name: string; inclusion: string; access: string; effective_access: string }

export function SimulatorClient({ plans, roles }: { plans: Plan[]; roles: Role[] }) {
  const [planId, setPlanId] = useState(plans[0]?.id || '')
  const [roleId, setRoleId] = useState(roles[0]?.id || '')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!planId || !roleId) return
    setLoading(true)
    fetch(`/api/admin/simulator?plan=${planId}&role=${roleId}`)
      .then(r => r.json())
      .then(data => { setResults(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => { setResults([]); setLoading(false) })
  }, [planId, roleId])

  const grouped = results.reduce<Record<string, Result[]>>((acc, r) => {
    ;(acc[r.module_name] = acc[r.module_name] || []).push(r)
    return acc
  }, {})

  const accessBadge = (val: string): 'green' | 'blue' | 'red' | 'gray' =>
    val === 'contributor' ? 'green' : val === 'reader' ? 'blue' : val === 'no_access' ? 'red' : 'gray'

  return (
    <div>
      <h2 className="font-serif text-2xl font-bold mb-1">Permission Simulator</h2>
      <p className="text-sm text-gray-500 mb-6">See exactly what a user sees based on their plan and role combination.</p>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <FormGroup label="Subscription Plan">
          <Select value={planId} onChange={e => setPlanId(e.target.value)}>
            {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </FormGroup>
        <FormGroup label="User Role">
          <Select value={roleId} onChange={e => setRoleId(e.target.value)}>
            {roles.map(r => <option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}
          </Select>
        </FormGroup>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-[10px] border border-gray-200 overflow-hidden">
          <table className="w-full text-[0.82rem]">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200">Atom</th>
                <th className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200">Type</th>
                <th className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200">Plan Entitlement</th>
                <th className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200">Role Access</th>
                <th className="text-left px-3 py-2.5 text-[0.7rem] uppercase tracking-wider text-gray-500 font-semibold border-b-2 border-gray-200">Effective</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(grouped).map(([moduleName, atoms]) => (
                <React.Fragment key={moduleName}>
                  <tr><td colSpan={5} className="bg-gray-900 text-white font-bold text-xs uppercase tracking-wider px-3 py-2">{moduleName}</td></tr>
                  {atoms.map(a => (
                    <tr key={`${a.atom_type}-${a.atom_id}`} className="hover:bg-gray-50">
                      <td className="px-3 py-2 border-b border-gray-100 font-medium">{a.atom_type === 'feature' ? '↳ ' : ''}{a.atom_name}</td>
                      <td className="px-3 py-2 border-b border-gray-100"><Badge variant="gray">{a.atom_type}</Badge></td>
                      <td className="px-3 py-2 border-b border-gray-100"><Badge variant={a.inclusion === 'included' ? 'green' : a.inclusion === 'tbd' ? 'amber' : 'gray'}>{a.inclusion}</Badge></td>
                      <td className="px-3 py-2 border-b border-gray-100"><Badge variant={accessBadge(a.access)}>{a.access}</Badge></td>
                      <td className="px-3 py-2 border-b border-gray-100"><Badge variant={accessBadge(a.effective_access)}>{a.effective_access}</Badge></td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
