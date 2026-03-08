import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, isBackendEnabled } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import { useTenantContext } from '@/components/TenantProvider';
import { ROLE_LABELS } from '@/types/auth';
import { getInitials } from '@/lib/formatters';
import { Plus, Send, MessageCircle } from 'lucide-react';

interface Thread {
  id: string;
  tenancy_id: string;
  subject: string;
  status: string;
  priority: string;
  module: string;
  assignee_name: string | null;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  thread_id: string;
  sender_type: string;
  sender_name: string;
  sender_role: string | null;
  body: string;
  created_at: string;
}

const PRIORITY_META: Record<string, { color: string; label: string }> = {
  high: { color: '#dc2626', label: 'High' },
  medium: { color: '#d97706', label: 'Medium' },
  low: { color: '#6b7280', label: 'Low' },
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: '#92400e', bg: '#fef3c7' },
  pending: { label: 'Pending', color: '#1d4ed8', bg: '#dbeafe' },
  resolved: { label: 'Resolved', color: '#065f46', bg: '#d1fae5' },
};

const MODULES = ['Board Room', 'Fiscal Lens', 'Compliance', 'Access & Permissions', 'Other'];

function timeAgo(date: string) {
  const now = new Date();
  const then = new Date(date);
  const mins = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function SupportPage() {
  const { currentUser, currentRole } = useAuthStore();
  const tenant = useTenantContext();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newModule, setNewModule] = useState('Board Room');
  const [newPriority, setNewPriority] = useState('medium');
  const [newMessage, setNewMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const thread = threads.find(t => t.id === selectedId);

  // Load threads
  useEffect(() => {
    if (!isBackendEnabled || !supabase || tenant.isDemo) {
      setLoadingThreads(false);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from('support_threads')
        .select('*')
        .eq('tenancy_id', tenant.id)
        .order('updated_at', { ascending: false });

      if (data) {
        setThreads(data as Thread[]);
        if (data.length > 0) setSelectedId(data[0].id);
      }
      setLoadingThreads(false);
    })();
  }, [tenant.id, tenant.isDemo]);

  // Load messages for selected thread
  const fetchMessages = useCallback(async (threadId: string) => {
    if (!supabase) return;
    setLoadingMessages(true);
    const { data } = await supabase
      .from('support_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (data) setMessages(data as Message[]);
    setLoadingMessages(false);
  }, []);

  useEffect(() => {
    if (selectedId) fetchMessages(selectedId);
  }, [selectedId, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Realtime subscription
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel('tenant-support-live')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
      }, (payload) => {
        const msg = payload.new as Message;
        if (msg.thread_id === selectedId) {
          setMessages(prev => [...prev, msg]);
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'support_threads',
      }, (payload) => {
        const updated = payload.new as Thread;
        setThreads(prev => prev.map(t => t.id === updated.id ? updated : t));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedId]);

  const sendReply = async () => {
    if (!replyText.trim() || !selectedId || !supabase) return;
    setSending(true);
    const { data } = await supabase
      .from('support_messages')
      .insert({
        thread_id: selectedId,
        sender_type: 'tenant',
        sender_name: currentUser.name,
        sender_role: ROLE_LABELS[currentRole],
        body: replyText,
      })
      .select()
      .single();

    if (data) {
      setMessages(prev => [...prev, data as Message]);
      setReplyText('');
      // Update thread's updated_at
      await supabase.from('support_threads').update({ updated_at: new Date().toISOString() }).eq('id', selectedId);
    }
    setSending(false);
  };

  const createThread = async () => {
    if (!newSubject.trim() || !newMessage.trim() || !supabase) return;
    setCreating(true);

    const { data: newThread } = await supabase
      .from('support_threads')
      .insert({
        tenancy_id: tenant.id,
        subject: newSubject,
        module: newModule,
        priority: newPriority,
        created_by_name: currentUser.name,
      })
      .select()
      .single();

    if (newThread) {
      // Insert first message
      await supabase.from('support_messages').insert({
        thread_id: newThread.id,
        sender_type: 'tenant',
        sender_name: currentUser.name,
        sender_role: ROLE_LABELS[currentRole],
        body: newMessage,
      });

      setThreads(prev => [newThread as Thread, ...prev]);
      setSelectedId(newThread.id);
      setShowNewForm(false);
      setNewSubject('');
      setNewModule('Board Room');
      setNewPriority('medium');
      setNewMessage('');
    }
    setCreating(false);
  };

  if (tenant.isDemo) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <MessageCircle className="w-12 h-12 text-ink-300 mx-auto mb-4" />
        <h2 className="font-display text-xl font-bold text-ink-900 mb-2">Help & Support</h2>
        <p className="text-ink-500">Support messaging is available for registered buildings. Contact us at <span className="font-medium">support@getonetwo.com</span> for help.</p>
      </div>
    );
  }

  return (
    <div className="-m-6 flex bg-white rounded-xl border border-ink-200 overflow-hidden" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Left — thread list */}
      <div className="w-[300px] flex-shrink-0 border-r border-ink-200 flex flex-col">
        <div className="p-3 border-b border-ink-100 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-ink-900">Support</h2>
          <button
            onClick={() => { setShowNewForm(true); setSelectedId(null); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-ink-700 bg-mist-50 border border-ink-200 rounded-lg hover:bg-mist-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingThreads ? (
            <div className="p-5 text-center text-sm text-ink-400">Loading...</div>
          ) : threads.length === 0 && !showNewForm ? (
            <div className="p-5 text-center text-sm text-ink-400">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 text-ink-300" />
              No support threads yet.
              <br />
              <button onClick={() => setShowNewForm(true)} className="text-accent-600 font-medium mt-2 hover:underline">
                Start a new thread
              </button>
            </div>
          ) : (
            threads.map(t => {
              const isActive = t.id === selectedId;
              const ps = PRIORITY_META[t.priority] || PRIORITY_META.medium;
              const sm = STATUS_META[t.status] || STATUS_META.open;
              return (
                <div
                  key={t.id}
                  onClick={() => { setSelectedId(t.id); setShowNewForm(false); }}
                  className={`px-3.5 py-3 border-b border-ink-100 cursor-pointer transition-colors ${
                    isActive ? 'bg-mist-50' : 'hover:bg-mist-25'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-px rounded"
                      style={{ color: sm.color, background: sm.bg }}
                    >
                      {sm.label}
                    </span>
                    <span className="text-[10px] text-ink-400">{timeAgo(t.updated_at)}</span>
                  </div>
                  <div className="text-[13px] font-medium text-ink-800 mb-1 line-clamp-2">{t.subject}</div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium" style={{ color: ps.color }}>
                      ● {ps.label}
                    </span>
                    <span className="text-[10px] text-ink-400">· {t.module}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right — message view or new form */}
      <div className="flex-1 flex flex-col min-w-0 bg-mist-25">
        {showNewForm ? (
          <div className="flex-1 flex flex-col">
            <div className="bg-white border-b border-ink-200 px-5 py-3">
              <h3 className="text-sm font-bold text-ink-900">New Support Thread</h3>
              <p className="text-xs text-ink-400 mt-0.5">Describe your issue and our team will respond shortly.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="max-w-lg space-y-4">
                <div>
                  <label className="block text-xs font-medium text-ink-600 mb-1">Subject</label>
                  <input
                    value={newSubject}
                    onChange={e => setNewSubject(e.target.value)}
                    placeholder="Describe the issue..."
                    className="w-full bg-white border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-ink-600 mb-1">Module</label>
                    <select
                      value={newModule}
                      onChange={e => setNewModule(e.target.value)}
                      className="w-full bg-white border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-800 outline-none cursor-pointer"
                    >
                      {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-ink-600 mb-1">Priority</label>
                    <select
                      value={newPriority}
                      onChange={e => setNewPriority(e.target.value)}
                      className="w-full bg-white border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-800 outline-none cursor-pointer"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-600 mb-1">Message</label>
                  <textarea
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder="Describe what you need help with..."
                    rows={5}
                    className="w-full bg-white border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-800 resize-none outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={createThread}
                    disabled={!newSubject.trim() || !newMessage.trim() || creating}
                    className="px-4 py-2 text-sm font-medium text-white bg-ink-900 rounded-lg hover:bg-ink-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {creating ? 'Sending...' : 'Submit'}
                  </button>
                  <button
                    onClick={() => setShowNewForm(false)}
                    className="px-4 py-2 text-sm font-medium text-ink-700 bg-white border border-ink-200 rounded-lg hover:bg-mist-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : thread ? (
          <>
            {/* Thread header */}
            <div className="bg-white border-b border-ink-200 px-5 py-3">
              <div className="text-sm font-bold text-ink-900 mb-1">{thread.subject}</div>
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-px rounded"
                  style={{
                    color: (STATUS_META[thread.status] || STATUS_META.open).color,
                    background: (STATUS_META[thread.status] || STATUS_META.open).bg,
                  }}
                >
                  {(STATUS_META[thread.status] || STATUS_META.open).label}
                </span>
                <span className="text-[11px] bg-ink-100 border border-ink-200 rounded px-1.5 py-px text-ink-500">
                  {thread.module}
                </span>
                <span className="text-[11px] font-medium" style={{ color: (PRIORITY_META[thread.priority] || PRIORITY_META.medium).color }}>
                  ● {(PRIORITY_META[thread.priority] || PRIORITY_META.medium).label} priority
                </span>
                {thread.assignee_name && (
                  <>
                    <span className="text-ink-300">|</span>
                    <span className="text-[11px] text-ink-500">Assigned to {thread.assignee_name}</span>
                  </>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-3.5">
              {loadingMessages ? (
                <div className="flex-1 flex items-center justify-center text-ink-400 text-sm">Loading...</div>
              ) : (
                messages.map(msg => {
                  const isTenant = msg.sender_type === 'tenant';
                  return (
                    <div key={msg.id} className={`flex gap-2.5 ${isTenant ? 'flex-row' : 'flex-row-reverse'}`}>
                      <div
                        className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 text-white"
                        style={{ background: isTenant ? '#3d3d3d' : '#2563eb' }}
                      >
                        {getInitials(msg.sender_name)}
                      </div>
                      <div className="max-w-[68%]">
                        <div className={`flex items-baseline gap-1.5 mb-1 ${isTenant ? 'flex-row' : 'flex-row-reverse'}`}>
                          <span className="text-xs font-semibold text-ink-700">{msg.sender_name}</span>
                          {msg.sender_role && isTenant && (
                            <span className="text-[11px] text-ink-400 bg-ink-100 px-1.5 py-px rounded">{msg.sender_role}</span>
                          )}
                          {!isTenant && (
                            <span className="text-[11px] text-blue-600 bg-blue-50 px-1.5 py-px rounded">Support</span>
                          )}
                          <span className="text-[11px] text-ink-300">{timeAgo(msg.created_at)}</span>
                        </div>
                        <div
                          className={`border px-3.5 py-2.5 ${
                            isTenant
                              ? 'bg-white border-ink-200 rounded-xl rounded-tl-sm'
                              : 'bg-blue-50 border-blue-200 rounded-xl rounded-tr-sm'
                          }`}
                        >
                          <p className="text-[13px] text-ink-700 leading-relaxed m-0">{msg.body}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply box */}
            {thread.status !== 'resolved' ? (
              <div className="bg-white border-t border-ink-200 px-5 py-3">
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                  placeholder="Type your reply..."
                  rows={2}
                  className="w-full bg-mist-50 border border-ink-200 rounded-lg px-3 py-2 text-[13px] text-ink-700 resize-none outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={sendReply}
                    disabled={!replyText.trim() || sending}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium text-white bg-ink-900 rounded-lg hover:bg-ink-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {sending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-mist-50 border-t border-ink-200 px-5 py-3 text-center text-sm text-ink-500">
                This thread has been resolved.
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-ink-300 text-sm">
            Select a thread or create a new one
          </div>
        )}
      </div>
    </div>
  );
}
