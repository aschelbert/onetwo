'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { TabBar, TabButton } from '@/components/ui/tabs'
import { Card, CardBody } from '@/components/ui/card'
import { TaskCard } from './TaskCard'
import { TaskForm } from './TaskForm'
import type { AssociationTask, TaskStatus } from '@/types/association-team'
import { Plus, Search, ListTodo } from 'lucide-react'

interface TeamMember {
  id: string
  name: string
  role: string
}

const STATUS_TABS: { label: string; value: TaskStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'To Do', value: 'todo' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Done', value: 'done' },
  { label: 'Backlog', value: 'backlog' },
]

export function TaskList({
  tasks,
  teamMembers,
  tenancySlug,
}: {
  tasks: AssociationTask[]
  teamMembers: TeamMember[]
  tenancySlug: string
}) {
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)

  const filtered = tasks.filter((task) => {
    if (statusFilter !== 'all' && task.status !== statusFilter) return false
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false
    if (assigneeFilter !== 'all') {
      if (assigneeFilter === 'unassigned' && task.assigned_to) return false
      if (assigneeFilter !== 'unassigned' && task.assigned_to !== assigneeFilter) return false
    }
    if (search) {
      const q = search.toLowerCase()
      return task.title.toLowerCase().includes(q) || task.description.toLowerCase().includes(q)
    }
    return true
  })

  // Summary stats
  const todoCount = tasks.filter((t) => t.status === 'todo').length
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length
  const doneCount = tasks.filter((t) => t.status === 'done').length

  return (
    <div>
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <Card>
          <CardBody className="text-center py-3">
            <p className="text-2xl font-bold text-blue-600">{todoCount}</p>
            <p className="text-[0.75rem] text-[#929da8]">To Do</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center py-3">
            <p className="text-2xl font-bold text-[#a16207]">{inProgressCount}</p>
            <p className="text-[0.75rem] text-[#929da8]">In Progress</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center py-3">
            <p className="text-2xl font-bold text-[#047857]">{doneCount}</p>
            <p className="text-[0.75rem] text-[#929da8]">Done</p>
          </CardBody>
        </Card>
      </div>

      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#929da8]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="w-auto"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
          <Select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="w-auto"
          >
            <option value="all">All Assignees</option>
            <option value="unassigned">Unassigned</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
          <Button onClick={() => setShowForm(true)}>
            <Plus size={14} /> New Task
          </Button>
        </div>
      </div>

      {/* Status filter tabs */}
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
                ({tasks.filter((t) => t.status === tab.value).length})
              </span>
            )}
          </TabButton>
        ))}
      </TabBar>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <ListTodo size={40} className="mx-auto text-[#929da8] mb-3" />
          <p className="text-sm font-semibold text-[#45505a] mb-1">No tasks yet</p>
          <p className="text-[0.8rem] text-[#929da8] mb-4">Create your first task to get started</p>
          <Button onClick={() => setShowForm(true)}>
            <Plus size={14} /> New Task
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((task) => (
            <TaskCard key={task.id} task={task} tenancySlug={tenancySlug} />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <TaskForm
        open={showForm}
        onClose={() => setShowForm(false)}
        tenancySlug={tenancySlug}
        teamMembers={teamMembers}
      />
    </div>
  )
}
