/**
 * CasesTab — Board Room tab showing Open (count), Requests (count of issues
 * with status SUBMITTED), and Closed segments.
 *
 * Left column: case rows. Right column: selected case's CasePage inline (desktop).
 * "Open a case" button top-right opens OpenCaseDrawer blank.
 */

import { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Calendar,
  ChevronRight,
} from 'lucide-react';
import { useIssuesStore, CATS, APPR_LABELS, APPR_COLORS, PRIO_COLORS } from '@/store/useIssuesStore';
import CasePage from '@/features/issues/CasePage';
import OpenCaseDrawer from '@/features/issues/OpenCaseDrawer';
import RequestDrawer from '@/features/issues/RequestDrawer';
import type { CaseTrackerCase } from '@/types/issues';
import { BOARD_ROLE_LABELS, type BoardRoleKey } from '@/types/auth';

type Segment = 'open' | 'requests' | 'closed';

function DuePill({ date }: { date?: string }) {
  if (!date) return null;
  const d = new Date(date + 'T00:00:00');
  const now = new Date();
  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const color =
    diff < 0
      ? 'bg-red-100 text-red-700'
      : diff <= 7
      ? 'bg-amber-100 text-amber-700'
      : 'bg-ink-100 text-ink-600';
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium ${color}`}>
      <Calendar size={9} />
      {diff < 0 ? `${Math.abs(diff)}d over` : diff === 0 ? 'Today' : `${diff}d`}
    </span>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  return (
    <div className="h-1 bg-ink-100 rounded-full w-16">
      <div
        className="h-full bg-accent-500 rounded-full transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function CasesTab() {
  const { cases, issues } = useIssuesStore();
  const [segment, setSegment] = useState<Segment>('open');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [requestDrawerOpen, setRequestDrawerOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  // Filtered data
  const openCases = useMemo(
    () => cases.filter(c => c.status === 'open' || c.status === 'on-hold'),
    [cases],
  );
  const closedCases = useMemo(
    () => cases.filter(c => c.status === 'closed'),
    [cases],
  );
  const submittedRequests = useMemo(
    () => issues.filter(i => i.status === 'SUBMITTED'),
    [issues],
  );

  // Current list based on segment
  const currentCases = useMemo(() => {
    const list = segment === 'open' ? openCases : segment === 'closed' ? closedCases : [];
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(c => c.title.toLowerCase().includes(q));
  }, [segment, openCases, closedCases, search]);

  const filteredRequests = useMemo(() => {
    if (segment !== 'requests') return [];
    if (!search) return submittedRequests;
    const q = search.toLowerCase();
    return submittedRequests.filter(r => r.title.toLowerCase().includes(q));
  }, [segment, submittedRequests, search]);

  // Auto-select first case
  const selected = currentCases.find(c => c.id === selectedCaseId) || currentCases[0];

  return (
    <div className="space-y-4">
      {/* Top bar: segments + open case button */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 bg-ink-50 rounded-lg p-0.5">
          {([
            { key: 'open' as Segment, label: 'Open', count: openCases.length },
            { key: 'requests' as Segment, label: 'Requests', count: submittedRequests.length },
            { key: 'closed' as Segment, label: 'Closed', count: closedCases.length },
          ]).map(seg => (
            <button
              key={seg.key}
              onClick={() => { setSegment(seg.key); setSelectedCaseId(null); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                segment === seg.key
                  ? 'bg-white text-ink-900 shadow-sm'
                  : 'text-ink-500 hover:text-ink-700'
              }`}
            >
              {seg.label}
              {seg.count > 0 && (
                <span className="ml-1 text-[10px] text-ink-400">({seg.count})</span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-medium hover:bg-ink-800 transition-colors"
        >
          <Plus size={14} />
          Open a case
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={segment === 'requests' ? 'Search requests...' : 'Search cases...'}
          className="w-full pl-9 pr-3 py-2 border border-ink-200 rounded-lg text-sm"
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left: case/request list */}
        <div className="lg:col-span-2 space-y-1.5 max-h-[calc(100vh-300px)] overflow-y-auto">
          {segment === 'requests' ? (
            filteredRequests.length > 0 ? (
              filteredRequests.map(req => (
                <button
                  key={req.id}
                  onClick={() => { setSelectedRequestId(req.id); setRequestDrawerOpen(true); }}
                  className="w-full text-left p-3 rounded-lg border border-ink-200 hover:border-ink-300 transition-colors"
                >
                  <p className="text-sm font-medium text-ink-800 truncate">{req.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-ink-400">{req.category}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                      req.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                      req.priority === 'URGENT' ? 'bg-red-100 text-red-700' :
                      'bg-ink-100 text-ink-500'
                    }`}>
                      {req.priority}
                    </span>
                    <span className="text-[10px] text-ink-400">{req.reporterName}</span>
                  </div>
                </button>
              ))
            ) : (
              <p className="text-center text-sm text-ink-400 py-8">No pending requests.</p>
            )
          ) : (
            currentCases.length > 0 ? (
              currentCases.map(c => (
                <CaseRow
                  key={c.id}
                  caseData={c}
                  isSelected={selected?.id === c.id}
                  onClick={() => setSelectedCaseId(c.id)}
                />
              ))
            ) : (
              <p className="text-center text-sm text-ink-400 py-8">
                {segment === 'open' ? 'No open cases.' : 'No closed cases.'}
              </p>
            )
          )}
        </div>

        {/* Right: selected case detail (desktop) */}
        <div className="hidden lg:block lg:col-span-3">
          {selected && segment !== 'requests' ? (
            <CasePage caseId={selected.id} inline />
          ) : (
            <div className="flex items-center justify-center py-12 text-sm text-ink-400">
              {segment === 'requests'
                ? 'Tap a request to view details.'
                : 'Select a case to view details.'}
            </div>
          )}
        </div>
      </div>

      {/* Open Case Drawer */}
      {drawerOpen && (
        <OpenCaseDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {/* Request Drawer */}
      {requestDrawerOpen && selectedRequestId && (
        <RequestDrawer
          open={requestDrawerOpen}
          onClose={() => { setRequestDrawerOpen(false); setSelectedRequestId(null); }}
          requestId={selectedRequestId}
          onReply={() => { setRequestDrawerOpen(false); }}
          onMakeCase={(request) => {
            setRequestDrawerOpen(false);
            setDrawerOpen(true);
          }}
        />
      )}
    </div>
  );
}

// ── Case Row ─────────────────────────────────────────────────────────

function CaseRow({
  caseData,
  isSelected,
  onClick,
}: {
  caseData: CaseTrackerCase;
  isSelected: boolean;
  onClick: () => void;
}) {
  const cat = CATS.find(c => c.id === caseData.catId);
  const sit = cat?.sits.find(s => s.id === caseData.sitId);
  const steps = caseData.steps || [];
  const doneSteps = steps.filter(s => s.done).length;
  const totalSteps = steps.length;
  const currentStepIdx = steps.findIndex(s => !s.done);
  const currentStep = currentStepIdx >= 0 ? steps[currentStepIdx] : null;

  const ownerRole = caseData.assignedRole
    ? BOARD_ROLE_LABELS[caseData.assignedRole as BoardRoleKey] || caseData.assignedRole
    : '';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        isSelected
          ? 'border-accent-300 bg-accent-50'
          : 'border-ink-200 hover:border-ink-300 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink-800 truncate">{caseData.title}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {sit && (
              <span className="text-[10px] text-ink-400 truncate max-w-[120px]">
                {sit.title}
              </span>
            )}
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border ${APPR_COLORS[caseData.approach]}`}>
              {APPR_LABELS[caseData.approach]}
            </span>
          </div>
        </div>
        <ChevronRight size={14} className="text-ink-300 shrink-0 mt-1" />
      </div>

      <div className="flex items-center gap-2 mt-2">
        {currentStep && (
          <span className="text-[10px] text-ink-500 truncate flex-1">
            Step {currentStepIdx + 1} of {totalSteps}: {currentStep.s.slice(0, 40)}
            {currentStep.s.length > 40 ? '...' : ''}
          </span>
        )}
        {!currentStep && totalSteps > 0 && (
          <span className="text-[10px] text-sage-600">All steps complete</span>
        )}
      </div>

      <div className="flex items-center gap-2 mt-1.5">
        {ownerRole && (
          <span className="text-[9px] text-ink-400">{ownerRole}</span>
        )}
        <DuePill date={caseData.dueDate} />
        {totalSteps > 0 && <ProgressBar done={doneSteps} total={totalSteps} />}
      </div>
    </button>
  );
}
