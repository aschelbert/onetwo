import { useState, useMemo } from 'react';
import { useComplianceStore } from '@/store/useComplianceStore';
import type { Announcement, OwnerCommunication } from '@/store/useComplianceStore';
import { useLetterStore } from '@/store/useLetterStore';
import type { LetterTemplate, GeneratedLetter } from '@/store/useLetterStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import { buildCommunicationsFeed, type CommunicationFeedItem } from './communicationsUtils';

// ─── Constants ────────────────────────────────────────

type Category = LetterTemplate['category'];
type SubView = 'feed' | 'templates';
type ModalType = null | 'newComm' | 'addAnnouncement' | 'addComm' | 'compose' | 'templateEditor' | 'viewLetter';
type FeedFilter = 'all' | 'announcement' | 'communication' | 'letter';

const COMM_TYPES: Record<string, string> = { notice:'bg-accent-100 text-accent-700', minutes:'bg-sage-100 text-sage-700', financial:'bg-yellow-100 text-yellow-700', response:'bg-mist-100 text-ink-600', resale:'bg-ink-100 text-ink-600', violation:'bg-red-100 text-red-700', other:'bg-ink-100 text-ink-500' };
const ANN_CAT_STYLES: Record<string, string> = { general:'bg-ink-100 text-ink-600', maintenance:'bg-amber-100 text-amber-700', financial:'bg-sage-100 text-sage-700', safety:'bg-red-100 text-red-700', rules:'bg-violet-100 text-violet-700', meeting:'bg-accent-100 text-accent-700' };

const CATEGORY_LABELS: Record<Category, string> = { violation: 'Violation', collection: 'Collection', notice: 'Notice', welcome: 'Welcome', maintenance: 'Maintenance', general: 'General' };
const CATEGORY_COLORS: Record<Category, { bg: string; text: string; border: string }> = {
  violation:   { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200' },
  collection:  { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' },
  notice:      { bg: 'bg-accent-100', text: 'text-accent-700', border: 'border-accent-200' },
  welcome:     { bg: 'bg-sage-100',   text: 'text-sage-700',   border: 'border-sage-200' },
  maintenance: { bg: 'bg-mist-100',   text: 'text-ink-600',    border: 'border-mist-200' },
  general:     { bg: 'bg-ink-100',    text: 'text-ink-600',    border: 'border-ink-200' },
};
const STATUS_COLORS: Record<GeneratedLetter['status'], { bg: string; text: string }> = {
  draft:    { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  sent:     { bg: 'bg-sage-100',   text: 'text-sage-700' },
  archived: { bg: 'bg-ink-100',    text: 'text-ink-500' },
};
const CATEGORY_ORDER: Category[] = ['violation', 'collection', 'notice', 'welcome', 'maintenance', 'general'];

// ─── Helpers ──────────────────────────────────────────

function substituteVariables(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return values[varName] !== undefined && values[varName] !== '' ? values[varName] : match;
  });
}

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

// ─── Component ────────────────────────────────────────

export default function CommunicationsTab() {
  const comp = useComplianceStore();
  const { templates, letters, addTemplate, updateTemplate, deleteTemplate, addLetter, updateLetter, deleteLetter } = useLetterStore();
  const { currentUser, currentRole, buildingMembers } = useAuthStore();
  const { units } = useFinancialStore();
  const { board } = useBuildingStore();

  // ─── View state ─────────────────────────────────────
  const [subView, setSubView] = useState<SubView>('feed');
  const [modal, setModal] = useState<ModalType>(null);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');

  // ─── Announcement form state ────────────────────────
  const [annForm, setAnnForm] = useState({ title: '', body: '', category: 'general', pinned: false, sendEmail: false });
  const [sendingEmail, setSendingEmail] = useState(false);

  // ─── Communication log form state ───────────────────
  const [commForm, setCommForm] = useState({ type: 'notice', subject: '', date: new Date().toISOString().split('T')[0], method: 'email', recipients: 'All owners (50 units)', status: 'sent', notes: '' });

  // ─── Template Editor state ──────────────────────────
  const emptyTemplate = { name: '', category: 'general' as Category, subject: '', body: '', variables: [] as Array<{ name: string; label: string; defaultValue: string }> };
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState(emptyTemplate);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  // ─── Compose state ─────────────────────────────────
  const [composeTemplateId, setComposeTemplateId] = useState<string | null>(null);
  const [composeValues, setComposeValues] = useState<Record<string, string>>({});
  const [composeSentVia, setComposeSentVia] = useState<string>('email');
  const [composeSelectedUnit, setComposeSelectedUnit] = useState<string>('');

  // ─── View Letter state ──────────────────────────────
  const [viewLetterId, setViewLetterId] = useState<string | null>(null);

  // ─── New Communication modal step ──────────────────
  const [newCommStep, setNewCommStep] = useState<'choose' | 'announcement' | 'communication' | 'letter'>('choose');

  // ─── Derived ────────────────────────────────────────
  const composeTemplate = composeTemplateId ? templates.find(t => t.id === composeTemplateId) : null;

  const feed = useMemo(() => {
    const items = buildCommunicationsFeed(comp.announcements || [], comp.communications, letters);
    if (feedFilter === 'all') return items;
    return items.filter(i => i.type === feedFilter);
  }, [comp.announcements, comp.communications, letters, feedFilter]);

  const feedCounts = useMemo(() => ({
    all: buildCommunicationsFeed(comp.announcements || [], comp.communications, letters).length,
    announcement: (comp.announcements || []).length,
    communication: comp.communications.length,
    letter: letters.length,
  }), [comp.announcements, comp.communications, letters]);

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
    archived: letters.filter(l => l.status === 'archived').length,
  }), [letters]);

  // ─── Actions ────────────────────────────────────────

  function openNewComm() {
    setNewCommStep('choose');
    setModal('newComm');
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

  function openCompose(template: LetterTemplate) {
    setComposeTemplateId(template.id);
    const defaults: Record<string, string> = {};
    template.variables.forEach(v => { defaults[v.name] = v.defaultValue || ''; });
    setComposeValues(defaults);
    setComposeSentVia('email');
    setComposeSelectedUnit('');
    setModal('compose');
  }

  function selectUnit(unitNumber: string) {
    setComposeSelectedUnit(unitNumber);
    const unit = units.find(u => u.number === unitNumber);
    if (unit) {
      setComposeValues(prev => ({ ...prev, owner_name: unit.owner || prev.owner_name || '', unit_number: unit.number || prev.unit_number || '' }));
    }
  }

  function saveDraft() {
    if (!composeTemplate) return;
    const selectedUnit = units.find(u => u.number === composeSelectedUnit);
    addLetter({
      templateId: composeTemplate.id, templateName: composeTemplate.name,
      recipient: composeValues.owner_name || selectedUnit?.owner || '',
      unitNumber: composeSelectedUnit || composeValues.unit_number || '',
      subject: substituteVariables(composeTemplate.subject, composeValues),
      body: substituteVariables(composeTemplate.body, composeValues),
      status: 'draft', sentDate: '', sentVia: composeSentVia, createdBy: currentUser.name,
    });
    setModal(null);
  }

  function sendLetter() {
    if (!composeTemplate) return;
    const selectedUnit = units.find(u => u.number === composeSelectedUnit);
    const today = new Date().toISOString().split('T')[0];
    addLetter({
      templateId: composeTemplate.id, templateName: composeTemplate.name,
      recipient: composeValues.owner_name || selectedUnit?.owner || '',
      unitNumber: composeSelectedUnit || composeValues.unit_number || '',
      subject: substituteVariables(composeTemplate.subject, composeValues),
      body: substituteVariables(composeTemplate.body, composeValues),
      status: 'sent', sentDate: today, sentVia: composeSentVia, createdBy: currentUser.name,
    });
    setModal(null);
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

  const pendingComms = comp.communications.filter(c => c.status === 'pending').length;

  return (
    <div className="space-y-5">
      {/* Header with sub-view toggle and new button */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-display text-xl font-bold text-ink-900">Communications</h3>
          <p className="text-sm text-ink-500 mt-0.5">Announcements, owner communications & letter templates</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-ink-100 rounded-lg p-0.5">
            <button onClick={() => setSubView('feed')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${subView === 'feed' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}>
              All Communications
              {pendingComms > 0 && <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-yellow-100 text-yellow-700 rounded-full font-semibold">{pendingComms}</span>}
            </button>
            <button onClick={() => setSubView('templates')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${subView === 'templates' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}>
              Templates
            </button>
          </div>
          <button onClick={openNewComm} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800 transition-colors">+ New Communication</button>
        </div>
      </div>

      {/* ═══════════════ ALL COMMUNICATIONS VIEW ═══════════════ */}
      {subView === 'feed' && (
        <div className="space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-ink-100 p-4">
              <p className="text-xs text-ink-400 uppercase tracking-wider font-semibold">Total Items</p>
              <p className="text-2xl font-bold text-ink-900 mt-1">{feedCounts.all}</p>
            </div>
            <div className="bg-white rounded-xl border border-ink-100 p-4">
              <p className="text-xs text-ink-400 uppercase tracking-wider font-semibold">Pending</p>
              <p className="text-2xl font-bold text-yellow-600 mt-1">{pendingComms}</p>
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

          {/* Filter pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {([['all', 'All'], ['announcement', 'Announcements'], ['communication', 'Communications'], ['letter', 'Letters']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setFeedFilter(key)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${feedFilter === key ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}>
                {label} <span className="ml-1 opacity-70">({feedCounts[key]})</span>
              </button>
            ))}
          </div>

          {/* Feed */}
          {feed.length === 0 && <p className="text-sm text-ink-400 text-center py-8">No communications yet.</p>}
          <div className="space-y-2">
            {feed.map(item => {
              if (item.type === 'announcement') {
                const a = item.sourceData as Announcement;
                return (
                  <div key={item.id} className={`rounded-xl border p-4 ${a.pinned ? 'border-accent-300 bg-accent-50 bg-opacity-30' : 'border-ink-100'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-100 text-accent-700 font-bold">Announcement</span>
                          {a.pinned && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-100 text-accent-700 font-bold">PINNED</span>}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${ANN_CAT_STYLES[a.category] || ANN_CAT_STYLES.general}`}>{a.category}</span>
                          <span className="text-sm font-semibold text-ink-900">{a.title}</span>
                        </div>
                        <p className="text-xs text-ink-500 mt-1 line-clamp-2">{a.body}</p>
                        <p className="text-[10px] text-ink-400 mt-1.5">Posted by {a.postedBy} · {a.postedDate}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => comp.togglePinAnnouncement(a.id)} className={`text-[10px] px-2 py-1 rounded font-medium ${a.pinned ? 'bg-accent-100 text-accent-700' : 'bg-ink-50 text-ink-500 hover:bg-ink-100'}`}>{a.pinned ? 'Unpin' : 'Pin'}</button>
                        <button onClick={() => { if (confirm('Delete this announcement?')) comp.deleteAnnouncement(a.id); }} className="text-[10px] text-red-400 hover:text-red-600">Delete</button>
                      </div>
                    </div>
                  </div>
                );
              }

              if (item.type === 'communication') {
                const c = item.sourceData as OwnerCommunication;
                return (
                  <div key={item.id} className="rounded-xl border border-ink-100 p-4 hover:bg-mist-50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-200 text-ink-600 font-bold">Communication</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded text-xs ${COMM_TYPES[c.type] || COMM_TYPES.other}`}>{c.type}</span>
                          <p className="text-sm font-medium text-ink-900">{c.subject}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded text-xs ${c.status === 'sent' ? 'bg-sage-100 text-sage-700' : c.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-ink-100 text-ink-500'}`}>{c.status}</span>
                        </div>
                        <p className="text-xs text-ink-500">{c.date} · {c.method} · To: {c.recipients}</p>
                        {c.notes && <p className="text-xs text-ink-400 mt-1">{c.notes}</p>}
                      </div>
                      <button onClick={() => { if (confirm('Remove?')) comp.deleteCommunication(c.id); }} className="text-xs text-red-400 shrink-0">Remove</button>
                    </div>
                  </div>
                );
              }

              if (item.type === 'letter') {
                const l = item.sourceData as GeneratedLetter;
                const statusColor = STATUS_COLORS[l.status];
                return (
                  <div key={item.id} className="rounded-xl border border-ink-100 p-4 hover:bg-mist-50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-bold">Letter</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-mist-100 text-ink-600 font-semibold">{l.templateName}</span>
                          <span className="text-sm font-bold text-ink-900">{l.recipient || 'No recipient'}</span>
                          {l.unitNumber && <span className="text-[10px] px-1.5 py-0.5 rounded bg-mist-100 text-ink-600 font-semibold">Unit {l.unitNumber}</span>}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${statusColor.bg} ${statusColor.text}`}>{l.status.charAt(0).toUpperCase() + l.status.slice(1)}</span>
                        </div>
                        <p className="text-xs text-ink-500 truncate">{l.subject}</p>
                        <div className="flex items-center gap-3 mt-1">
                          {l.sentDate && <span className="text-[11px] text-ink-400">{formatDate(l.sentDate)}</span>}
                          {l.sentVia && <span className="text-[11px] text-ink-400">via {l.sentVia}</span>}
                          <span className="text-[11px] text-ink-400">by {l.createdBy}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {l.status === 'draft' && (
                          <button onClick={() => { const today = new Date().toISOString().split('T')[0]; updateLetter(l.id, { status: 'sent', sentDate: today }); }} className="text-[10px] px-2 py-1 rounded font-medium bg-sage-100 text-sage-700 hover:bg-sage-200">Mark Sent</button>
                        )}
                        {l.status !== 'archived' && (
                          <button onClick={() => updateLetter(l.id, { status: 'archived' })} className="text-[10px] px-2 py-1 rounded font-medium bg-ink-50 text-ink-500 hover:bg-ink-100">Archive</button>
                        )}
                        <button onClick={() => { if (confirm('Delete this letter?')) { deleteLetter(l.id); } }} className="text-[10px] text-red-400 hover:text-red-600">Delete</button>
                      </div>
                    </div>
                  </div>
                );
              }

              return null;
            })}
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
                              <button onClick={(e) => { e.stopPropagation(); openCompose(template); }} className="px-3 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-medium hover:bg-ink-800 transition-colors">Use Template</button>
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

      {/* ═══════════════ NEW COMMUNICATION MODAL ═══════════════ */}
      {modal === 'newComm' && (
        <Modal title="New Communication" onClose={() => setModal(null)} onSave={() => {
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
              <p className="text-sm text-ink-500">What type of communication would you like to create?</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button onClick={() => { setAnnForm({ title: '', body: '', category: 'general', pinned: false, sendEmail: false }); setNewCommStep('announcement'); }} className="p-5 bg-accent-50 border border-accent-200 rounded-xl text-center hover:border-accent-400 hover:bg-accent-100 transition-colors">
                  <span className="text-2xl">📢</span>
                  <p className="text-sm font-semibold text-ink-900 mt-2">Post Announcement</p>
                  <p className="text-xs text-ink-400 mt-1">Community-wide update visible in Community Room</p>
                </button>
                <button onClick={() => { setCommForm({ type: 'notice', subject: '', date: new Date().toISOString().split('T')[0], method: 'email', recipients: 'All owners (50 units)', status: 'sent', notes: '' }); setNewCommStep('communication'); }} className="p-5 bg-mist-50 border border-mist-200 rounded-xl text-center hover:border-accent-400 hover:bg-mist-100 transition-colors">
                  <span className="text-2xl">✉️</span>
                  <p className="text-sm font-semibold text-ink-900 mt-2">Log Communication</p>
                  <p className="text-xs text-ink-400 mt-1">Record a notice, minutes distribution, etc.</p>
                </button>
                <button onClick={() => { setModal(null); setSubView('templates'); }} className="p-5 bg-violet-50 border border-violet-200 rounded-xl text-center hover:border-accent-400 hover:bg-violet-100 transition-colors">
                  <span className="text-2xl">📄</span>
                  <p className="text-sm font-semibold text-ink-900 mt-2">Send Letter from Template</p>
                  <p className="text-xs text-ink-400 mt-1">Pick a template, fill variables, and send</p>
                </button>
              </div>
            </div>
          )}

          {newCommStep === 'announcement' && (
            <div className="space-y-3">
              <button onClick={() => setNewCommStep('choose')} className="text-xs text-accent-600 hover:text-accent-700 font-medium mb-1">&larr; Back to options</button>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Title *</label><input value={annForm.title} onChange={e => setAnnForm(p => ({ ...p, title: e.target.value }))} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Elevator Modernization Project Update" /></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Category</label><select value={annForm.category} onChange={e => setAnnForm(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                <option value="general">General</option><option value="maintenance">Maintenance</option><option value="financial">Financial</option><option value="safety">Safety</option><option value="rules">Rules & Policies</option><option value="meeting">Meeting</option>
              </select></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Message *</label><textarea value={annForm.body} onChange={e => setAnnForm(p => ({ ...p, body: e.target.value }))} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={5} placeholder="Write the announcement body. This will be visible to all residents in the Community Room." /></div>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={annForm.pinned} onChange={e => setAnnForm(p => ({ ...p, pinned: e.target.checked }))} className="h-4 w-4 accent-accent-600 rounded" /><span className="text-sm text-ink-700">Pin this announcement</span><span className="text-[10px] text-ink-400">(pinned posts appear first)</span></label>
              <div className="border-t border-ink-100 pt-3 mt-1">
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={annForm.sendEmail} onChange={e => setAnnForm(p => ({ ...p, sendEmail: e.target.checked }))} className="h-4 w-4 accent-accent-600 rounded" /><span className="text-sm text-ink-700">Also send via email</span><span className="text-[10px] text-ink-400">(to all building members)</span></label>
                {annForm.sendEmail && <p className="text-[11px] text-ink-400 mt-1.5 ml-6">This announcement will be emailed to {buildingMembers.filter(m => m.email && m.status === 'active').length} active members via Mailjet.</p>}
              </div>
            </div>
          )}

          {newCommStep === 'communication' && (
            <div className="space-y-3">
              <button onClick={() => setNewCommStep('choose')} className="text-xs text-accent-600 hover:text-accent-700 font-medium mb-1">&larr; Back to options</button>
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

      {/* ═══════════════ COMPOSE LETTER MODAL ═══════════════ */}
      {modal === 'compose' && composeTemplate && (
        <Modal title="Compose Letter" subtitle={`Using template: ${composeTemplate.name}`} onClose={() => setModal(null)} wide
          footer={
            <div className="flex items-center gap-3 w-full justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-ink-700 hover:text-ink-900 font-medium text-sm">Cancel</button>
              <button onClick={saveDraft} className="px-5 py-2 border border-ink-300 text-ink-700 rounded-lg font-medium text-sm hover:bg-ink-50 transition-colors">Save as Draft</button>
              <button onClick={sendLetter} className="px-5 py-2 bg-ink-900 text-white rounded-lg font-medium text-sm hover:bg-ink-800 transition-colors">Send</button>
            </div>
          }
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">Recipient (Unit)</label>
                <select value={composeSelectedUnit} onChange={e => selectUnit(e.target.value)} className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent">
                  <option value="">-- Select a unit --</option>
                  {units.map(u => <option key={u.number} value={u.number}>Unit {u.number} - {u.owner} ({u.email})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">Send Via</label>
                <select value={composeSentVia} onChange={e => setComposeSentVia(e.target.value)} className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent">
                  <option value="email">Email</option><option value="mail">Mail</option><option value="both">Both</option>
                </select>
              </div>
              {composeTemplate.variables.length > 0 && (
                <div>
                  <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-2">Template Variables</p>
                  <div className="space-y-3">
                    {composeTemplate.variables.map(v => (
                      <div key={v.name}>
                        <label className="block text-xs font-medium text-ink-600 mb-1">{v.label}</label>
                        <input type="text" value={composeValues[v.name] || ''} onChange={e => setComposeValues(prev => ({ ...prev, [v.name]: e.target.value }))} placeholder={v.defaultValue || v.label} className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* Right: Live preview */}
            <div className="space-y-3">
              <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold">Live Preview</p>
              <div className="bg-ink-50 rounded-xl border border-ink-100 overflow-hidden">
                <div className="bg-white border-b border-ink-100 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs text-ink-400 mb-1.5">
                    <span className="font-semibold text-ink-500">To:</span>
                    <span>{composeValues.owner_name || '(recipient)'}</span>
                    {(composeSelectedUnit || composeValues.unit_number) && <span className="text-ink-300">| Unit {composeSelectedUnit || composeValues.unit_number}</span>}
                  </div>
                  <p className="text-sm font-bold text-ink-900">{substituteVariables(composeTemplate.subject, composeValues)}</p>
                </div>
                <div className="px-4 py-3 text-sm text-ink-700 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                  {substituteVariables(composeTemplate.body, composeValues)}
                </div>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-ink-400">
                <span>Via: {composeSentVia}</span>
                <span>By: {currentUser.name}</span>
              </div>
            </div>
          </div>
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
