import { useState, useMemo } from 'react';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useVendorTrackerStore } from '@/store/useVendorTrackerStore';
import type { VendorBid, VendorReview, VendorContract } from '@/store/useVendorTrackerStore';
import { useAuthStore } from '@/store/useAuthStore';
import { fmt, formatDate } from '@/lib/formatters';
import Modal from '@/components/ui/Modal';

type SubTab = 'directory' | 'bids' | 'contracts';
type ModalKind = null | 'addVendor' | 'editVendor' | 'addBid' | 'addReview' | 'addContract' | 'editContract';

// ── Helpers ──────────────────────────────────────

function Stars({ rating, size = 'text-sm' }: { rating: number; size?: string }) {
  return (
    <span className={`${size} leading-none`}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={i <= Math.round(rating) ? 'text-yellow-400' : 'text-ink-200'}>&#9733;</span>
      ))}
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" onClick={() => onChange(i)} className={`text-2xl leading-none ${i <= value ? 'text-yellow-400' : 'text-ink-200'} hover:text-yellow-300`}>&#9733;</button>
      ))}
    </div>
  );
}

function isExpiringSoon(endDate: string): boolean {
  const end = new Date(endDate);
  const now = new Date();
  const daysLeft = Math.floor((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return daysLeft <= 30 && daysLeft > 0;
}

function daysUntil(dateStr: string): number {
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// ── Component ────────────────────────────────────

export default function VendorsTab() {
  const { vendors, addVendor, updateVendor, removeVendor, toggleVendorStatus } = useBuildingStore();
  const { bids, reviews, contracts, addBid, updateBid, deleteBid, addReview, deleteReview, addContract, updateContract, deleteContract } = useVendorTrackerStore();
  const { currentUser } = useAuthStore();

  const [subTab, setSubTab] = useState<SubTab>('directory');
  const [modal, setModal] = useState<ModalKind>(null);
  const [editId, setEditId] = useState('');
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [starRating, setStarRating] = useState(5);

  // Bid filters
  const [bidProjectFilter, setBidProjectFilter] = useState('all');
  const [bidStatusFilter, setBidStatusFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');
  const [showCompare, setShowCompare] = useState<string | null>(null);

  const f = (key: string) => form[key] || '';
  const sf = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));
  const resetForm = () => { setForm({}); setStarRating(5); };

  const Field = ({ label, k, type = 'text', placeholder = '' }: { label: string; k: string; type?: string; placeholder?: string }) => (
    <div>
      <label className="block text-xs font-medium text-ink-700 mb-1">{label}</label>
      <input type={type} value={f(k)} onChange={e => sf(k, e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder={placeholder} />
    </div>
  );

  // ── Computed data ──

  const vendorStats = useMemo(() => {
    const map: Record<string, { avgRating: number; reviewCount: number; activeContracts: number; pendingBids: number }> = {};
    vendors.forEach(v => {
      const vReviews = reviews.filter(r => r.vendorId === v.id || r.vendorName === v.name);
      const avg = vReviews.length > 0 ? vReviews.reduce((s, r) => s + r.rating, 0) / vReviews.length : 0;
      const activeC = contracts.filter(c => (c.vendorId === v.id || c.vendorName === v.name) && c.status === 'active').length;
      const pendingB = bids.filter(b => (b.vendorId === v.id || b.vendorName === v.name) && b.status === 'pending').length;
      map[v.id] = { avgRating: avg, reviewCount: vReviews.length, activeContracts: activeC, pendingBids: pendingB };
    });
    return map;
  }, [vendors, reviews, contracts, bids]);

  const bidProjects = useMemo(() => {
    const set = new Set(bids.map(b => b.project));
    return Array.from(set).sort();
  }, [bids]);

  const filteredBids = useMemo(() => {
    let result = [...bids];
    if (bidProjectFilter !== 'all') result = result.filter(b => b.project === bidProjectFilter);
    if (bidStatusFilter !== 'all') result = result.filter(b => b.status === bidStatusFilter);
    return result;
  }, [bids, bidProjectFilter, bidStatusFilter]);

  const bidsGroupedByProject = useMemo(() => {
    const groups: Record<string, VendorBid[]> = {};
    filteredBids.forEach(b => {
      if (!groups[b.project]) groups[b.project] = [];
      groups[b.project].push(b);
    });
    return groups;
  }, [filteredBids]);

  // Projects with multiple bids (for compare)
  const comparableProjects = useMemo(() => {
    const groups: Record<string, VendorBid[]> = {};
    bids.forEach(b => {
      if (!groups[b.project]) groups[b.project] = [];
      groups[b.project].push(b);
    });
    return Object.entries(groups).filter(([, arr]) => arr.length > 1);
  }, [bids]);

  const SUB_TABS: { key: SubTab; label: string; count?: number }[] = [
    { key: 'directory', label: 'Vendors Directory', count: vendors.length },
    { key: 'bids', label: 'Bids & Proposals', count: bids.filter(b => b.status === 'pending').length },
    { key: 'contracts', label: 'Contracts', count: contracts.filter(c => c.status === 'active').length },
  ];

  // ── Render ──

  return (
    <div className="space-y-5">
      {/* Sub-tab navigation */}
      <div className="flex items-center gap-1 bg-ink-50 rounded-lg p-1">
        {SUB_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${subTab === t.key ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${subTab === t.key ? 'bg-ink-900 text-white' : 'bg-ink-200 text-ink-600'}`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════ DIRECTORY ═══════ */}
      {subTab === 'directory' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl font-bold text-ink-900">Preferred Vendors</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => { resetForm(); setModal('addReview'); }} className="px-4 py-2 border border-ink-200 text-ink-700 rounded-lg hover:bg-ink-50 text-sm font-medium">+ Review</button>
              <button onClick={() => { resetForm(); setModal('addVendor'); }} className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium">+ Add Vendor</button>
            </div>
          </div>

          {vendors.map(v => {
            const stats = vendorStats[v.id] || { avgRating: 0, reviewCount: 0, activeContracts: 0, pendingBids: 0 };
            const isExpanded = expandedVendor === v.id;
            const vReviews = reviews.filter(r => r.vendorId === v.id || r.vendorName === v.name);
            const vContracts = contracts.filter(c => (c.vendorId === v.id || c.vendorName === v.name) && c.status === 'active');
            const vBids = bids.filter(b => b.vendorId === v.id || b.vendorName === v.name);

            return (
              <div key={v.id} className={`bg-white border rounded-xl transition-all ${v.status === 'inactive' ? 'opacity-60 border-ink-100' : 'border-ink-100 hover:shadow-sm'}`}>
                {/* Card header */}
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => setExpandedVendor(isExpanded ? null : v.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-ink-900">{v.name}</h4>
                        {stats.avgRating > 0 && (
                          <span className="flex items-center gap-1">
                            <Stars rating={stats.avgRating} size="text-xs" />
                            <span className="text-[11px] text-ink-400">({stats.avgRating.toFixed(1)})</span>
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${v.status === 'active' ? 'bg-sage-100 text-sage-700' : 'bg-ink-100 text-ink-500'}`}>{v.status}</span>
                      </div>
                      <p className="text-sm text-accent-600 font-medium mt-0.5">{v.service}</p>
                      <p className="text-xs text-ink-500">{v.contact} · {v.phone} · {v.email}</p>
                      <p className="text-xs text-ink-400 mt-0.5">{v.contract}</p>
                      <div className="flex items-center gap-4 mt-2">
                        {stats.activeContracts > 0 && (
                          <span className="text-[11px] text-sage-600 font-medium">{stats.activeContracts} active contract{stats.activeContracts !== 1 ? 's' : ''}</span>
                        )}
                        {stats.pendingBids > 0 && (
                          <span className="text-[11px] text-yellow-600 font-medium">{stats.pendingBids} pending bid{stats.pendingBids !== 1 ? 's' : ''}</span>
                        )}
                        {stats.reviewCount > 0 && (
                          <span className="text-[11px] text-ink-400">{stats.reviewCount} review{stats.reviewCount !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3" onClick={e => e.stopPropagation()}>
                      <button onClick={() => toggleVendorStatus(v.id)} className={`text-xs font-medium ${v.status === 'active' ? 'text-yellow-600 hover:text-yellow-700' : 'text-sage-600 hover:text-sage-700'}`}>
                        {v.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => { setEditId(v.id); setForm({ name: v.name, service: v.service, contact: v.contact, phone: v.phone, email: v.email, contract: v.contract }); setModal('editVendor'); }}
                        className="text-xs text-accent-600 font-medium hover:text-accent-700"
                      >Edit</button>
                      <button onClick={() => { if (confirm(`Remove ${v.name}?`)) removeVendor(v.id); }} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                      <span className={`text-ink-300 text-sm transition-transform ${isExpanded ? 'rotate-180' : ''}`}>&#9660;</span>
                    </div>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-ink-100 px-4 pb-4 pt-3 space-y-4">
                    {/* Reviews */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="text-xs font-bold text-ink-800 uppercase tracking-wider">Reviews</h5>
                        <button onClick={() => { resetForm(); sf('vendorName', v.name); sf('vendorId', v.id); setModal('addReview'); }} className="text-[11px] text-accent-600 font-medium hover:text-accent-700">+ Add Review</button>
                      </div>
                      {vReviews.length === 0 && <p className="text-xs text-ink-400 italic">No reviews yet.</p>}
                      {vReviews.map(r => (
                        <div key={r.id} className="bg-accent-50 rounded-lg p-3 mb-2 border border-accent-100">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Stars rating={r.rating} size="text-xs" />
                              <span className="text-xs text-ink-500">{r.reviewer}</span>
                              <span className="text-[10px] text-ink-300">{formatDate(r.date)}</span>
                            </div>
                            <button onClick={() => { if (confirm('Delete review?')) deleteReview(r.id); }} className="text-[10px] text-red-400 hover:text-red-600">Delete</button>
                          </div>
                          <p className="text-xs text-ink-700 mt-1">{r.review}</p>
                        </div>
                      ))}
                    </div>

                    {/* Active contracts */}
                    <div>
                      <h5 className="text-xs font-bold text-ink-800 uppercase tracking-wider mb-2">Active Contracts</h5>
                      {vContracts.length === 0 && <p className="text-xs text-ink-400 italic">No active contracts.</p>}
                      {vContracts.map(c => (
                        <div key={c.id} className="bg-sage-50 rounded-lg p-3 mb-2 border border-sage-100">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs font-bold text-ink-900">{c.title}</span>
                              <span className="text-xs text-ink-500 ml-2">{fmt(c.amount)}</span>
                            </div>
                            <span className="text-[10px] text-ink-400">{formatDate(c.startDate)} - {formatDate(c.endDate)}</span>
                          </div>
                          {c.autoRenew && <span className="text-[10px] text-sage-600 font-medium">Auto-renew</span>}
                        </div>
                      ))}
                    </div>

                    {/* Bid history */}
                    <div>
                      <h5 className="text-xs font-bold text-ink-800 uppercase tracking-wider mb-2">Bid History</h5>
                      {vBids.length === 0 && <p className="text-xs text-ink-400 italic">No bids on record.</p>}
                      {vBids.map(b => (
                        <div key={b.id} className="bg-mist-50 rounded-lg p-3 mb-2 border border-mist-100">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs font-bold text-ink-900">{b.project}</span>
                              <span className="text-xs text-ink-700 ml-2">{fmt(b.amount)}</span>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${b.status === 'accepted' ? 'bg-sage-100 text-sage-700' : b.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{b.status}</span>
                          </div>
                          <p className="text-[10px] text-ink-400 mt-0.5">{formatDate(b.submittedDate)}{b.notes ? ` · ${b.notes}` : ''}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <button onClick={() => { resetForm(); setModal('addVendor'); }} className="w-full py-3 border-2 border-dashed border-ink-200 rounded-xl text-sm text-ink-500 hover:border-accent-300 hover:text-accent-600 transition-colors font-medium">
            + Add Vendor
          </button>
        </div>
      )}

      {/* ═══════ BIDS & PROPOSALS ═══════ */}
      {subTab === 'bids' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="font-display text-xl font-bold text-ink-900">Bids & Proposals</h3>
            <button onClick={() => { resetForm(); sf('submittedDate', new Date().toISOString().split('T')[0]); setModal('addBid'); }} className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium">+ New Bid</button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="block text-[10px] font-medium text-ink-500 mb-0.5 uppercase tracking-wider">Project</label>
              <select value={bidProjectFilter} onChange={e => setBidProjectFilter(e.target.value)} className="px-3 py-1.5 border border-ink-200 rounded-lg text-sm text-ink-700">
                <option value="all">All Projects</option>
                {bidProjects.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-ink-500 mb-0.5 uppercase tracking-wider">Status</label>
              <select value={bidStatusFilter} onChange={e => setBidStatusFilter(e.target.value as typeof bidStatusFilter)} className="px-3 py-1.5 border border-ink-200 rounded-lg text-sm text-ink-700">
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            {comparableProjects.length > 0 && (
              <div className="ml-auto">
                <label className="block text-[10px] font-medium text-ink-500 mb-0.5 uppercase tracking-wider">Compare</label>
                <select value={showCompare || ''} onChange={e => setShowCompare(e.target.value || null)} className="px-3 py-1.5 border border-accent-200 rounded-lg text-sm text-accent-700 bg-accent-50">
                  <option value="">Select project...</option>
                  {comparableProjects.map(([proj, arr]) => (
                    <option key={proj} value={proj}>{proj} ({arr.length} bids)</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Compare view */}
          {showCompare && (() => {
            const compareBids = bids.filter(b => b.project === showCompare);
            if (compareBids.length < 2) return null;
            const sorted = [...compareBids].sort((a, b) => a.amount - b.amount);
            return (
              <div className="bg-accent-50 border border-accent-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-ink-900 text-sm">Bid Comparison: {showCompare}</h4>
                  <button onClick={() => setShowCompare(null)} className="text-xs text-ink-400 hover:text-ink-600">Close</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-accent-200">
                        <th className="text-left py-2 px-2 text-xs font-bold text-ink-600 uppercase">Vendor</th>
                        <th className="text-right py-2 px-2 text-xs font-bold text-ink-600 uppercase">Amount</th>
                        <th className="text-center py-2 px-2 text-xs font-bold text-ink-600 uppercase">Status</th>
                        <th className="text-left py-2 px-2 text-xs font-bold text-ink-600 uppercase">Date</th>
                        <th className="text-left py-2 px-2 text-xs font-bold text-ink-600 uppercase">Notes</th>
                        <th className="text-right py-2 px-2 text-xs font-bold text-ink-600 uppercase">vs. Lowest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((b, i) => {
                        const diff = i === 0 ? 0 : b.amount - sorted[0].amount;
                        const diffPct = i === 0 ? 0 : Math.round((diff / sorted[0].amount) * 100);
                        return (
                          <tr key={b.id} className={`border-b border-accent-100 ${i === 0 ? 'bg-sage-50' : ''}`}>
                            <td className="py-2 px-2 font-medium text-ink-900">{b.vendorName} {i === 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sage-100 text-sage-700 font-semibold ml-1">Lowest</span>}</td>
                            <td className="py-2 px-2 text-right font-bold text-ink-900">{fmt(b.amount)}</td>
                            <td className="py-2 px-2 text-center">
                              <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${b.status === 'accepted' ? 'bg-sage-100 text-sage-700' : b.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{b.status}</span>
                            </td>
                            <td className="py-2 px-2 text-ink-500 text-xs">{formatDate(b.submittedDate)}</td>
                            <td className="py-2 px-2 text-ink-500 text-xs max-w-[200px] truncate">{b.notes || '-'}</td>
                            <td className="py-2 px-2 text-right text-xs">
                              {i === 0 ? <span className="text-sage-600 font-medium">Baseline</span> : <span className="text-red-500">+{fmt(diff)} (+{diffPct}%)</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Grouped bids */}
          {Object.keys(bidsGroupedByProject).length === 0 && (
            <div className="text-center py-8">
              <p className="text-ink-400 text-sm">No bids match your filters.</p>
            </div>
          )}

          {Object.entries(bidsGroupedByProject).map(([project, projectBids]) => (
            <div key={project}>
              <h4 className="text-xs font-bold text-ink-800 uppercase tracking-wider mb-2">{project}</h4>
              <div className="space-y-2">
                {projectBids.map(b => (
                  <div key={b.id} className="bg-white border border-ink-100 rounded-xl p-4 hover:shadow-sm transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-ink-900">{b.vendorName}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${b.status === 'accepted' ? 'bg-sage-100 text-sage-700' : b.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{b.status}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-lg font-bold text-ink-900">{fmt(b.amount)}</span>
                          <span className="text-xs text-ink-400">{formatDate(b.submittedDate)}</span>
                        </div>
                        {b.notes && <p className="text-xs text-ink-500 mt-1">{b.notes}</p>}
                        {b.attachments.length > 0 && (
                          <div className="flex items-center gap-2 mt-1">
                            {b.attachments.map((att, i) => (
                              <span key={i} className="text-[10px] text-accent-500">📎 {att.name} ({att.size})</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        {b.status === 'pending' && (
                          <>
                            <button onClick={() => updateBid(b.id, { status: 'accepted' })} className="text-xs text-sage-600 font-medium hover:text-sage-700">Accept</button>
                            <button onClick={() => updateBid(b.id, { status: 'rejected' })} className="text-xs text-red-400 font-medium hover:text-red-600">Reject</button>
                          </>
                        )}
                        <button onClick={() => { if (confirm('Delete this bid?')) deleteBid(b.id); }} className="text-xs text-ink-300 hover:text-red-500">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <button onClick={() => { resetForm(); sf('submittedDate', new Date().toISOString().split('T')[0]); setModal('addBid'); }} className="w-full py-3 border-2 border-dashed border-ink-200 rounded-xl text-sm text-ink-500 hover:border-accent-300 hover:text-accent-600 transition-colors font-medium">
            + New Bid
          </button>
        </div>
      )}

      {/* ═══════ CONTRACTS ═══════ */}
      {subTab === 'contracts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl font-bold text-ink-900">Vendor Contracts</h3>
            <button onClick={() => { resetForm(); sf('status', 'active'); setModal('addContract'); }} className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium">+ New Contract</button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-sage-50 rounded-lg p-3 border border-sage-100">
              <p className="text-xs text-ink-400">Active</p>
              <p className="text-lg font-bold text-sage-700">{contracts.filter(c => c.status === 'active').length}</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-100">
              <p className="text-xs text-ink-400">Pending</p>
              <p className="text-lg font-bold text-yellow-700">{contracts.filter(c => c.status === 'pending').length}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3 border border-red-100">
              <p className="text-xs text-ink-400">Expired</p>
              <p className="text-lg font-bold text-red-600">{contracts.filter(c => c.status === 'expired').length}</p>
            </div>
            <div className="bg-mist-50 rounded-lg p-3 border border-mist-100">
              <p className="text-xs text-ink-400">Total Value</p>
              <p className="text-lg font-bold text-ink-900">{fmt(contracts.reduce((s, c) => s + c.amount, 0))}</p>
            </div>
          </div>

          {/* Expiring soon alert */}
          {(() => {
            const expiring = contracts.filter(c => c.status === 'active' && isExpiringSoon(c.endDate));
            if (expiring.length === 0) return null;
            return (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <h4 className="text-sm font-bold text-yellow-800 mb-2">Expiring Within 30 Days</h4>
                {expiring.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-1">
                    <span className="text-sm text-ink-700">{c.vendorName} - {c.title}</span>
                    <span className="text-xs text-yellow-700 font-medium">{daysUntil(c.endDate)} days left · Ends {formatDate(c.endDate)}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Contract list */}
          <div className="space-y-2">
            {contracts.length === 0 && (
              <div className="text-center py-8">
                <p className="text-ink-400 text-sm">No contracts yet.</p>
              </div>
            )}
            {contracts.map(c => {
              const statusColor = c.status === 'active' ? 'sage' : c.status === 'expired' ? 'red' : 'yellow';
              const expSoon = c.status === 'active' && isExpiringSoon(c.endDate);
              return (
                <div key={c.id} className={`bg-white border rounded-xl p-4 hover:shadow-sm transition-all ${expSoon ? 'border-yellow-300 bg-yellow-50 bg-opacity-30' : 'border-ink-100'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-ink-900">{c.title}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-semibold bg-${statusColor}-100 text-${statusColor}-700`}>{c.status}</span>
                        {c.autoRenew && <span className="text-[10px] px-2 py-0.5 rounded bg-mist-100 text-mist-700 font-medium">Auto-renew</span>}
                        {expSoon && <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-200 text-yellow-800 font-semibold">Expiring soon</span>}
                      </div>
                      <p className="text-sm text-accent-600 font-medium mt-0.5">{c.vendorName}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-ink-500">
                        <span>{formatDate(c.startDate)} - {formatDate(c.endDate)}</span>
                        <span className="font-bold text-ink-700">{fmt(c.amount)}</span>
                      </div>
                      {c.notes && <p className="text-xs text-ink-400 mt-1">{c.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <button
                        onClick={() => {
                          setEditId(c.id);
                          setForm({
                            vendorName: c.vendorName,
                            vendorId: c.vendorId,
                            title: c.title,
                            startDate: c.startDate,
                            endDate: c.endDate,
                            amount: String(c.amount),
                            status: c.status,
                            autoRenew: c.autoRenew ? 'true' : 'false',
                            notes: c.notes,
                          });
                          setModal('editContract');
                        }}
                        className="text-xs text-accent-600 font-medium hover:text-accent-700"
                      >Edit</button>
                      <button onClick={() => { if (confirm('Delete contract?')) deleteContract(c.id); }} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button onClick={() => { resetForm(); sf('status', 'active'); setModal('addContract'); }} className="w-full py-3 border-2 border-dashed border-ink-200 rounded-xl text-sm text-ink-500 hover:border-accent-300 hover:text-accent-600 transition-colors font-medium">
            + New Contract
          </button>
        </div>
      )}

      {/* ═══════ MODALS ═══════ */}

      {/* Add / Edit Vendor */}
      {(modal === 'addVendor' || modal === 'editVendor') && (
        <Modal
          title={modal === 'addVendor' ? 'Add Vendor' : 'Edit Vendor'}
          onClose={() => { setModal(null); resetForm(); }}
          onSave={() => {
            if (!f('name') || !f('service')) { alert('Name and service required'); return; }
            const data = { name: f('name'), service: f('service'), contact: f('contact'), phone: f('phone'), email: f('email'), contract: f('contract') };
            if (modal === 'addVendor') addVendor({ ...data, status: 'active' });
            else updateVendor(editId, data);
            setModal(null); resetForm();
          }}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Company Name *" k="name" />
              <Field label="Service *" k="service" placeholder="Plumbing" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact Person" k="contact" />
              <Field label="Phone" k="phone" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email" k="email" type="email" />
              <Field label="Contract Description" k="contract" placeholder="On-call" />
            </div>
          </div>
        </Modal>
      )}

      {/* Add Bid */}
      {modal === 'addBid' && (
        <Modal
          title="New Bid / Proposal"
          onClose={() => { setModal(null); resetForm(); }}
          onSave={() => {
            if (!f('project') || !f('amount')) { alert('Project and amount required'); return; }
            const vendorName = f('vendorName') || 'Unknown Vendor';
            const matchedVendor = vendors.find(v => v.name === vendorName);
            addBid({
              vendorId: matchedVendor?.id || '',
              vendorName,
              project: f('project'),
              amount: parseFloat(f('amount')) || 0,
              status: (f('bidStatus') as VendorBid['status']) || 'pending',
              submittedDate: f('submittedDate') || new Date().toISOString().split('T')[0],
              notes: f('notes'),
              attachments: [],
            });
            setModal(null); resetForm();
          }}
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Vendor</label>
              <div className="relative">
                <input
                  list="vendor-list-bid"
                  value={f('vendorName')}
                  onChange={e => sf('vendorName', e.target.value)}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                  placeholder="Select or type vendor name"
                />
                <datalist id="vendor-list-bid">
                  {vendors.map(v => <option key={v.id} value={v.name} />)}
                </datalist>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Project *" k="project" placeholder="Elevator Modernization" />
              <Field label="Amount *" k="amount" type="number" placeholder="82000" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Status</label>
                <select value={f('bidStatus') || 'pending'} onChange={e => sf('bidStatus', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                  <option value="pending">Pending</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <Field label="Submitted Date" k="submittedDate" type="date" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Notes</label>
              <textarea value={f('notes')} onChange={e => sf('notes', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={2} placeholder="Additional details..." />
            </div>
          </div>
        </Modal>
      )}

      {/* Add Review */}
      {modal === 'addReview' && (
        <Modal
          title="Add Vendor Review"
          onClose={() => { setModal(null); resetForm(); }}
          onSave={() => {
            const vendorName = f('vendorName');
            if (!vendorName) { alert('Please select a vendor'); return; }
            const matchedVendor = vendors.find(v => v.name === vendorName);
            addReview({
              vendorId: matchedVendor?.id || f('vendorId') || '',
              vendorName,
              rating: starRating,
              review: f('review'),
              reviewer: currentUser.name,
              date: new Date().toISOString().split('T')[0],
            });
            setModal(null); resetForm();
          }}
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Vendor</label>
              <div className="relative">
                <input
                  list="vendor-list-review"
                  value={f('vendorName')}
                  onChange={e => sf('vendorName', e.target.value)}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                  placeholder="Select vendor"
                />
                <datalist id="vendor-list-review">
                  {vendors.map(v => <option key={v.id} value={v.name} />)}
                </datalist>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Rating</label>
              <StarPicker value={starRating} onChange={setStarRating} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Review</label>
              <textarea value={f('review')} onChange={e => sf('review', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={3} placeholder="Share your experience with this vendor..." />
            </div>
          </div>
        </Modal>
      )}

      {/* Add / Edit Contract */}
      {(modal === 'addContract' || modal === 'editContract') && (
        <Modal
          title={modal === 'addContract' ? 'New Contract' : 'Edit Contract'}
          onClose={() => { setModal(null); resetForm(); }}
          onSave={() => {
            const vendorName = f('vendorName');
            if (!vendorName || !f('title')) { alert('Vendor and title required'); return; }
            const matchedVendor = vendors.find(v => v.name === vendorName);
            const data = {
              vendorId: matchedVendor?.id || f('vendorId') || '',
              vendorName,
              title: f('title'),
              startDate: f('startDate') || new Date().toISOString().split('T')[0],
              endDate: f('endDate') || '',
              amount: parseFloat(f('amount')) || 0,
              status: (f('status') as VendorContract['status']) || 'active',
              autoRenew: f('autoRenew') === 'true',
              attachments: [] as Array<{ name: string; size: string }>,
              notes: f('notes'),
            };
            if (modal === 'addContract') {
              addContract(data);
            } else {
              updateContract(editId, data);
            }
            setModal(null); resetForm();
          }}
          wide
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Vendor *</label>
                <div className="relative">
                  <input
                    list="vendor-list-contract"
                    value={f('vendorName')}
                    onChange={e => sf('vendorName', e.target.value)}
                    className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                    placeholder="Select or type vendor name"
                  />
                  <datalist id="vendor-list-contract">
                    {vendors.map(v => <option key={v.id} value={v.name} />)}
                  </datalist>
                </div>
              </div>
              <Field label="Title *" k="title" placeholder="Annual Maintenance Agreement" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Start Date" k="startDate" type="date" />
              <Field label="End Date" k="endDate" type="date" />
              <Field label="Amount" k="amount" type="number" placeholder="3200" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Status</label>
                <select value={f('status') || 'active'} onChange={e => sf('status', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={f('autoRenew') === 'true'} onChange={e => sf('autoRenew', e.target.checked ? 'true' : 'false')} className="rounded border-ink-300 text-ink-900 focus:ring-ink-500" />
                  <span className="text-sm text-ink-700">Auto-renew</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Notes</label>
              <textarea value={f('notes')} onChange={e => sf('notes', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={2} placeholder="Contract details..." />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
