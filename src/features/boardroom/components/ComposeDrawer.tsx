/**
 * ComposeDrawer — Three-step compose flow for board communications.
 * Step 1: Who (audience picker)
 * Step 2: What (template or blank, subject + body)
 * Step 3: How (delivery channels)
 */

import { useState, useMemo } from 'react';
import { Users, Building2, ShieldCheck, Truck, X, Mail, Globe, Send } from 'lucide-react';
import DrawerShell from '@/components/ui/DrawerShell';
import { useAuthStore } from '@/store/useAuthStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useLetterStore } from '@/store/useLetterStore';
import { useCommunicationsStore } from '@/store/useCommunicationsStore';

interface ComposeDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Pre-fill recipient (e.g., from RoleCharter "Send to {name}") */
  prefillRecipient?: string;
}

type AudienceKind = 'all_owners' | 'unit' | 'board' | 'vendor';

const AUDIENCE_OPTIONS: { kind: AudienceKind; label: string; icon: typeof Users }[] = [
  { kind: 'all_owners', label: 'All owners', icon: Users },
  { kind: 'unit', label: 'A specific unit', icon: Building2 },
  { kind: 'board', label: 'The board', icon: ShieldCheck },
  { kind: 'vendor', label: 'A vendor', icon: Truck },
];

type Channel = 'email' | 'postal' | 'portal';

export default function ComposeDrawer({ open, onClose, prefillRecipient }: ComposeDrawerProps) {
  const { currentUser, buildingMembers } = useAuthStore();
  const letterStore = useLetterStore();
  const complianceStore = useComplianceStore();
  const commsStore = useCommunicationsStore();

  const [step, setStep] = useState(1);
  const [audience, setAudience] = useState<AudienceKind>(prefillRecipient ? 'unit' : 'all_owners');
  const [unitTarget, setUnitTarget] = useState(prefillRecipient || '');
  const [chips, setChips] = useState<string[]>(prefillRecipient ? [prefillRecipient] : []);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [channels, setChannels] = useState<Channel[]>(['email']);

  const templates = letterStore.templates;

  const selectedTemplate = useMemo(
    () => (templateId ? templates.find((t) => t.id === templateId) : null),
    [templateId, templates],
  );

  // Count recipients based on audience
  const recipientCount = useMemo(() => {
    switch (audience) {
      case 'all_owners':
        return buildingMembers.filter((m) => m.status === 'active').length;
      case 'unit':
        return chips.length || 1;
      case 'board':
        return buildingMembers.filter(
          (m) => m.role === 'BOARD_MEMBER' && m.status === 'active',
        ).length;
      case 'vendor':
        return 1;
      default:
        return 0;
    }
  }, [audience, chips, buildingMembers]);

  const addChip = (val: string) => {
    const trimmed = val.trim();
    if (trimmed && !chips.includes(trimmed)) {
      setChips([...chips, trimmed]);
    }
    setUnitTarget('');
  };

  const removeChip = (val: string) => {
    setChips(chips.filter((c) => c !== val));
  };

  const toggleChannel = (ch: Channel) => {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch],
    );
  };

  const handleTemplateSelect = (tId: string) => {
    const t = templates.find((x) => x.id === tId);
    if (t) {
      setTemplateId(tId);
      setSubject(t.subject);
      setBody(t.body);
    }
  };

  const handleSend = () => {
    if (!subject.trim()) return;

    // Write OwnerCommunication row via compliance store
    complianceStore.addCommunication({
      type: channels.includes('email') ? 'notice' : 'announcement',
      subject,
      date: new Date().toISOString().split('T')[0],
      method: channels.join('+'),
      recipients:
        audience === 'all_owners'
          ? `All owners (${recipientCount})`
          : audience === 'board'
            ? 'Board members'
            : chips.join(', ') || unitTarget,
      respondedBy: null,
      status: 'sent',
      notes: body.slice(0, 200),
    });

    // Also write via unified Communications store for delivery tracking
    commsStore.sendCommunication({
      scope: audience === 'unit' || audience === 'vendor' ? 'unit' : 'community',
      subject,
      body,
      templateId: templateId,
      templateName: selectedTemplate?.name || null,
      channels: channels.map((ch) =>
        ch === 'portal' ? 'announcement' as const : ch === 'postal' ? 'mail' as const : 'email' as const,
      ),
      recipientUnit: audience === 'unit' ? chips[0] || unitTarget : null,
      recipientName: audience === 'unit' ? chips[0] || unitTarget : null,
      recipientEmail: null,
      mailDeliveryMethod: channels.includes('postal') ? 'first-class' : null,
      mailLetterCount: channels.includes('postal') ? recipientCount : 0,
      announcementPriority: 'normal',
      caseId: null,
      stepIdx: null,
      source: 'compose',
      createdBy: currentUser?.name || 'Board',
    });

    onClose();
  };

  const canAdvance =
    step === 1
      ? audience !== 'unit' || chips.length > 0
      : step === 2
        ? subject.trim().length > 0
        : channels.length > 0;

  const primaryLabel =
    step < 3
      ? 'Next'
      : `Send to ${recipientCount} ${recipientCount === 1 ? 'recipient' : 'recipients'}`;

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      breadcrumb={['Board Room', 'Outbox', 'Compose']}
      title="New Communication"
      step={{ current: step, total: 3 }}
      footer={{
        primaryLabel,
        onPrimary: step < 3 ? () => setStep(step + 1) : handleSend,
        primaryDisabled: !canAdvance,
        secondaryLabel: step > 1 ? 'Back' : undefined,
        onSecondary: step > 1 ? () => setStep(step - 1) : undefined,
      }}
    >
      {/* Step 1: Who */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-ink-700">Who should receive this?</p>
          <div className="grid grid-cols-2 gap-3">
            {AUDIENCE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = audience === opt.kind;
              return (
                <button
                  key={opt.kind}
                  onClick={() => setAudience(opt.kind)}
                  className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                    active
                      ? 'border-navy bg-navy/5 ring-1 ring-navy'
                      : 'border-ink-200 hover:border-ink-300'
                  }`}
                >
                  <Icon size={18} className={active ? 'text-navy' : 'text-ink-400'} />
                  <span
                    className={`text-sm font-medium ${active ? 'text-navy' : 'text-ink-600'}`}
                  >
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>

          {audience === 'unit' && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-500 uppercase tracking-wider">
                Unit or owner name
              </label>
              <div className="flex flex-wrap gap-1.5 rounded-lg border border-ink-200 p-2 min-h-[40px]">
                {chips.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 bg-navy/10 text-navy text-xs rounded-full px-2.5 py-1 font-medium"
                  >
                    {c}
                    <button onClick={() => removeChip(c)} className="hover:text-red-500">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <input
                  value={unitTarget}
                  onChange={(e) => setUnitTarget(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && unitTarget.trim()) {
                      e.preventDefault();
                      addChip(unitTarget);
                    }
                  }}
                  placeholder="Type unit number or name..."
                  className="flex-1 min-w-[120px] text-sm outline-none bg-transparent"
                />
              </div>
              <p className="text-[10px] text-ink-400">Press Enter to add multiple recipients</p>
            </div>
          )}
        </div>
      )}

      {/* Step 2: What */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-ink-500 uppercase tracking-wider">
              Template (optional)
            </label>
            <select
              value={templateId || ''}
              onChange={(e) =>
                e.target.value ? handleTemplateSelect(e.target.value) : setTemplateId(null)
              }
              className="w-full mt-1 px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white"
            >
              <option value="">Blank message</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-ink-500 uppercase tracking-wider">
              Subject
            </label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
              className="w-full mt-1 px-3 py-2 border border-ink-200 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-ink-500 uppercase tracking-wider">
              Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              placeholder="Write your message..."
              className="w-full mt-1 px-3 py-2 border border-ink-200 rounded-lg text-sm"
            />
          </div>
        </div>
      )}

      {/* Step 3: How */}
      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-ink-700">Delivery channels</p>
          <div className="space-y-3">
            {([
              { ch: 'email' as Channel, label: 'Email', desc: 'Send via email to recipients', icon: Mail },
              { ch: 'postal' as Channel, label: 'Postal mail', desc: 'Print and mail via USPS', icon: Send },
              { ch: 'portal' as Channel, label: 'Portal post', desc: 'Post as an announcement on the portal', icon: Globe },
            ]).map(({ ch, label, desc, icon: Icon }) => {
              const active = channels.includes(ch);
              return (
                <button
                  key={ch}
                  onClick={() => toggleChannel(ch)}
                  className={`flex items-start gap-3 w-full rounded-xl border p-4 text-left transition-colors ${
                    active
                      ? 'border-navy bg-navy/5 ring-1 ring-navy'
                      : 'border-ink-200 hover:border-ink-300'
                  }`}
                >
                  <Icon size={18} className={active ? 'text-navy' : 'text-ink-400'} />
                  <div>
                    <p className={`text-sm font-medium ${active ? 'text-navy' : 'text-ink-600'}`}>
                      {label}
                    </p>
                    <p className="text-xs text-ink-400 mt-0.5">{desc}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="bg-mist-50 rounded-lg p-4 space-y-1">
            <p className="text-xs font-bold text-ink-700">Summary</p>
            <p className="text-xs text-ink-500">
              To: {audience === 'all_owners' ? 'All owners' : audience === 'board' ? 'Board members' : chips.join(', ')}
            </p>
            <p className="text-xs text-ink-500">Subject: {subject}</p>
            <p className="text-xs text-ink-500">
              Via: {channels.map((c) => c === 'postal' ? 'Postal mail' : c === 'portal' ? 'Portal' : 'Email').join(', ')}
            </p>
          </div>
        </div>
      )}
    </DrawerShell>
  );
}
