'use client'

import { useState, useTransition } from 'react'
import { StepShell } from '../shared/StepShell'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Input, Select, FormGroup } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Send, UserPlus } from 'lucide-react'
import {
  inviteUser,
  updateChecklistStep,
} from '@/app/app/onboarding/[tenancy]/actions'
import type { ExistingUser, InvitePayload } from '@/types/onboarding'

interface Props {
  tenancyId: string
  tenancySlug: string
  initialUsers: ExistingUser[]
  roles: { id: string; name: string }[]
}

export function Step7InviteUsers({ tenancyId, tenancySlug, initialUsers, roles }: Props) {
  const [users, setUsers] = useState<ExistingUser[]>(initialUsers)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [roleId, setRoleId] = useState(roles[0]?.id || 'RESIDENT')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const handleInvite = async () => {
    if (!email) return
    setSending(true)
    setError(null)

    try {
      await inviteUser(tenancyId, {
        email,
        role_id: roleId,
        display_name: displayName || email.split('@')[0],
      })

      setUsers(prev => [...prev, {
        id: crypto.randomUUID(),
        email,
        display_name: displayName || email.split('@')[0],
        role_id: roleId,
        role_name: roles.find(r => r.id === roleId)?.name || roleId,
        status: 'invited',
      }])

      setEmail('')
      setDisplayName('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  const handleSave = async () => {
    if (users.some(u => u.status === 'invited')) {
      await updateChecklistStep(tenancyId, 'first_user_invited', true)
    }
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge variant="green">Active</Badge>
      case 'invited': return <Badge variant="blue">Invited</Badge>
      default: return <Badge variant="gray">{status}</Badge>
    }
  }

  return (
    <StepShell
      stepNumber={7}
      totalSteps={8}
      title="Invite Users"
      description="Invite board members, property managers, and residents to the platform."
      required={false}
      tenancySlug={tenancySlug}
      onSave={handleSave}
    >
      <div className="space-y-5">
        {/* Invite form */}
        <Card>
          <CardHeader>
            <span className="text-[14px] font-semibold text-[#1a1f25]">Send Invite</span>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-0">
              <FormGroup label="Email Address *">
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </FormGroup>
              <FormGroup label="Display Name">
                <Input
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Jane Smith"
                />
              </FormGroup>
              <FormGroup label="Role">
                <Select value={roleId} onChange={e => setRoleId(e.target.value)}>
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </Select>
              </FormGroup>
            </div>

            {error && (
              <p className="text-[12px] text-[#d12626] mb-3">{error}</p>
            )}

            <Button
              variant="accent"
              size="sm"
              onClick={handleInvite}
              disabled={!email || sending}
            >
              <Send size={13} /> {sending ? 'Sending...' : 'Send Invite'}
            </Button>
          </CardBody>
        </Card>

        {/* Users list */}
        <Card>
          <CardHeader>
            <span className="text-[14px] font-semibold text-[#1a1f25]">
              Users ({users.length})
            </span>
          </CardHeader>
          <CardBody className="p-0">
            {users.length === 0 ? (
              <div className="text-center py-8">
                <UserPlus size={24} className="text-[#929da8] mx-auto mb-2" />
                <p className="text-[13px] text-[#929da8]">No users invited yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-[#f8f9fa] border-b border-[#e6e8eb]">
                      <th className="px-3 py-2 text-left text-[#6e7b8a] font-semibold">Name</th>
                      <th className="px-3 py-2 text-left text-[#6e7b8a] font-semibold">Email</th>
                      <th className="px-3 py-2 text-left text-[#6e7b8a] font-semibold">Role</th>
                      <th className="px-3 py-2 text-left text-[#6e7b8a] font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} className="border-b border-[#f8f9fa]">
                        <td className="px-3 py-2 text-[#1a1f25]">{u.display_name}</td>
                        <td className="px-3 py-2 text-[#6e7b8a]">{u.email}</td>
                        <td className="px-3 py-2 text-[#45505a]">{u.role_name}</td>
                        <td className="px-3 py-2">{statusBadge(u.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </StepShell>
  )
}
