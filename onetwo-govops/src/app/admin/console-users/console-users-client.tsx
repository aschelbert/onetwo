'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface ConsoleUser {
  id: string
  email: string
  display_name: string | null
  platform_role: string
  admin_console_role_id: string | null
  created_at: string
}

interface ConsoleRole {
  id: string
  name: string
  description: string | null
}

const ROLE_BADGE: Record<string, 'green' | 'blue' | 'gray'> = {
  admin: 'green',
  contributor: 'blue',
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getInitials(name: string | null, email: string) {
  if (name) return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return email.slice(0, 2).toUpperCase()
}

export function ConsoleUsersClient({ users, roles }: { users: ConsoleUser[]; roles: ConsoleRole[] }) {
  const router = useRouter()
  const [saving, setSaving] = useState<string | null>(null)

  const roleMap = Object.fromEntries(roles.map(r => [r.id, r]))

  const handleRoleChange = async (userId: string, roleId: string) => {
    setSaving(userId)
    await fetch('/api/admin/console-users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, admin_console_role_id: roleId }),
    })
    setSaving(null)
    router.refresh()
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-serif text-2xl font-bold">Console Users</h2>
        <p className="text-sm text-gray-500 mt-1">{users.length} admin console {users.length === 1 ? 'user' : 'users'}</p>
      </div>

      <div className="bg-white rounded-[10px] border border-gray-200 overflow-hidden">
        <table className="w-full border-collapse text-[0.82rem]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left p-3 font-semibold text-gray-700 text-[0.7rem] uppercase tracking-wider">User</th>
              <th className="text-left p-3 font-semibold text-gray-700 text-[0.7rem] uppercase tracking-wider">Email</th>
              <th className="text-left p-3 font-semibold text-gray-700 text-[0.7rem] uppercase tracking-wider">Console Role</th>
              <th className="text-left p-3 font-semibold text-gray-700 text-[0.7rem] uppercase tracking-wider">Joined</th>
              <th className="text-right p-3 font-semibold text-gray-700 text-[0.7rem] uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => {
              const role = user.admin_console_role_id ? roleMap[user.admin_console_role_id] : null
              const roleName = role?.name || 'Unassigned'
              const badgeVariant = ROLE_BADGE[user.admin_console_role_id || ''] || 'gray'

              return (
                <tr key={user.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/60 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                        {getInitials(user.display_name, user.email)}
                      </div>
                      <span className="font-medium text-gray-900">
                        {user.display_name || user.email.split('@')[0]}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 text-gray-600">{user.email}</td>
                  <td className="p-3">
                    <Badge variant={badgeVariant}>{roleName}</Badge>
                  </td>
                  <td className="p-3 text-gray-500 text-xs">{formatDate(user.created_at)}</td>
                  <td className="p-3 text-right">
                    <select
                      value={user.admin_console_role_id || ''}
                      onChange={e => handleRoleChange(user.id, e.target.value)}
                      disabled={saving === user.id}
                      className="bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-700 outline-none cursor-pointer disabled:opacity-50"
                    >
                      {roles.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-400">No admin console users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Role legend */}
      <div className="mt-6 bg-white rounded-[10px] border border-gray-200 p-5">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Role Definitions</h3>
        <div className="grid grid-cols-2 gap-4">
          {roles.map(r => (
            <div key={r.id} className="flex items-start gap-3">
              <Badge variant={ROLE_BADGE[r.id] || 'gray'} className="mt-0.5">{r.name}</Badge>
              <span className="text-sm text-gray-600">{r.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
