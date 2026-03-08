'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTenant } from '@/lib/tenant-context'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Plus, Send, MessageCircle } from 'lucide-react'

interface Thread {
  id: string
  tenancy_id: string
  subject: string
  status: string
  priority: string
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

const PRIORITY_META: Record<string, { color: string; label: string }> = {
  high: { color: '#dc2626', label: 'High' },
  medium: { color: '#d97706', label: 'Medium' },
  low: { color: '#6b7280', label: 'Low' },
}

const STATUS_META: Record<string, { label: string; variant: 'amber' | 'blue' | 'green' }> = {
  open: { label: 'Open', variant: 'amber' },
  pending: { label: 'Pending', variant: 'blue' },
  resolved: { label: 'Resolved', variant: 'green' },
}

const MODULES = ['Board Room', 'Fiscal Lens', 'Compliance', 'Access & Permissions', 'Other']

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

export function SupportClient({
  threads: initialThreads,
  tenancyId,
}: {
  threads: Thread[]
  tenancyId: string
  tenancySlug: string
}) {
  const { user } = useTenant()
  const [threads, setThreads] = useState(initialThreads)
  const [selectedId, setSelectedId] = useState<string | null>(initialThreads[0]?.id || null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newSubject, setNewSubject] = useState('')
  const [newModule, setNewModule] = useState('Board Room')
  const [newPriority, setNewPriority] = useState('medium')
  const [newMessage, setNewMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const thread = threads.find(t => t.id === selectedId)

  // Fetch messages when thread selected
  const fetchMessages = useCallback(async (threadId: string) => {
    setLoadingMessages(true)
    try {
      const res = await fetch(`/api/support/messages?thread_id=${threadId}&tenancy_id=${tenancyId}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data)
      }
    } finally {
      setLoadingMessages(false)
    }
  }, [tenancyId])

  useEffect(() => {
    if (selectedId) fetchMessages(selectedId)
  }, [selectedId, fetchMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('tenant-support')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
      }, (payload) => {
        const msg = payload.new as Message
        if (msg.thread_id === selectedId) {
          setMessages(prev => [...prev, msg])
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'support_threads',
      }, (payload) => {
        const updated = payload.new as Thread
        setThreads(prev => prev.map(t => t.id === updated.id ? updated : t))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [selectedId])

  const sendReply = async () => {
    if (!replyText.trim() || !selectedId) return
    setSending(true)
    try {
      const res = await fetch('/api/support/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: selectedId, tenancy_id: tenancyId, body: replyText }),
      })
      if (res.ok) {
        const msg = await res.json()
        setMessages(prev => [...prev, msg])
        setReplyText('')
      }
    } finally {
      setSending(false)
    }
  }

  const createThread = async () => {
    if (!newSubject.trim() || !newMessage.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/support/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenancy_id: tenancyId,
          subject: newSubject,
          module: newModule,
          priority: newPriority,
          message: newMessage,
        }),
      })
      if (res.ok) {
        const newThread = await res.json()
        setThreads(prev => [newThread, ...prev])
        setSelectedId(newThread.id)
        setShowNewForm(false)
        setNewSubject('')
        setNewModule('Board Room')
        setNewPriority('medium')
        setNewMessage('')
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="-m-6 flex" style={{ height: 'calc(100vh - 56px)' }}>
      {/* Left — thread list */}
      <div className="w-[300px] flex-shrink-0 bg-white border-r border-stone-200 flex flex-col">
        <div className="p-3 border-b border-stone-100 flex items-center justify-between">
          <h2 className="font-serif text-base font-semibold text-stone-900">Support</h2>
          <Button size="sm" variant="outline" onClick={() => { setShowNewForm(true); setSelectedId(null) }}>
            <Plus size={14} />
            New
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 && !showNewForm && (
            <div className="p-5 text-center text-sm text-stone-400">
              <MessageCircle size={32} className="mx-auto mb-2 text-stone-300" />
              No support threads yet.
            </div>
          )}
          {threads.map(t => {
            const isActive = t.id === selectedId
            const ps = PRIORITY_META[t.priority] || PRIORITY_META.medium
            const sm = STATUS_META[t.status] || STATUS_META.open
            return (
              <div
                key={t.id}
                onClick={() => { setSelectedId(t.id); setShowNewForm(false) }}
                className={cn(
                  'px-3.5 py-3 border-b border-stone-100 cursor-pointer transition-colors',
                  isActive ? 'bg-stone-100' : 'hover:bg-stone-50'
                )}
              >
                <div className="flex justify-between items-start mb-1">
                  <Badge variant={sm.variant} className="text-[10px]">{sm.label}</Badge>
                  <span className="text-[10px] text-stone-400">{timeAgo(t.updated_at)}</span>
                </div>
                <div className="text-[13px] font-medium text-stone-800 mb-1 line-clamp-2">{t.subject}</div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-medium" style={{ color: ps.color }}>
                    {ps.label}
                  </span>
                  <span className="text-[10px] text-stone-400">{t.module}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right — message view or new form */}
      <div className="flex-1 flex flex-col min-w-0 bg-stone-50">
        {showNewForm ? (
          <div className="flex-1 flex flex-col">
            <div className="bg-white border-b border-stone-200 px-5 py-3">
              <h3 className="text-sm font-semibold text-stone-900">New Support Thread</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="max-w-lg space-y-4">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Subject</label>
                  <input
                    value={newSubject}
                    onChange={e => setNewSubject(e.target.value)}
                    placeholder="Describe the issue..."
                    className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-700 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1">Module</label>
                    <select
                      value={newModule}
                      onChange={e => setNewModule(e.target.value)}
                      className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-700 outline-none cursor-pointer"
                    >
                      {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1">Priority</label>
                    <select
                      value={newPriority}
                      onChange={e => setNewPriority(e.target.value)}
                      className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-700 outline-none cursor-pointer"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Message</label>
                  <textarea
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder="Describe what you need help with..."
                    rows={5}
                    className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-700 resize-none outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={createThread} disabled={!newSubject.trim() || !newMessage.trim() || creating}>
                    {creating ? 'Sending...' : 'Submit'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowNewForm(false)}>Cancel</Button>
                </div>
              </div>
            </div>
          </div>
        ) : thread ? (
          <>
            {/* Thread header */}
            <div className="bg-white border-b border-stone-200 px-5 py-3">
              <div className="text-sm font-semibold text-stone-900 mb-1">{thread.subject}</div>
              <div className="flex items-center gap-1.5">
                <Badge variant={STATUS_META[thread.status]?.variant || 'amber'}>
                  {STATUS_META[thread.status]?.label || thread.status}
                </Badge>
                <span className="text-[11px] bg-stone-100 border border-stone-200 rounded px-1.5 py-px text-stone-500">
                  {thread.module}
                </span>
                <span className="text-[11px] font-medium" style={{ color: PRIORITY_META[thread.priority]?.color || '#6b7280' }}>
                  {PRIORITY_META[thread.priority]?.label || thread.priority} priority
                </span>
                {thread.assignee_name && (
                  <>
                    <span className="text-stone-300">|</span>
                    <span className="text-[11px] text-stone-500">Assigned to {thread.assignee_name}</span>
                  </>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-3.5">
              {loadingMessages ? (
                <div className="flex-1 flex items-center justify-center text-stone-400 text-sm">Loading...</div>
              ) : (
                messages.map(msg => {
                  const isTenant = msg.sender_type === 'tenant'
                  return (
                    <div key={msg.id} className={cn('flex gap-2.5', isTenant ? 'flex-row' : 'flex-row-reverse')}>
                      <div
                        className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 text-white"
                        style={{ background: isTenant ? '#78716c' : '#2563eb' }}
                      >
                        {getInitials(msg.sender_name)}
                      </div>
                      <div className="max-w-[68%]">
                        <div className={cn('flex items-baseline gap-1.5 mb-1', isTenant ? 'flex-row' : 'flex-row-reverse')}>
                          <span className="text-xs font-semibold text-stone-700">{msg.sender_name}</span>
                          {msg.sender_role && isTenant && (
                            <span className="text-[11px] text-stone-400 bg-stone-100 px-1.5 py-px rounded">{msg.sender_role}</span>
                          )}
                          {!isTenant && (
                            <span className="text-[11px] text-blue-500 bg-blue-50 px-1.5 py-px rounded">Support</span>
                          )}
                          <span className="text-[11px] text-stone-300">{timeAgo(msg.created_at)}</span>
                        </div>
                        <div
                          className={cn(
                            'border px-3.5 py-2.5',
                            isTenant
                              ? 'bg-white border-stone-200 rounded-xl rounded-tl-sm'
                              : 'bg-blue-50 border-blue-200 rounded-xl rounded-tr-sm'
                          )}
                        >
                          <p className="text-[13px] text-stone-700 leading-relaxed m-0">{msg.body}</p>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply box */}
            {thread.status !== 'resolved' ? (
              <div className="bg-white border-t border-stone-200 px-5 py-3">
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                  placeholder="Type your reply..."
                  rows={2}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-[13px] text-stone-700 resize-none outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200"
                />
                <div className="flex justify-end mt-2">
                  <Button onClick={sendReply} disabled={!replyText.trim() || sending}>
                    <Send size={14} />
                    {sending ? 'Sending...' : 'Send'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-stone-100 border-t border-stone-200 px-5 py-3 text-center text-sm text-stone-500">
                This thread has been resolved.
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-stone-300 text-sm">
            Select a thread or create a new one
          </div>
        )}
      </div>
    </div>
  )
}
