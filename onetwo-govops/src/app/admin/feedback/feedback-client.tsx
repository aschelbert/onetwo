'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// --- Types ---

type FeedbackType = 'bug' | 'feature' | 'docs'
type FeedbackStatus = 'In Development' | 'In Roadmap' | 'Planned' | 'Exploring' | 'Backlog' | 'Captured'

interface FeedbackItem {
  id: string
  title: string
  description: string | null
  theme: string
  type: FeedbackType
  status: FeedbackStatus
  votes: number
  impact: string | null
  quarter: string | null
  feedback_source_threads: { thread_id: string }[]
  feedback_assocs: { tenancy_id: string }[]
}

interface ThreadRef {
  id: string
  tenancy_id: string
  subject: string
  status: string
  updated_at: string
}

interface Tenancy {
  id: string
  name: string
  slug: string
  subscription_plans: { name: string; color: string } | null
}

// --- Meta ---

const FEEDBACK_STATUS_META: Record<FeedbackStatus, { color: string; bg: string }> = {
  'In Development': { color: '#1d4ed8', bg: '#dbeafe' },
  'In Roadmap':     { color: '#065f46', bg: '#d1fae5' },
  'Planned':        { color: '#5b21b6', bg: '#ede9fe' },
  'Exploring':      { color: '#92400e', bg: '#fef3c7' },
  'Backlog':        { color: '#374151', bg: '#f3f4f6' },
  'Captured':       { color: '#5b21b6', bg: '#ede9fe' },
}

const TYPE_META: Record<FeedbackType, { label: string; variant: 'red' | 'purple' | 'amber' }> = {
  bug:     { label: 'Bug',     variant: 'red' },
  feature: { label: 'Feature', variant: 'purple' },
  docs:    { label: 'Docs',    variant: 'amber' },
}

const THREAD_STATUS_VARIANT: Record<string, 'amber' | 'blue' | 'green'> = {
  open: 'amber',
  pending: 'blue',
  resolved: 'green',
}

const ALL_STATUSES: FeedbackStatus[] = ['Backlog', 'Exploring', 'Planned', 'In Roadmap', 'In Development']

function timeAgo(date: string) {
  const now = new Date()
  const then = new Date(date)
  const mins = Math.floor((now.getTime() - then.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// --- Component ---

export function FeedbackClient({
  initialFeedback,
  threads,
  tenancies,
}: {
  initialFeedback: FeedbackItem[]
  threads: ThreadRef[]
  tenancies: Tenancy[]
}) {
  const router = useRouter()
  const [feedbackItems, setFeedbackItems] = useState(initialFeedback)
  const [typeFilter, setTypeFilter] = useState('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)

  function tenancyById(id: string) {
    return tenancies.find(t => t.id === id)
  }

  function getPlanColor(t: Tenancy | undefined): string {
    return t?.subscription_plans?.color || '#6b7280'
  }

  const themes = [...new Set(feedbackItems.map(f => f.theme))]
  const filtered = typeFilter === 'all' ? feedbackItems : feedbackItems.filter(f => f.type === typeFilter)
  const item = selectedId ? feedbackItems.find(f => f.id === selectedId) : null

  // Find source threads for selected item
  const srcThreadIds = item ? item.feedback_source_threads.map(st => st.thread_id) : []
  const srcThreads = threads.filter(t => srcThreadIds.includes(t.id))

  const handleStatusChange = async (feedbackId: string, newStatus: FeedbackStatus) => {
    const res = await fetch('/api/admin/feedback', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: feedbackId, status: newStatus }),
    })
    if (res.ok) {
      const updated = await res.json()
      setFeedbackItems(prev => prev.map(f => f.id === updated.id ? { ...f, ...updated } : f))
    }
  }

  return (
    <div className="-m-8 flex" style={{ height: 'calc(100vh - 73px)' }}>
      {/* Left: grouped list */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-5">
            <div>
              <h2 className="font-serif text-2xl font-bold">Feedback</h2>
              <p className="text-sm text-gray-500 mt-1">{feedbackItems.length} items across {themes.length} themes</p>
            </div>
          </div>

          {/* Type filter */}
          <div className="flex gap-1 mb-4">
            {[['all', 'All'], ['feature', 'Features'], ['bug', 'Bugs'], ['docs', 'Docs']].map(([v, l]) => (
              <button
                key={v}
                onClick={() => setTypeFilter(v)}
                className={cn(
                  'px-3.5 py-1.5 rounded-[5px] text-xs cursor-pointer transition-all',
                  typeFilter === v
                    ? 'bg-white text-gray-900 font-semibold border border-gray-300 shadow-sm'
                    : 'bg-transparent text-gray-400 font-normal border border-transparent'
                )}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Theme groups */}
          <div className="space-y-2.5">
            {themes.map(theme => {
              const items = filtered.filter(f => f.theme === theme)
              if (!items.length) return null
              const isOpen = expanded[theme] !== false
              const allAssocIds = [...new Set(items.flatMap(f => f.feedback_assocs.map(a => a.tenancy_id)))]
              return (
                <div key={theme} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setExpanded(prev => ({ ...prev, [theme]: !isOpen }))}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-4 py-3 cursor-pointer border-none text-left bg-transparent',
                      isOpen ? 'border-b border-gray-100' : ''
                    )}
                  >
                    <span
                      className="text-gray-400 text-[10px] transition-transform inline-block"
                      style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    >
                      ▶
                    </span>
                    <span className="flex-1 text-sm font-semibold text-gray-900">{theme}</span>
                    <span className="text-xs text-gray-400">{items.length} items · ▲ {items.reduce((a, f) => a + f.votes, 0)}</span>
                    <div className="flex gap-1">
                      {allAssocIds.map(aid => {
                        const t = tenancyById(aid)
                        const color = getPlanColor(t)
                        return t ? (
                          <span key={aid} title={t.name} className="w-[7px] h-[7px] rounded-full" style={{ background: color }} />
                        ) : null
                      })}
                    </div>
                  </button>

                  {isOpen && items.map((f, i) => {
                    const isSel = selectedId === f.id
                    const tm = TYPE_META[f.type]
                    const sm = FEEDBACK_STATUS_META[f.status] || FEEDBACK_STATUS_META.Backlog
                    return (
                      <div
                        key={f.id}
                        onClick={() => setSelectedId(isSel ? null : f.id)}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
                          i < items.length - 1 ? 'border-b border-gray-50' : '',
                          isSel ? 'bg-blue-50' : 'hover:bg-gray-50/60'
                        )}
                        style={{ borderLeft: `2px solid ${isSel ? '#2563eb' : 'transparent'}` }}
                      >
                        <Badge variant={tm.variant} className="text-[10px]">{tm.label}</Badge>
                        <span className={cn('text-[13px] flex-1 min-w-0 truncate', isSel ? 'text-blue-800' : 'text-gray-700')}>
                          {f.title}
                        </span>
                        <div className="flex gap-1 flex-shrink-0">
                          {f.feedback_assocs.map(assoc => {
                            const t = tenancyById(assoc.tenancy_id)
                            const color = getPlanColor(t)
                            return t ? (
                              <span key={assoc.tenancy_id} title={t.name} className="w-[7px] h-[7px] rounded-full" style={{ background: color }} />
                            ) : null
                          })}
                        </div>
                        {f.feedback_source_threads.length > 0 && (
                          <span className="text-[11px] text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-px flex-shrink-0">
                            {f.feedback_source_threads.length} thread{f.feedback_source_threads.length > 1 ? 's' : ''}
                          </span>
                        )}
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-px rounded flex-shrink-0"
                          style={{ color: sm.color, background: sm.bg }}
                        >
                          {f.status}
                        </span>
                        <span className="text-[11px] text-gray-400 min-w-[36px] text-right flex-shrink-0">▲ {f.votes}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Right: detail panel */}
      {item && (
        <div className="w-80 flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto">
          <div className="p-4 flex flex-col gap-3">
            {/* Header card */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-1.5 mb-2.5">
                <Badge variant={TYPE_META[item.type].variant}>{TYPE_META[item.type].label}</Badge>
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-px rounded"
                  style={{ color: (FEEDBACK_STATUS_META[item.status] || FEEDBACK_STATUS_META.Backlog).color, background: (FEEDBACK_STATUS_META[item.status] || FEEDBACK_STATUS_META.Backlog).bg }}
                >
                  {item.status}
                </span>
              </div>
              <h3 className="text-[15px] font-bold text-gray-900 mb-1">{item.title}</h3>
              <div className="text-xs text-gray-400 mb-3">{item.theme} · ▲ {item.votes} votes · {item.impact || 'medium'} impact</div>

              {/* Status changer */}
              <div className="flex flex-wrap gap-1">
                {ALL_STATUSES.map(s => {
                  const meta = FEEDBACK_STATUS_META[s]
                  const isActive = item.status === s
                  return (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(item.id, s)}
                      className="text-[10px] px-2 py-1 rounded cursor-pointer border transition-all"
                      style={{
                        background: isActive ? meta.bg : '#f9fafb',
                        color: isActive ? meta.color : '#9ca3af',
                        borderColor: isActive ? '#e5e7eb' : '#f3f4f6',
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {s}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Association Signal */}
            <div className="bg-white border border-gray-200 rounded-lg p-3.5">
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">Association Signal</div>
              {item.feedback_assocs.map(assoc => {
                const t = tenancyById(assoc.tenancy_id)
                const color = getPlanColor(t)
                if (!t) return null
                return (
                  <div key={assoc.tenancy_id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-b-0">
                    <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="text-[13px] text-gray-700 flex-1">{t.name}</span>
                    <span className="text-[11px] text-gray-400">{t.subscription_plans?.name || ''}</span>
                  </div>
                )
              })}
            </div>

            {/* Source Threads */}
            <div className="bg-white border border-gray-200 rounded-lg p-3.5">
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
                Source Threads {srcThreads.length > 0 && `(${srcThreads.length})`}
              </div>
              {srcThreads.length === 0 ? (
                <span className="text-xs text-gray-300">No threads linked yet.</span>
              ) : (
                srcThreads.map(t => {
                  const tn = tenancyById(t.tenancy_id)
                  const color = getPlanColor(tn)
                  return (
                    <div
                      key={t.id}
                      className="border border-gray-200 rounded-[5px] p-2.5 mb-1.5 last:mb-0"
                      style={{ borderLeft: `3px solid ${color}` }}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[11px] font-semibold" style={{ color }}>{tn?.name?.split(' ').slice(0, 3).join(' ')}</span>
                        <Badge variant={THREAD_STATUS_VARIANT[t.status] || 'amber'} className="text-[10px]">
                          {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-700">{t.subject}</div>
                      <div className="text-[11px] text-gray-400 mt-1">{t.id.slice(0, 8)} · {timeAgo(t.updated_at)}</div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
