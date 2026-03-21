import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, getActiveTenantId, logDbError } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';

// ─── Types ──────────────────────────────────────────────────────
interface TeamChannel {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  description: string;
  channel_type: 'group' | 'direct';
  restricted_to_role: string | null;
  created_at: string;
}

interface TeamMessage {
  id: string;
  tenant_id: string;
  channel_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  body: string;
  attachment_url: string | null;
  attachment_name: string | null;
  read_by: string[];
  created_at: string;
}

// ─── Role config ────────────────────────────────────────────────
const ROLE_COLORS: Record<string, string> = {
  board_member: '#D62839',
  property_manager: '#155E75',
  staff: '#0D1B2E',
  BOARD_MEMBER: '#D62839',
  PROPERTY_MANAGER: '#155E75',
  STAFF: '#0D1B2E',
};

const ROLE_LABELS: Record<string, string> = {
  board_member: 'Board',
  property_manager: 'PM',
  staff: 'Staff',
  BOARD_MEMBER: 'Board',
  PROPERTY_MANAGER: 'PM',
  STAFF: 'Staff',
};

function roleColor(role: string) { return ROLE_COLORS[role] || '#6B7280'; }
function roleLabel(role: string) { return ROLE_LABELS[role] || role; }

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ─── Default channels to seed ───────────────────────────────────
const DEFAULT_CHANNELS = [
  { slug: 'general', name: '# General', channel_type: 'group', restricted_to_role: null, description: 'General team discussion' },
  { slug: 'maintenance', name: '# Maintenance', channel_type: 'group', restricted_to_role: null, description: 'Maintenance coordination and updates' },
  { slug: 'board-only', name: '🔒 Board Only', channel_type: 'group', restricted_to_role: 'board_member', description: 'Private board member discussions' },
];

const MAX_CHANNELS = 50;

// ─── Component ──────────────────────────────────────────────────
export default function CommunicationsTab() {
  const tenantId = getActiveTenantId();
  const { currentUser, currentRole } = useAuthStore();

  const [channels, setChannels] = useState<TeamChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState('');
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [tenantUserId, setTenantUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');
  const [newChannelRestricted, setNewChannelRestricted] = useState(false);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeChannel = channels.find(c => c.id === activeChannelId);
  const dbRole = currentRole?.toLowerCase().replace(/\s+/g, '_') || '';

  // ─── Resolve tenant_users.id ──────────────────────────────────
  useEffect(() => {
    if (!supabase || !tenantId) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: tu } = await supabase
        .from('tenant_users')
        .select('id, role')
        .eq('tenant_id', tenantId)
        .eq('user_id', user.id)
        .single();

      if (tu) {
        setTenantUserId(tu.id);
        if (tu.role === 'resident') setAccessDenied(true);
      }
    })();
  }, [tenantId]);

  // ─── Load channels (seed defaults if none) ───────────────────
  const loadChannels = useCallback(async () => {
    if (!supabase || !tenantId) return;

    // Check if channels exist
    let { data: chs } = await supabase
      .from('team_channels')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });

    // Seed defaults if empty
    if (!chs || chs.length === 0) {
      for (const ch of DEFAULT_CHANNELS) {
        await supabase.from('team_channels').insert({
          tenant_id: tenantId,
          slug: ch.slug,
          name: ch.name,
          channel_type: ch.channel_type,
          restricted_to_role: ch.restricted_to_role,
          description: ch.description,
        });
      }
      const result = await supabase
        .from('team_channels')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true });
      chs = result.data;
    }

    if (chs) {
      setChannels(chs as unknown as TeamChannel[]);
      if (!activeChannelId && chs.length > 0) setActiveChannelId(chs[0].id);
    }
    setLoading(false);
  }, [tenantId, activeChannelId]);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  // ─── Fetch messages for active channel ────────────────────────
  const fetchMessages = useCallback(async () => {
    if (!supabase || !activeChannelId) return;
    const { data, error } = await supabase
      .from('team_messages')
      .select('*')
      .eq('channel_id', activeChannelId)
      .order('created_at', { ascending: true });
    if (error) logDbError('team_messages select', error);
    if (data) setMessages(data as unknown as TeamMessage[]);
  }, [activeChannelId]);

  // ─── Fetch unread counts ──────────────────────────────────────
  const fetchUnreadCounts = useCallback(async () => {
    if (!supabase || !tenantUserId || channels.length === 0) return;
    const counts: Record<string, number> = {};
    for (const ch of channels) {
      const { data } = await supabase
        .from('team_messages')
        .select('id, read_by, sender_id')
        .eq('channel_id', ch.id)
        .neq('sender_id', tenantUserId);
      const unread = (data || []).filter(
        (m: any) => !m.read_by?.includes(tenantUserId)
      ).length;
      counts[ch.id] = unread;
    }
    setUnreadCounts(counts);
  }, [channels, tenantUserId]);

  // ─── Mark channel as read ─────────────────────────────────────
  const markAsRead = useCallback(async () => {
    if (!supabase || !activeChannelId || !tenantUserId) return;
    await supabase.rpc('mark_channel_messages_read', {
      p_channel_id: activeChannelId,
      p_user_id: tenantUserId,
    });
    setUnreadCounts(prev => ({ ...prev, [activeChannelId]: 0 }));
  }, [activeChannelId, tenantUserId]);

  // ─── On channel change ────────────────────────────────────────
  useEffect(() => {
    fetchMessages();
    markAsRead();
  }, [activeChannelId, fetchMessages, markAsRead]);

  useEffect(() => { fetchUnreadCounts(); }, [fetchUnreadCounts]);

  // ─── Realtime ─────────────────────────────────────────────────
  useEffect(() => {
    if (!supabase || !activeChannelId) return;
    const channel = supabase
      .channel(`team-msgs-${activeChannelId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'team_messages',
        filter: `channel_id=eq.${activeChannelId}`,
      }, (payload) => {
        const msg = payload.new as TeamMessage;
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        if (msg.sender_id !== tenantUserId) markAsRead();
        fetchUnreadCounts();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeChannelId, tenantUserId, markAsRead, fetchUnreadCounts]);

  // ─── Auto-scroll ──────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Send message ─────────────────────────────────────────────
  const handleSend = async () => {
    const body = draft.trim();
    if ((!body && !attachFile) || !supabase || !tenantId || !tenantUserId) return;
    setSending(true);

    let attachmentUrl: string | null = null;
    let attachmentName: string | null = null;

    if (attachFile) {
      const ext = attachFile.name.split('.').pop() || 'bin';
      const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from('team-attachments')
        .upload(path, attachFile);
      if (!error) {
        const { data: urlData } = supabase.storage
          .from('team-attachments')
          .getPublicUrl(path);
        attachmentUrl = urlData.publicUrl;
        attachmentName = attachFile.name;
      }
    }

    await supabase.from('team_messages').insert({
      tenant_id: tenantId,
      channel_id: activeChannelId,
      sender_id: tenantUserId,
      sender_name: currentUser.name,
      sender_role: dbRole,
      body: body || `Shared file: ${attachmentName}`,
      attachment_url: attachmentUrl,
      attachment_name: attachmentName,
      read_by: [tenantUserId],
    });

    setDraft('');
    setAttachFile(null);
    setSending(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── Create channel ─────────────────────────────────────────
  const handleCreateChannel = async () => {
    const name = newChannelName.trim();
    if (!name || !supabase || !tenantId) return;
    if (channels.length >= MAX_CHANNELS) return;
    setCreatingChannel(true);

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { data, error } = await supabase.from('team_channels').insert({
      tenant_id: tenantId,
      slug: slug || `ch-${Date.now()}`,
      name: `# ${name}`,
      description: newChannelDesc.trim(),
      channel_type: 'group',
      restricted_to_role: newChannelRestricted ? 'board_member' : null,
    }).select().single();

    if (!error && data) {
      setChannels(prev => [...prev, data as unknown as TeamChannel]);
      setActiveChannelId(data.id);
    }

    setNewChannelName('');
    setNewChannelDesc('');
    setNewChannelRestricted(false);
    setShowNewChannel(false);
    setCreatingChannel(false);
  };

  // ─── Access denied state ──────────────────────────────────────
  if (accessDenied) {
    return (
      <div className="flex items-center justify-center h-64 text-center">
        <div>
          <div className="text-3xl mb-2">🔒</div>
          <p className="text-sm text-ink-500">Team communications are available to board members, property managers, and staff only.</p>
        </div>
      </div>
    );
  }

  // ─── Loading ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-ink-400">Loading channels...</p>
      </div>
    );
  }

  // ─── Main layout ──────────────────────────────────────────────
  return (
    <div className="flex border border-ink-100 rounded-lg overflow-hidden" style={{ height: 'calc(100vh - 360px)', minHeight: 420 }}>
      {/* Left Rail */}
      <div className="w-[240px] flex-shrink-0 border-r border-ink-100 flex flex-col bg-white">
        <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Channels</span>
          {channels.length < MAX_CHANNELS && (
            <button
              onClick={() => setShowNewChannel(true)}
              className="w-5 h-5 flex items-center justify-center rounded text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors text-lg leading-none"
              title="New channel"
            >
              +
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {/* New channel form */}
          {showNewChannel && (
            <div className="px-3 py-2 border-b border-ink-100 space-y-2">
              <input
                autoFocus
                value={newChannelName}
                onChange={e => setNewChannelName(e.target.value)}
                placeholder="Channel name"
                maxLength={40}
                className="w-full text-sm border border-ink-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-600"
                onKeyDown={e => { if (e.key === 'Enter') handleCreateChannel(); if (e.key === 'Escape') setShowNewChannel(false); }}
              />
              <input
                value={newChannelDesc}
                onChange={e => setNewChannelDesc(e.target.value)}
                placeholder="Description (optional)"
                maxLength={100}
                className="w-full text-xs border border-ink-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
              <label className="flex items-center gap-1.5 text-[11px] text-ink-500 cursor-pointer">
                <input type="checkbox" checked={newChannelRestricted} onChange={e => setNewChannelRestricted(e.target.checked)} className="rounded" />
                Board members only
              </label>
              <div className="flex gap-1.5">
                <button
                  onClick={handleCreateChannel}
                  disabled={!newChannelName.trim() || creatingChannel}
                  className="flex-1 text-xs font-medium py-1.5 rounded bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {creatingChannel ? 'Creating...' : 'Create'}
                </button>
                <button
                  onClick={() => { setShowNewChannel(false); setNewChannelName(''); setNewChannelDesc(''); setNewChannelRestricted(false); }}
                  className="text-xs font-medium py-1.5 px-3 rounded text-ink-500 hover:bg-ink-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
              <p className="text-[10px] text-ink-300">{channels.length} / {MAX_CHANNELS} channels</p>
            </div>
          )}
          {channels.map(ch => {
            const isActive = ch.id === activeChannelId;
            const unread = unreadCounts[ch.id] || 0;
            return (
              <button
                key={ch.id}
                onClick={() => setActiveChannelId(ch.id)}
                className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between transition-colors ${
                  isActive
                    ? 'bg-ink-50 text-ink-900 font-semibold'
                    : 'text-ink-500 hover:bg-ink-50/50'
                }`}
              >
                <span className="truncate">{ch.name}</span>
                {unread > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-accent-600 text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="border-t border-ink-100 px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Direct Messages</span>
          <p className="text-[11px] text-ink-300 mt-1">Coming soon</p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Channel header */}
        {activeChannel && (
          <div className="px-5 py-3 border-b border-ink-100 flex items-center gap-3">
            <h3 className="text-sm font-semibold text-ink-900">{activeChannel.name}</h3>
            {activeChannel.description && (
              <span className="text-xs text-ink-400">{activeChannel.description}</span>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-12 h-12 rounded-full bg-ink-50 flex items-center justify-center mb-3">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-ink-300">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-sm text-ink-400">No messages yet. Start the conversation.</p>
            </div>
          ) : (
            messages.map(msg => {
              const isMe = msg.sender_id === tenantUserId;
              return (
                <div key={msg.id} className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  {!isMe && (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                      style={{ backgroundColor: roleColor(msg.sender_role) }}
                    >
                      {initials(msg.sender_name)}
                    </div>
                  )}
                  <div className={`max-w-[70%] min-w-[120px] ${isMe ? 'text-right' : 'text-left'}`}>
                    {!isMe && (
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-ink-900">{msg.sender_name}</span>
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: roleColor(msg.sender_role) }}
                        >
                          {roleLabel(msg.sender_role)}
                        </span>
                        <span className="text-[10px] text-ink-400">{timeAgo(msg.created_at)}</span>
                      </div>
                    )}
                    <div className={`px-3 py-2 rounded-lg text-sm leading-relaxed inline-block text-left ${
                      isMe ? 'bg-cyan-50 text-ink-900' : 'bg-ink-50 text-ink-900'
                    }`}>
                      <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                      {msg.attachment_url && (
                        <a
                          href={msg.attachment_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-1.5 text-xs text-teal-700 hover:underline"
                        >
                          📎 {msg.attachment_name || 'Attachment'}
                        </a>
                      )}
                    </div>
                    {isMe && (
                      <div className="mt-0.5">
                        <span className="text-[10px] text-ink-400">{timeAgo(msg.created_at)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message input */}
        <div className="px-5 py-3 border-t border-ink-100">
          {attachFile && (
            <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-ink-50 rounded text-xs text-ink-500">
              📎 <span className="truncate">{attachFile.name}</span>
              <button onClick={() => setAttachFile(null)} className="ml-auto text-ink-400 hover:text-ink-600">&times;</button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-ink-400 hover:text-ink-600 transition-colors rounded hover:bg-ink-50"
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
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) setAttachFile(file);
                e.target.value = '';
              }}
            />
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
              rows={1}
              className="flex-1 resize-none rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-1 focus:ring-teal-600 focus:border-teal-600"
              style={{ maxHeight: 120 }}
            />
            <button
              onClick={handleSend}
              disabled={sending || (!draft.trim() && !attachFile)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sending || (!draft.trim() && !attachFile)
                  ? 'bg-ink-100 text-ink-400 cursor-not-allowed'
                  : 'bg-teal-700 text-white hover:bg-teal-800'
              }`}
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
