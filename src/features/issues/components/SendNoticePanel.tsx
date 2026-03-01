import { useState, useMemo } from 'react';
import type { CaseTrackerCase } from '@/types/issues';
import type { MailDeliveryMethod, PostalAddress } from '@/types/mail';
import { PRICING, calculateMailingCost, formatDeliveryMethod, getRecommendedDeliveryMethod } from '@/types/mail';
import { useLetterStore } from '@/store/useLetterStore';
import { useMailStore } from '@/store/useMailStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { getSuggestedTemplateCategories } from '../templateMapping';

interface Props {
  caseId: string;
  caseData: CaseTrackerCase;
  stepIdx: number | null;
  onClose: () => void;
}

const DELIVERY_OPTIONS: { method: MailDeliveryMethod; label: string; priceCents: number }[] = [
  { method: 'first-class', label: 'First Class', priceCents: PRICING['first-class'] },
  { method: 'certified', label: 'Certified Mail', priceCents: PRICING['certified'] },
  { method: 'certified-electronic-return-receipt', label: 'Certified + Electronic Return Receipt', priceCents: PRICING['certified-electronic-return-receipt'] },
];

export default function SendNoticePanel({ caseId, caseData, stepIdx, onClose }: Props) {
  const letterStore = useLetterStore();
  const mailStore = useMailStore();
  const buildingStore = useBuildingStore();

  // Filter templates by case type
  const suggestedCategories = useMemo(
    () => getSuggestedTemplateCategories(caseData.catId, caseData.sitId),
    [caseData.catId, caseData.sitId],
  );
  const filteredTemplates = useMemo(
    () => letterStore.templates.filter(t => suggestedCategories.includes(t.category)),
    [letterStore.templates, suggestedCategories],
  );
  const allTemplates = letterStore.templates;

  // State
  const [selectedTemplateId, setSelectedTemplateId] = useState(filteredTemplates[0]?.id || '');
  const [showAllTemplates, setShowAllTemplates] = useState(false);

  const selectedTemplate = useMemo(
    () => allTemplates.find(t => t.id === selectedTemplateId),
    [allTemplates, selectedTemplateId],
  );

  // Recommended delivery method
  const recommended = useMemo(
    () => getRecommendedDeliveryMethod(selectedTemplate?.category || 'general'),
    [selectedTemplate?.category],
  );
  const [deliveryMethod, setDeliveryMethod] = useState<MailDeliveryMethod>(recommended.method);

  // Recipient
  const [editingRecipient, setEditingRecipient] = useState(false);
  const [recipientName, setRecipientName] = useState(caseData.owner || '');
  const [recipientAddress, setRecipientAddress] = useState<PostalAddress>({
    line1: buildingStore.address.street,
    city: buildingStore.address.city,
    state: buildingStore.address.state,
    zip: buildingStore.address.zip,
  });

  // Options
  const [emailCopy, setEmailCopy] = useState(true);
  const [includeReturnEnvelope, setIncludeReturnEnvelope] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);

  // Merge variables
  const [mergeVars, setMergeVars] = useState<Record<string, string>>(() => {
    const vars: Record<string, string> = {};
    if (selectedTemplate) {
      for (const v of selectedTemplate.variables) {
        if (v.name === 'owner_name') vars[v.name] = caseData.owner || '';
        else if (v.name === 'unit_number') vars[v.name] = caseData.unit || '';
        else if (v.name === 'sender_name') vars[v.name] = mailStore.mailingSettings.senderName;
        else vars[v.name] = v.defaultValue;
      }
    }
    return vars;
  });

  // Update merge vars when template changes
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const tmpl = allTemplates.find(t => t.id === templateId);
    if (tmpl) {
      const vars: Record<string, string> = {};
      for (const v of tmpl.variables) {
        if (v.name === 'owner_name') vars[v.name] = caseData.owner || '';
        else if (v.name === 'unit_number') vars[v.name] = caseData.unit || '';
        else if (v.name === 'sender_name') vars[v.name] = mailStore.mailingSettings.senderName;
        else vars[v.name] = v.defaultValue;
      }
      setMergeVars(vars);
      const rec = getRecommendedDeliveryMethod(tmpl.category);
      setDeliveryMethod(rec.method);
    }
  };

  // Cost calculation
  const pageCount = 1;
  const cost = useMemo(
    () => calculateMailingCost(deliveryMethod, pageCount, includeReturnEnvelope),
    [deliveryMethod, includeReturnEnvelope],
  );

  // Preview body
  const previewBody = useMemo(() => {
    if (!selectedTemplate) return '';
    let body = selectedTemplate.body;
    for (const [key, val] of Object.entries(mergeVars)) {
      body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val || `[${key}]`);
    }
    return body;
  }, [selectedTemplate, mergeVars]);

  const handleSend = async () => {
    if (!selectedTemplate) return;
    setSending(true);
    try {
      await mailStore.sendNotice({
        caseId,
        stepId: stepIdx != null && caseData.steps?.[stepIdx] ? caseData.steps[stepIdx].id : undefined,
        tenantId: 'demo',
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.name,
        recipient: { name: recipientName, address: recipientAddress },
        deliveryMethod,
        pageCount,
        includeReturnEnvelope,
        emailCopy,
        mergeVariables: mergeVars,
      });
      onClose();
    } finally {
      setSending(false);
    }
  };

  const templatesForDropdown = showAllTemplates ? allTemplates : filteredTemplates;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[640px] max-w-full bg-white border-l border-ink-200 z-50 overflow-y-auto shadow-xl">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-ink-900">Send Notice</h2>
            <button onClick={onClose} className="text-ink-400 hover:text-ink-600 text-xl leading-none">&times;</button>
          </div>

          {/* Template Selection */}
          <div>
            <h3 className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-2">Template</h3>
            <select
              value={selectedTemplateId}
              onChange={e => handleTemplateChange(e.target.value)}
              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
            >
              {templatesForDropdown.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {!showAllTemplates && (
              <button onClick={() => setShowAllTemplates(true)} className="text-xs text-accent-600 hover:text-accent-700 mt-1">
                Show all templates
              </button>
            )}
            {selectedTemplate && (
              <p className="text-xs text-ink-500 mt-1">{selectedTemplate.subject}</p>
            )}
          </div>

          {/* Recipient */}
          <div>
            <h3 className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-2">Recipient</h3>
            {!editingRecipient ? (
              <div className="bg-mist-50 border border-mist-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink-900">{recipientName}</p>
                    <p className="text-xs text-ink-500">{recipientAddress.line1}{recipientAddress.line2 ? `, ${recipientAddress.line2}` : ''}</p>
                    <p className="text-xs text-ink-500">{recipientAddress.city}, {recipientAddress.state} {recipientAddress.zip}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-600 text-xs font-medium">&#10003; Address on file</span>
                    <button onClick={() => setEditingRecipient(true)} className="text-xs text-accent-600 hover:text-accent-700 font-medium">Edit</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Recipient name" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" />
                <input value={recipientAddress.line1} onChange={e => setRecipientAddress({ ...recipientAddress, line1: e.target.value })} placeholder="Address line 1" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" />
                <input value={recipientAddress.line2 || ''} onChange={e => setRecipientAddress({ ...recipientAddress, line2: e.target.value })} placeholder="Address line 2 (optional)" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" />
                <div className="grid grid-cols-3 gap-2">
                  <input value={recipientAddress.city} onChange={e => setRecipientAddress({ ...recipientAddress, city: e.target.value })} placeholder="City" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" />
                  <input value={recipientAddress.state} onChange={e => setRecipientAddress({ ...recipientAddress, state: e.target.value })} placeholder="State" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" />
                  <input value={recipientAddress.zip} onChange={e => setRecipientAddress({ ...recipientAddress, zip: e.target.value })} placeholder="ZIP" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" />
                </div>
                <button onClick={() => setEditingRecipient(false)} className="text-xs text-accent-600 font-medium">Done</button>
              </div>
            )}
          </div>

          {/* Delivery Method */}
          <div>
            <h3 className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-2">Delivery Method</h3>
            <div className="space-y-2">
              {DELIVERY_OPTIONS.map(opt => {
                const isRecommended = opt.method === recommended.method;
                const isSelected = opt.method === deliveryMethod;
                return (
                  <button
                    key={opt.method}
                    onClick={() => setDeliveryMethod(opt.method)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-colors ${
                      isSelected
                        ? 'border-ink-900 bg-ink-50'
                        : 'border-ink-200 hover:border-ink-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-ink-900' : 'border-ink-300'}`}>
                        {isSelected && <div className="w-2 h-2 rounded-full bg-ink-900" />}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-ink-900">{opt.label}</span>
                        {isRecommended && (
                          <span className="ml-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5 text-[11px] font-semibold">
                            RECOMMENDED
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-ink-700">${(opt.priceCents / 100).toFixed(2)}</span>
                  </button>
                );
              })}
              {recommended && (
                <p className="text-xs text-emerald-700 ml-7">{recommended.reason}</p>
              )}
            </div>
          </div>

          {/* Merge Variables */}
          {selectedTemplate && selectedTemplate.variables.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-2">Merge Variables</h3>
              <div className="space-y-2">
                {selectedTemplate.variables.map(v => (
                  <div key={v.name}>
                    <label className="block text-xs font-medium text-ink-700 mb-1">{v.label}</label>
                    <input
                      value={mergeVars[v.name] || ''}
                      onChange={e => setMergeVars({ ...mergeVars, [v.name]: e.target.value })}
                      placeholder={v.defaultValue || v.label}
                      className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Additional Options */}
          <div>
            <h3 className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-2">Additional Options</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={emailCopy} onChange={e => setEmailCopy(e.target.checked)} className="rounded border-ink-300" />
                <span className="text-sm text-ink-700">Also send digital copy via email</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeReturnEnvelope} onChange={e => setIncludeReturnEnvelope(e.target.checked)} className="rounded border-ink-300" />
                <span className="text-sm text-ink-700">Include return envelope (+$0.15)</span>
              </label>
            </div>
          </div>

          {/* Preview */}
          <div>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="text-sm text-accent-600 hover:text-accent-700 font-medium"
            >
              {showPreview ? 'Hide Preview' : 'Preview Letter'}
            </button>
            {showPreview && (
              <div className="mt-2 border border-ink-200 rounded-lg p-4 bg-white max-h-80 overflow-y-auto">
                <p className="text-xs text-ink-400 mb-2">{selectedTemplate?.subject}</p>
                <div className="text-sm text-ink-700 whitespace-pre-wrap font-mono leading-relaxed">
                  {previewBody}
                </div>
              </div>
            )}
          </div>

          {/* Cost Summary */}
          <div className="bg-ink-50 border border-ink-200 rounded-lg p-4 space-y-2">
            <h3 className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-2">Cost Summary</h3>
            <div className="flex justify-between text-sm">
              <span className="text-ink-600">{formatDeliveryMethod(deliveryMethod)}</span>
              <span className="text-ink-900 font-medium">${(cost.baseCostCents / 100).toFixed(2)}</span>
            </div>
            {cost.additionalPagesCents > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-ink-600">Additional pages ({pageCount - 1})</span>
                <span className="text-ink-900 font-medium">${(cost.additionalPagesCents / 100).toFixed(2)}</span>
              </div>
            )}
            {cost.returnEnvelopeCents > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-ink-600">Return envelope</span>
                <span className="text-ink-900 font-medium">${(cost.returnEnvelopeCents / 100).toFixed(2)}</span>
              </div>
            )}
            <div className="border-t border-ink-200 pt-2 flex justify-between text-sm font-bold">
              <span className="text-ink-900">Total</span>
              <span className="text-ink-900">${(cost.totalCents / 100).toFixed(2)}</span>
            </div>
            <p className="text-[11px] text-ink-400">
              Charged to {mailStore.mailingSettings.senderName} via saved card ending {mailStore.mailingSettings.cardLast4}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-ink-600 hover:text-ink-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !selectedTemplate}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? 'Sending...' : `Approve & Send — $${(cost.totalCents / 100).toFixed(2)}`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
