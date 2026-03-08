'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, Sparkles } from 'lucide-react'

// --- Types ---

type Priority = 'high' | 'medium' | 'low'
type ThreadStatus = 'open' | 'pending' | 'resolved'

interface Tenancy {
  id: string
  name: string
  subdomain: string
}

interface SupportThread {
  id: string
  tenancy_id: string
  subject: string
  status: ThreadStatus
  priority: Priority
  module: string
  assignee_name: string | null
  ai_summary: string | null
  created_by_name: string
  created_at: string
  updated_at: string
}

interface Message {
  id: string
  thread_id: string
  sender_type: string
  sender_id: string | null
  sender_name: string
  sender_role: string | null
  body: string
  created_at: string
}

interface CapturedItem {
  id: string
  thread_id: string
  type: string
  title: string
  feedback_id: string | null
  feedback_items: { id: string; title: string; status: string } | null
}

interface FeedbackRef {
  id: string
  title: string
  status: string
}

// --- Plan meta ---

const PRIORITY_META: Record<Priority, { color: string; label: string }> = {
  high:   { color: '#dc2626', label: 'High' },
  medium: { color: '#d97706', label: 'Medium' },
  low:    { color: '#6b7280', label: 'Low' },
}

const THREAD_STATUS_META: Record<ThreadStatus, { label: string; variant: 'amber' | 'blue' | 'green' }> = {
  open:     { label: 'Open',     variant: 'amber' },
  pending:  { label: 'Pending',  variant: 'blue' },
  resolved: { label: 'Resolved', variant: 'green' },
}

const TYPE_META: Record<string, { label: string; variant: 'red' | 'purple' | 'amber' }> = {
  bug:     { label: 'Bug',     variant: 'red' },
  feature: { label: 'Feature', variant: 'purple' },
  docs:    { label: 'Docs',    variant: 'amber' },
}

// --- Helpers ---

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

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

export function SupportClient({
  initialThreads,
  tenancies,
  feedbackItems,
}: {
  initialThreads: SupportThread[]
  tenancies: Tenancy[]
  feedbackItems: FeedbackRef[]
}) {
  const router = useRouter()
  const [threads, setThreads] = useState(initialThreads)
  const [scopeTenancyId, setScopeTenancyId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [replyText, setReplyText] = useState('')
  const [rightPanel, setRightPanel] = useState<'capture' | 'association'>('capture')
  const [linkTarget, setLinkTarget] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [capturedItems, setCapturedItems] = useState<CapturedItem[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  function tenancyById(id: string) {
    return tenancies.find(t => t.id === id)
  }

  function getPlanColor(_tenancy: Tenancy | undefined): string {
    return '#6b7280'
  }

  const visible = threads
    .filter(t => scopeTenancyId ? t.tenancy_id === scopeTenancyId : true)
    .filter(t => statusFilter === 'all' ? true : t.status === statusFilter)
    .sort((a, b) => {
      const p: Record<string, number> = { high: 0, medium: 1, low: 2 }
      if (a.status !== 'resolved' && b.status === 'resolved') return -1
      if (a.status === 'resolved' && b.status !== 'resolved') return 1
      return (p[a.priority] ?? 2) - (p[b.priority] ?? 2)
    })

  useEffect(() => {
    if ((!selectedId || !visible.find(t => t.id === selectedId)) && visible.length) {
      setSelectedId(visible[0].id)
    }
  }, [scopeTenancyId, statusFilter])

  // Fetch messages for selected thread
  const fetchMessages = useCallback(async (threadId: string) => {
    setLoadingMessages(true)
    try {
      const res = await fetch(`/api/admin/support/messages?thread_id=${threadId}`)
      if (res.ok) setMessages(await res.json())
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  const fetchCapturedItems = useCallback(async (threadId: string) => {
    const res = await fetch(`/api/admin/support/captured-items?thread_id=${threadId}`)
    if (res.ok) setCapturedItems(await res.json())
  }, [])

  useEffect(() => {
    if (selectedId) {
      fetchMessages(selectedId)
      fetchCapturedItems(selectedId)
    }
  }, [selectedId, fetchMessages, fetchCapturedItems])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Realtime
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('admin-support')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, (payload) => {
        const msg = payload.new as Message
        if (msg.thread_id === selectedId) {
          setMessages(prev => [...prev, msg])
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_threads' }, (payload) => {
        const updated = payload.new as SupportThread
        setThreads(prev => prev.map(t => t.id === updated.id ? updated : t))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [selectedId])

  const thread = threads.find(t => t.id === selectedId)
  const tenancy = thread ? tenancyById(thread.tenancy_id) : undefined
  const planColor = getPlanColor(tenancy)
  const planName = tenancy?.subdomain || 'Unknown'

  const sendReply = async () => {
    if (!replyText.trim() || !selectedId) return
    const res = await fetch('/api/admin/support/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_id: selectedId, body: replyText }),
    })
    if (res.ok) {
      const msg = await res.json()
      setMessages(prev => [...prev, msg])
      setReplyText('')
    }
  }

  const handleResolve = async () => {
    if (!selectedId) return
    const res = await fetch('/api/admin/support/threads', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selectedId, status: 'resolved' }),
    })
    if (res.ok) {
      const updated = await res.json()
      setThreads(prev => prev.map(t => t.id === updated.id ? updated : t))
    }
  }

  const handleAssignee = async (assignee: string) => {
    if (!selectedId) return
    const res = await fetch('/api/admin/support/threads', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selectedId, assignee_name: assignee || null }),
    })
    if (res.ok) {
      const updated = await res.json()
      setThreads(prev => prev.map(t => t.id === updated.id ? updated : t))
    }
  }

  const handleSummarize = async (threadId: string) => {
    const t = threads.find(th => th.id === threadId)
    if (!t) return
    const summary = t.priority === 'high'
      ? `Critical issue reported. ${t.subject.split('—')[1]?.trim() || t.subject}. Requires engineering escalation.`
      : `${t.subject.split('—')[1]?.trim() || t.subject}. Issue identified and being tracked.`
    const res = await fetch('/api/admin/support/threads', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: threadId, ai_summary: summary }),
    })
    if (res.ok) {
      const updated = await res.json()
      setThreads(prev => prev.map(th => th.id === updated.id ? updated : th))
    }
  }

  // Unique tenancies that have threads
  const tenancyIds = [...new Set(threads.map(t => t.tenancy_id))]
  const threadTenancies = tenancyIds.map(id => tenancyById(id)).filter(Boolean) as Tenancy[]

  return (
    <div className="-m-8 flex flex-col" style={{ height: 'calc(100vh - 73px)' }}>
      {/* Tenancy scope tabs */}
      <div className="flex items-center gap-0 border-b border-gray-200 bg-white px-6 overflow-x-auto">
        <button
          onClick={() => setScopeTenancyId(null)}
          className={cn(
            'px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-all cursor-pointer bg-transparent border-x-0 border-t-0 whitespace-nowrap',
            scopeTenancyId === null ? 'text-gray-900 font-semibold border-b-gray-900' : 'text-gray-400 border-b-transparent hover:text-gray-700'
          )}
        >
          All associations
        </button>
        {threadTenancies.map(t => {
          const color = getPlanColor(t)
          const unread = threads.filter(th => th.tenancy_id === t.id && th.status === 'open').length
          const active = scopeTenancyId === t.id
          return (
            <button
              key={t.id}
              onClick={() => setScopeTenancyId(active ? null : t.id)}
              className={cn(
                'px-3.5 py-2.5 text-xs font-medium border-b-2 -mb-px transition-all cursor-pointer bg-transparent border-x-0 border-t-0 flex items-center gap-1.5 whitespace-nowrap',
                active ? 'font-semibold' : 'text-gray-400 border-b-transparent hover:text-gray-700'
              )}
              style={active ? { color, borderBottomColor: color } : undefined}
            >
              <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: color }} />
              {t.name.split(' ').slice(0, 3).join(' ')}
              {unread > 0 && (
                <span className="bg-[#dc2626] text-white rounded-full w-3.5 h-3.5 text-[8px] font-bold inline-flex items-center justify-center flex-shrink-0">{unread}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* 3-pane layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left — thread list */}
        <div className="w-[280px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
          {/* Status filter pills */}
          <div className="p-2.5 border-b border-gray-100 flex gap-1">
            {[['all', 'All'], ['open', 'Open'], ['pending', 'Pending'], ['resolved', 'Resolved']].map(([v, l]) => (
              <button
                key={v}
                onClick={() => setStatusFilter(v)}
                className={cn(
                  'flex-1 py-1.5 text-[11px] font-medium rounded-[5px] cursor-pointer transition-all border bg-transparent',
                  statusFilter === v
                    ? 'text-gray-900 font-semibold border-gray-200 bg-gray-50'
                    : 'text-gray-400 border-transparent'
                )}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {visible.length === 0 && <div className="p-5 text-[13px] text-gray-400">No threads.</div>}
            {visible.map(t => {
              const tn = tenancyById(t.tenancy_id)
              const color = getPlanColor(tn)
              const isActive = t.id === selectedId
              const ps = PRIORITY_META[t.priority]
              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={cn(
                    'px-3.5 py-3 border-b border-gray-100 cursor-pointer transition-colors',
                    isActive ? 'bg-blue-50' : 'bg-white hover:bg-gray-50/60'
                  )}
                  style={{ borderLeft: `3px solid ${isActive ? color : 'transparent'}` }}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {!scopeTenancyId && <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: color }} />}
                      <span className={cn('text-xs font-semibold overflow-hidden text-ellipsis whitespace-nowrap flex-1', isActive ? 'text-blue-800' : 'text-gray-900')}>
                        {scopeTenancyId ? t.id.slice(0, 8) : tn?.name?.split(' ').slice(0, 3).join(' ') || 'Unknown'}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 ml-1.5 flex-shrink-0">{timeAgo(t.updated_at)}</span>
                  </div>
                  <div className="text-xs text-gray-700 overflow-hidden text-ellipsis whitespace-nowrap mb-1.5">{t.subject}</div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium" style={{ color: ps.color }}>● {ps.label}</span>
                    <span className="text-[10px] text-gray-400">· {t.module}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Center — message thread */}
        <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
          {thread && tenancy ? (
            <>
              {/* Thread header */}
              <div className="bg-white border-b border-gray-200 px-5 py-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: planColor }} />
                  <span className="text-xs font-semibold" style={{ color: planColor }}>{tenancy.name}</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-[11px] text-gray-400">{planName}</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-[11px] text-gray-400">{thread.id.slice(0, 8)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-sm font-semibold text-gray-900 mb-1">{thread.subject}</div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={THREAD_STATUS_META[thread.status].variant}>{THREAD_STATUS_META[thread.status].label}</Badge>
                      <span className="text-[11px] bg-gray-100 border border-gray-200 rounded px-1.5 py-px text-gray-500">{thread.module}</span>
                      <span className="text-[11px] font-medium" style={{ color: PRIORITY_META[thread.priority].color }}>
                        ● {PRIORITY_META[thread.priority].label} priority
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={thread.assignee_name || ''}
                      onChange={e => handleAssignee(e.target.value)}
                      className="bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-700 outline-none cursor-pointer"
                    >
                      <option value="">Assign…</option>
                      <option value="Alex K.">Alex K.</option>
                      <option value="Maya R.">Maya R.</option>
                      <option value="Sam L.">Sam L.</option>
                    </select>
                    {thread.status !== 'resolved' && (
                      <Button variant="sage" size="sm" onClick={handleResolve}>
                        <CheckCircle size={14} />
                        Resolve
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-3.5">
                {loadingMessages ? (
                  <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">Loading messages...</div>
                ) : (
                  messages.map(msg => {
                    const isSupport = msg.sender_type === 'admin'
                    return (
                      <div key={msg.id} className={cn('flex gap-2.5', isSupport ? 'flex-row-reverse' : 'flex-row')}>
                        <div
                          className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
                          style={{ background: isSupport ? '#6b7280' : planColor, color: '#fff' }}
                        >
                          {getInitials(msg.sender_name)}
                        </div>
                        <div className="max-w-[68%]">
                          <div className={cn('flex items-baseline gap-1.5 mb-1', isSupport ? 'flex-row-reverse' : 'flex-row')}>
                            <span className="text-xs font-semibold text-gray-700">{msg.sender_name}</span>
                            {msg.sender_role && !isSupport && (
                              <span className="text-[11px] text-gray-400 bg-gray-100 px-1.5 py-px rounded">{msg.sender_role}</span>
                            )}
                            <span className="text-[11px] text-gray-300">{timeAgo(msg.created_at)}</span>
                          </div>
                          <div
                            className={cn(
                              'border px-3.5 py-2.5',
                              isSupport
                                ? 'bg-blue-50 border-blue-200 rounded-xl rounded-tr-sm'
                                : 'bg-white border-gray-200 rounded-xl rounded-tl-sm'
                            )}
                          >
                            <p className="text-[13px] text-gray-700 leading-relaxed m-0">{msg.body}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply box */}
              <div className="bg-white border-t border-gray-200 px-5 py-3">
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                  placeholder={`Reply to ${tenancy.name}…`}
                  rows={2}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 resize-none outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                />
                <div className="flex justify-end mt-2">
                  <Button onClick={sendReply} disabled={!replyText.trim()}>Send reply ↑</Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-300 text-[13px]">Select a thread</div>
          )}
        </div>

        {/* Right panel */}
        {thread && tenancy && (
          <div className="w-[290px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col">
            {/* Panel tabs */}
            <div className="flex border-b border-gray-200">
              {[['capture', 'Capture'], ['association', 'Association']].map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setRightPanel(v as 'capture' | 'association')}
                  className={cn(
                    'flex-1 py-2.5 text-xs font-medium border-b-2 -mb-px transition-all cursor-pointer bg-transparent border-x-0 border-t-0',
                    rightPanel === v ? 'text-gray-900 font-semibold border-b-gray-900' : 'text-gray-400 border-b-transparent hover:text-gray-700'
                  )}
                >
                  {l}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {rightPanel === 'capture' ? (
                <div className="p-4 flex flex-col gap-3">
                  {/* AI Summary */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-100 px-3 py-2 flex justify-between items-center">
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">AI Summary</span>
                      <button
                        onClick={() => handleSummarize(thread.id)}
                        className="text-[11px] text-blue-600 bg-transparent border-none cursor-pointer font-medium"
                      >
                        {thread.ai_summary ? 'Refresh' : 'Generate'}
                      </button>
                    </div>
                    <div className="px-3 py-2.5">
                      {thread.ai_summary ? (
                        <p className="text-xs text-gray-700 leading-relaxed m-0">{thread.ai_summary}</p>
                      ) : (
                        <p className="text-xs text-gray-300 m-0">Not yet generated.</p>
                      )}
                    </div>
                  </div>

                  {/* Captured Items */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-100 px-3 py-2 flex justify-between items-center">
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Captured Items</span>
                      <button className="text-[11px] text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-px cursor-pointer font-medium">
                        <Sparkles size={10} className="inline mr-0.5" />
                        Analyze
                      </button>
                    </div>
                    <div className="py-2">
                      {capturedItems.length === 0 ? (
                        <p className="text-xs text-gray-300 m-0 px-3">Run analysis to surface items.</p>
                      ) : (
                        capturedItems.map(item => {
                          const linked = item.feedback_items
                          const tm = TYPE_META[item.type]
                          return (
                            <div key={item.id} className="px-3 py-1.5 border-b border-gray-50 last:border-b-0">
                              <div className="flex items-start gap-1.5 mb-0.5">
                                <Badge variant={tm?.variant || 'amber'} className="text-[10px]">{tm?.label || item.type}</Badge>
                                <span className="text-xs text-gray-700 leading-snug">{item.title}</span>
                              </div>
                              {linked && (
                                <div className="ml-0.5 mt-1">
                                  <span className="text-[11px] text-gray-500">→ </span>
                                  <span className="text-[11px] text-blue-600 font-medium">{linked.id.slice(0, 8)} · {linked.status}</span>
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  {/* Link to Feedback */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-100 px-3 py-2">
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Link to Feedback</span>
                    </div>
                    <div className="px-3 py-2.5 flex gap-1.5">
                      <select
                        value={linkTarget}
                        onChange={e => setLinkTarget(e.target.value)}
                        className="flex-1 bg-white border border-gray-200 rounded-[5px] px-2 py-1.5 text-[11px] text-gray-700 outline-none"
                      >
                        <option value="">Select item…</option>
                        {feedbackItems.map(f => (
                          <option key={f.id} value={f.id}>{f.title.slice(0, 35)}</option>
                        ))}
                      </select>
                      <Button size="xs" onClick={() => setLinkTarget('')} disabled={!linkTarget}>Link</Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 flex flex-col gap-3.5">
                  {/* Tenancy summary card */}
                  <div className="rounded-lg p-3.5" style={{ border: `1px solid ${planColor}33`, background: `${planColor}08` }}>
                    <div className="text-sm font-bold text-gray-900 mb-1">{tenancy.name}</div>
                    <div className="text-xs text-gray-500 mb-2.5">{tenancy.subdomain}</div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: planColor }} />
                      <span className="text-[13px] text-gray-700">{planName}</span>
                    </div>
                  </div>

                  {/* All threads for tenancy */}
                  <div>
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">All Threads</div>
                    {threads.filter(t => t.tenancy_id === tenancy.id).map(t => (
                      <div
                        key={t.id}
                        onClick={() => setSelectedId(t.id)}
                        className={cn(
                          'flex items-center gap-1.5 px-2 py-1.5 rounded-[5px] cursor-pointer',
                          t.id === selectedId ? 'bg-blue-50' : 'hover:bg-gray-50'
                        )}
                      >
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: t.status === 'resolved' ? '#10b981' : '#f59e0b' }} />
                        <span className="text-xs text-gray-700 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{t.subject}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
