import { useState, useMemo } from 'react';
import { useLetterStore } from '@/store/useLetterStore';
import type { LetterTemplate, GeneratedLetter } from '@/store/useLetterStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import Modal from '@/components/ui/Modal';

// ─── Constants ────────────────────────────────────────
type Category = LetterTemplate['category'];

const CATEGORY_LABELS: Record<Category, string> = {
  violation: 'Violation',
  collection: 'Collection',
  notice: 'Notice',
  welcome: 'Welcome',
  maintenance: 'Maintenance',
  general: 'General',
};

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

type SubView = 'templates' | 'letters';
type ModalType = null | 'compose' | 'templateEditor' | 'viewLetter';

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
      return (
        <span key={i} className="px-1 py-0.5 bg-accent-100 text-accent-700 rounded text-xs font-mono font-semibold">
          {part}
        </span>
      );
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

export default function LetterEngineTab() {
  const { templates, letters, addTemplate, updateTemplate, deleteTemplate, addLetter, updateLetter, deleteLetter } = useLetterStore();
  const { currentUser } = useAuthStore();
  const { units } = useFinancialStore();

  const [subView, setSubView] = useState<SubView>('templates');
  const [modal, setModal] = useState<ModalType>(null);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [expandedLetter, setExpandedLetter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | GeneratedLetter['status']>('all');

  // ─── Template Editor state ────────────────────────
  const emptyTemplate = {
    name: '',
    category: 'general' as Category,
    subject: '',
    body: '',
    variables: [] as Array<{ name: string; label: string; defaultValue: string }>,
  };
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState(emptyTemplate);

  // ─── Compose state ────────────────────────────────
  const [composeTemplateId, setComposeTemplateId] = useState<string | null>(null);
  const [composeValues, setComposeValues] = useState<Record<string, string>>({});
  const [composeSentVia, setComposeSentVia] = useState<string>('email');
  const [composeSelectedUnit, setComposeSelectedUnit] = useState<string>('');

  // ─── View Letter state ────────────────────────────
  const [viewLetterId, setViewLetterId] = useState<string | null>(null);

  // ─── Derived ──────────────────────────────────────
  const composeTemplate = composeTemplateId ? templates.find(t => t.id === composeTemplateId) : null;

  const filteredLetters = useMemo(() => {
    if (statusFilter === 'all') return letters;
    return letters.filter(l => l.status === statusFilter);
  }, [letters, statusFilter]);

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

  // ─── Actions ──────────────────────────────────────

  function openTemplateEditor(template?: LetterTemplate) {
    if (template) {
      setEditingTemplateId(template.id);
      setTemplateForm({
        name: template.name,
        category: template.category,
        subject: template.subject,
        body: template.body,
        variables: template.variables.map(v => ({ ...v })),
      });
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
    template.variables.forEach(v => {
      defaults[v.name] = v.defaultValue || '';
    });
    setComposeValues(defaults);
    setComposeSentVia('email');
    setComposeSelectedUnit('');
    setModal('compose');
  }

  function selectUnit(unitNumber: string) {
    setComposeSelectedUnit(unitNumber);
    const unit = units.find(u => u.number === unitNumber);
    if (unit) {
      setComposeValues(prev => ({
        ...prev,
        owner_name: unit.owner || prev.owner_name || '',
        unit_number: unit.number || prev.unit_number || '',
      }));
    }
  }

  function saveDraft() {
    if (!composeTemplate) return;
    const selectedUnit = units.find(u => u.number === composeSelectedUnit);
    const today = new Date().toISOString().split('T')[0];
    addLetter({
      templateId: composeTemplate.id,
      templateName: composeTemplate.name,
      recipient: composeValues.owner_name || selectedUnit?.owner || '',
      unitNumber: composeSelectedUnit || composeValues.unit_number || '',
      subject: substituteVariables(composeTemplate.subject, composeValues),
      body: substituteVariables(composeTemplate.body, composeValues),
      status: 'draft',
      sentDate: '',
      sentVia: composeSentVia,
      createdBy: currentUser.name,
    });
    setModal(null);
  }

  function sendLetter() {
    if (!composeTemplate) return;
    const selectedUnit = units.find(u => u.number === composeSelectedUnit);
    const today = new Date().toISOString().split('T')[0];
    addLetter({
      templateId: composeTemplate.id,
      templateName: composeTemplate.name,
      recipient: composeValues.owner_name || selectedUnit?.owner || '',
      unitNumber: composeSelectedUnit || composeValues.unit_number || '',
      subject: substituteVariables(composeTemplate.subject, composeValues),
      body: substituteVariables(composeTemplate.body, composeValues),
      status: 'sent',
      sentDate: today,
      sentVia: composeSentVia,
      createdBy: currentUser.name,
    });
    setModal(null);
  }

  // ─── Render ───────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header with sub-view toggle */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-display text-xl font-bold text-ink-900">Letter Engine</h3>
          <p className="text-sm text-ink-500 mt-0.5">Create correspondence and notices from templates</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-ink-100 rounded-lg p-0.5">
            <button
              onClick={() => setSubView('templates')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                subView === 'templates' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
              }`}
            >
              Templates
            </button>
            <button
              onClick={() => setSubView('letters')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                subView === 'letters' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
              }`}
            >
              Letters
              {letterCounts.draft > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-yellow-100 text-yellow-700 rounded-full font-semibold">
                  {letterCounts.draft}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

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
            <button
              onClick={() => openTemplateEditor()}
              className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800 transition-colors"
            >
              + New Template
            </button>
          </div>

          {/* Templates grouped by category */}
          {Object.entries(templatesByCategory).map(([category, catTemplates]) => {
            const cat = category as Category;
            const colors = CATEGORY_COLORS[cat];
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${colors.bg} ${colors.text}`}>
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <span className="text-xs text-ink-400">{catTemplates.length} template{catTemplates.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="space-y-2">
                  {catTemplates.map(template => {
                    const isExpanded = expandedTemplate === template.id;
                    return (
                      <div
                        key={template.id}
                        className={`rounded-xl border transition-all ${
                          isExpanded ? `${colors.border} bg-white shadow-sm` : 'border-ink-100 bg-white hover:border-ink-200'
                        }`}
                      >
                        {/* Card header */}
                        <div
                          className="p-4 cursor-pointer"
                          onClick={() => setExpandedTemplate(isExpanded ? null : template.id)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-ink-900">{template.name}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${colors.bg} ${colors.text}`}>
                                  {CATEGORY_LABELS[cat]}
                                </span>
                              </div>
                              <p className="text-xs text-ink-500 mt-1 truncate">{template.subject}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] text-ink-400 font-mono">
                                {template.variables.length} var{template.variables.length !== 1 ? 's' : ''}
                              </span>
                              <svg
                                className={`w-4 h-4 text-ink-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                        </div>

                        {/* Expanded body */}
                        {isExpanded && (
                          <div className="border-t border-ink-100 px-4 pb-4 pt-3 space-y-3">
                            {/* Subject with variables highlighted */}
                            <div>
                              <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-1">Subject</p>
                              <p className="text-sm text-ink-700">{highlightVariables(template.subject)}</p>
                            </div>

                            {/* Body with variables highlighted */}
                            <div>
                              <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-1">Body</p>
                              <div className="bg-ink-50 rounded-lg p-3 text-sm text-ink-700 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                                {highlightVariables(template.body)}
                              </div>
                            </div>

                            {/* Variables list */}
                            {template.variables.length > 0 && (
                              <div>
                                <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-1.5">Variables</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {template.variables.map(v => (
                                    <span key={v.name} className="text-[11px] px-2 py-1 bg-accent-50 text-accent-700 rounded-lg border border-accent-100">
                                      <span className="font-mono font-semibold">{`{{${v.name}}}`}</span>
                                      <span className="text-accent-500 ml-1">{v.label}</span>
                                      {v.defaultValue && (
                                        <span className="text-ink-400 ml-1">= {v.defaultValue}</span>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); openCompose(template); }}
                                className="px-3 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-medium hover:bg-ink-800 transition-colors"
                              >
                                Use Template
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); openTemplateEditor(template); }}
                                className="px-3 py-1.5 text-accent-600 hover:text-accent-700 text-xs font-medium"
                              >
                                Edit
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Delete template "${template.name}"?`)) {
                                    deleteTemplate(template.id);
                                    setExpandedTemplate(null);
                                  }
                                }}
                                className="px-3 py-1.5 text-red-400 hover:text-red-600 text-xs font-medium"
                              >
                                Delete
                              </button>
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
              <button
                onClick={() => openTemplateEditor()}
                className="mt-4 px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800 transition-colors"
              >
                + New Template
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ LETTERS VIEW ═══════════════ */}
      {subView === 'letters' && (
        <div className="space-y-4">
          {/* Filter row */}
          <div className="flex items-center gap-2 flex-wrap">
            {(['all', 'draft', 'sent', 'archived'] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  statusFilter === f
                    ? 'bg-ink-900 text-white'
                    : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                }`}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                <span className="ml-1 opacity-70">({letterCounts[f]})</span>
              </button>
            ))}
          </div>

          {/* Letters list */}
          {filteredLetters.length === 0 && (
            <div className="text-center py-12 text-ink-400">
              <p className="text-lg font-medium">No letters {statusFilter !== 'all' ? `with status "${statusFilter}"` : 'yet'}</p>
              <p className="text-sm mt-1">Use a template to compose your first letter.</p>
              <button
                onClick={() => setSubView('templates')}
                className="mt-4 px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800 transition-colors"
              >
                Browse Templates
              </button>
            </div>
          )}

          <div className="space-y-2">
            {filteredLetters.map(letter => {
              const isExpanded = expandedLetter === letter.id;
              const statusColor = STATUS_COLORS[letter.status];
              return (
                <div
                  key={letter.id}
                  className={`rounded-xl border transition-all ${
                    isExpanded ? 'border-ink-200 bg-white shadow-sm' : 'border-ink-100 bg-white hover:border-ink-200'
                  }`}
                >
                  {/* Card header */}
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => setExpandedLetter(isExpanded ? null : letter.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-ink-900">{letter.recipient || 'No recipient'}</span>
                          {letter.unitNumber && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-mist-100 text-ink-600 font-semibold">
                              Unit {letter.unitNumber}
                            </span>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${statusColor.bg} ${statusColor.text}`}>
                            {letter.status.charAt(0).toUpperCase() + letter.status.slice(1)}
                          </span>
                        </div>
                        <p className="text-xs text-ink-500 mt-1 truncate">{letter.subject}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[11px] text-ink-400">{letter.templateName}</span>
                          {letter.sentDate && (
                            <span className="text-[11px] text-ink-400">{formatDate(letter.sentDate)}</span>
                          )}
                          {letter.sentVia && (
                            <span className="text-[11px] text-ink-400">via {letter.sentVia}</span>
                          )}
                        </div>
                      </div>
                      <svg
                        className={`w-4 h-4 text-ink-400 transition-transform shrink-0 mt-1 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded body */}
                  {isExpanded && (
                    <div className="border-t border-ink-100 px-4 pb-4 pt-3 space-y-3">
                      <div>
                        <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-1">Subject</p>
                        <p className="text-sm text-ink-700 font-medium">{letter.subject}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-1">Body</p>
                        <div className="bg-ink-50 rounded-lg p-3 text-sm text-ink-700 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                          {letter.body}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-ink-400">
                        <span>Created by {letter.createdBy}</span>
                        {letter.sentDate && <span>Sent {formatDate(letter.sentDate)}</span>}
                        {letter.sentVia && <span>Via {letter.sentVia}</span>}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-1">
                        {letter.status === 'draft' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const today = new Date().toISOString().split('T')[0];
                              updateLetter(letter.id, { status: 'sent', sentDate: today });
                            }}
                            className="px-3 py-1.5 bg-sage-600 text-white rounded-lg text-xs font-medium hover:bg-sage-700 transition-colors"
                          >
                            Mark Sent
                          </button>
                        )}
                        {letter.status !== 'archived' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateLetter(letter.id, { status: 'archived' });
                            }}
                            className="px-3 py-1.5 text-ink-500 hover:text-ink-700 text-xs font-medium"
                          >
                            Archive
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Delete this letter?')) {
                              deleteLetter(letter.id);
                              setExpandedLetter(null);
                            }
                          }}
                          className="px-3 py-1.5 text-red-400 hover:text-red-600 text-xs font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════ COMPOSE LETTER MODAL ═══════════════ */}
      {modal === 'compose' && composeTemplate && (
        <Modal
          title="Compose Letter"
          subtitle={`Using template: ${composeTemplate.name}`}
          onClose={() => setModal(null)}
          wide
          footer={
            <div className="flex items-center gap-3 w-full justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-ink-700 hover:text-ink-900 font-medium text-sm">
                Cancel
              </button>
              <button
                onClick={saveDraft}
                className="px-5 py-2 border border-ink-300 text-ink-700 rounded-lg font-medium text-sm hover:bg-ink-50 transition-colors"
              >
                Save as Draft
              </button>
              <button
                onClick={sendLetter}
                className="px-5 py-2 bg-ink-900 text-white rounded-lg font-medium text-sm hover:bg-ink-800 transition-colors"
              >
                Send
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Form */}
            <div className="space-y-4">
              {/* Recipient selector */}
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">Recipient (Unit)</label>
                <select
                  value={composeSelectedUnit}
                  onChange={e => selectUnit(e.target.value)}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent"
                >
                  <option value="">-- Select a unit --</option>
                  {units.map(u => (
                    <option key={u.number} value={u.number}>
                      Unit {u.number} - {u.owner} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Sent Via */}
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">Send Via</label>
                <select
                  value={composeSentVia}
                  onChange={e => setComposeSentVia(e.target.value)}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent"
                >
                  <option value="email">Email</option>
                  <option value="mail">Mail</option>
                  <option value="both">Both</option>
                </select>
              </div>

              {/* Variable fields */}
              {composeTemplate.variables.length > 0 && (
                <div>
                  <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-2">Template Variables</p>
                  <div className="space-y-3">
                    {composeTemplate.variables.map(v => (
                      <div key={v.name}>
                        <label className="block text-xs font-medium text-ink-600 mb-1">{v.label}</label>
                        <input
                          type="text"
                          value={composeValues[v.name] || ''}
                          onChange={e => setComposeValues(prev => ({ ...prev, [v.name]: e.target.value }))}
                          placeholder={v.defaultValue || v.label}
                          className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent"
                        />
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
                {/* Letter header */}
                <div className="bg-white border-b border-ink-100 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs text-ink-400 mb-1.5">
                    <span className="font-semibold text-ink-500">To:</span>
                    <span>{composeValues.owner_name || '(recipient)'}</span>
                    {(composeSelectedUnit || composeValues.unit_number) && (
                      <span className="text-ink-300">| Unit {composeSelectedUnit || composeValues.unit_number}</span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-ink-900">
                    {substituteVariables(composeTemplate.subject, composeValues)}
                  </p>
                </div>

                {/* Letter body */}
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
        <Modal
          title={editingTemplateId ? 'Edit Template' : 'New Template'}
          onClose={() => setModal(null)}
          onSave={saveTemplate}
          saveLabel={editingTemplateId ? 'Save Changes' : 'Create Template'}
          wide
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Form fields */}
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">Template Name *</label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={e => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Late Payment Notice"
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">Category</label>
                <select
                  value={templateForm.category}
                  onChange={e => setTemplateForm(prev => ({ ...prev, category: e.target.value as Category }))}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent"
                >
                  {CATEGORY_ORDER.map(c => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={templateForm.subject}
                  onChange={e => setTemplateForm(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder='e.g. Past Due Notice -- Unit {{unit_number}}'
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent"
                />
                <p className="text-[10px] text-ink-400 mt-1">{`Use {{variable_name}} to insert variables`}</p>
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">Body</label>
                <textarea
                  value={templateForm.body}
                  onChange={e => setTemplateForm(prev => ({ ...prev, body: e.target.value }))}
                  rows={10}
                  placeholder={'Dear {{owner_name}},\n\nYour letter content here...\n\nSincerely,\n{{sender_name}}'}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent resize-y font-mono"
                />
                <p className="text-[10px] text-ink-400 mt-1">{`Use {{variable_name}} to insert dynamic values`}</p>
              </div>

              {/* Variables */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-ink-700">Variables</p>
                  <button
                    onClick={() =>
                      setTemplateForm(prev => ({
                        ...prev,
                        variables: [...prev.variables, { name: '', label: '', defaultValue: '' }],
                      }))
                    }
                    className="text-[11px] text-accent-600 hover:text-accent-700 font-medium"
                  >
                    + Add Variable
                  </button>
                </div>
                {templateForm.variables.length === 0 && (
                  <p className="text-xs text-ink-400 italic">No variables defined. Add variables to make this template dynamic.</p>
                )}
                <div className="space-y-2">
                  {templateForm.variables.map((v, i) => (
                    <div key={i} className="flex items-start gap-2 bg-ink-50 rounded-lg p-2.5">
                      <div className="flex-1 grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] text-ink-400 mb-0.5">Name</label>
                          <input
                            type="text"
                            value={v.name}
                            onChange={e => {
                              const vars = [...templateForm.variables];
                              vars[i] = { ...vars[i], name: e.target.value.replace(/\s/g, '_').toLowerCase() };
                              setTemplateForm(prev => ({ ...prev, variables: vars }));
                            }}
                            placeholder="var_name"
                            className="w-full border border-ink-200 rounded px-2 py-1 text-xs text-ink-700 font-mono focus:outline-none focus:ring-1 focus:ring-accent-400"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-ink-400 mb-0.5">Label</label>
                          <input
                            type="text"
                            value={v.label}
                            onChange={e => {
                              const vars = [...templateForm.variables];
                              vars[i] = { ...vars[i], label: e.target.value };
                              setTemplateForm(prev => ({ ...prev, variables: vars }));
                            }}
                            placeholder="Display Label"
                            className="w-full border border-ink-200 rounded px-2 py-1 text-xs text-ink-700 focus:outline-none focus:ring-1 focus:ring-accent-400"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-ink-400 mb-0.5">Default</label>
                          <input
                            type="text"
                            value={v.defaultValue}
                            onChange={e => {
                              const vars = [...templateForm.variables];
                              vars[i] = { ...vars[i], defaultValue: e.target.value };
                              setTemplateForm(prev => ({ ...prev, variables: vars }));
                            }}
                            placeholder="Optional"
                            className="w-full border border-ink-200 rounded px-2 py-1 text-xs text-ink-700 focus:outline-none focus:ring-1 focus:ring-accent-400"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const vars = templateForm.variables.filter((_, idx) => idx !== i);
                          setTemplateForm(prev => ({ ...prev, variables: vars }));
                        }}
                        className="mt-3.5 p-1 text-red-400 hover:text-red-600 shrink-0"
                        title="Remove variable"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
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
                  {templateForm.subject && (
                    <div className="bg-white border-b border-ink-100 px-4 py-3">
                      <p className="text-sm font-bold text-ink-900">{highlightVariables(templateForm.subject)}</p>
                    </div>
                  )}
                  {templateForm.body && (
                    <div className="px-4 py-3 text-sm text-ink-700 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                      {highlightVariables(templateForm.body)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-ink-50 rounded-xl border border-ink-100 p-8 text-center text-sm text-ink-400">
                  Start typing to see a preview of your template
                </div>
              )}

              {/* Variable summary */}
              {templateForm.variables.filter(v => v.name).length > 0 && (
                <div>
                  <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-1.5">Defined Variables</p>
                  <div className="flex flex-wrap gap-1.5">
                    {templateForm.variables.filter(v => v.name).map((v, i) => (
                      <span key={i} className="text-[11px] px-2 py-1 bg-accent-50 text-accent-700 rounded-lg border border-accent-100 font-mono">
                        {`{{${v.name}}}`}
                      </span>
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
