'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { MessageCircle, ThumbsUp } from 'lucide-react'

// --- Types ---

type FeedbackType = 'bug' | 'feature' | 'docs'
type FeedbackStatus = 'In Development' | 'In Roadmap' | 'Planned' | 'Exploring' | 'Backlog' | 'Captured'
type PlanName = 'Compliance Pro' | 'Community Plus' | 'Management Suite'

interface FeedbackItem {
  id: string
  title: string
  theme: string
  type: FeedbackType
  status: FeedbackStatus
  votes: number
  sourceThreads: string[]
  assocs: string[]
  impact: 'high' | 'medium' | 'low'
  quarter: string | null
}

interface ThreadRef {
  id: string
  assocId: string
  subject: string
  status: 'open' | 'pending' | 'resolved'
  lastAt: string
  capturedItems: { feedbackId: string | null }[]
}

// --- Plan meta ---

const PLAN_META: Record<PlanName, { color: string; dot: string }> = {
  'Compliance Pro':   { color: '#dc2626', dot: '#dc2626' },
  'Community Plus':   { color: '#2563eb', dot: '#2563eb' },
  'Management Suite': { color: '#7c3aed', dot: '#7c3aed' },
}

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

// --- Seed data ---

interface AssocRef {
  id: string
  name: string
  plan: PlanName
  units: number
}

const ASSOCIATIONS: AssocRef[] = [
  { id: 'assoc_1302rstnw',  name: '1302 R Street NW Condominium', plan: 'Compliance Pro',   units: 12 },
  { id: 'assoc_capitolhill', name: 'Capitol Hill Terraces HOA',    plan: 'Community Plus',   units: 48 },
  { id: 'assoc_dupont',      name: 'Dupont Circle Lofts',          plan: 'Management Suite', units: 32 },
  { id: 'assoc_adamsmorg',   name: 'Adams Morgan Commons',         plan: 'Compliance Pro',   units: 24 },
  { id: 'assoc_georgemews',  name: 'Georgetown Mews',              plan: 'Compliance Pro',   units: 8 },
]

const THREADS: ThreadRef[] = [
  { id: 'SUP-001', assocId: 'assoc_capitolhill', subject: 'Votes & Resolutions — quorum tracking not updating',       status: 'open',     lastAt: '12m ago', capturedItems: [{ feedbackId: 'F-003' }, { feedbackId: 'F-004' }] },
  { id: 'SUP-002', assocId: 'assoc_1302rstnw',   subject: 'Fiscal Lens — reserve fund balance showing incorrect figure', status: 'open',   lastAt: '1h ago',  capturedItems: [{ feedbackId: 'F-001' }] },
  { id: 'SUP-003', assocId: 'assoc_dupont',       subject: 'Work order workflow — vendor assignment not saving',         status: 'open',     lastAt: '3h ago',  capturedItems: [{ feedbackId: 'F-005' }, { feedbackId: 'F-006' }] },
  { id: 'SUP-004', assocId: 'assoc_dupont',       subject: 'Bylaws & Legal — document upload failing for large PDFs',   status: 'pending',  lastAt: '1d ago',  capturedItems: [{ feedbackId: 'F-002' }, { feedbackId: null }] },
  { id: 'SUP-005', assocId: 'assoc_adamsmorg',    subject: 'Governance Calendar — meeting invitations not sending',     status: 'open',     lastAt: '4h ago',  capturedItems: [] },
  { id: 'SUP-006', assocId: 'assoc_1302rstnw',    subject: 'Permission question — resident access to board minutes',   status: 'resolved', lastAt: '3d ago',  capturedItems: [{ feedbackId: null }] },
]

const INITIAL_FEEDBACK: FeedbackItem[] = [
  { id: 'F-001', title: 'Reserve fund balance sync delay from General Ledger',   theme: 'Fiscal Lens',     type: 'bug',     status: 'In Development', votes: 6,  sourceThreads: ['SUP-002'], assocs: ['assoc_1302rstnw'],                                          impact: 'high',   quarter: 'Q2 2026' },
  { id: 'F-002', title: 'PDF upload fails silently over 10MB limit',             theme: 'Board Room',      type: 'bug',     status: 'In Development', votes: 4,  sourceThreads: ['SUP-004'], assocs: ['assoc_dupont'],                                             impact: 'medium', quarter: 'Q2 2026' },
  { id: 'F-003', title: 'Live quorum count not updating for all participants',    theme: 'Board Room',      type: 'bug',     status: 'Exploring',      votes: 8,  sourceThreads: ['SUP-001'], assocs: ['assoc_capitolhill'],                                        impact: 'high',   quarter: 'Q2 2026' },
  { id: 'F-004', title: 'Email notification when quorum is reached',             theme: 'Board Room',      type: 'feature', status: 'Backlog',        votes: 12, sourceThreads: ['SUP-001'], assocs: ['assoc_capitolhill', 'assoc_1302rstnw'],                    impact: 'medium', quarter: null },
  { id: 'F-005', title: 'Vendor assignment on work order form not persisting',    theme: 'Fiscal Lens',     type: 'bug',     status: 'In Development', votes: 3,  sourceThreads: ['SUP-003'], assocs: ['assoc_dupont'],                                             impact: 'high',   quarter: 'Q2 2026' },
  { id: 'F-006', title: 'Recurring work order templates',                         theme: 'Fiscal Lens',     type: 'feature', status: 'In Roadmap',     votes: 19, sourceThreads: ['SUP-003'], assocs: ['assoc_dupont', 'assoc_1302rstnw'],                        impact: 'high',   quarter: 'Q3 2026' },
  { id: 'F-007', title: 'Compliance grade breakdown — drill-down detail',         theme: 'Compliance',      type: 'feature', status: 'Planned',        votes: 9,  sourceThreads: [],          assocs: ['assoc_capitolhill', 'assoc_dupont'],                     impact: 'medium', quarter: 'Q3 2026' },
  { id: 'F-008', title: 'Resident portal — maintenance request submission',       theme: 'Resident Portal', type: 'feature', status: 'In Roadmap',     votes: 31, sourceThreads: [],          assocs: ['assoc_capitolhill', 'assoc_dupont', 'assoc_1302rstnw'], impact: 'high',   quarter: 'Q2 2026' },
  { id: 'F-009', title: 'Budget vs actuals comparison report',                    theme: 'Fiscal Lens',     type: 'feature', status: 'Planned',        votes: 14, sourceThreads: [],          assocs: ['assoc_1302rstnw', 'assoc_adamsmorg'],                   impact: 'high',   quarter: 'Q3 2026' },
  { id: 'F-010', title: 'Bulk resident import via CSV',                           theme: 'Resident Portal', type: 'feature', status: 'Backlog',        votes: 7,  sourceThreads: [],          assocs: ['assoc_capitolhill'],                                    impact: 'medium', quarter: null },
]

// --- Helpers ---

function assocById(id: string) {
  return ASSOCIATIONS.find(a => a.id === id)
}

const ALL_STATUSES: FeedbackStatus[] = ['Backlog', 'Exploring', 'Planned', 'In Roadmap', 'In Development']

// --- Component ---

export function FeedbackClient() {
  const [feedbackItems, setFeedbackItems] = useState(INITIAL_FEEDBACK)
  const [typeFilter, setTypeFilter] = useState('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const themes = [...new Set(feedbackItems.map(f => f.theme))]
  const filtered = typeFilter === 'all' ? feedbackItems : feedbackItems.filter(f => f.type === typeFilter)
  const item = selectedId ? feedbackItems.find(f => f.id === selectedId) : null

  // Find source threads that have captured items linking to the selected feedback item
  const srcThreads = item
    ? THREADS.filter(t => t.capturedItems.some(ci => ci.feedbackId === item.id))
    : []

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
              const allAssocIds = [...new Set(items.flatMap(f => f.assocs))]
              return (
                <div key={theme} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  {/* Theme header */}
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
                        const a = assocById(aid)
                        const pm = a ? PLAN_META[a.plan] : null
                        return a && pm ? (
                          <span key={aid} title={a.name} className="w-[7px] h-[7px] rounded-full" style={{ background: pm.dot }} />
                        ) : null
                      })}
                    </div>
                  </button>

                  {/* Items */}
                  {isOpen && items.map((f, i) => {
                    const isSel = selectedId === f.id
                    const tm = TYPE_META[f.type]
                    const sm = FEEDBACK_STATUS_META[f.status]
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
                        {/* Type tag */}
                        <Badge variant={tm.variant} className="text-[10px]">{tm.label}</Badge>

                        {/* Title */}
                        <span className={cn('text-[13px] flex-1 min-w-0 truncate', isSel ? 'text-blue-800' : 'text-gray-700')}>
                          {f.title}
                        </span>

                        {/* Association dots */}
                        <div className="flex gap-1 flex-shrink-0">
                          {f.assocs.map(aid => {
                            const a = assocById(aid)
                            const pm = a ? PLAN_META[a.plan] : null
                            return a && pm ? (
                              <span key={aid} title={a.name} className="w-[7px] h-[7px] rounded-full" style={{ background: pm.dot }} />
                            ) : null
                          })}
                        </div>

                        {/* Source thread count */}
                        {f.sourceThreads.length > 0 && (
                          <span className="text-[11px] text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-px flex-shrink-0">
                            {f.sourceThreads.length} thread{f.sourceThreads.length > 1 ? 's' : ''}
                          </span>
                        )}

                        {/* Status pill */}
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-px rounded flex-shrink-0"
                          style={{ color: sm.color, background: sm.bg }}
                        >
                          {f.status}
                        </span>

                        {/* Votes */}
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
                  style={{ color: FEEDBACK_STATUS_META[item.status].color, background: FEEDBACK_STATUS_META[item.status].bg }}
                >
                  {item.status}
                </span>
              </div>
              <h3 className="text-[15px] font-bold text-gray-900 mb-1">{item.title}</h3>
              <div className="text-xs text-gray-400 mb-3">{item.theme} · ▲ {item.votes} votes · {item.impact} impact</div>

              {/* Status changer */}
              <div className="flex flex-wrap gap-1">
                {ALL_STATUSES.map(s => {
                  const meta = FEEDBACK_STATUS_META[s]
                  const isActive = item.status === s
                  return (
                    <button
                      key={s}
                      onClick={() => setFeedbackItems(prev => prev.map(f => f.id === item.id ? { ...f, status: s } : f))}
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
              {item.assocs.map(aid => {
                const a = assocById(aid)
                const pm = a ? PLAN_META[a.plan] : null
                if (!a || !pm) return null
                return (
                  <div key={aid} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-b-0">
                    <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: pm.dot }} />
                    <span className="text-[13px] text-gray-700 flex-1">{a.name}</span>
                    <span className="text-[11px] text-gray-400">{a.plan}</span>
                    <span className="text-[11px] text-gray-700 font-medium">{a.units} units</span>
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
                  const a = assocById(t.assocId)
                  const pm = a ? PLAN_META[a.plan] : null
                  return (
                    <div
                      key={t.id}
                      className="border border-gray-200 rounded-[5px] p-2.5 mb-1.5 last:mb-0"
                      style={{ borderLeft: `3px solid ${pm?.dot || '#e5e7eb'}` }}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[11px] font-semibold" style={{ color: pm?.color }}>{a?.name?.split(' ').slice(0, 3).join(' ')}</span>
                        <Badge variant={THREAD_STATUS_VARIANT[t.status] || 'gray'} className="text-[10px]">
                          {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-700">{t.subject}</div>
                      <div className="text-[11px] text-gray-400 mt-1">{t.id} · {t.lastAt}</div>
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
