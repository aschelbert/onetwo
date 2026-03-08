'use client'

import React from 'react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Lock } from 'lucide-react'

interface Module {
  id: string
  name: string
  slug: string
  section: string
  sort_order: number
}

interface Role {
  id: string
  name: string
  description: string | null
}

interface Permission {
  id: number
  module_id: string
  role_id: string
  access_level: string
}

type AccessLevel = 'full_access' | 'read_only' | 'no_access'

const ACCESS_META: Record<AccessLevel, { label: string; short: string; color: string }> = {
  full_access: { label: 'Full Access', short: 'Full', color: 'bg-green-100 text-green-800' },
  read_only:   { label: 'Read Only',   short: 'Read', color: 'bg-blue-100 text-blue-800' },
  no_access:   { label: 'No Access',   short: '—',    color: 'bg-gray-100 text-gray-400' },
}

export function ConsolePermissionsClient({ modules, roles, permissions }: {
  modules: Module[]
  roles: Role[]
  permissions: Permission[]
}) {
  const router = useRouter()
  const [pendingChanges, setPendingChanges] = useState<Permission[]>([])
  const [saving, setSaving] = useState(false)

  // Group modules by section
  const sections = [...new Set(modules.map(m => m.section))]

  function getAccess(moduleId: string, roleId: string): AccessLevel {
    const pending = pendingChanges.find(p => p.module_id === moduleId && p.role_id === roleId)
    if (pending) return pending.access_level as AccessLevel
    const perm = permissions.find(p => p.module_id === moduleId && p.role_id === roleId)
    return (perm?.access_level as AccessLevel) || 'no_access'
  }

  function cycleAccess(moduleId: string, roleId: string) {
    // Admin role is always full_access — don't allow cycling
    if (roleId === 'admin') return

    const current = getAccess(moduleId, roleId)
    const next: AccessLevel = current === 'full_access' ? 'read_only' : current === 'read_only' ? 'no_access' : 'full_access'
    setPendingChanges(prev => {
      const filtered = prev.filter(p => !(p.module_id === moduleId && p.role_id === roleId))
      return [...filtered, { id: 0, module_id: moduleId, role_id: roleId, access_level: next }]
    })
  }

  async function saveChanges() {
    if (!pendingChanges.length) return
    setSaving(true)
    await fetch('/api/admin/console-permissions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: pendingChanges.map(p => ({ module_id: p.module_id, role_id: p.role_id, access_level: p.access_level })) }),
    })
    setPendingChanges([])
    setSaving(false)
    router.refresh()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="font-serif text-2xl font-bold">Console Permissions</h2>
          <p className="text-sm text-gray-500 mt-1">{modules.length} modules &middot; {roles.length} roles</p>
        </div>
        {pendingChanges.length > 0 && (
          <Button onClick={saveChanges} disabled={saving}>
            {saving ? 'Saving...' : `Save ${pendingChanges.length} Change${pendingChanges.length > 1 ? 's' : ''}`}
          </Button>
        )}
      </div>

      <div className="bg-white rounded-[10px] border border-gray-200 overflow-x-auto">
        {/* Hint banner */}
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-xs text-blue-700">
          Click cells to cycle: <span className="font-bold">full access → read only → no access</span>. Admin role is locked to full access.
        </div>

        <table className="w-full border-collapse text-[0.78rem]">
          <thead>
            <tr>
              <th className="text-left p-3 bg-gray-50 font-semibold text-gray-700 text-[0.7rem] uppercase tracking-wider border border-gray-200 min-w-[220px]">Module</th>
              {roles.map(r => (
                <th key={r.id} className="p-3 bg-gray-50 font-semibold text-gray-700 text-[0.7rem] uppercase tracking-wider border border-gray-200 text-center min-w-[120px]">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map(section => {
              const sectionModules = modules.filter(m => m.section === section)
              return (
                <React.Fragment key={section}>
                  {/* Section header row */}
                  <tr>
                    <td
                      colSpan={1 + roles.length}
                      className="bg-gray-900 text-white font-bold text-xs uppercase tracking-wider p-2 border border-gray-200"
                    >
                      {section}
                    </td>
                  </tr>
                  {/* Module rows */}
                  {sectionModules.map(mod => (
                    <tr key={mod.id}>
                      <td className="p-3 border border-gray-200 bg-gray-50 font-medium text-gray-800">{mod.name}</td>
                      {roles.map(role => {
                        const access = getAccess(mod.id, role.id)
                        const meta = ACCESS_META[access]
                        const isAdmin = role.id === 'admin'
                        const isPending = pendingChanges.some(p => p.module_id === mod.id && p.role_id === role.id)
                        return (
                          <td
                            key={role.id}
                            className={`p-3 border border-gray-200 text-center ${isAdmin ? 'bg-gray-50' : 'cursor-pointer hover:bg-gray-50'}`}
                            onClick={() => cycleAccess(mod.id, role.id)}
                          >
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.65rem] font-semibold ${meta.color} ${isPending ? 'ring-2 ring-blue-400' : ''}`}
                            >
                              {isAdmin && <Lock size={10} className="flex-shrink-0" />}
                              {meta.short}
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-6 bg-white rounded-[10px] border border-gray-200 p-5">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Access Levels</h3>
        <div className="flex gap-6">
          {(Object.entries(ACCESS_META) as [AccessLevel, typeof ACCESS_META[AccessLevel]][]).map(([key, meta]) => (
            <div key={key} className="flex items-center gap-2">
              <span className={`inline-block px-2 py-0.5 rounded text-[0.65rem] font-semibold ${meta.color}`}>{meta.short}</span>
              <span className="text-sm text-gray-600">{meta.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
