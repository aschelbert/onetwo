import { useState, useEffect, useMemo } from 'react';
import { useLetterStore } from '@/store/useLetterStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useMailStore } from '@/store/useMailStore';
import { useCommunicationsStore } from '@/store/useCommunicationsStore';
import { PRICING, formatDeliveryMethod } from '@/types/mail';
import type { MailDeliveryMethod } from '@/types/mail';
import type { LetterTemplate } from '@/lib/services/letterEngine';
import type { ComposePanelContext, DeliveryChannel, AnnouncementPriority } from '@/types/communication';

// ── Template grouping helpers ────────────────────────────────

const UNIT_CATEGORIES = ['violation', 'collection', 'general'];
const COMMUNITY_CATEGORIES = ['notice', 'maintenance', 'general'];

const CATEGORY_GROUP_LABELS: Record<string, string> = {
  violation: 'Enforcement',
  collection: 'Financial',
  notice: 'Official Notices',
  maintenance: 'Maintenance',
  welcome: 'Welcome',
  general: 'General',
};

const CATEGORY_ICONS: Record<string, string> = {
  violation: '✉️',
  collection: '💰',
  notice: '📋',
  maintenance: '🔧',
  welcome: '👋',
  general: '📝',
};

// ── Mail pricing for display ────────────────────────────────

const MAIL_OPTIONS: { key: MailDeliveryMethod; label: string; price: number }[] = [
  { key: 'first-class', label: 'First Class', price: PRICING['first-class'] / 100 },
  { key: 'certified', label: 'Certified Mail', price: PRICING['certified'] / 100 },
  { key: 'certified-electronic-return-receipt', label: 'Certified + ERR', price: PRICING['certified-electronic-return-receipt'] / 100 },
];

function substituteVariables(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return values[varName] !== undefined && values[varName] !== '' ? values[varName] : match;
  });
}

// ── Component ────────────────────────────────────────────────

interface ComposePanelProps {
  context?: ComposePanelContext | null;
  onClose: () => void;
  onSent?: () => void;
}

export default function ComposePanel({ context, onClose, onSent }: ComposePanelProps) {
  const { templates } = useLetterStore();
  const { units } = useFinancialStore();
  const currentUser = useAuthStore(s => s.currentUser);
  const { mailingSettings } = useMailStore();
  const sendCommunication = useCommunicationsStore(s => s.sendCommunication);

  // ── State ─────────────────────────────────────────────────
  const [scope, setScope] = useState<'community' | 'unit'>(context?.scope || 'unit');
  const scopeLocked = !!context?.scopeLocked;

  const [selectedTemplate, setSelectedTemplate] = useState<LetterTemplate | null>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  const [selectedUnitNumber, setSelectedUnitNumber] = useState<string>(context?.recipientUnit || '');
  const selectedUnit = units.find(u => u.number === selectedUnitNumber);

  const [channels, setChannels] = useState<{ announcement: boolean; email: boolean; mail: boolean }>({
    announcement: scope === 'community',
    email: true,
    mail: false,
  });
  const [mailMethod, setMailMethod] = useState<MailDeliveryMethod>('first-class');
  const [announcementPriority, setAnnouncementPriority] = useState<AnnouncementPriority>('normal');

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [mergeValues, setMergeValues] = useState<Record<string, string>>({});

  const [sending, setSending] = useState(false);
  const [showReview, setShowReview] = useState(false);

  // ── Auto-select template from context ─────────────────────
  useEffect(() => {
    if (context?.autoTemplateId) {
      const tmpl = templates.find(t => t.id === context.autoTemplateId);
      if (tmpl) handleSelectTemplate(tmpl);
    }
  }, []);

  // ── Filtered templates for current scope ──────────────────
  const scopeTemplates = useMemo(() => {
    const cats = scope === 'community' ? COMMUNITY_CATEGORIES : UNIT_CATEGORIES;
    return templates.filter(t => cats.includes(t.category));
  }, [templates, scope]);

  const groupedTemplates = useMemo(() => {
    const groups: Record<string, LetterTemplate[]> = {};
    for (const t of scopeTemplates) {
      const group = t.category;
      if (!groups[group]) groups[group] = [];
      groups[group].push(t);
    }
    return groups;
  }, [scopeTemplates]);

  // ── Cost calculation ──────────────────────────────────────
  const mailPriceCents = PRICING[mailMethod] || 0;
  const mailLetterCount = scope === 'community' ? units.length : 1;
  const estimatedPageCount = Math.max(1, Math.ceil((body || '').length / 2800));
  const additionalPagesCostCents = (estimatedPageCount - 1) * PRICING.additionalPage * mailLetterCount;
  const mailCostCents = channels.mail ? (mailPriceCents * mailLetterCount) + additionalPagesCostCents : 0;
  const mailCostDollars = mailCostCents / 100;

  // ── Template selection handler ────────────────────────────
  const handleSelectTemplate = (tmpl: LetterTemplate) => {
    setSelectedTemplate(tmpl);
    setIsCustom(false);
    setShowTemplatePicker(false);

    // Set merge variable defaults
    const defaults: Record<string, string> = {};
    tmpl.variables.forEach(v => {
      defaults[v.name] = v.defaultValue || '';
    });
    // Pre-fill with unit data if available
    if (selectedUnit) {
      defaults['owner_name'] = selectedUnit.owner || defaults['owner_name'] || '';
      defaults['unit_number'] = selectedUnit.number || defaults['unit_number'] || '';
    }
    if (context?.recipientName) defaults['owner_name'] = context.recipientName;
    if (context?.recipientUnit) defaults['unit_number'] = context.recipientUnit;
    setMergeValues(defaults);

    // Fill subject/body
    setSubject(substituteVariables(tmpl.subject, defaults));
    setBody(substituteVariables(tmpl.body, defaults));

    // Set default channels based on template category
    if (scope === 'community') {
      setChannels({ announcement: true, email: true, mail: false });
    } else {
      // Enforcement templates default mail on
      const hasMailDefault = tmpl.category === 'violation' || tmpl.category === 'collection';
      setChannels({ announcement: false, email: true, mail: hasMailDefault });
      if (hasMailDefault) setMailMethod('certified-electronic-return-receipt');
    }
  };

  const handleCustom = () => {
    setSelectedTemplate(null);
    setIsCustom(true);
    setShowTemplatePicker(false);
    setSubject('');
    setBody('');
    setMergeValues({});
    setChannels(scope === 'community'
      ? { announcement: true, email: true, mail: false }
      : { announcement: false, email: true, mail: false }
    );
  };

  const handleScopeChange = (newScope: 'community' | 'unit') => {
    if (scopeLocked) return;
    setScope(newScope);
    setSelectedTemplate(null);
    setIsCustom(false);
    setSubject('');
    setBody('');
    setMergeValues({});
    setChannels(newScope === 'community'
      ? { announcement: true, email: true, mail: false }
      : { announcement: false, email: true, mail: false }
    );
  };

  // ── Send handler ──────────────────────────────────────────
  const handleSend = () => {
    if (!subject.trim()) return;
    setSending(true);

    const activeChannels: DeliveryChannel[] = [];
    if (scope === 'community' || channels.announcement) activeChannels.push('announcement');
    if (channels.email) activeChannels.push('email');
    if (channels.mail) activeChannels.push('mail');

    // Remove announcement from unit scope
    if (scope === 'unit') {
      const annIdx = activeChannels.indexOf('announcement');
      if (annIdx >= 0) activeChannels.splice(annIdx, 1);
    }

    sendCommunication({
      scope,
      subject,
      body,
      templateId: selectedTemplate?.id || null,
      templateName: selectedTemplate?.name || null,
      channels: activeChannels,
      recipientUnit: scope === 'unit' ? selectedUnitNumber : null,
      recipientName: scope === 'unit' ? (selectedUnit?.owner || context?.recipientName || null) : null,
      recipientEmail: scope === 'unit' ? (selectedUnit?.email || context?.recipientEmail || null) : null,
      mailDeliveryMethod: channels.mail ? mailMethod : null,
      mailLetterCount,
      announcementPriority: scope === 'community' ? announcementPriority : undefined,
      caseId: context?.caseId || null,
      stepIdx: context?.stepIdx ?? null,
      source: context?.source || 'compose',
      createdBy: currentUser.name,
    });

    setSending(false);
    onSent?.();
    onClose();
  };

  const showContent = selectedTemplate || isCustom;

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[60] flex justify-end" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-[620px] max-w-full bg-white h-full overflow-y-auto shadow-[-8px_0_30px_rgba(0,0,0,0.1)]">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-ink-100 px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-ink-900">{showReview ? 'Review Before Sending' : 'Compose Communication'}</h2>
            {context?.caseLink && (
              <p className="text-[11px] text-ink-400 mt-0.5">📋 {context.caseLink}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:bg-ink-50 transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {!showReview ? (<>
        {/* ① Scope */}
        <div className="px-6 py-4 border-b border-ink-100">
          <p className="text-[11px] font-bold text-ink-400 uppercase tracking-widest mb-2.5">① Scope</p>
          <div className="flex gap-2.5">
            {([
              { key: 'community' as const, icon: '🏢', title: 'Community', sub: 'All owners' },
              { key: 'unit' as const, icon: '🏠', title: 'Unit', sub: 'Single owner' },
            ]).map(s => (
              <button
                key={s.key}
                onClick={() => handleScopeChange(s.key)}
                disabled={scopeLocked && scope !== s.key}
                className={`flex-1 p-3.5 rounded-[10px] border-2 transition-all text-left ${
                  scope === s.key
                    ? 'border-red-500 bg-red-50'
                    : scopeLocked
                    ? 'border-ink-100 opacity-40 cursor-default'
                    : 'border-ink-100 hover:border-ink-200 cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{s.icon}</span>
                  <div>
                    <p className={`text-[13px] font-semibold ${scope === s.key ? 'text-red-600' : 'text-ink-900'}`}>{s.title}</p>
                    <p className="text-[11px] text-ink-400">{s.sub}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ② Template */}
        <div className="px-6 py-4 border-b border-ink-100">
          <p className="text-[11px] font-bold text-ink-400 uppercase tracking-widest mb-2.5">② Template</p>

          {selectedTemplate ? (
            <button
              onClick={() => setShowTemplatePicker(true)}
              className="w-full p-3 bg-ink-50 border border-ink-100 rounded-[10px] flex items-center justify-between text-left hover:bg-ink-100 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">{CATEGORY_ICONS[selectedTemplate.category] || '📝'}</span>
                <div>
                  <p className="text-[13px] font-semibold text-ink-900">{selectedTemplate.name}</p>
                  <p className="text-[11px] text-ink-400 mt-0.5">{selectedTemplate.category}</p>
                </div>
              </div>
              <span className="text-xs text-ink-400">Change ⌄</span>
            </button>
          ) : isCustom ? (
            <div className="p-3 bg-ink-50 border border-ink-200 rounded-[10px] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-lg">✏️</span>
                <div>
                  <p className="text-[13px] font-semibold text-ink-900">Custom Communication</p>
                  <p className="text-[11px] text-ink-400">Writing without a template</p>
                </div>
              </div>
              <button
                onClick={() => setShowTemplatePicker(true)}
                className="text-xs text-ink-400 hover:text-ink-600"
              >
                Use template ⌄
              </button>
            </div>
          ) : (
            <div>
              <p className="text-[13px] text-ink-500 mb-2.5">Choose a template to get started, or write a custom message.</p>
              <div className="flex gap-2">
                <button onClick={() => setShowTemplatePicker(true)} className="flex-1 py-2.5 bg-red-500 text-white rounded-[10px] text-[13px] font-semibold hover:bg-red-600 transition-colors">
                  Browse Templates
                </button>
                <button onClick={handleCustom} className="flex-1 py-2.5 bg-ink-50 text-ink-600 border border-ink-100 rounded-[10px] text-[13px] font-semibold hover:bg-ink-100 transition-colors">
                  Write Custom
                </button>
              </div>
            </div>
          )}

          {/* Template picker dropdown */}
          {showTemplatePicker && (
            <div className="mt-2.5 bg-white border border-ink-100 rounded-xl shadow-lg max-h-80 overflow-y-auto">
              {Object.entries(groupedTemplates).map(([cat, tmpls]) => (
                <div key={cat}>
                  <div className="px-3.5 py-2 text-[10px] font-bold text-ink-400 uppercase tracking-widest bg-ink-50 border-b border-ink-100">
                    {CATEGORY_GROUP_LABELS[cat] || cat}
                  </div>
                  {tmpls.map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleSelectTemplate(t)}
                      className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left hover:bg-ink-50 transition-colors border-b border-ink-50"
                    >
                      <span className="text-base">{CATEGORY_ICONS[t.category] || '📝'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-ink-900 truncate">{t.name}</p>
                        <p className="text-[11px] text-ink-400 truncate">{t.subject}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
              <button
                onClick={handleCustom}
                className="w-full px-3.5 py-3 flex items-center gap-2.5 text-left hover:bg-ink-50 transition-colors border-t border-ink-100 text-ink-400"
              >
                <span>✏️</span>
                <span className="text-xs font-semibold">Write custom communication instead</span>
              </button>
            </div>
          )}
        </div>

        {/* ③ Recipient (unit scope only) */}
        {scope === 'unit' && (
          <div className="px-6 py-4 border-b border-ink-100">
            <p className="text-[11px] font-bold text-ink-400 uppercase tracking-widest mb-2.5">③ Recipient</p>
            {selectedUnit ? (
              <div className="p-3 bg-ink-50 border border-ink-100 rounded-[10px]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                      {selectedUnit.number}
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-ink-900">{selectedUnit.owner} · Unit {selectedUnit.number}</p>
                      <p className="text-[11px] text-ink-400">{selectedUnit.email}</p>
                    </div>
                  </div>
                  {!context?.recipientUnit && (
                    <button
                      onClick={() => setSelectedUnitNumber('')}
                      className="text-[11px] text-red-600 font-semibold hover:text-red-700"
                    >
                      Change
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-1.5 text-[11px] text-emerald-700 font-medium">
                  <span>✓</span> Address on file
                </div>
              </div>
            ) : (
              <select
                value={selectedUnitNumber}
                onChange={e => setSelectedUnitNumber(e.target.value)}
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm text-ink-700"
              >
                <option value="">Select a unit...</option>
                {units.map(u => (
                  <option key={u.number} value={u.number}>Unit {u.number} — {u.owner}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* ④ Delivery Channels */}
        {showContent && (
          <div className="px-6 py-4 border-b border-ink-100">
            <p className="text-[11px] font-bold text-ink-400 uppercase tracking-widest mb-2.5">④ Delivery Channels</p>

            {/* Announcement (community only) */}
            {scope === 'community' && (
              <div className="flex items-start gap-2.5 py-2.5">
                <input type="checkbox" checked disabled className="mt-0.5 accent-red-500" />
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-ink-900">📌 In-App Announcement</p>
                  <p className="text-[11px] text-ink-400 mt-0.5">Appears in every owner's dashboard. Always included for community communications.</p>
                  <div className="flex gap-2 mt-2">
                    {(['normal', 'important', 'urgent'] as const).map(p => (
                      <label key={p} className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="priority"
                          checked={announcementPriority === p}
                          onChange={() => setAnnouncementPriority(p)}
                          className="accent-red-500"
                        />
                        <span className={`text-[11px] ${announcementPriority === p ? 'font-semibold text-ink-900' : 'text-ink-400'}`}>
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Email */}
            <div className="flex items-start gap-2.5 py-2.5">
              <input
                type="checkbox"
                checked={channels.email}
                disabled={scope === 'unit'}
                onChange={e => setChannels(c => ({ ...c, email: e.target.checked }))}
                className="mt-0.5 accent-red-500"
              />
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-ink-900">
                  📧 Email
                  {scope === 'unit' && <span className="text-[10px] text-ink-400 font-normal ml-1">— always included</span>}
                </p>
                <p className="text-[11px] text-ink-400 mt-0.5">
                  {scope === 'community'
                    ? `Sent to all ${units.length} owners with email on file`
                    : selectedUnit
                    ? `Sent to ${selectedUnit.email}`
                    : 'Select a recipient above'}
                </p>
              </div>
            </div>

            {/* Physical Mail */}
            <div className="py-2.5">
              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={channels.mail}
                  onChange={e => setChannels(c => ({ ...c, mail: e.target.checked }))}
                  className="mt-0.5 accent-red-500"
                />
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-ink-900">
                    📮 Physical Mail
                    {scope === 'community' && channels.mail && (
                      <span className="text-[11px] text-ink-400 font-normal ml-1">· {units.length} letters</span>
                    )}
                  </p>
                  <p className="text-[11px] text-ink-400 mt-0.5">Printed and mailed via USPS</p>
                </div>
              </div>

              {channels.mail && (
                <div className="ml-7 mt-2 p-3 bg-ink-50 rounded-lg border border-ink-100">
                  {MAIL_OPTIONS.map(m => (
                    <label key={m.key} className="flex items-center gap-2 py-1 cursor-pointer">
                      <input
                        type="radio"
                        name="mailMethod"
                        checked={mailMethod === m.key}
                        onChange={() => setMailMethod(m.key)}
                        className="accent-red-500"
                      />
                      <span className={`text-xs flex-1 ${mailMethod === m.key ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>
                        {m.label}
                      </span>
                      <span className="text-xs text-ink-400">
                        ${m.price.toFixed(2)}{scope === 'community' ? '/ea' : ''}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ⑤ Content */}
        {showContent && (
          <div className="px-6 py-4 border-b border-ink-100">
            <p className="text-[11px] font-bold text-ink-400 uppercase tracking-widest mb-2.5">⑤ Content</p>
            <div className="mb-2.5">
              <p className="text-xs font-semibold text-ink-600 mb-1">Subject</p>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Communication subject..."
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
              />
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-600 mb-1">Body</p>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Write your communication here..."
                rows={8}
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm resize-y leading-relaxed focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
              />
            </div>
          </div>
        )}

        {/* ⑥ Merge Variables (if template with variables) */}
        {selectedTemplate && selectedTemplate.variables.length > 0 && (
          <div className="px-6 py-4 border-b border-ink-100">
            <p className="text-[11px] font-bold text-ink-400 uppercase tracking-widest mb-2.5">⑥ Merge Variables</p>
            <div className="space-y-2.5">
              {selectedTemplate.variables.map(v => (
                <div key={v.name}>
                  <label className="block text-xs font-medium text-ink-600 mb-1">{v.label}</label>
                  <input
                    value={mergeValues[v.name] || ''}
                    onChange={e => {
                      const newVals = { ...mergeValues, [v.name]: e.target.value };
                      setMergeValues(newVals);
                      // Re-substitute into subject/body
                      setSubject(substituteVariables(selectedTemplate.subject, newVals));
                      setBody(substituteVariables(selectedTemplate.body, newVals));
                    }}
                    placeholder={v.defaultValue || v.label}
                    className="w-full px-3 py-1.5 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cost Summary + Send */}
        {showContent && (
          <div className="sticky bottom-0 bg-white border-t border-ink-100 px-6 py-4">
            {channels.mail ? (
              <div className="p-3 bg-ink-50 rounded-[10px] mb-3 text-xs text-ink-600">
                <p className="font-semibold mb-1">Cost Summary</p>
                <div className="flex justify-between">
                  <span>{formatDeliveryMethod(mailMethod)} ({mailLetterCount} {mailLetterCount > 1 ? 'letters' : 'letter'} × ${(mailPriceCents / 100).toFixed(2)})</span>
                  <span className="font-semibold">${(mailPriceCents * mailLetterCount / 100).toFixed(2)}</span>
                </div>
                {estimatedPageCount > 1 && (
                  <div className="flex justify-between">
                    <span>Additional pages ({estimatedPageCount - 1} pg × ${(PRICING.additionalPage / 100).toFixed(2)}{mailLetterCount > 1 ? ` × ${mailLetterCount}` : ''})</span>
                    <span className="font-semibold">${(additionalPagesCostCents / 100).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 text-ink-400 mt-0.5">
                  <span>{estimatedPageCount} {estimatedPageCount === 1 ? 'page' : 'pages'} per letter</span>
                </div>
                {channels.email && <p className="text-ink-400">Email: included</p>}
                {scope === 'community' && <p className="text-ink-400">Announcement: included</p>}
                <div className="border-t border-ink-200 mt-1.5 pt-1.5 flex justify-between font-bold text-ink-900">
                  <span>Total</span>
                  <span>${mailCostDollars.toFixed(2)}</span>
                </div>
                <p className="text-[10px] text-ink-400 mt-1">
                  {mailingSettings.cardLast4
                    ? `Charged to ${mailingSettings.senderName} via card ending ${mailingSettings.cardLast4}`
                    : 'No card on file'}
                </p>
              </div>
            ) : (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg mb-3 text-[11px] text-emerald-700 font-medium">
                ✓ No charges — email{scope === 'community' ? ' and announcements are' : ' is'} included
              </div>
            )}
            <div className="flex gap-2.5">
              <button
                onClick={onClose}
                className="px-5 py-2.5 bg-ink-50 text-ink-600 border border-ink-100 rounded-[10px] text-[13px] font-semibold hover:bg-ink-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowReview(true)}
                disabled={!subject.trim()}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-[10px] text-[13px] font-semibold hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {channels.mail ? `Review & Send — $${mailCostDollars.toFixed(2)}` : 'Review & Send'}
              </button>
            </div>
          </div>
        )}
        </>) : (
          /* ── Review Mode ─────────────────────────────────────── */
          <div className="px-6 py-5 space-y-5">
            {/* Sending Summary */}
            <div>
              <p className="text-[11px] font-bold text-ink-400 uppercase tracking-widest mb-2">Sending To</p>
              <div className="p-3 bg-ink-50 rounded-[10px] border border-ink-100">
                {scope === 'community' ? (
                  <p className="text-[13px] font-semibold text-ink-900">All owners ({units.length} recipients)</p>
                ) : (
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                      {selectedUnit?.number}
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-ink-900">{selectedUnit?.owner} · Unit {selectedUnit?.number}</p>
                      <p className="text-[11px] text-ink-400">{selectedUnit?.email}</p>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {channels.email && (
                    <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">Email</span>
                  )}
                  {channels.mail && (
                    <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">{formatDeliveryMethod(mailMethod)}</span>
                  )}
                  {scope === 'community' && (
                    <span className="text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5">Announcement</span>
                  )}
                </div>
              </div>
            </div>

            {/* Mail Preview */}
            {channels.mail && (
              <div>
                <div className="border border-ink-200 rounded-lg overflow-hidden shadow-sm">
                  <div className="bg-ink-50 border-b border-ink-200 px-4 py-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-ink-500">Mail Preview</span>
                    <span className="text-[11px] font-semibold text-ink-600 bg-white border border-ink-200 rounded-full px-2.5 py-0.5">
                      {estimatedPageCount} {estimatedPageCount === 1 ? 'page' : 'pages'}
                    </span>
                  </div>
                  <div className="p-5 bg-white max-h-80 overflow-y-auto">
                    <div className="space-y-3 text-xs" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                      <div className="text-ink-500">
                        <p className="font-semibold">{mailingSettings.senderName}</p>
                        <p>{mailingSettings.senderAddress.line1}</p>
                        {mailingSettings.senderAddress.line2 && <p>{mailingSettings.senderAddress.line2}</p>}
                        <p>{mailingSettings.senderAddress.city}, {mailingSettings.senderAddress.state} {mailingSettings.senderAddress.zip}</p>
                      </div>
                      <p className="text-ink-400">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                      <div className="text-ink-700">
                        <p className="font-semibold">{scope === 'unit' ? (selectedUnit?.owner || '') : '[Each Owner]'}</p>
                        {scope === 'unit' ? (
                          <p>Unit {selectedUnit?.number}</p>
                        ) : (
                          <p>[Unit Address]</p>
                        )}
                      </div>
                      <div className="border-t border-ink-100 pt-3">
                        <p className="font-bold text-ink-900 mb-2">RE: {subject}</p>
                        <div className="text-ink-700 whitespace-pre-wrap leading-relaxed">{body}</div>
                      </div>
                    </div>
                  </div>
                  {estimatedPageCount > 1 && (
                    <div className="border-t border-dashed border-ink-200 px-4 py-2 bg-amber-50">
                      <p className="text-[10px] text-amber-700 text-center font-medium">
                        Content spans {estimatedPageCount} pages · Additional page fee: ${((estimatedPageCount - 1) * PRICING.additionalPage / 100).toFixed(2)}/letter
                      </p>
                    </div>
                  )}
                </div>
                {scope === 'community' && (
                  <p className="text-[11px] text-ink-400 mt-1.5">
                    This letter will be personalized and mailed to each of the {units.length} owners.
                  </p>
                )}
              </div>
            )}

            {/* Email Preview */}
            {channels.email && (
              <div>
                <div className="border border-ink-200 rounded-lg overflow-hidden">
                  <div className="bg-ink-50 border-b border-ink-200 px-4 py-2">
                    <span className="text-[11px] font-semibold text-ink-500">Email Preview</span>
                  </div>
                  <div className="px-4 py-2.5 border-b border-ink-100 space-y-1 text-[11px]">
                    <div className="flex gap-2"><span className="text-ink-400 w-12">From:</span><span className="text-ink-700 font-medium">{mailingSettings.senderName}</span></div>
                    <div className="flex gap-2"><span className="text-ink-400 w-12">To:</span><span className="text-ink-700 font-medium">{scope === 'unit' ? (selectedUnit?.email || '') : `All owners (${units.length})`}</span></div>
                    <div className="flex gap-2"><span className="text-ink-400 w-12">Subject:</span><span className="text-ink-900 font-semibold">{subject}</span></div>
                  </div>
                  <div className="px-4 py-3 max-h-48 overflow-y-auto">
                    <div className="text-xs text-ink-700 whitespace-pre-wrap leading-relaxed">{body}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Announcement Preview */}
            {scope === 'community' && (
              <div>
                <div className="border border-ink-200 rounded-lg overflow-hidden">
                  <div className="bg-ink-50 border-b border-ink-200 px-4 py-2">
                    <span className="text-[11px] font-semibold text-ink-500">Announcement Preview</span>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      {announcementPriority === 'urgent' && <span className="text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 rounded px-1.5 py-0.5">URGENT</span>}
                      {announcementPriority === 'important' && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5">IMPORTANT</span>}
                      <p className="text-[13px] font-bold text-ink-900">{subject}</p>
                    </div>
                    <p className="text-xs text-ink-600 leading-relaxed line-clamp-4">{body}</p>
                    <p className="text-[10px] text-ink-400 mt-2">Posted by {currentUser.name} · Visible to all owners</p>
                  </div>
                </div>
              </div>
            )}

            {/* Cost Summary + Confirm */}
            <div className="sticky bottom-0 bg-white border-t border-ink-100 -mx-6 px-6 py-4 mt-2">
              {channels.mail ? (
                <div className="p-3 bg-ink-50 rounded-[10px] mb-3 text-xs text-ink-600">
                  <p className="font-semibold mb-1">Cost Summary</p>
                  <div className="flex justify-between">
                    <span>{formatDeliveryMethod(mailMethod)} ({mailLetterCount} {mailLetterCount > 1 ? 'letters' : 'letter'} × ${(mailPriceCents / 100).toFixed(2)})</span>
                    <span className="font-semibold">${(mailPriceCents * mailLetterCount / 100).toFixed(2)}</span>
                  </div>
                  {estimatedPageCount > 1 && (
                    <div className="flex justify-between">
                      <span>Additional pages ({estimatedPageCount - 1} × ${(PRICING.additionalPage / 100).toFixed(2)}{mailLetterCount > 1 ? ` × ${mailLetterCount}` : ''})</span>
                      <span className="font-semibold">${(additionalPagesCostCents / 100).toFixed(2)}</span>
                    </div>
                  )}
                  {channels.email && <p className="text-ink-400">Email: included</p>}
                  {scope === 'community' && <p className="text-ink-400">Announcement: included</p>}
                  <div className="border-t border-ink-200 mt-1.5 pt-1.5 flex justify-between font-bold text-ink-900">
                    <span>Total</span>
                    <span>${mailCostDollars.toFixed(2)}</span>
                  </div>
                  <p className="text-[10px] text-ink-400 mt-1">
                    {mailingSettings.cardLast4
                    ? `Charged to ${mailingSettings.senderName} via card ending ${mailingSettings.cardLast4}`
                    : 'No card on file'}
                  </p>
                </div>
              ) : (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg mb-3 text-[11px] text-emerald-700 font-medium">
                  No charges — email{scope === 'community' ? ' and announcements are' : ' is'} included
                </div>
              )}
              <div className="flex gap-2.5">
                <button
                  onClick={() => setShowReview(false)}
                  className="px-5 py-2.5 bg-ink-50 text-ink-600 border border-ink-100 rounded-[10px] text-[13px] font-semibold hover:bg-ink-100 transition-colors"
                >
                  ← Back to Edit
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="flex-1 py-2.5 bg-red-500 text-white rounded-[10px] text-[13px] font-semibold hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? 'Sending...' : channels.mail ? `Confirm & Send — $${mailCostDollars.toFixed(2)}` : 'Confirm & Send'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
