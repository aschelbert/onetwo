'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TabBar, TabButton } from '@/components/ui/tabs'
import { PropertyLogCard } from './PropertyLogCard'
import { PropertyLogForm } from './PropertyLogForm'
import type { PropertyLog, PropertyLogStatus } from '@/types/association-team'
import { Plus, Search, ClipboardList } from 'lucide-react'

const STATUS_TABS: { label: string; value: PropertyLogStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Closed', value: 'closed' },
]

export function PropertyLogList({
  logs,
  tenancySlug,
}: {
  logs: PropertyLog[]
  tenancySlug: string
}) {
  const [statusFilter, setStatusFilter] = useState<PropertyLogStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)

  const filtered = logs.filter((log) => {
    if (statusFilter !== 'all' && log.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        log.title.toLowerCase().includes(q) ||
        log.location.toLowerCase().includes(q) ||
        log.conducted_by.toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#929da8]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs..."
            className="pl-8"
          />
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus size={14} /> New Inspection
        </Button>
      </div>

      {/* Status filter */}
      <TabBar>
        {STATUS_TABS.map((tab) => (
          <TabButton
            key={tab.value}
            active={statusFilter === tab.value}
            onClick={() => setStatusFilter(tab.value)}
          >
            {tab.label}
            {tab.value !== 'all' && (
              <span className="ml-1 text-[0.7rem] text-[#929da8]">
                ({logs.filter((l) => l.status === tab.value).length})
              </span>
            )}
          </TabButton>
        ))}
      </TabBar>

      {/* Card list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardList size={40} className="mx-auto text-[#929da8] mb-3" />
          <p className="text-sm font-semibold text-[#45505a] mb-1">No property logs yet</p>
          <p className="text-[0.8rem] text-[#929da8] mb-4">Create your first inspection or walkthrough log</p>
          <Button onClick={() => setShowForm(true)}>
            <Plus size={14} /> New Inspection
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((log) => (
            <PropertyLogCard key={log.id} log={log} tenancySlug={tenancySlug} />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <PropertyLogForm open={showForm} onClose={() => setShowForm(false)} tenancySlug={tenancySlug} />
    </div>
  )
}
