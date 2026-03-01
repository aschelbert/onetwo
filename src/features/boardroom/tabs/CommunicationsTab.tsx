import { useState, useMemo } from 'react';
import { useComplianceStore } from '@/store/useComplianceStore';
import type { Announcement, OwnerCommunication } from '@/store/useComplianceStore';
import { useLetterStore } from '@/store/useLetterStore';
import type { LetterTemplate, GeneratedLetter } from '@/store/useLetterStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useCommunicationsStore } from '@/store/useCommunicationsStore';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import ComposePanel from '../components/ComposePanel';
import type { ComposePanelContext } from '@/types/communication';
import type { Communication } from '@/types/communication';

// ─── Constants ────────────────────────────────────────

type Category = LetterTemplate['category'];
type SubView = 'feed' | 'templates';
type ModalType = null | 'newComm' | 'templateEditor';
type ScopeFilter = 'all' | 'community' | 'unit';
type ChannelFilter = 'all' | 'announcement' | 'email' | 'mail';

const CATEGORY_LABELS: Record<Category, string> = { violation: 'Violation', collection: 'Collection', notice: 'Notice', welcome: 'Welcome', maintenance: 'Maintenance', general: 'General' };
const CATEGORY_COLORS: Record<Category, { bg: string; text: string; border: string }> = {
  violation:   { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200' },
  collection:  { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' },
  notice:      { bg: 'bg-accent-100', text: 'text-accent-700', border: 'border-accent-200' },
  welcome:     { bg: 'bg-sage-100',   text: 'text-sage-700',   border: 'border-sage-200' },
  maintenance: { bg: 'bg-mist-100',   text: 'text-ink-600',    border: 'border-mist-200' },
  general:     { bg: 'bg-ink-100',    text: 'text-ink-600',    border: 'border-ink-200' },
};
const CATEGORY_ORDER: Category[] = ['violation', 'collection', 'notice', 'welcome', 'maintenance', 'general'];

// Icons for communication log entries
const SCOPE_ICON: Record<string, string> = { community: '🏢', unit: '🏠' };
const CHANNEL_ICON: Record<string, string> = { announcement: '📌', email: '📧', mail: '📮' };

// ─── Helpers ──────────────────────────────────────────

function highlightVariables(text: string) {
  const parts = text.split(/(\{\{\w+\}\})/g);
  return parts.map((part, i) => {
    if (/^\{\{\w+\}\}$/.test(part)) {
      return <span key={i} className="px-1 py-0.5 bg-accent-100 text-accent-700 rounded text-xs font-mono font-semibold">{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getEmailStatusLabel(comm: Communication): string {
  if (!comm.channels.includes('email')) return '';
  if (comm.scope === 'community') {
    const delivered = comm.emailDeliveredCount || 0;
    const bounced = comm.emailBouncedCount || 0;
    return `${delivered} delivered${bounced > 0 ? `, ${bounced} bounced` : ''}`;
  }
  return comm.emailStatus === 'delivered' ? 'Delivered' :
    comm.emailStatus === 'sent' ? 'Sending...' :
    comm.emailStatus === 'bounced' ? 'Bounced' :
    comm.emailStatus || '';
}

function getMailStatusLabel(comm: Communication): string {
  if (!comm.channels.includes('mail')) return '';
  const method = comm.mailDeliveryMethod === 'certified-electronic-return-receipt' ? 'Certified + ERR'
    : comm.mailDeliveryMethod === 'certified' ? 'Certified'
    : 'First Class';
  return `${comm.mailStatus || 'Pending'} (${method})`;
}

// ─── Component ────────────────────────────────────────

export default function CommunicationsTab() {
  const comp = useComplianceStore();
  const { templates, letters, addTemplate, updateTemplate, deleteTemplate, updateLetter, deleteLetter } = useLetterStore();
  const { currentUser, currentRole, buildingMembers } = useAuthStore();
  const { units } = useFinancialStore();
  const { board } = useBuildingStore();
  const communications = useCommunicationsStore(s => s.communications);

  // ─── View state ─────────────────────────────────────
  const [subView, setSubView] = useState<SubView>('feed');
  const [modal, setModal] = useState<ModalType>(null);

  // Compose panel
  const [showCompose, setShowCompose] = useState(false);
  const [composeContext, setComposeContext] = useState<ComposePanelContext | null>(null);

  // Communications log filters
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');

  // ─── Template Editor state ──────────────────────────
  const emptyTemplate = { name: '', category: 'general' as Category, subject: '', body: '', variables: [] as Array<{ name: string; label: string; defaultValue: string }> };
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState(emptyTemplate);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  // ─── Announcement form state (for legacy quick-post) ─
  const [annForm, setAnnForm] = useState({ title: '', body: '', category: 'general', pinned: false, sendEmail: false });
  const [sendingEmail, setSendingEmail] = useState(false);
  const [newCommStep, setNewCommStep] = useState<'choose' | 'announcement' | 'communication'>('choose');

  // ─── Communication log form state ───────────────────
  const [commForm, setCommForm] = useState({ type: 'notice', subject: '', date: new Date().toISOString().split('T')[0], method: 'email', recipients: 'All owners (50 units)', status: 'sent', notes: '' });

  // ─── Derived ────────────────────────────────────────

  const filteredComms = useMemo(() => {
    let result = communications;
    if (scopeFilter !== 'all') result = result.filter(c => c.scope === scopeFilter);
    if (channelFilter !== 'all') result = result.filter(c => c.channels.includes(channelFilter));
    return result;
  }, [communications, scopeFilter, channelFilter]);

  const templatesByCategory = useMemo(() => {
    const grouped: Record<string, LetterTemplate[]> = {};
    for (const cat of CATEGORY_ORDER) {
      const items = templates.filter(t => t.category === cat);
      if (items.length > 0) grouped[cat] = items;
    }
    return grouped;
  }, [templates]);

  const letterCounts = useMemo(() => ({
    all: letters.length,
    draft: letters.filter(l => l.status === 'draft').length,
    sent: letters.filter(l => l.status === 'sent').length,
  }), [letters]);

  // ─── Actions ────────────────────────────────────────

  function openCompose(ctx?: ComposePanelContext | null) {
    setComposeContext(ctx || null);
    setShowCompose(true);
  }

  function openTemplateEditor(template?: LetterTemplate) {
    if (template) {
      setEditingTemplateId(template.id);
      setTemplateForm({ name: template.name, category: template.category, subject: template.subject, body: template.body, variables: template.variables.map(v => ({ ...v })) });
    } else {
      setEditingTemplateId(null);
      setTemplateForm({ ...emptyTemplate, variables: [] });
    }
    setModal('templateEditor');
  }

  function saveTemplate() {
    if (!templateForm.name.trim()) return;
    if (editingTemplateId) {
      updateTemplate(editingTemplateId, templateForm);
    } else {
      addTemplate(templateForm);
    }
    setModal(null);
  }

  function openNewComm() {
    setNewCommStep('choose');
    setModal('newComm');
  }

  async function saveAnnouncement() {
    if (!annForm.title || !annForm.body) { alert('Title and body required'); return; }
    const boardMember = board.find(b => b.name === currentUser.name);
    const roleName = boardMember?.role || currentRole.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
    comp.addAnnouncement({
      title: annForm.title, body: annForm.body,
      category: (annForm.category || 'general') as Announcement['category'],
      postedBy: roleName, postedDate: new Date().toISOString().split('T')[0], pinned: annForm.pinned,
    });
    if (annForm.sendEmail) {
      setSendingEmail(true);
      try {
        const sbUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const sbKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
        const session = supabase ? (await supabase.auth.getSession()).data.session : null;
        const recipients = buildingMembers.filter(m => m.email && m.status === 'active').map(m => ({ email: m.email, name: m.name }));
        if (!sbUrl || !sbKey) {
          alert('Announcement posted! Email not sent — Supabase not configured.');
        } else {
          const res = await fetch(`${sbUrl}/functions/v1/send-announcement`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': session ? `Bearer ${session.access_token}` : `Bearer ${sbKey}`, 'apikey': sbKey },
            body: JSON.stringify({ title: annForm.title, announcementBody: annForm.body, category: annForm.category || 'general', postedBy: roleName, recipients }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.sent > 0) alert(`Announcement posted and emailed to ${data.sent} recipient${data.sent !== 1 ? 's' : ''}.`);
            else alert('Announcement posted! Email sending is not configured yet — deploy the send-announcement Edge Function.');
          } else {
            const errText = await res.text();
            if (res.status === 404) alert('Announcement posted! To enable email, deploy the Edge Function:\nsupabase functions deploy send-announcement --no-verify-jwt');
            else alert(`Announcement posted but email failed: ${errText.slice(0, 100)}`);
          }
        }
      } catch (e) {
        console.error('Announcement email error:', e);
        alert('Announcement posted! Email sending encountered an error.');
      } finally {
        setSendingEmail(false);
      }
    }
    setModal(null);
  }

  function saveCommunication() {
    if (!commForm.subject) { alert('Subject required'); return; }
    comp.addCommunication({ type: commForm.type, subject: commForm.subject, date: commForm.date, method: commForm.method, recipients: commForm.recipients, respondedBy: null, status: commForm.status as OwnerCommunication['status'], notes: commForm.notes });
    setModal(null);
  }

  // ─── Render ─────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-display text-xl font-bold text-ink-900">Communications</h3>
          <p className="text-sm text-ink-500 mt-0.5">{communications.length} communications sent</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-ink-100 rounded-lg p-0.5">
            <button onClick={() => setSubView('feed')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${subView === 'feed' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}>
              Communications
            </button>
            <button onClick={() => setSubView('templates')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${subView === 'templates' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}>
              Templates
            </button>
          </div>
          <button onClick={() => openCompose()} className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600 transition-colors flex items-center gap-1.5">
            + New Communication
          </button>
        </div>
      </div>

      {/* ═══════════════ COMMUNICATIONS LOG ═══════════════ */}
      {subView === 'feed' && (
        <div className="space-y-4">
          {/* Scope / Channel filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {([['all', 'All'], ['community', 'Community'], ['unit', 'Unit']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setScopeFilter(key)} className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors border ${scopeFilter === key ? 'border-red-500 bg-red-50 text-red-600' : 'border-ink-100 bg-white text-ink-500 hover:bg-ink-50'}`}>
                {label}
              </button>
            ))}
            <span className="text-ink-200 mx-1">|</span>
            {([['all', 'All Channels'], ['announcement', 'Announcements'], ['email', 'Email'], ['mail', 'Mail']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setChannelFilter(key)} className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors border ${channelFilter === key ? 'border-red-500 bg-red-50 text-red-600' : 'border-ink-100 bg-white text-ink-500 hover:bg-ink-50'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Communications list */}
          {filteredComms.length === 0 && (
            <p className="text-sm text-ink-400 text-center py-12">No communications found.</p>
          )}
          <div className="space-y-2.5">
            {filteredComms.map(comm => (
              <div key={comm.id} className="p-4 bg-white rounded-xl border border-ink-100 hover:border-ink-200 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Icon */}
                    <div className="w-9 h-9 rounded-[10px] bg-ink-50 flex items-center justify-center text-lg shrink-0">
                      {comm.templateName?.includes('Violation') ? '✉️' :
                       comm.templateName?.includes('Delinquency') || comm.templateName?.includes('Budget') || comm.templateName?.includes('Assessment') ? '💰' :
                       comm.templateName?.includes('Meeting') ? '📅' :
                       comm.scope === 'community' ? '📢' : '✉️'}
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Subject */}
                      <p className="text-sm font-semibold text-ink-900">{comm.subject}</p>
                      {/* Meta */}
                      <p className="text-xs text-ink-400 mt-0.5">
                        To: {comm.scope === 'community' ? 'All Owners (Community)' : `${comm.recipientName || ''} · Unit ${comm.recipientUnit || ''}`}
                        {' · '}{formatDate(comm.createdAt)} · Sent by {comm.createdBy}
                      </p>

                      {/* Delivery channel status badges */}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {comm.channels.includes('announcement') && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-ink-600">
                            <span>{CHANNEL_ICON.announcement}</span>
                            <span className="font-medium">Announcement:</span>
                            <span className="text-ink-400">Published</span>
                          </span>
                        )}
                        {comm.channels.includes('email') && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-ink-600">
                            <span>{CHANNEL_ICON.email}</span>
                            <span className="font-medium">Email:</span>
                            <span className="text-ink-400">{getEmailStatusLabel(comm)}</span>
                          </span>
                        )}
                        {comm.channels.includes('mail') && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-ink-600">
                            <span>{CHANNEL_ICON.mail}</span>
                            <span className="font-medium">Mail:</span>
                            <span className="text-ink-400">{getMailStatusLabel(comm)}</span>
                          </span>
                        )}
                      </div>

                      {/* Case link */}
                      {comm.caseId && (
                        <p className="text-[11px] text-red-600 mt-1.5 flex items-center gap-1">
                          📋 Case {comm.caseId} · Step {(comm.stepIdx ?? 0) + 1}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Scope badge */}
                  <span className="text-[10px] font-semibold text-ink-400 bg-ink-50 px-2 py-0.5 rounded uppercase shrink-0">
                    {comm.scope}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Legacy quick-add actions */}
          <div className="border-t border-ink-100 pt-4 mt-4">
            <p className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-2">Quick Actions</p>
            <div className="flex gap-2">
              <button onClick={openNewComm} className="px-3 py-1.5 bg-ink-50 text-ink-600 border border-ink-100 rounded-lg text-xs font-medium hover:bg-ink-100 transition-colors">
                Log Communication
              </button>
              <button onClick={() => openCompose({ scope: 'community' })} className="px-3 py-1.5 bg-ink-50 text-ink-600 border border-ink-100 rounded-lg text-xs font-medium hover:bg-ink-100 transition-colors">
                Community Announcement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ TEMPLATES VIEW ═══════════════ */}
      {subView === 'templates' && (
        <div className="space-y-5">
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-ink-100 p-4">
              <p className="text-xs text-ink-400 uppercase tracking-wider font-semibold">Total Templates</p>
              <p className="text-2xl font-bold text-ink-900 mt-1">{templates.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-ink-100 p-4">
              <p className="text-xs text-ink-400 uppercase tracking-wider font-semibold">Categories</p>
              <p className="text-2xl font-bold text-ink-900 mt-1">{Object.keys(templatesByCategory).length}</p>
            </div>
            <div className="bg-white rounded-xl border border-ink-100 p-4">
              <p className="text-xs text-ink-400 uppercase tracking-wider font-semibold">Letters Sent</p>
              <p className="text-2xl font-bold text-sage-600 mt-1">{letterCounts.sent}</p>
            </div>
            <div className="bg-white rounded-xl border border-ink-100 p-4">
              <p className="text-xs text-ink-400 uppercase tracking-wider font-semibold">Drafts</p>
              <p className="text-2xl font-bold text-yellow-600 mt-1">{letterCounts.draft}</p>
            </div>
          </div>

          {/* New template button */}
          <div className="flex justify-end">
            <button onClick={() => openTemplateEditor()} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800 transition-colors">+ New Template</button>
          </div>

          {/* Templates grouped by category */}
          {Object.entries(templatesByCategory).map(([category, catTemplates]) => {
            const cat = category as Category;
            const colors = CATEGORY_COLORS[cat];
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${colors.bg} ${colors.text}`}>{CATEGORY_LABELS[cat]}</span>
                  <span className="text-xs text-ink-400">{catTemplates.length} template{catTemplates.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="space-y-2">
                  {catTemplates.map(template => {
                    const isExpanded = expandedTemplate === template.id;
                    return (
                      <div key={template.id} className={`rounded-xl border transition-all ${isExpanded ? `${colors.border} bg-white shadow-sm` : 'border-ink-100 bg-white hover:border-ink-200'}`}>
                        <div className="p-4 cursor-pointer" onClick={() => setExpandedTemplate(isExpanded ? null : template.id)}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-ink-900">{template.name}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${colors.bg} ${colors.text}`}>{CATEGORY_LABELS[cat]}</span>
                              </div>
                              <p className="text-xs text-ink-500 mt-1 truncate">{template.subject}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] text-ink-400 font-mono">{template.variables.length} var{template.variables.length !== 1 ? 's' : ''}</span>
                              <svg className={`w-4 h-4 text-ink-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                            </div>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="border-t border-ink-100 px-4 pb-4 pt-3 space-y-3">
                            <div>
                              <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-1">Subject</p>
                              <p className="text-sm text-ink-700">{highlightVariables(template.subject)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-1">Body</p>
                              <div className="bg-ink-50 rounded-lg p-3 text-sm text-ink-700 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">{highlightVariables(template.body)}</div>
                            </div>
                            {template.variables.length > 0 && (
                              <div>
                                <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-1.5">Variables</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {template.variables.map(v => (
                                    <span key={v.name} className="text-[11px] px-2 py-1 bg-accent-50 text-accent-700 rounded-lg border border-accent-100">
                                      <span className="font-mono font-semibold">{`{{${v.name}}}`}</span>
                                      <span className="text-accent-500 ml-1">{v.label}</span>
                                      {v.defaultValue && <span className="text-ink-400 ml-1">= {v.defaultValue}</span>}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="flex items-center gap-2 pt-1">
                              <button onClick={(e) => { e.stopPropagation(); openCompose({ autoTemplateId: template.id, scope: 'unit' }); }} className="px-3 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-medium hover:bg-ink-800 transition-colors">Use Template</button>
                              <button onClick={(e) => { e.stopPropagation(); openTemplateEditor(template); }} className="px-3 py-1.5 text-accent-600 hover:text-accent-700 text-xs font-medium">Edit</button>
                              <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete template "${template.name}"?`)) { deleteTemplate(template.id); setExpandedTemplate(null); } }} className="px-3 py-1.5 text-red-400 hover:text-red-600 text-xs font-medium">Delete</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {templates.length === 0 && (
            <div className="text-center py-12 text-ink-400">
              <p className="text-lg font-medium">No templates yet</p>
              <p className="text-sm mt-1">Create your first letter template to get started.</p>
              <button onClick={() => openTemplateEditor()} className="mt-4 px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800 transition-colors">+ New Template</button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ COMPOSE PANEL ═══════════════ */}
      {showCompose && (
        <ComposePanel
          context={composeContext}
          onClose={() => { setShowCompose(false); setComposeContext(null); }}
        />
      )}

      {/* ═══════════════ LEGACY NEW COMM MODAL (Log Communication / Quick Announcement) ═══════════════ */}
      {modal === 'newComm' && (
        <Modal title="Log Communication" onClose={() => setModal(null)} onSave={() => {
          if (newCommStep === 'announcement') { saveAnnouncement(); return; }
          if (newCommStep === 'communication') { saveCommunication(); return; }
          setModal(null);
        }} saveLabel={
          newCommStep === 'choose' ? undefined :
          newCommStep === 'announcement' ? (sendingEmail ? 'Sending...' : annForm.sendEmail ? 'Post & Send Email' : 'Post to Community') :
          newCommStep === 'communication' ? 'Log Communication' : 'Done'
        } wide={newCommStep !== 'choose'}>
          {newCommStep === 'choose' && (
            <div className="space-y-4">
              <p className="text-sm text-ink-500">What type of communication would you like to log?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={() => { setAnnForm({ title: '', body: '', category: 'general', pinned: false, sendEmail: false }); setNewCommStep('announcement'); }} className="p-5 bg-accent-50 border border-accent-200 rounded-xl text-center hover:border-accent-400 hover:bg-accent-100 transition-colors">
                  <span className="text-2xl">📢</span>
                  <p className="text-sm font-semibold text-ink-900 mt-2">Quick Announcement</p>
                  <p className="text-xs text-ink-400 mt-1">Post directly to Community Room</p>
                </button>
                <button onClick={() => { setCommForm({ type: 'notice', subject: '', date: new Date().toISOString().split('T')[0], method: 'email', recipients: 'All owners (50 units)', status: 'sent', notes: '' }); setNewCommStep('communication'); }} className="p-5 bg-mist-50 border border-mist-200 rounded-xl text-center hover:border-accent-400 hover:bg-mist-100 transition-colors">
                  <span className="text-2xl">📋</span>
                  <p className="text-sm font-semibold text-ink-900 mt-2">Log Communication</p>
                  <p className="text-xs text-ink-400 mt-1">Record a call, notice, or other communication</p>
                </button>
              </div>
            </div>
          )}

          {newCommStep === 'announcement' && (
            <div className="space-y-3">
              <button onClick={() => setNewCommStep('choose')} className="text-xs text-accent-600 hover:text-accent-700 font-medium mb-1">&larr; Back</button>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Title *</label><input value={annForm.title} onChange={e => setAnnForm(p => ({ ...p, title: e.target.value }))} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Elevator Modernization Project Update" /></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Category</label><select value={annForm.category} onChange={e => setAnnForm(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                <option value="general">General</option><option value="maintenance">Maintenance</option><option value="financial">Financial</option><option value="safety">Safety</option><option value="rules">Rules & Policies</option><option value="meeting">Meeting</option>
              </select></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Message *</label><textarea value={annForm.body} onChange={e => setAnnForm(p => ({ ...p, body: e.target.value }))} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={5} placeholder="Write the announcement body." /></div>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={annForm.pinned} onChange={e => setAnnForm(p => ({ ...p, pinned: e.target.checked }))} className="h-4 w-4 accent-accent-600 rounded" /><span className="text-sm text-ink-700">Pin this announcement</span></label>
              <div className="border-t border-ink-100 pt-3 mt-1">
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={annForm.sendEmail} onChange={e => setAnnForm(p => ({ ...p, sendEmail: e.target.checked }))} className="h-4 w-4 accent-accent-600 rounded" /><span className="text-sm text-ink-700">Also send via email</span><span className="text-[10px] text-ink-400">(to all building members)</span></label>
                {annForm.sendEmail && <p className="text-[11px] text-ink-400 mt-1.5 ml-6">Will be emailed to {buildingMembers.filter(m => m.email && m.status === 'active').length} active members.</p>}
              </div>
            </div>
          )}

          {newCommStep === 'communication' && (
            <div className="space-y-3">
              <button onClick={() => setNewCommStep('choose')} className="text-xs text-accent-600 hover:text-accent-700 font-medium mb-1">&larr; Back</button>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Type</label><select value={commForm.type} onChange={e => setCommForm(p => ({ ...p, type: e.target.value }))} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{['notice','minutes','financial','response','resale','violation','other'].map(t => <option key={t}>{t}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Subject *</label><input value={commForm.subject} onChange={e => setCommForm(p => ({ ...p, subject: e.target.value }))} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-ink-700 mb-1">Date</label><input type="date" value={commForm.date} onChange={e => setCommForm(p => ({ ...p, date: e.target.value }))} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-medium text-ink-700 mb-1">Method</label><select value={commForm.method} onChange={e => setCommForm(p => ({ ...p, method: e.target.value }))} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{['email','mail','mail+email','email+portal','certified mail','posted'].map(m => <option key={m}>{m}</option>)}</select></div>
              </div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Recipients</label><input value={commForm.recipients} onChange={e => setCommForm(p => ({ ...p, recipients: e.target.value }))} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Status</label><select value={commForm.status} onChange={e => setCommForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{['sent','pending','draft'].map(s => <option key={s}>{s}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Notes</label><textarea value={commForm.notes} onChange={e => setCommForm(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={2} /></div>
            </div>
          )}
        </Modal>
      )}

      {/* ═══════════════ TEMPLATE EDITOR MODAL ═══════════════ */}
      {modal === 'templateEditor' && (
        <Modal title={editingTemplateId ? 'Edit Template' : 'New Template'} onClose={() => setModal(null)} onSave={saveTemplate} saveLabel={editingTemplateId ? 'Save Changes' : 'Create Template'} wide>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Form fields */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">Template Name *</label>
                <input type="text" value={templateForm.name} onChange={e => setTemplateForm(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g. Late Payment Notice" className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">Category</label>
                <select value={templateForm.category} onChange={e => setTemplateForm(prev => ({ ...prev, category: e.target.value as Category }))} className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent">
                  {CATEGORY_ORDER.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">Subject</label>
                <input type="text" value={templateForm.subject} onChange={e => setTemplateForm(prev => ({ ...prev, subject: e.target.value }))} placeholder='e.g. Past Due Notice -- Unit {{unit_number}}' className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent" />
                <p className="text-[10px] text-ink-400 mt-1">{`Use {{variable_name}} to insert variables`}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">Body</label>
                <textarea value={templateForm.body} onChange={e => setTemplateForm(prev => ({ ...prev, body: e.target.value }))} rows={10} placeholder={'Dear {{owner_name}},\n\nYour letter content here...\n\nSincerely,\n{{sender_name}}'} className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent resize-y font-mono" />
                <p className="text-[10px] text-ink-400 mt-1">{`Use {{variable_name}} to insert dynamic values`}</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-ink-700">Variables</p>
                  <button onClick={() => setTemplateForm(prev => ({ ...prev, variables: [...prev.variables, { name: '', label: '', defaultValue: '' }] }))} className="text-[11px] text-accent-600 hover:text-accent-700 font-medium">+ Add Variable</button>
                </div>
                {templateForm.variables.length === 0 && <p className="text-xs text-ink-400 italic">No variables defined. Add variables to make this template dynamic.</p>}
                <div className="space-y-2">
                  {templateForm.variables.map((v, i) => (
                    <div key={i} className="flex items-start gap-2 bg-ink-50 rounded-lg p-2.5">
                      <div className="flex-1 grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] text-ink-400 mb-0.5">Name</label>
                          <input type="text" value={v.name} onChange={e => { const vars = [...templateForm.variables]; vars[i] = { ...vars[i], name: e.target.value.replace(/\s/g, '_').toLowerCase() }; setTemplateForm(prev => ({ ...prev, variables: vars })); }} placeholder="var_name" className="w-full border border-ink-200 rounded px-2 py-1 text-xs text-ink-700 font-mono focus:outline-none focus:ring-1 focus:ring-accent-400" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-ink-400 mb-0.5">Label</label>
                          <input type="text" value={v.label} onChange={e => { const vars = [...templateForm.variables]; vars[i] = { ...vars[i], label: e.target.value }; setTemplateForm(prev => ({ ...prev, variables: vars })); }} placeholder="Display Label" className="w-full border border-ink-200 rounded px-2 py-1 text-xs text-ink-700 focus:outline-none focus:ring-1 focus:ring-accent-400" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-ink-400 mb-0.5">Default</label>
                          <input type="text" value={v.defaultValue} onChange={e => { const vars = [...templateForm.variables]; vars[i] = { ...vars[i], defaultValue: e.target.value }; setTemplateForm(prev => ({ ...prev, variables: vars })); }} placeholder="Optional" className="w-full border border-ink-200 rounded px-2 py-1 text-xs text-ink-700 focus:outline-none focus:ring-1 focus:ring-accent-400" />
                        </div>
                      </div>
                      <button onClick={() => { const vars = templateForm.variables.filter((_, idx) => idx !== i); setTemplateForm(prev => ({ ...prev, variables: vars })); }} className="mt-3.5 p-1 text-red-400 hover:text-red-600 shrink-0" title="Remove variable">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Right: Preview */}
            <div className="space-y-3">
              <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold">Preview</p>
              {templateForm.subject || templateForm.body ? (
                <div className="bg-ink-50 rounded-xl border border-ink-100 overflow-hidden">
                  {templateForm.subject && <div className="bg-white border-b border-ink-100 px-4 py-3"><p className="text-sm font-bold text-ink-900">{highlightVariables(templateForm.subject)}</p></div>}
                  {templateForm.body && <div className="px-4 py-3 text-sm text-ink-700 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">{highlightVariables(templateForm.body)}</div>}
                </div>
              ) : (
                <div className="bg-ink-50 rounded-xl border border-ink-100 p-8 text-center text-sm text-ink-400">Start typing to see a preview of your template</div>
              )}
              {templateForm.variables.filter(v => v.name).length > 0 && (
                <div>
                  <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-1.5">Defined Variables</p>
                  <div className="flex flex-wrap gap-1.5">
                    {templateForm.variables.filter(v => v.name).map((v, i) => (
                      <span key={i} className="text-[11px] px-2 py-1 bg-accent-50 text-accent-700 rounded-lg border border-accent-100 font-mono">{`{{${v.name}}}`}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
