import { useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

type FeedbackTheme = 'Board Room' | 'Fiscal Lens' | 'Compliance' | 'Resident Portal';
type FeedbackType = 'bug' | 'feature';
type Impact = 'high' | 'medium' | 'low';

interface FeedbackItem {
  id: string;
  title: string;
  theme: FeedbackTheme;
  type: FeedbackType;
  votes: number;
  assocs: string[];
  impact: Impact;
  status: 'open' | 'triaged' | 'linked';
}

// ── Constants ────────────────────────────────────────────────────────────────

const ASSOC_MAP: Record<string, { name: string; plan: string; color: string }> = {
  a1: { name: '1302 R Street NW Condominium', plan: 'Compliance Pro', color: '#dc2626' },
  a2: { name: 'Capitol Hill Terraces HOA', plan: 'Community Plus', color: '#2563eb' },
  a3: { name: 'Dupont Circle Lofts', plan: 'Management Suite', color: '#7c3aed' },
  a4: { name: 'Adams Morgan Commons', plan: 'Compliance Pro', color: '#dc2626' },
};

const IMPACT_COLORS: Record<Impact, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-ink-100 text-ink-500',
};

const THEME_ORDER: FeedbackTheme[] = ['Board Room', 'Fiscal Lens', 'Compliance', 'Resident Portal'];

const SEED_FEEDBACK: FeedbackItem[] = [
  { id: 'F-001', title: 'Reserve fund balance sync delay from General Ledger', theme: 'Fiscal Lens', type: 'bug', votes: 6, assocs: ['a1'], impact: 'high', status: 'open' },
  { id: 'F-002', title: 'PDF upload fails silently over 10MB', theme: 'Board Room', type: 'bug', votes: 4, assocs: ['a3'], impact: 'medium', status: 'open' },
  { id: 'F-003', title: 'Live quorum count not updating for all participants', theme: 'Board Room', type: 'bug', votes: 8, assocs: ['a2'], impact: 'high', status: 'linked' },
  { id: 'F-004', title: 'Email notification when quorum is reached', theme: 'Board Room', type: 'feature', votes: 12, assocs: ['a2', 'a1'], impact: 'medium', status: 'linked' },
  { id: 'F-005', title: 'Vendor assignment on work order form not persisting', theme: 'Fiscal Lens', type: 'bug', votes: 3, assocs: ['a3'], impact: 'high', status: 'linked' },
  { id: 'F-006', title: 'Recurring work order templates', theme: 'Fiscal Lens', type: 'feature', votes: 19, assocs: ['a3', 'a1'], impact: 'high', status: 'linked' },
  { id: 'F-007', title: 'Compliance grade breakdown — drill-down detail', theme: 'Compliance', type: 'feature', votes: 9, assocs: ['a2', 'a3'], impact: 'medium', status: 'linked' },
  { id: 'F-008', title: 'Resident portal — maintenance request submission', theme: 'Resident Portal', type: 'feature', votes: 31, assocs: ['a2', 'a3', 'a1'], impact: 'high', status: 'linked' },
  { id: 'F-009', title: 'Budget vs actuals comparison report', theme: 'Fiscal Lens', type: 'feature', votes: 14, assocs: ['a1', 'a4'], impact: 'high', status: 'linked' },
  { id: 'F-010', title: 'Bulk resident import via CSV', theme: 'Resident Portal', type: 'feature', votes: 7, assocs: ['a2'], impact: 'medium', status: 'open' },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function FeedbackTab() {
  const [feedback] = useState<FeedbackItem[]>(SEED_FEEDBACK);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [psTitle, setPsTitle] = useState('');
  const [psOwner, setPsOwner] = useState('');

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const grouped = THEME_ORDER.map(theme => ({
    theme,
    items: feedback.filter(f => f.theme === theme),
  })).filter(g => g.items.length > 0);

  const totalVotes = feedback.reduce((s, f) => s + f.votes, 0);
  const bugCount = feedback.filter(f => f.type === 'bug').length;
  const featureCount = feedback.filter(f => f.type === 'feature').length;
  const highImpact = feedback.filter(f => f.impact === 'high').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-display text-lg font-bold text-ink-900">Feedback</h2>
        <p className="text-sm text-ink-500 mt-1">Feedback items grouped by theme from tenancy associations</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Items', value: String(feedback.length), sub: `${bugCount} bugs · ${featureCount} features` },
          { label: 'Total Votes', value: String(totalVotes), sub: 'across all items' },
          { label: 'High Impact', value: String(highImpact), sub: 'items flagged high' },
          { label: 'Themes', value: String(grouped.length), sub: THEME_ORDER.join(', ') },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-[10px] border border-ink-200 p-5">
            <p className="text-xs text-ink-500 font-medium">{m.label}</p>
            <p className="text-2xl font-display font-bold mt-1 text-ink-900">{m.value}</p>
            <p className="text-[0.72rem] text-ink-400 mt-0.5">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Grouped feedback */}
      {grouped.map(group => (
        <div key={group.theme} className="bg-white rounded-[10px] border border-ink-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-bold text-ink-900">{group.theme}</h3>
              <span className="text-xs bg-ink-100 text-ink-500 px-2 py-0.5 rounded-full font-semibold">{group.items.length}</span>
            </div>
            <span className="text-xs text-ink-400">{group.items.reduce((s, f) => s + f.votes, 0)} total votes</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[0.7rem] uppercase tracking-wide text-ink-500 font-semibold border-b-2 border-ink-200 bg-ink-50">
                <th className="px-5 py-2.5 w-10">
                  <input
                    type="checkbox"
                    className="rounded border-ink-300 accent-ink-900"
                    checked={group.items.every(i => selected.has(i.id))}
                    onChange={() => {
                      const allSelected = group.items.every(i => selected.has(i.id));
                      setSelected(prev => {
                        const next = new Set(prev);
                        group.items.forEach(i => allSelected ? next.delete(i.id) : next.add(i.id));
                        return next;
                      });
                    }}
                  />
                </th>
                <th className="px-3 py-2.5 w-20">ID</th>
                <th className="px-3 py-2.5">Title</th>
                <th className="px-3 py-2.5 w-20">Type</th>
                <th className="px-3 py-2.5 w-20 text-right">Votes</th>
                <th className="px-3 py-2.5 w-24">Impact</th>
                <th className="px-3 py-2.5">Associations</th>
                <th className="px-3 py-2.5 w-20">Status</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map(item => (
                <tr key={item.id} className={`border-b border-ink-100 hover:bg-ink-50 cursor-pointer transition-colors ${selected.has(item.id) ? 'bg-ink-50' : ''}`}
                  onClick={() => toggle(item.id)}>
                  <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="rounded border-ink-300 accent-ink-900"
                      checked={selected.has(item.id)}
                      onChange={() => toggle(item.id)}
                    />
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-ink-500">{item.id}</td>
                  <td className="px-3 py-3 font-medium text-ink-900">{item.title}</td>
                  <td className="px-3 py-3">
                    <span className={`text-[0.65rem] px-2 py-0.5 rounded-full font-semibold ${
                      item.type === 'bug' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                    }`}>{item.type}</span>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-ink-700">{item.votes}</td>
                  <td className="px-3 py-3">
                    <span className={`text-[0.65rem] px-2 py-0.5 rounded-full font-semibold ${IMPACT_COLORS[item.impact]}`}>{item.impact}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      {item.assocs.map(a => (
                        <span key={a} className="w-2.5 h-2.5 rounded-full shrink-0" title={ASSOC_MAP[a]?.name}
                          style={{ backgroundColor: ASSOC_MAP[a]?.color }} />
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-[0.65rem] px-2 py-0.5 rounded-full font-semibold ${
                      item.status === 'linked' ? 'bg-sage-100 text-sage-700' : item.status === 'triaged' ? 'bg-amber-100 text-amber-700' : 'bg-ink-100 text-ink-500'
                    }`}>{item.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-60 right-0 flex justify-center z-40 pointer-events-none">
          <div className="bg-ink-900 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-4 pointer-events-auto">
            <span className="text-sm font-semibold">{selected.size} item{selected.size !== 1 ? 's' : ''} selected</span>
            <button onClick={() => setSelected(new Set())} className="text-xs text-ink-400 hover:text-white transition-colors">Clear</button>
            <button onClick={() => { setPsTitle(''); setPsOwner(''); setShowModal(true); }}
              className="px-4 py-1.5 bg-white text-ink-900 rounded-lg text-sm font-semibold hover:bg-ink-100 transition-colors">
              Create Problem Statement &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Create Problem Statement modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg font-bold text-ink-900">Create Problem Statement</h3>
              <button onClick={() => setShowModal(false)} className="text-ink-400 hover:text-ink-700 text-xl leading-none">&times;</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Problem Title *</label>
                <input value={psTitle} onChange={e => setPsTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                  placeholder="e.g. Board meeting workflow is unreliable" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Owner</label>
                <input value={psOwner} onChange={e => setPsOwner(e.target.value)}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                  placeholder="e.g. Maya R." />
              </div>

              <div>
                <p className="text-xs font-semibold text-ink-400 uppercase mb-2">Linked Feedback ({selected.size})</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {Array.from(selected).map(id => {
                    const item = feedback.find(f => f.id === id);
                    if (!item) return null;
                    return (
                      <div key={id} className="flex items-center gap-2 bg-ink-50 rounded-lg px-3 py-2">
                        <span className="font-mono text-xs text-ink-500">{item.id}</span>
                        <span className="text-sm text-ink-700 truncate flex-1">{item.title}</span>
                        <span className={`text-[0.6rem] px-1.5 py-0.5 rounded-full font-semibold ${
                          item.type === 'bug' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                        }`}>{item.type}</span>
                        <span className="text-xs text-ink-400">{item.votes}v</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-ink-400 uppercase mb-2">Affected Associations</p>
                <div className="flex gap-2 flex-wrap">
                  {Array.from(new Set(
                    Array.from(selected).flatMap(id => feedback.find(f => f.id === id)?.assocs || [])
                  )).map(a => (
                    <div key={a} className="flex items-center gap-1.5 bg-ink-50 rounded-full px-2.5 py-1">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ASSOC_MAP[a]?.color }} />
                      <span className="text-xs text-ink-600">{ASSOC_MAP[a]?.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-ink-100">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-ink-600 hover:text-ink-900">Cancel</button>
              <button onClick={() => { setShowModal(false); setSelected(new Set()); }}
                className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-semibold hover:bg-ink-800"
                disabled={!psTitle.trim()}>
                Create Problem Statement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
