import { useState } from 'react';
import { useArchiveStore, type ArchiveSnapshot } from '@/store/useArchiveStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { refreshComplianceRequirements } from '@/lib/complianceRefresh';
import Modal from '@/components/ui/Modal';

const fmt = (n: number | undefined) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

type Section = 'overview' | 'compliance' | 'refresh' | 'filings' | 'meetings' | 'communications' | 'financial' | 'insurance' | 'legal' | 'board';

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'compliance', label: 'Compliance', icon: '✅' },
  { id: 'refresh', label: 'Regulatory Refresh', icon: '🔄' },
  { id: 'filings', label: 'Filings', icon: '📅' },
  { id: 'meetings', label: 'Meetings', icon: '🗓' },
  { id: 'communications', label: 'Communications', icon: '📨' },
  { id: 'financial', label: 'Fiscal Snapshot', icon: '💰' },
  { id: 'insurance', label: 'Insurance', icon: '🛡' },
  { id: 'legal', label: 'Legal Docs', icon: '⚖' },
  { id: 'board', label: 'Board', icon: '👥' },
];

export default function ArchivesPage() {
  const archiveStore = useArchiveStore();
  const { currentRole, currentUser } = useAuthStore();
  const comp = useComplianceStore();
  const mtg = useMeetingsStore();
  const building = useBuildingStore();
  const finStore = useFinancialStore();

  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('overview');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [archiveYear, setArchiveYear] = useState(String(new Date().getFullYear() - 1));
  const [lastRefreshResult, setLastRefreshResult] = useState<null | ReturnType<typeof refreshComplianceRequirements>>(null);

  const selected = archiveStore.archives.find(a => a.id === selectedId);

  // ─── Archive creation with regulatory refresh ───
  const handleCreateArchive = () => {
    const year = parseInt(archiveYear) || new Date().getFullYear() - 1;
    const pStart = `${year}-01-01`;
    const pEnd = `${year}-12-31`;

    // 1. Run regulatory refresh against current jurisdiction + documents
    const refreshResult = refreshComplianceRequirements({
      state: building.address.state,
      legalDocuments: building.legalDocuments.map(d => ({ name: d.name, status: d.status })),
      insurance: building.insurance.map(p => ({ type: p.type, expires: p.expires })),
      boardCount: building.board.length,
      hasManagement: !!building.management.company,
    });

    // 2. Compute health scores using refreshed categories
    const catScores = refreshResult.categories.map(c => {
      const passed = c.items.filter(i => comp.completions[i.id]).length;
      return { pct: c.items.length > 0 ? Math.round((passed / c.items.length) * 100) : 100, weight: c.weight };
    });
    const totalWeight = catScores.reduce((s, c) => s + c.weight, 0);
    const healthIndex = Math.round(catScores.reduce((s, c) => s + (c.pct * c.weight) / totalWeight, 0));
    const grade = healthIndex >= 90 ? 'A' : healthIndex >= 80 ? 'B' : healthIndex >= 70 ? 'C' : healthIndex >= 60 ? 'D' : 'F';

    // 3. Auto-update completions for items with autoPass
    refreshResult.categories.forEach(cat => {
      cat.items.forEach(item => {
        if (item.autoPass && !comp.completions[item.id]) {
          comp.setCompletion(item.id, true);
        }
      });
    });

    // 4. Build snapshot
    const metrics = finStore.getIncomeMetrics();
    const occupiedUnits = finStore.units.filter(u => u.status === 'OCCUPIED');
    const totalChecklistItems = refreshResult.categories.reduce((s, c) => s + c.items.length, 0);

    const snapshot: ArchiveSnapshot = {
      id: 'arc_' + Date.now(),
      label: `FY ${year} (Jan 1, ${year} – Dec 31, ${year})`,
      periodStart: pStart,
      periodEnd: pEnd,
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.name || 'Board Member',
      compliance: { runbookCompletions: { ...comp.completions }, healthIndex, grade },
      regulatoryRefresh: {
        refreshedAt: refreshResult.refreshedAt,
        jurisdiction: refreshResult.jurisdiction,
        documentsDetected: refreshResult.documentsDetected,
        regulatoryNotes: refreshResult.regulatoryNotes,
        categoryCount: refreshResult.categories.length,
        totalChecklistItems,
      },
      filings: comp.filings.filter(fi => fi.dueDate >= pStart && fi.dueDate <= pEnd).map(fi => ({ ...fi, attachments: [...fi.attachments] })),
      meetings: mtg.meetings.filter(m => m.date >= pStart && m.date <= pEnd).map(m => ({ ...m, votes: [...m.votes], attendees: { ...m.attendees }, agenda: [...m.agenda] })),
      communications: comp.communications.filter(c => c.date >= pStart && c.date <= pEnd).map(c => ({ ...c })),
      financial: {
        collectionRate: metrics.collectionRate || 0,
        totalBudgeted: metrics.annualExpected || 0,
        totalActual: metrics.annualCollected || 0,
        reserveBalance: 245000,
        totalAR: finStore.units.reduce((s, u) => s + u.balance, 0),
        monthlyRevenue: finStore.units.reduce((s, u) => s + u.monthlyFee, 0),
        unitCount: finStore.units.length,
        occupiedCount: occupiedUnits.length,
        delinquentCount: occupiedUnits.filter(u => u.balance > 0).length,
      },
      insurance: building.insurance.map(p => ({ type: p.type, carrier: p.carrier, policyNumber: p.policyNum, coverage: p.coverage, premium: p.premium, expires: p.expires, status: new Date(p.expires) > new Date(pEnd) ? 'active' : 'expired' })),
      legalDocuments: building.legalDocuments.map(d => ({ name: d.name, version: d.version, status: d.status, attachments: (d.attachments || []).map(a => ({ name: a.name, size: a.size })) })),
      board: building.board.map(b => ({ name: b.name, role: b.role, term: b.term })),
    };

    archiveStore.addArchive(snapshot);
    setLastRefreshResult(refreshResult);
    setShowCreateModal(false);
    alert(`✅ Archive created for FY ${year}.\n\nRegulatory refresh completed:\n• Jurisdiction: ${refreshResult.jurisdiction}\n• Documents detected: ${refreshResult.documentsDetected.length}\n• Compliance items: ${totalChecklistItems}\n• ${refreshResult.regulatoryNotes.length} regulatory notes\n• ${refreshResult.categories.filter(c => c.items.some(i => i.autoPass)).length} categories with auto-pass items updated`);
  };

  // ─── Header with Create Archive button ───
  const ArchiveHeader = ({ rounded = 'rounded-t-xl' }: { rounded?: string }) => (
    <div className={`bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 ${rounded} p-8 text-white shadow-sm`}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          {selectedId && <button onClick={() => setSelectedId(null)} className="text-accent-200 hover:text-white text-sm mb-2 inline-flex items-center gap-1">← Back to Archives</button>}
          <h2 className="font-display text-2xl font-bold">📦 The Archives</h2>
          <p className="text-accent-200 text-sm mt-1">
            {selected ? `${selected.label} · Created ${new Date(selected.createdAt).toLocaleDateString()} by ${selected.createdBy}` : archiveStore.archives.length > 0 ? `${archiveStore.archives.length} archived period${archiveStore.archives.length !== 1 ? 's' : ''} · Read-only historical records` : 'Historical compliance records and audit trail'}
          </p>
        </div>
        {isBoard && !selectedId && (
          <button onClick={() => { setArchiveYear(String(new Date().getFullYear() - 1)); setShowCreateModal(true); }} className="px-5 py-2.5 bg-white bg-opacity-15 hover:bg-opacity-25 text-white rounded-lg text-sm font-semibold border border-white border-opacity-25 transition-colors">
            📦 Create Archive
          </button>
        )}
      </div>
    </div>
  );

  // ─── Empty state ───
  if (archiveStore.archives.length === 0 && !showCreateModal) {
    return (
      <div className="space-y-0">
        <ArchiveHeader rounded="rounded-t-xl" />
        <div className="bg-white rounded-b-xl border-x border-b border-ink-100 p-12 text-center">
          <p className="text-5xl mb-4">📦</p>
          <h3 className="text-lg font-bold text-ink-900 mb-2">No archives yet</h3>
          <p className="text-sm text-ink-500 max-w-md mx-auto mb-6">
            {isBoard
              ? 'Create an annual archive to capture a permanent, read-only snapshot of all compliance, financial, and governance records for a fiscal year. A regulatory refresh is performed automatically to ensure requirements are current.'
              : 'Your board has not yet created any annual archives. Once they do, you\'ll be able to view all historical records here.'}
          </p>
          {isBoard && (
            <button onClick={() => { setArchiveYear(String(new Date().getFullYear() - 1)); setShowCreateModal(true); }} className="px-6 py-3 bg-ink-900 text-white rounded-lg text-sm font-semibold hover:bg-ink-800">
              📦 Create Your First Archive
            </button>
          )}
        </div>
        {showCreateModal && <CreateModal />}
      </div>
    );
  }

  // ─── Archive list view ───
  if (!selected) {
    return (
      <div className="space-y-0">
        <ArchiveHeader />
        <div className="bg-white rounded-b-xl border-x border-b border-ink-100 p-6">
          <div className="grid gap-4">
            {archiveStore.archives.map(a => (
              <div key={a.id} className="border border-ink-100 rounded-xl hover:border-accent-200 hover:shadow-sm transition-all cursor-pointer" onClick={() => { setSelectedId(a.id); setSection('overview'); }}>
                <div className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-accent-100 rounded-xl flex items-center justify-center text-2xl">📦</div>
                    <div>
                      <h3 className="font-bold text-ink-900">{a.label}</h3>
                      <p className="text-xs text-ink-500">Created {new Date(a.createdAt).toLocaleDateString()} by {a.createdBy}</p>
                      {a.regulatoryRefresh && <p className="text-[10px] text-accent-600 mt-0.5">🔄 Regulatory refresh: {a.regulatoryRefresh.jurisdiction} · {a.regulatoryRefresh.documentsDetected.length} docs detected · {a.regulatoryRefresh.totalChecklistItems} checklist items</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="grid grid-cols-4 gap-3">
                      <div className="text-center"><p className="text-xs text-ink-400">Health</p><p className="text-sm font-bold text-ink-900">{a.compliance.grade}</p></div>
                      <div className="text-center"><p className="text-xs text-ink-400">Meetings</p><p className="text-sm font-bold text-ink-900">{a.meetings.length}</p></div>
                      <div className="text-center"><p className="text-xs text-ink-400">Filings</p><p className="text-sm font-bold text-ink-900">{a.filings.length}</p></div>
                      <div className="text-center"><p className="text-xs text-ink-400">Comms</p><p className="text-sm font-bold text-ink-900">{a.communications.length}</p></div>
                    </div>
                    {isBoard && <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete this archive? This cannot be undone.')) archiveStore.deleteArchive(a.id); }} className="text-xs text-red-400 hover:text-red-600 ml-2">Delete</button>}
                    <span className="text-accent-400 text-lg">→</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {showCreateModal && <CreateModal />}
      </div>
    );
  }

  // ─── Archive detail view ───
  return (
    <div className="space-y-0">
      <ArchiveHeader />
      {/* Section Nav */}
      <div className="bg-white border-x border-ink-100 border-b overflow-x-auto">
        <div className="flex min-w-max px-4">
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)} className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${section === s.id ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-400 hover:text-ink-700'}`}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </div>
      {/* Body */}
      <div className="bg-white rounded-b-xl border-x border-b border-ink-100 p-6">

        {section === 'overview' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card label="Compliance Grade" val={selected.compliance.grade} sub={`${selected.compliance.healthIndex}%`} />
              <Card label="Meetings Held" val={String(selected.meetings.filter(m => m.status === 'COMPLETED').length)} sub={`${selected.meetings.length} total`} />
              <Card label="Filings Complete" val={String(selected.filings.filter(f => f.status === 'filed').length)} sub={`of ${selected.filings.length}`} />
              <Card label="Collection Rate" val={`${selected.financial.collectionRate}%`} sub={fmt(selected.financial.totalAR) + ' AR'} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card label="Budget" val={fmt(selected.financial.totalBudgeted)} sub={`Actual: ${fmt(selected.financial.totalActual)}`} />
              <Card label="Units" val={`${selected.financial.occupiedCount}/${selected.financial.unitCount}`} sub={`${selected.financial.delinquentCount} delinquent`} />
              <Card label="Insurance" val={String(selected.insurance.length)} sub={`${selected.insurance.filter(p => p.status === 'active').length} active`} />
              <Card label="Board Members" val={String(selected.board.length)} sub="" />
            </div>
            {selected.regulatoryRefresh && (
              <div className="bg-accent-50 border border-accent-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2"><span className="text-lg">🔄</span><h4 className="text-sm font-bold text-accent-800">Regulatory Refresh at Archive Time</h4></div>
                <p className="text-xs text-accent-700">Jurisdiction: <strong>{selected.regulatoryRefresh.jurisdiction}</strong> · {selected.regulatoryRefresh.categoryCount} categories · {selected.regulatoryRefresh.totalChecklistItems} checklist items · {selected.regulatoryRefresh.documentsDetected.length} documents detected</p>
                {selected.regulatoryRefresh.documentsDetected.length > 0 && <p className="text-xs text-accent-600 mt-1">Documents: {selected.regulatoryRefresh.documentsDetected.join(', ')}</p>}
              </div>
            )}
          </div>
        )}

        {section === 'compliance' && (
          <div className="space-y-3">
            <h3 className="font-display text-lg font-bold text-ink-900">Compliance Runbook Snapshot</h3>
            <div className="flex items-center gap-3 mb-4">
              <span className={`text-3xl font-bold ${selected.compliance.healthIndex >= 80 ? 'text-sage-600' : selected.compliance.healthIndex >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>{selected.compliance.grade}</span>
              <span className="text-sm text-ink-500">Health Index: {selected.compliance.healthIndex}%</span>
            </div>
            <div className="bg-mist-50 rounded-xl border border-mist-200 p-4 space-y-2">
              <p className="text-xs font-bold text-ink-800 mb-2">Checklist Item Status</p>
              {Object.entries(selected.compliance.runbookCompletions).map(([id, done]) => (
                <div key={id} className="flex items-center gap-2 text-xs">
                  <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] ${done ? 'bg-sage-100 text-sage-600' : 'bg-red-100 text-red-600'}`}>{done ? '✓' : '✗'}</span>
                  <span className="font-mono text-ink-500">{id}</span>
                  <span className={done ? 'text-sage-600' : 'text-red-600'}>{done ? 'Complete' : 'Incomplete'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {section === 'refresh' && (
          <div className="space-y-4">
            <h3 className="font-display text-lg font-bold text-ink-900">🔄 Regulatory Refresh Report</h3>
            {selected.regulatoryRefresh ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card label="Jurisdiction" val={selected.regulatoryRefresh.jurisdiction} sub="" />
                  <Card label="Categories" val={String(selected.regulatoryRefresh.categoryCount)} sub="" />
                  <Card label="Checklist Items" val={String(selected.regulatoryRefresh.totalChecklistItems)} sub="" />
                  <Card label="Docs Detected" val={String(selected.regulatoryRefresh.documentsDetected.length)} sub="" />
                </div>
                {selected.regulatoryRefresh.documentsDetected.length > 0 && (
                  <div className="bg-sage-50 border border-sage-200 rounded-xl p-4">
                    <p className="text-xs font-bold text-sage-800 mb-2">📄 Documents Detected</p>
                    <div className="flex flex-wrap gap-2">{selected.regulatoryRefresh.documentsDetected.map(d => <span key={d} className="text-xs bg-sage-100 text-sage-700 px-2.5 py-1 rounded-lg font-medium">✓ {d}</span>)}</div>
                    <p className="text-[10px] text-sage-600 mt-2">These documents were detected in Legal & Bylaws at archive time. Compliance checks were dynamically adjusted to reference them.</p>
                  </div>
                )}
                {selected.regulatoryRefresh.regulatoryNotes.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-xs font-bold text-amber-800 mb-2">📋 Regulatory Notes</p>
                    <div className="space-y-1.5">{selected.regulatoryRefresh.regulatoryNotes.map((n, i) => <p key={i} className="text-xs text-amber-700">{n}</p>)}</div>
                  </div>
                )}
                <p className="text-[10px] text-ink-400">Refresh performed: {new Date(selected.regulatoryRefresh.refreshedAt).toLocaleString()}</p>
              </>
            ) : (
              <p className="text-sm text-ink-400 p-4">No regulatory refresh data available for this archive (created before this feature).</p>
            )}
          </div>
        )}

        {section === 'filings' && (
          <div className="space-y-3">
            <h3 className="font-display text-lg font-bold text-ink-900">Filings & Deadlines ({selected.filings.length})</h3>
            {selected.filings.length === 0 ? <p className="text-sm text-ink-400 p-4">No filings for this period.</p> :
            <div className="bg-white rounded-xl border border-ink-100 divide-y divide-ink-50">
              {selected.filings.map(fi => (
                <div key={fi.id} className={`p-4 ${fi.status === 'filed' ? 'bg-sage-50 bg-opacity-50' : 'bg-red-50 bg-opacity-30'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-ink-900">{fi.name}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${fi.status === 'filed' ? 'bg-sage-100 text-sage-700' : 'bg-red-100 text-red-700'}`}>{fi.status === 'filed' ? '✓ Filed' : 'Not Filed'}</span>
                  </div>
                  <p className="text-xs text-ink-500 mt-1">Due: {fi.dueDate} · {fi.responsible}{fi.filedDate ? ` · Filed: ${fi.filedDate}` : ''}{fi.confirmationNum ? ` · Ref: ${fi.confirmationNum}` : ''}</p>
                  {fi.attachments.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{fi.attachments.map(att => <span key={att.name} className="text-[10px] bg-mist-50 border border-mist-200 rounded px-2 py-0.5">📎 {att.name} ({att.size})</span>)}</div>}
                </div>
              ))}
            </div>}
          </div>
        )}

        {section === 'meetings' && (
          <div className="space-y-3">
            <h3 className="font-display text-lg font-bold text-ink-900">Meetings ({selected.meetings.length})</h3>
            {selected.meetings.length === 0 ? <p className="text-sm text-ink-400 p-4">No meetings for this period.</p> :
            <div className="space-y-4">
              {selected.meetings.sort((a, b) => b.date.localeCompare(a.date)).map(m => (
                <div key={m.id} className="border border-ink-100 rounded-xl overflow-hidden">
                  <div className="p-4 bg-mist-50">
                    <div className="flex items-center gap-2"><h4 className="font-bold text-ink-900">{m.title}</h4><span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${m.status === 'COMPLETED' ? 'bg-sage-100 text-sage-700' : 'bg-accent-100 text-accent-700'}`}>{m.status}</span><span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-100 text-ink-600">{m.type}</span></div>
                    <p className="text-xs text-ink-500 mt-1">{m.date} · {m.time} · {m.location}</p>
                  </div>
                  <div className="p-4 space-y-3">
                    {m.agenda.length > 0 && <div><p className="text-xs font-bold text-ink-700 mb-1">Agenda</p><ul className="text-xs text-ink-600 space-y-0.5">{m.agenda.map((a, i) => <li key={i}>• {a}</li>)}</ul></div>}
                    {m.attendees.board.length > 0 && <div><p className="text-xs font-bold text-ink-700 mb-1">Board Attendees</p><p className="text-xs text-ink-600">{m.attendees.board.join(', ')}</p></div>}
                    {m.attendees.owners.length > 0 && <div><p className="text-xs font-bold text-ink-700 mb-1">Owner Attendees</p><p className="text-xs text-ink-600">{m.attendees.owners.join(', ')}</p></div>}
                    {m.attendees.guests.length > 0 && <div><p className="text-xs font-bold text-ink-700 mb-1">Guests</p><p className="text-xs text-ink-600">{m.attendees.guests.join(', ')}</p></div>}
                    {m.minutes && <div><p className="text-xs font-bold text-ink-700 mb-1">Minutes</p><pre className="text-xs text-ink-600 whitespace-pre-wrap bg-white rounded-lg border border-ink-100 p-3">{m.minutes}</pre></div>}
                    {m.votes.length > 0 && <div><p className="text-xs font-bold text-ink-700 mb-1">Votes ({m.votes.length})</p><div className="space-y-2">{m.votes.map(v => (
                      <div key={v.id} className="bg-white border border-ink-100 rounded-lg p-3">
                        <div className="flex items-center gap-2"><p className="text-xs font-medium text-ink-900">{v.motion}</p><span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${v.status === 'passed' ? 'bg-sage-100 text-sage-700' : 'bg-red-100 text-red-700'}`}>{v.status}</span></div>
                        <p className="text-[10px] text-ink-400 mt-1">Approve: {v.tally.approve} · Deny: {v.tally.deny} · Abstain: {v.tally.abstain}</p>
                        {v.results.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{v.results.map((r, ri) => <span key={ri} className={`text-[10px] px-1.5 py-0.5 rounded ${r.vote === 'approve' ? 'bg-sage-50 text-sage-700' : r.vote === 'deny' ? 'bg-red-50 text-red-700' : 'bg-ink-50 text-ink-500'}`}>{r.name}: {r.vote}</span>)}</div>}
                      </div>
                    ))}</div></div>}
                  </div>
                </div>
              ))}
            </div>}
          </div>
        )}

        {section === 'communications' && (
          <div className="space-y-3">
            <h3 className="font-display text-lg font-bold text-ink-900">Communications ({selected.communications.length})</h3>
            {selected.communications.length === 0 ? <p className="text-sm text-ink-400 p-4">No communications.</p> :
            <div className="bg-white rounded-xl border border-ink-100 divide-y divide-ink-50">{selected.communications.map(c => (
              <div key={c.id} className="p-4">
                <div className="flex items-center gap-2 flex-wrap"><p className="text-sm font-medium text-ink-900">{c.subject}</p><span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-100 text-ink-600">{c.type}</span><span className={`text-[10px] px-1.5 py-0.5 rounded ${c.status === 'sent' ? 'bg-sage-100 text-sage-700' : 'bg-yellow-100 text-yellow-700'}`}>{c.status}</span></div>
                <p className="text-xs text-ink-500 mt-1">{c.date} · {c.method} · {c.recipients}</p>
                {c.notes && <p className="text-xs text-ink-400 mt-1">{c.notes}</p>}
              </div>
            ))}</div>}
          </div>
        )}

        {section === 'financial' && (
          <div className="space-y-4">
            <h3 className="font-display text-lg font-bold text-ink-900">Fiscal Lens Snapshot</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Card label="Collection Rate" val={`${selected.financial.collectionRate}%`} sub="" />
              <Card label="Total Budgeted" val={fmt(selected.financial.totalBudgeted)} sub="" />
              <Card label="Total Actual" val={fmt(selected.financial.totalActual)} sub={`Variance: ${fmt(selected.financial.totalBudgeted - selected.financial.totalActual)}`} />
              <Card label="Reserve Balance" val={fmt(selected.financial.reserveBalance)} sub="" />
              <Card label="Total Receivable" val={fmt(selected.financial.totalAR)} sub="" />
              <Card label="Monthly Revenue" val={fmt(selected.financial.monthlyRevenue)} sub="" />
              <Card label="Units" val={`${selected.financial.occupiedCount}/${selected.financial.unitCount}`} sub="Occupied / Total" />
              <Card label="Delinquent" val={String(selected.financial.delinquentCount)} sub={`${selected.financial.occupiedCount > 0 ? Math.round((selected.financial.delinquentCount / selected.financial.occupiedCount) * 100) : 0}% rate`} />
            </div>
          </div>
        )}

        {section === 'insurance' && (
          <div className="space-y-3">
            <h3 className="font-display text-lg font-bold text-ink-900">Insurance Policies ({selected.insurance.length})</h3>
            {selected.insurance.length === 0 ? <p className="text-sm text-ink-400 p-4">No insurance records.</p> :
            <div className="bg-white rounded-xl border border-ink-100 divide-y divide-ink-50">{selected.insurance.map((p, i) => (
              <div key={i} className="p-4">
                <div className="flex items-center gap-2"><p className="text-sm font-bold text-ink-900">{p.type}</p><span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${p.status === 'active' ? 'bg-sage-100 text-sage-700' : 'bg-red-100 text-red-700'}`}>{p.status}</span></div>
                <p className="text-xs text-ink-500 mt-1">{p.carrier} · Policy #{p.policyNumber} · Coverage: {p.coverage} · Premium: {p.premium} · Expires: {p.expires}</p>
              </div>
            ))}</div>}
          </div>
        )}

        {section === 'legal' && (
          <div className="space-y-3">
            <h3 className="font-display text-lg font-bold text-ink-900">Legal & Governing Documents ({selected.legalDocuments.length})</h3>
            {selected.legalDocuments.length === 0 ? <p className="text-sm text-ink-400 p-4">No documents.</p> :
            <div className="bg-white rounded-xl border border-ink-100 divide-y divide-ink-50">{selected.legalDocuments.map((d, i) => (
              <div key={i} className="p-4">
                <div className="flex items-center gap-2"><p className="text-sm font-bold text-ink-900">{d.name}</p><span className="text-xs text-ink-400">v{d.version}</span><span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${d.status === 'current' ? 'bg-sage-100 text-sage-700' : 'bg-yellow-100 text-yellow-700'}`}>{d.status}</span></div>
                {d.attachments.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{d.attachments.map(att => <span key={att.name} className="text-[10px] bg-mist-50 border border-mist-200 rounded px-2 py-0.5">📎 {att.name} ({att.size})</span>)}</div>}
              </div>
            ))}</div>}
          </div>
        )}

        {section === 'board' && (
          <div className="space-y-3">
            <h3 className="font-display text-lg font-bold text-ink-900">Board Composition ({selected.board.length})</h3>
            {selected.board.length === 0 ? <p className="text-sm text-ink-400 p-4">No board data.</p> :
            <div className="bg-white rounded-xl border border-ink-100 divide-y divide-ink-50">{selected.board.map((b, i) => (
              <div key={i} className="p-4 flex items-center justify-between">
                <div><p className="text-sm font-bold text-ink-900">{b.name}</p><p className="text-xs text-ink-500">{b.role}</p></div>
                <span className="text-xs text-ink-400">Term: {b.term}</span>
              </div>
            ))}</div>}
          </div>
        )}
      </div>
      {showCreateModal && <CreateModal />}
    </div>
  );

  // ─── Create Archive Modal (inline component) ───
  function CreateModal() {
    return (
      <Modal title="📦 Create Annual Archive" onClose={() => setShowCreateModal(false)} onSave={handleCreateArchive} saveLabel="Create Archive">
        <div className="space-y-4">
          <p className="text-sm text-ink-700">Create a permanent read-only snapshot of all compliance, financial, and governance records for a fiscal year.</p>

          <div className="bg-accent-50 border border-accent-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2"><span className="text-lg">🔄</span><h4 className="text-sm font-bold text-accent-800">Automatic Regulatory Refresh</h4></div>
            <p className="text-xs text-accent-700">When you create this archive, the system will automatically check current local regulations for <strong>{building.address.state}</strong> and cross-reference all uploaded legal and bylaw documents to ensure compliance requirements are accurate and up to date. Auto-pass checklist items will be updated based on detected documents.</p>
          </div>

          <div><label className="block text-xs font-medium text-ink-700 mb-1">Fiscal Year</label><select value={archiveYear} onChange={e => setArchiveYear(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{[2025,2024,2023].map(y => <option key={y} value={y}>FY {y} (Jan 1 – Dec 31, {y})</option>)}</select></div>

          <div className="bg-mist-50 border border-mist-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold text-ink-900">What gets archived:</p>
            {[
              { icon: '✅', label: 'Compliance Runbook', desc: 'All checklist completions and health score' },
              { icon: '🔄', label: 'Regulatory Refresh', desc: 'Jurisdiction check, detected documents, updated requirements' },
              { icon: '📅', label: 'Filings & Deadlines', desc: 'All filings with statuses and attached proof documents' },
              { icon: '🗓', label: 'Meetings', desc: 'Agendas, minutes, attendance records, and vote results' },
              { icon: '📨', label: 'Communications', desc: 'Owner communication log with type, method, and status' },
              { icon: '💰', label: 'Fiscal Lens Snapshot', desc: 'Collection rate, budget vs actual, reserve balance, receivables' },
              { icon: '🛡', label: 'Insurance Policies', desc: 'All policies with carrier, coverage, and expiration' },
              { icon: '⚖', label: 'Legal & Governing Documents', desc: 'Document versions and attached files' },
              { icon: '👥', label: 'Board Composition', desc: 'Board members, roles, and terms during the period' },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-2"><span className="text-sm">{item.icon}</span><div><span className="text-xs font-semibold text-ink-800">{item.label}</span><span className="text-xs text-ink-400 ml-1">— {item.desc}</span></div></div>
            ))}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3"><p className="text-xs text-amber-800"><strong>Note:</strong> Archives are read-only snapshots visible to all users (including residents) in The Archives module for transparency and auditing.</p></div>
        </div>
      </Modal>
    );
  }
}

function Card({ label, val, sub }: { label: string; val: string; sub: string }) {
  return (
    <div className="bg-mist-50 rounded-lg p-3 border border-mist-100">
      <p className="text-[11px] text-ink-400">{label}</p>
      <p className="text-lg font-bold text-ink-900 mt-0.5">{val}</p>
      {sub && <p className="text-[10px] text-ink-400">{sub}</p>}
    </div>
  );
}

