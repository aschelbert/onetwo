/**
 * OpenCaseDrawer — three-step "Open a case" flow:
 *   Step 1 (Kind): situationGuess ranks CATS situations; top 3 chips + 10 category chips + "Something else"
 *   Step 2 (How): approach options with step counts; recommended = pre-legal unless amount > spendingLimit
 *   Step 3 (Who): board member chips; default the role whose charter covers the situation
 *
 * Reachable from six entry points via prefill prop.
 */

import { useState, useMemo } from 'react';
import {
  Search,
  ChevronRight,
  Briefcase,
  Scale,
  Shield,
} from 'lucide-react';
import DrawerShell from '@/components/ui/DrawerShell';
import { useIssuesStore, CATS, APPR_LABELS } from '@/store/useIssuesStore';
import { useAuthStore } from '@/store/useAuthStore';
import { BOARD_ROLE_LABELS, type BoardRoleKey } from '@/types/auth';
import { situationGuess } from './situationGuess';
import type { CaseApproach, CasePriority } from '@/types/issues';

export interface OpenCaseDrawerPrefill {
  text?: string;
  situationId?: string;
  catId?: string;
  unit?: string;
  reporter?: string;
  vendorId?: string;
  insurancePolicyId?: string;
  assetId?: string;
  meetingId?: string;
  source?: string;
  sourceId?: string;
}

interface OpenCaseDrawerProps {
  open: boolean;
  onClose: () => void;
  prefill?: OpenCaseDrawerPrefill;
}

const APPROACH_ICONS: Record<string, React.ReactNode> = {
  pre: <Briefcase size={16} />,
  self: <Shield size={16} />,
  legal: <Scale size={16} />,
};

const APPROACH_DESCRIPTIONS: Record<string, string> = {
  pre: 'Board handles with standard processes',
  self: 'Board represents itself with documentation',
  legal: 'Engage legal counsel for formal proceedings',
};

/**
 * Map CATS category ids to typical board roles that own those areas.
 */
const CAT_ROLE_MAP: Record<string, BoardRoleKey> = {
  financial: 'treasurer',
  maintenance: 'president',
  enforcement: 'president',
  governance: 'secretary',
  insurance: 'treasurer',
  vendor: 'president',
  emergency: 'president',
  strategic: 'president',
};

export default function OpenCaseDrawer({ open, onClose, prefill }: OpenCaseDrawerProps) {
  const store = useIssuesStore();
  const { buildingMembers, currentUser } = useAuthStore();
  const board = buildingMembers.filter(m => m.role === 'BOARD_MEMBER' && m.status === 'active');

  // Steps: 1=kind, 2=how, 3=who
  const [step, setStep] = useState(1);

  // Step 1: situation selection
  const [searchText, setSearchText] = useState(prefill?.text || '');
  const [selectedCatId, setSelectedCatId] = useState(prefill?.catId || '');
  const [selectedSitId, setSelectedSitId] = useState(prefill?.situationId || '');
  const [title, setTitle] = useState(prefill?.text || '');
  const [isCustomSituation, setIsCustomSituation] = useState(false);

  // Step 2: approach
  const [approach, setApproach] = useState<CaseApproach>('pre');

  // Step 3: who
  const [assignedMemberId, setAssignedMemberId] = useState('');
  const [unit, setUnit] = useState(prefill?.unit || '');
  const [priority, setPriority] = useState<CasePriority>('medium');

  // Situation matches
  const matches = useMemo(() => situationGuess(searchText), [searchText]);
  const topMatches = matches.filter(m => m.score > 0).slice(0, 3);

  // Selected situation data
  const selectedCat = CATS.find(c => c.id === selectedCatId);
  const selectedSit = selectedCat?.sits.find(s => s.id === selectedSitId);

  // Approach step counts
  const approachOptions = useMemo(() => {
    if (!selectedSit) return [];
    const opts: { key: CaseApproach; label: string; steps: number; recommended: boolean }[] = [];
    if (selectedSit.pre.length > 0) {
      opts.push({ key: 'pre', label: 'Pre-Legal', steps: selectedSit.pre.length, recommended: true });
    }
    if (selectedSit.self.length > 0) {
      opts.push({ key: 'self', label: 'Self-Represented', steps: selectedSit.self.length, recommended: false });
    }
    if (selectedSit.legal.length > 0) {
      opts.push({ key: 'legal', label: 'Legal Counsel', steps: selectedSit.legal.length, recommended: false });
    }
    return opts;
  }, [selectedSit]);

  // Default role for selected category
  const defaultRole = selectedCatId ? (CAT_ROLE_MAP[selectedCatId] || 'president') : 'president';

  // Set default member when reaching step 3
  const ensureDefaultMember = () => {
    if (!assignedMemberId && board.length > 0) {
      const defaultMember = board.find(m => m.roleKey === defaultRole) || board[0];
      setAssignedMemberId(defaultMember.id);
    }
  };

  const selectSituation = (catId: string, sitId: string) => {
    setSelectedCatId(catId);
    setSelectedSitId(sitId);
    setIsCustomSituation(false);
    const cat = CATS.find(c => c.id === catId);
    const sit = cat?.sits.find(s => s.id === sitId);
    if (sit && !title) setTitle(sit.title);
    setStep(2);
  };

  const selectCategory = (catId: string) => {
    setSelectedCatId(catId);
    // Show situations for this category
  };

  const handleNext = () => {
    if (step === 1) {
      if (!selectedSitId && !isCustomSituation) return;
      setStep(2);
    } else if (step === 2) {
      ensureDefaultMember();
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleOpenCase = () => {
    const assignedMember = board.find(m => m.id === assignedMemberId);
    const caseId = store.createCase({
      catId: selectedCatId || 'governance',
      sitId: selectedSitId || 'custom',
      approach,
      title: title || 'New Case',
      unit,
      owner: prefill?.reporter || currentUser.name,
      priority,
      notes: '',
      assignedTo: assignedMember?.name || currentUser.name,
      assignedRole: assignedMember?.roleKey || defaultRole,
      source: prefill?.source,
      sourceId: prefill?.sourceId,
    });
    onClose();
  };

  const canProceed = step === 1
    ? (selectedSitId !== '' || isCustomSituation)
    : step === 2
    ? true
    : true;

  const primaryLabel = step === 3 ? 'Open case' : 'Next';
  const handlePrimary = step === 3 ? handleOpenCase : handleNext;

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      breadcrumb={['Cases', 'Open a Case']}
      title={step === 1 ? 'What kind of situation?' : step === 2 ? 'How should the board handle it?' : 'Who owns this case?'}
      step={{ current: step, total: 3 }}
      footer={{
        primaryLabel,
        onPrimary: handlePrimary,
        primaryDisabled: !canProceed,
        secondaryLabel: step > 1 ? 'Back' : undefined,
        onSecondary: step > 1 ? handleBack : undefined,
      }}
    >
      {/* Step 1: Kind */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Describe what happened..."
              className="w-full pl-9 pr-3 py-2.5 border border-ink-200 rounded-lg text-sm"
              autoFocus
            />
          </div>

          {/* Title field */}
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1">Case title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief title for this case"
              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
            />
          </div>

          {/* Top matches */}
          {topMatches.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-ink-500 uppercase tracking-wide mb-2">
                Best matches
              </p>
              <div className="flex flex-wrap gap-2">
                {topMatches.map((m) => (
                  <button
                    key={`${m.catId}-${m.sitId}`}
                    onClick={() => selectSituation(m.catId, m.sitId)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      selectedSitId === m.sitId
                        ? 'border-accent-400 bg-accent-50 text-accent-700'
                        : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300'
                    }`}
                  >
                    {m.sitTitle}
                    <span className="ml-1 text-ink-400">{m.catLabel}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category chips */}
          <div>
            <p className="text-[10px] font-bold text-ink-500 uppercase tracking-wide mb-2">
              Or choose a category
            </p>
            <div className="flex flex-wrap gap-2">
              {CATS.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => selectCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    selectedCatId === cat.id
                      ? 'border-accent-400 bg-accent-50 text-accent-700'
                      : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
              <button
                onClick={() => {
                  setIsCustomSituation(true);
                  setSelectedCatId('governance');
                  setSelectedSitId('');
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  isCustomSituation
                    ? 'border-accent-400 bg-accent-50 text-accent-700'
                    : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300'
                }`}
              >
                Something else
              </button>
            </div>
          </div>

          {/* Situations within selected category */}
          {selectedCatId && !selectedSitId && !isCustomSituation && (
            <div>
              <p className="text-[10px] font-bold text-ink-500 uppercase tracking-wide mb-2">
                Situations in {selectedCat?.label}
              </p>
              <div className="space-y-1.5">
                {selectedCat?.sits.map((sit) => (
                  <button
                    key={sit.id}
                    onClick={() => selectSituation(selectedCatId, sit.id)}
                    className="w-full text-left px-3 py-2.5 rounded-lg border border-ink-200 hover:border-ink-300 transition-colors"
                  >
                    <p className="text-sm font-medium text-ink-800">{sit.title}</p>
                    <p className="text-xs text-ink-500 mt-0.5 line-clamp-1">{sit.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 2: How */}
      {step === 2 && (
        <div className="space-y-4">
          {selectedSit && (
            <div className="px-3 py-2 bg-ink-50 rounded-lg text-xs text-ink-600">
              <span className="font-medium">{selectedSit.title}</span> — {selectedSit.desc}
            </div>
          )}

          <div className="space-y-2">
            {approachOptions.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setApproach(opt.key)}
                className={`w-full text-left p-4 rounded-lg border transition-colors ${
                  approach === opt.key
                    ? 'border-accent-400 bg-accent-50'
                    : 'border-ink-200 hover:border-ink-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="shrink-0 text-ink-500">
                    {APPROACH_ICONS[opt.key]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink-800">{opt.label}</span>
                      <span className="text-[10px] text-ink-400">{opt.steps} steps</span>
                      {opt.recommended && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sage-100 text-sage-700">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {APPROACH_DESCRIPTIONS[opt.key]}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-ink-300 shrink-0" />
                </div>
              </button>
            ))}

            {isCustomSituation && (
              <div className="px-3 py-2 bg-ink-50 rounded-lg text-xs text-ink-500">
                Custom situation — the board will define steps as the case progresses.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Who */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-bold text-ink-500 uppercase tracking-wide mb-2">
              Assign to board member
            </p>
            <div className="flex flex-wrap gap-2">
              {board.map((member) => (
                <button
                  key={member.id}
                  onClick={() => setAssignedMemberId(member.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    assignedMemberId === member.id
                      ? 'border-accent-400 bg-accent-50 text-accent-700'
                      : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300'
                  }`}
                >
                  {member.name}
                  {member.roleKey && (
                    <span className="ml-1 text-ink-400">
                      {BOARD_ROLE_LABELS[member.roleKey]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Unit */}
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1">Related unit (optional)</label>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g. 302"
              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1">Priority</label>
            <div className="flex gap-2">
              {(['low', 'medium', 'high', 'urgent'] as CasePriority[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors capitalize ${
                    priority === p
                      ? 'border-accent-400 bg-accent-50 text-accent-700'
                      : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="p-3 bg-ink-50 rounded-lg space-y-1.5">
            <p className="text-xs font-bold text-ink-600">Case summary</p>
            <p className="text-sm text-ink-800">{title || 'Untitled Case'}</p>
            <div className="flex items-center gap-2 text-xs text-ink-500">
              {selectedSit && <span>{selectedSit.title}</span>}
              <span>{APPR_LABELS[approach]}</span>
              <span className="capitalize">{priority}</span>
              {unit && <span>Unit {unit}</span>}
            </div>
          </div>
        </div>
      )}
    </DrawerShell>
  );
}
