/**
 * BooksLedger.tsx -- GL ledger with Posted by and Proof columns.
 *
 * Columns: Date, Memo, Debit account, Credit account, Amount, Posted by, Proof.
 * Row tint: manual rows light red when missing reason; locked period rows show lock glyph.
 * Filters: search, period, account, source, "Show manual only". Export CSV.
 */

import { useState, useMemo, useCallback } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';
import { postedByFor, proofFor } from '@/lib/ledgerView';
import { toPeriod } from '@/lib/monthClose';
import { Lock, Download, FileText } from 'lucide-react';
import ManualJournalDrawer from '../drawers/ManualJournalDrawer';

const PAGE_SIZE = 20;

export default function BooksLedger() {
  const store = useFinancialStore();
  const { generalLedger, getAcctName, chartOfAccounts, periodCloses, isMonthLocked } = store;

  const [search, setSearch] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [manualOnly, setManualOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [showJournalDrawer, setShowJournalDrawer] = useState(false);

  // Derived options
  const sourceOpts = useMemo(
    () => [...new Set(generalLedger.map(e => e.source))].sort(),
    [generalLedger],
  );
  const acctOpts = useMemo(
    () =>
      [...new Set([...generalLedger.map(e => e.debitAcct), ...generalLedger.map(e => e.creditAcct)])].sort(),
    [generalLedger],
  );
  const periodOpts = useMemo(() => {
    const periods = new Set(generalLedger.map(e => toPeriod(e.date)));
    return [...periods].sort().reverse();
  }, [generalLedger]);

  // Filter
  const filtered = useMemo(() => {
    let list = [...generalLedger];
    if (filterPeriod) list = list.filter(e => toPeriod(e.date) === filterPeriod);
    if (filterAccount) list = list.filter(e => e.debitAcct === filterAccount || e.creditAcct === filterAccount);
    if (filterSource) list = list.filter(e => e.source === filterSource);
    if (manualOnly) list = list.filter(e => e.source === 'manual');
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        e =>
          e.memo.toLowerCase().includes(s) ||
          e.id.toLowerCase().includes(s) ||
          (e.sourceId && e.sourceId.toLowerCase().includes(s)),
      );
    }
    list.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    return list;
  }, [generalLedger, filterPeriod, filterAccount, filterSource, manualOnly, search]);

  const total = filtered.length;
  const pages = Math.ceil(total / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalVolume = filtered.reduce((s, e) => s + e.amount, 0);

  // Export CSV
  const exportCsv = useCallback(() => {
    const headers = ['ID', 'Date', 'Memo', 'Debit Acct', 'Credit Acct', 'Amount', 'Source', 'Posted By', 'Proof'];
    const rows = filtered.map(e => {
      const proof = proofFor(e);
      return [
        e.id,
        e.date,
        `"${e.memo.replace(/"/g, '""')}"`,
        `${e.debitAcct} ${getAcctName(e.debitAcct)}`,
        `${e.creditAcct} ${getAcctName(e.creditAcct)}`,
        e.amount.toFixed(2),
        e.source,
        postedByFor(e),
        proof.label,
      ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, getAcctName]);

  const hasFilters = !!(search || filterPeriod || filterAccount || filterSource || manualOnly);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start">
        <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full">
          <input
            type="text"
            placeholder="Search memo, ID, or ref..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="px-3 py-2 border border-ink-200 rounded-lg text-sm flex-1"
          />
          <select
            value={filterPeriod}
            onChange={e => { setFilterPeriod(e.target.value); setPage(0); }}
            className="px-3 py-2 border border-ink-200 rounded-lg text-sm"
          >
            <option value="">All periods</option>
            {periodOpts.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            value={filterAccount}
            onChange={e => { setFilterAccount(e.target.value); setPage(0); }}
            className="px-3 py-2 border border-ink-200 rounded-lg text-sm"
          >
            <option value="">All accounts</option>
            {acctOpts.map(a => (
              <option key={a} value={a}>{getAcctName(a)}</option>
            ))}
          </select>
          <select
            value={filterSource}
            onChange={e => { setFilterSource(e.target.value); setPage(0); }}
            className="px-3 py-2 border border-ink-200 rounded-lg text-sm"
          >
            <option value="">All sources</option>
            {sourceOpts.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-ink-600 whitespace-nowrap">
            <input
              type="checkbox"
              checked={manualOnly}
              onChange={e => { setManualOnly(e.target.checked); setPage(0); }}
              className="h-3.5 w-3.5"
            />
            Manual only
          </label>
          <button
            onClick={() => setShowJournalDrawer(true)}
            className="px-3 py-2 text-ink-500 hover:text-ink-700 text-sm font-medium flex items-center gap-1.5"
          >
            <FileText size={14} />
            Journal Entry
          </button>
          <button
            onClick={exportCsv}
            className="px-3 py-2 border border-ink-200 text-ink-700 rounded-lg hover:bg-mist-50 text-sm font-medium flex items-center gap-1.5"
          >
            <Download size={14} />
            CSV
          </button>
        </div>
      </div>

      <div className="text-xs text-ink-400">
        {total} entries . Total volume: {fmt(totalVolume)}
        {hasFilters && (
          <button
            onClick={() => {
              setSearch('');
              setFilterPeriod('');
              setFilterAccount('');
              setFilterSource('');
              setManualOnly(false);
              setPage(0);
            }}
            className="ml-2 text-accent-600 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Ledger table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-400 uppercase tracking-wide border-b border-ink-100">
              <th className="py-2 pr-2 w-24">Date</th>
              <th className="py-2 pr-2">Memo</th>
              <th className="py-2 pr-2 w-28">Debit</th>
              <th className="py-2 pr-2 w-28">Credit</th>
              <th className="py-2 pr-2 w-24 text-right">Amount</th>
              <th className="py-2 pr-2 w-32">Posted by</th>
              <th className="py-2 w-36">Proof</th>
            </tr>
          </thead>
          <tbody>
            {paged.map(e => {
              const entryPeriod = toPeriod(e.date);
              const locked = isMonthLocked(entryPeriod);
              const isMissingReason = e.source === 'manual' && !e.reason;
              const proof = proofFor(e);

              return (
                <tr
                  key={e.id}
                  className={`border-b border-ink-50 hover:bg-mist-50 ${
                    isMissingReason ? 'bg-red-50/50' : ''
                  }`}
                >
                  <td className="py-2 pr-2 text-ink-500">
                    {locked && <Lock size={10} className="inline mr-1 text-ink-300" />}
                    {e.date}
                  </td>
                  <td className="py-2 pr-2 text-ink-800">{e.memo}</td>
                  <td className="py-2 pr-2 text-xs">
                    <span
                      className="bg-sage-50 text-sage-700 px-1.5 py-0.5 rounded font-mono"
                      title={getAcctName(e.debitAcct)}
                    >
                      {e.debitAcct}
                    </span>
                    <span className="text-[10px] text-ink-300 ml-1 hidden sm:inline">
                      {getAcctName(e.debitAcct).split(' . ').pop()}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-xs">
                    <span
                      className="bg-accent-50 text-accent-700 px-1.5 py-0.5 rounded font-mono"
                      title={getAcctName(e.creditAcct)}
                    >
                      {e.creditAcct}
                    </span>
                    <span className="text-[10px] text-ink-300 ml-1 hidden sm:inline">
                      {getAcctName(e.creditAcct).split(' . ').pop()}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-right font-semibold">{fmt(e.amount)}</td>
                  <td className="py-2 pr-2 text-xs text-ink-500">{postedByFor(e)}</td>
                  <td className="py-2">
                    <span
                      className={`text-xs ${
                        proof.isWarning
                          ? 'text-red-600 font-medium'
                          : 'text-ink-400'
                      }`}
                    >
                      {proof.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className={`px-3 py-1.5 border border-ink-200 rounded-lg text-sm ${
              page === 0 ? 'opacity-40' : 'hover:bg-mist-50'
            }`}
          >
            Prev
          </button>
          <span className="text-sm text-ink-400">
            Page {page + 1} of {pages}
          </span>
          <button
            onClick={() => setPage(Math.min(pages - 1, page + 1))}
            disabled={page >= pages - 1}
            className={`px-3 py-1.5 border border-ink-200 rounded-lg text-sm ${
              page >= pages - 1 ? 'opacity-40' : 'hover:bg-mist-50'
            }`}
          >
            Next
          </button>
        </div>
      )}

      {/* Manual Journal Drawer */}
      <ManualJournalDrawer
        open={showJournalDrawer}
        onClose={() => setShowJournalDrawer(false)}
      />
    </div>
  );
}
