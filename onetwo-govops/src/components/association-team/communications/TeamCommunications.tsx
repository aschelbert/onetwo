'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { TeamChannel, TeamMessage } from '@/types/association-team'

// ─── Role colors ────────────────────────────────────────────────
const ROLE_COLORS: Record<string, string> = {
  board_member: '#D62839',
  property_manager: '#155E75',
  staff: '#0D1B2E',
}

const ROLE_LABELS: Record<string, string> = {
  board_member: 'Board',
  property_manager: 'PM',
  staff: 'Staff',
}

function roleColor(role: string) {
  return ROLE_COLORS[role] || '#6B7280'
}

function roleLabel(role: string) {
  return ROLE_LABELS[role] || role
}

function initials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

// ─── Props ──────────────────────────────────────────────────────
interface Props {
  channels: TeamChannel[]
  tenantId: string
  currentUser: {
    tenantUserId: string
    authUserId: string
    name: string
    role: string
  }
}

export function TeamCommunications({ channels, tenantId, currentUser }: Props) {
  const [activeChannelId, setActiveChannelId] = useState(channels[0]?.id || '')
  const [messages, setMessages] = useState<TeamMessage[]>([])
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [attachFile, setAttachFile] = useState<File | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeChannel = channels.find((c) => c.id === activeChannelId)

  // ─── Fetch messages for active channel ──────────────────────
  const fetchMessages = useCallback(async () => {
    if (!activeChannelId) return
    const supabase = createClient()
    const { data } = await (supabase as any)
      .from('team_messages')
      .select('*')
      .eq('channel_id', activeChannelId)
      .order('created_at', { ascending: true })
    if (data) setMessages(data as TeamMessage[])
  }, [activeChannelId])

  // ─── Fetch unread counts across all channels ────────────────
  const fetchUnreadCounts = useCallback(async () => {
    const supabase = createClient()
    const counts: Record<string, number> = {}
    for (const ch of channels) {
      const { data } = await (supabase as any)
        .from('team_messages')
        .select('id, read_by, sender_id')
        .eq('channel_id', ch.id)
        .neq('sender_id', currentUser.tenantUserId)
      const unread = (data || []).filter(
        (m: { read_by: string[] }) => !m.read_by?.includes(currentUser.tenantUserId)
      ).length
      counts[ch.id] = unread
    }
    setUnreadCounts(counts)
  }, [channels, currentUser.tenantUserId])

  // ─── Mark channel as read ───────────────────────────────────
  const markAsRead = useCallback(async () => {
    if (!activeChannelId) return
    const supabase = createClient()
    await (supabase as any).rpc('mark_channel_messages_read', {
      p_channel_id: activeChannelId,
      p_user_id: currentUser.tenantUserId,
    })
    setUnreadCounts((prev) => ({ ...prev, [activeChannelId]: 0 }))
  }, [activeChannelId, currentUser.tenantUserId])

  // ─── On channel change: fetch messages + mark read ──────────
  useEffect(() => {
    fetchMessages()
    markAsRead()
  }, [activeChannelId, fetchMessages, markAsRead])

  // ─── Fetch unread counts on mount ───────────────────────────
  useEffect(() => {
    fetchUnreadCounts()
  }, [fetchUnreadCounts])

  // ─── Realtime subscription ──────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`team-messages-${activeChannelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'team_messages',
          filter: `channel_id=eq.${activeChannelId}`,
        },
        (payload) => {
          const msg = payload.new as TeamMessage
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev
            return [...prev, msg]
          })
          // If the message is from someone else, mark it as read since channel is active
          if (msg.sender_id !== currentUser.tenantUserId) {
            markAsRead()
          }
          // Refresh unread counts for other channels
          fetchUnreadCounts()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeChannelId, currentUser.tenantUserId, markAsRead, fetchUnreadCounts])

  // ─── Auto-scroll on new messages ────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ─── Send message ───────────────────────────────────────────
  const handleSend = async () => {
    const body = draft.trim()
    if (!body && !attachFile) return
    setSending(true)

    const supabase = createClient()
    let attachmentUrl: string | null = null
    let attachmentName: string | null = null

    // Upload attachment if present
    if (attachFile) {
      const ext = attachFile.name.split('.').pop() || 'bin'
      const path = `${tenantId}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage
        .from('team-attachments')
        .upload(path, attachFile)
      if (!error) {
        const { data: urlData } = supabase.storage
          .from('team-attachments')
          .getPublicUrl(path)
        attachmentUrl = urlData.publicUrl
        attachmentName = attachFile.name
      }
    }

    await (supabase as any).from('team_messages').insert({
      tenant_id: tenantId,
      channel_id: activeChannelId,
      sender_id: currentUser.tenantUserId,
      sender_name: currentUser.name,
      sender_role: currentUser.role,
      body: body || (attachmentName ? `Shared file: ${attachmentName}` : ''),
      attachment_url: attachmentUrl,
      attachment_name: attachmentName,
      read_by: [currentUser.tenantUserId],
    })

    setDraft('')
    setAttachFile(null)
    setSending(false)
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div className="flex border border-[#e6e8eb] rounded-[10px] bg-white overflow-hidden" style={{ height: 'calc(100vh - 240px)', minHeight: 480 }}>
      {/* Left Rail */}
      <div className="w-[240px] flex-shrink-0 border-r border-[#e6e8eb] flex flex-col bg-white">
        <div className="px-4 py-3 border-b border-[#e6e8eb]">
          <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-[#929da8]">Channels</span>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {channels.map((ch) => {
            const isActive = ch.id === activeChannelId
            const unread = unreadCounts[ch.id] || 0
            return (
              <button
                key={ch.id}
                onClick={() => setActiveChannelId(ch.id)}
                className={cn(
                  'w-full text-left px-4 py-2 text-sm flex items-center justify-between transition-colors',
                  isActive
                    ? 'bg-gray-100 text-[#1a1f25] font-semibold'
                    : 'text-[#45505a] hover:bg-gray-50'
                )}
              >
                <span className="truncate">{ch.name}</span>
                {unread > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[0.65rem] font-bold bg-[#D62839] text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {/* Direct Messages stub */}
        <div className="border-t border-[#e6e8eb] px-4 py-3">
          <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-[#929da8]">Direct Messages</span>
          <p className="text-[0.72rem] text-[#929da8] mt-1">Coming soon</p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Channel Header */}
        {activeChannel && (
          <div className="px-5 py-3 border-b border-[#e6e8eb] flex items-center gap-3">
            <h2 className="text-sm font-semibold text-[#1a1f25]">{activeChannel.name}</h2>
            {activeChannel.description && (
              <span className="text-xs text-[#929da8]">{activeChannel.description}</span>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-[#929da8]">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-sm text-[#929da8]">No messages yet. Start the conversation.</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.sender_id === currentUser.tenantUserId
              return (
                <div
                  key={msg.id}
                  className={cn('flex gap-2.5', isMe ? 'flex-row-reverse' : 'flex-row')}
                >
                  {/* Avatar */}
                  {!isMe && (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[0.65rem] font-bold flex-shrink-0"
                      style={{ backgroundColor: roleColor(msg.sender_role) }}
                    >
                      {initials(msg.sender_name)}
                    </div>
                  )}

                  {/* Message bubble */}
                  <div className={cn('max-w-[70%] min-w-[120px]', isMe ? 'items-end' : 'items-start')}>
                    {!isMe && (
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-[#1a1f25]">{msg.sender_name}</span>
                        <span
                          className="text-[0.6rem] font-semibold px-1.5 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: roleColor(msg.sender_role) }}
                        >
                          {roleLabel(msg.sender_role)}
                        </span>
                        <span className="text-[0.65rem] text-[#929da8]">{timeAgo(msg.created_at)}</span>
                      </div>
                    )}
                    <div
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm leading-relaxed',
                        isMe ? 'bg-[#ecfeff] text-[#1a1f25]' : 'bg-gray-100 text-[#1a1f25]'
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                      {msg.attachment_url && (
                        <a
                          href={msg.attachment_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-1.5 text-xs text-[#155E75] hover:underline"
                        >
                          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          {msg.attachment_name || 'Attachment'}
                        </a>
                      )}
                    </div>
                    {isMe && (
                      <div className="flex justify-end mt-0.5">
                        <span className="text-[0.65rem] text-[#929da8]">{timeAgo(msg.created_at)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        <div className="px-5 py-3 border-t border-[#e6e8eb]">
          {attachFile && (
            <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-gray-50 rounded text-xs text-[#45505a]">
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              <span className="truncate">{attachFile.name}</span>
              <button onClick={() => setAttachFile(null)} className="ml-auto text-[#929da8] hover:text-[#45505a]">
                &times;
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-[#929da8] hover:text-[#45505a] transition-colors rounded hover:bg-gray-50"
              title="Attach file"
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) setAttachFile(file)
                e.target.value = ''
              }}
            />
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
              rows={1}
              className="flex-1 resize-none rounded-lg border border-[#e6e8eb] px-3 py-2 text-sm text-[#1a1f25] placeholder:text-[#929da8] focus:outline-none focus:ring-1 focus:ring-[#155E75] focus:border-[#155E75]"
              style={{ maxHeight: 120 }}
            />
            <button
              onClick={handleSend}
              disabled={sending || (!draft.trim() && !attachFile)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                sending || (!draft.trim() && !attachFile)
                  ? 'bg-gray-100 text-[#929da8] cursor-not-allowed'
                  : 'bg-[#155E75] text-white hover:bg-[#134e60]'
              )}
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
