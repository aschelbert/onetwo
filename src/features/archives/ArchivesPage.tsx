import { useState } from 'react';
import { useArchiveStore, type ArchiveSnapshot } from '@/store/useArchiveStore';
import { useAuthStore } from '@/store/useAuthStore';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

type Section = 'overview' | 'compliance' | 'filings' | 'meetings' | 'communications' | 'financial' | 'insurance' | 'legal' | 'board';

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'compliance', label: 'Compliance Runbook', icon: '✅' },
  { id: 'filings', label: 'Filings & Deadlines', icon: '📅' },
  { id: 'meetings', label: 'Meetings', icon: '🗓' },
  { id: 'communications', label: 'Communications', icon: '📨' },
  { id: 'financial', label: 'Fiscal Snapshot', icon: '💰' },
  { id: 'insurance', label: 'Insurance', icon: '🛡' },
  { id: 'legal', label: 'Legal Documents', icon: '⚖' },
  { id: 'board', label: 'Board Composition', icon: '👥' },
];

export default function ArchivesPage() {
  const { archives, deleteArchive } = useArchiveStore();
  const { currentRole } = useAuthStore();
  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('overview');

  const selected = archives.find(a => a.id === selectedId);

  if (archives.length === 0) {
    return (
      <div className="space-y-0">
        <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-xl p-8 text-white shadow-sm">
          <h2 className="font-display text-2xl font-bold">📦 The Archives</h2>
          <p className="text-accent-200 text-sm mt-1">Historical compliance records and audit trail</p>
        </div>
        <div className="bg-white rounded-b-xl border-x border-b border-ink-100 p-12 text-center">
          <p className="text-5xl mb-4">📦</p>
          <h3 className="text-lg font-bold text-ink-900 mb-2">No archives yet</h3>
          <p className="text-sm text-ink-500 max-w-md mx-auto">
            {isBoard
              ? 'Create an annual archive from the Compliance Runbook module to capture a permanent snapshot of compliance, financial, and governance records for a fiscal year.'
              : 'Your board has not yet created any annual archives. Once they do, you\'ll be able to view all historical records here.'}
          </p>
        </div>
      </div>
    );
  }

  // Archive list view
  if (!selected) {
    return (
      <div className="space-y-0">
        <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-t-xl p-8 text-white shadow-sm">
          <h2 className="font-display text-2xl font-bold">📦 The Archives</h2>
          <p className="text-accent-200 text-sm mt-1">{archives.length} archived period{archives.length !== 1 ? 's' : ''} · Read-only historical records</p>
        </div>
        <div className="bg-white rounded-b-xl border-x border-b border-ink-100 p-6">
          <div className="grid gap-4">
            {archives.map(a => (
              <div key={a.id} className="border border-ink-100 rounded-xl hover:border-accent-200 hover:shadow-sm transition-all cursor-pointer" onClick={() => { setSelectedId(a.id); setSection('overview'); }}>
                <div className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-accent-100 rounded-xl flex items-center justify-center text-2xl">📦</div>
                    <div>
                      <h3 className="font-bold text-ink-900">{a.label}</h3>
                      <p className="text-xs text-ink-500">Created {new Date(a.createdAt).toLocaleDateString()} by {a.createdBy}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="grid grid-cols-4 gap-3">
                      <div className="text-center"><p className="text-xs text-ink-400">Health</p><p className="text-sm font-bold text-ink-900">{a.compliance.grade}</p></div>
                      <div className="text-center"><p className="text-xs text-ink-400">Meetings</p><p className="text-sm font-bold text-ink-900">{a.meetings.length}</p></div>
                      <div className="text-center"><p className="text-xs text-ink-400">Filings</p><p className="text-sm font-bold text-ink-900">{a.filings.length}</p></div>
                      <div className="text-center"><p className="text-xs text-ink-400">Comms</p><p className="text-sm font-bold text-ink-900">{a.communications.length}</p></div>
                    </div>
                    {isBoard && <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete this archive? This cannot be undone.')) deleteArchive(a.id); }} className="text-xs text-red-400 hover:text-red-600 ml-2">Delete</button>}
                    <span className="text-accent-400 text-lg">→</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Archive detail view
  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-t-xl p-8 text-white shadow-sm">
        <button onClick={() => setSelectedId(null)} className="text-accent-200 hover:text-white text-sm mb-3 inline-flex items-center gap-1">← Back to Archives</button>
        <h2 className="font-display text-2xl font-bold">📦 {selected.label}</h2>
        <p className="text-accent-200 text-sm mt-1">Created {new Date(selected.createdAt).toLocaleDateString()} by {selected.createdBy} · Read-only snapshot</p>
      </div>

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
        {/* Overview */}
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
              <Card label="Insurance Policies" val={String(selected.insurance.length)} sub={`${selected.insurance.filter(p => p.status === 'active').length} active`} />
              <Card label="Board Members" val={String(selected.board.length)} sub={selected.board.map(b => b.role).join(', ')} />
            </div>
            <p className="text-xs text-ink-400 mt-4">This archive contains {selected.meetings.length} meetings, {selected.filings.length} filings, {selected.communications.length} communications, {selected.insurance.length} insurance policies, {selected.legalDocuments.length} legal documents, and financial data for the period {selected.periodStart} to {selected.periodEnd}.</p>
          </div>
        )}

        {/* Compliance Runbook */}
        {section === 'compliance' && (
          <div className="space-y-3">
            <h3 className="font-display text-lg font-bold text-ink-900">Compliance Runbook Snapshot</h3>
            <div className="flex items-center gap-3 mb-4">
              <span className={`text-3xl font-bold ${selected.compliance.healthIndex >= 80 ? 'text-sage-600' : selected.compliance.healthIndex >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>{selected.compliance.grade}</span>
              <span className="text-sm text-ink-500">Health Index: {selected.compliance.healthIndex}%</span>
            </div>
            <div className="bg-mist-50 rounded-xl border border-mist-200 p-4 space-y-2">
              <p className="text-xs font-bold text-ink-800 mb-2">Completion Status</p>
              {Object.entries(selected.compliance.runbookCompletions).map(([id, done]) => (
                <div key={id} className="flex items-center gap-2 text-xs">
                  <span className={`w-5 h-5 rounded flex items-center justify-center ${done ? 'bg-sage-100 text-sage-600' : 'bg-red-100 text-red-600'}`}>{done ? '✓' : '✗'}</span>
                  <span className="font-mono text-ink-500">{id}</span>
                  <span className={done ? 'text-sage-600' : 'text-red-600'}>{done ? 'Complete' : 'Incomplete'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filings */}
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

        {/* Meetings */}
        {section === 'meetings' && (
          <div className="space-y-3">
            <h3 className="font-display text-lg font-bold text-ink-900">Meetings ({selected.meetings.length})</h3>
            {selected.meetings.length === 0 ? <p className="text-sm text-ink-400 p-4">No meetings for this period.</p> :
            <div className="space-y-4">
              {selected.meetings.sort((a, b) => b.date.localeCompare(a.date)).map(m => (
                <div key={m.id} className="border border-ink-100 rounded-xl overflow-hidden">
                  <div className="p-4 bg-mist-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2"><h4 className="font-bold text-ink-900">{m.title}</h4><span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${m.status === 'COMPLETED' ? 'bg-sage-100 text-sage-700' : 'bg-accent-100 text-accent-700'}`}>{m.status}</span><span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-100 text-ink-600">{m.type}</span></div>
                        <p className="text-xs text-ink-500 mt-1">{m.date} · {m.time} · {m.location}</p>
                      </div>
                    </div>
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

        {/* Communications */}
        {section === 'communications' && (
          <div className="space-y-3">
            <h3 className="font-display text-lg font-bold text-ink-900">Communications ({selected.communications.length})</h3>
            {selected.communications.length === 0 ? <p className="text-sm text-ink-400 p-4">No communications for this period.</p> :
            <div className="bg-white rounded-xl border border-ink-100 divide-y divide-ink-50">
              {selected.communications.map(c => (
                <div key={c.id} className="p-4">
                  <div className="flex items-center gap-2 flex-wrap"><p className="text-sm font-medium text-ink-900">{c.subject}</p><span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-100 text-ink-600">{c.type}</span><span className={`text-[10px] px-1.5 py-0.5 rounded ${c.status === 'sent' ? 'bg-sage-100 text-sage-700' : 'bg-yellow-100 text-yellow-700'}`}>{c.status}</span></div>
                  <p className="text-xs text-ink-500 mt-1">{c.date} · {c.method} · {c.recipients}</p>
                  {c.notes && <p className="text-xs text-ink-400 mt-1">{c.notes}</p>}
                </div>
              ))}
            </div>}
          </div>
        )}

        {/* Financial */}
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

        {/* Insurance */}
        {section === 'insurance' && (
          <div className="space-y-3">
            <h3 className="font-display text-lg font-bold text-ink-900">Insurance Policies ({selected.insurance.length})</h3>
            {selected.insurance.length === 0 ? <p className="text-sm text-ink-400 p-4">No insurance records.</p> :
            <div className="bg-white rounded-xl border border-ink-100 divide-y divide-ink-50">
              {selected.insurance.map((p, i) => (
                <div key={i} className="p-4">
                  <div className="flex items-center gap-2"><p className="text-sm font-bold text-ink-900">{p.type}</p><span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${p.status === 'active' ? 'bg-sage-100 text-sage-700' : 'bg-red-100 text-red-700'}`}>{p.status}</span></div>
                  <p className="text-xs text-ink-500 mt-1">{p.carrier} · Policy #{p.policyNumber} · Coverage: {p.coverage} · Premium: {p.premium} · Expires: {p.expires}</p>
                </div>
              ))}
            </div>}
          </div>
        )}

        {/* Legal Documents */}
        {section === 'legal' && (
          <div className="space-y-3">
            <h3 className="font-display text-lg font-bold text-ink-900">Legal & Governing Documents ({selected.legalDocuments.length})</h3>
            {selected.legalDocuments.length === 0 ? <p className="text-sm text-ink-400 p-4">No documents.</p> :
            <div className="bg-white rounded-xl border border-ink-100 divide-y divide-ink-50">
              {selected.legalDocuments.map((d, i) => (
                <div key={i} className="p-4">
                  <div className="flex items-center gap-2"><p className="text-sm font-bold text-ink-900">{d.name}</p><span className="text-xs text-ink-400">v{d.version}</span><span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${d.status === 'current' ? 'bg-sage-100 text-sage-700' : 'bg-yellow-100 text-yellow-700'}`}>{d.status}</span></div>
                  {d.attachments.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{d.attachments.map(att => <span key={att.name} className="text-[10px] bg-mist-50 border border-mist-200 rounded px-2 py-0.5">📎 {att.name} ({att.size})</span>)}</div>}
                </div>
              ))}
            </div>}
          </div>
        )}

        {/* Board */}
        {section === 'board' && (
          <div className="space-y-3">
            <h3 className="font-display text-lg font-bold text-ink-900">Board Composition ({selected.board.length})</h3>
            {selected.board.length === 0 ? <p className="text-sm text-ink-400 p-4">No board data.</p> :
            <div className="bg-white rounded-xl border border-ink-100 divide-y divide-ink-50">
              {selected.board.map((b, i) => (
                <div key={i} className="p-4 flex items-center justify-between">
                  <div><p className="text-sm font-bold text-ink-900">{b.name}</p><p className="text-xs text-ink-500">{b.role}</p></div>
                  <span className="text-xs text-ink-400">Term: {b.term}</span>
                </div>
              ))}
            </div>}
          </div>
        )}
      </div>
    </div>
  );
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

