/**
 * FLMoneyIn -- "Money in" tab for v2 Fiscal Lens.
 *
 * - Top card: "{n} units are late, {amount} outstanding" + Chase button
 * - Unit table: number, owner, balance, status, days late, last payment
 * - Search bar
 * - Clicking a row opens UnitDrawer
 * - Quick record row at top
 */

import { useState, useMemo } from 'react';
import { Search, AlertTriangle, ArrowUpRight, DollarSign } from 'lucide-react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt, formatDate } from '@/lib/formatters';
import UnitDrawer from '../drawers/UnitDrawer';
import LateUnitsDrawer from '../drawers/LateUnitsDrawer';
import type { Unit } from '@/types/financial';

export default function FLMoneyIn() {
  const store = useFinancialStore();
  const [search, setSearch] = useState('');
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [showLateDrawer, setShowLateDrawer] = useState(false);

  // Quick record state
  const [quickUnit, setQuickUnit] = useState('');
  const [quickAmount, setQuickAmount] = useState('');
  const [quickMethod, setQuickMethod] = useState('check');

  // Filtered units
  const filteredUnits = useMemo(() => {
    const needle = search.toLowerCase();
    return store.units.filter(u =>
      u.number.toLowerCase().includes(needle) ||
      u.owner.toLowerCase().includes(needle) ||
      u.email.toLowerCase().includes(needle),
    );
  }, [store.units, search]);

  // Late units stats
  const lateUnits = useMemo(() => store.units.filter(u => u.balance > 0), [store.units]);
  const totalOutstanding = lateUnits.reduce((sum, u) => sum + u.balance, 0);

  // Days past due calculator
  const daysPastDue = (unit: Unit): number => {
    const now = Date.now();
    const dueDate = new Date();
    dueDate.setDate(store.hoaDueDay);
    if (dueDate.getTime() > now) dueDate.setMonth(dueDate.getMonth() - 1);
    return unit.balance > 0
      ? Math.max(0, Math.floor((now - dueDate.getTime()) / 86400000))
      : 0;
  };

  // Last payment date
  const lastPayment = (unit: Unit): string => {
    if (unit.payments.length === 0) return '--';
    return formatDate(unit.payments[unit.payments.length - 1].date);
  };

  const handleQuickRecord = () => {
    const amt = parseFloat(quickAmount);
    if (!quickUnit || !amt || amt <= 0) return;
    store.recordUnitPayment(quickUnit, amt, quickMethod);
    setQuickUnit('');
    setQuickAmount('');
    setQuickMethod('check');
  };

  return (
    <div className="space-y-6">
      {/* Late units alert card */}
      {lateUnits.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle size={20} className="text-red-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-red-800">
                {lateUnits.length} unit{lateUnits.length !== 1 ? 's are' : ' is'} late, {fmt(totalOutstanding)} outstanding
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                Collection actions recommended based on days past due
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowLateDrawer(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors shrink-0"
          >
            Chase late units <ArrowUpRight size={14} />
          </button>
        </div>
      )}

      {/* Quick record row */}
      <div className="bg-mist-50 rounded-xl p-4">
        <h3 className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-3">Quick record a payment</h3>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs text-ink-400 block mb-1">Unit</label>
            <select
              value={quickUnit}
              onChange={e => setQuickUnit(e.target.value)}
              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white"
            >
              <option value="">Select unit</option>
              {store.units.map(u => (
                <option key={u.number} value={u.number}>
                  {u.number} -- {u.owner}
                </option>
              ))}
            </select>
          </div>
          <div className="w-32">
            <label className="text-xs text-ink-400 block mb-1">Amount</label>
            <input
              type="number"
              step="0.01"
              value={quickAmount}
              onChange={e => setQuickAmount(e.target.value)}
              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white"
              placeholder="0.00"
            />
          </div>
          <div className="w-32">
            <label className="text-xs text-ink-400 block mb-1">Method</label>
            <select
              value={quickMethod}
              onChange={e => setQuickMethod(e.target.value)}
              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white"
            >
              <option value="check">Check</option>
              <option value="ach">ACH</option>
              <option value="cash">Cash</option>
              <option value="zelle">Zelle</option>
            </select>
          </div>
          <button
            onClick={handleQuickRecord}
            disabled={!quickUnit || !quickAmount}
            className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <DollarSign size={14} className="inline -mt-0.5 mr-1" />
            Record
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-ink-200 rounded-lg text-sm"
          placeholder="Search units by number, owner, or email..."
        />
      </div>

      {/* Unit table */}
      <div className="overflow-x-auto border border-ink-100 rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-mist-50 border-b border-ink-100">
              <th className="text-left px-4 py-3 font-medium text-ink-500 text-xs uppercase">Unit</th>
              <th className="text-left px-4 py-3 font-medium text-ink-500 text-xs uppercase">Owner</th>
              <th className="text-right px-4 py-3 font-medium text-ink-500 text-xs uppercase">Balance</th>
              <th className="text-center px-4 py-3 font-medium text-ink-500 text-xs uppercase">Status</th>
              <th className="text-right px-4 py-3 font-medium text-ink-500 text-xs uppercase">Days late</th>
              <th className="text-right px-4 py-3 font-medium text-ink-500 text-xs uppercase">Last payment</th>
            </tr>
          </thead>
          <tbody>
            {filteredUnits.map(unit => {
              const daysLate = daysPastDue(unit);
              return (
                <tr
                  key={unit.number}
                  onClick={() => setSelectedUnit(unit.number)}
                  className="border-b border-ink-50 last:border-0 hover:bg-mist-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-semibold text-ink-800">{unit.number}</td>
                  <td className="px-4 py-3 text-ink-600">{unit.owner}</td>
                  <td className={`px-4 py-3 text-right font-medium ${unit.balance > 0 ? 'text-red-600' : 'text-sage-700'}`}>
                    {fmt(unit.balance)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      unit.balance === 0
                        ? 'bg-sage-100 text-sage-700'
                        : daysLate >= 60
                        ? 'bg-red-100 text-red-700'
                        : daysLate >= 30
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-orange-100 text-orange-700'
                    }`}>
                      {unit.balance === 0 ? 'Current' : daysLate >= 60 ? 'Delinquent' : 'Late'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-ink-500">
                    {daysLate > 0 ? `${daysLate}d` : '--'}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-500">
                    {lastPayment(unit)}
                  </td>
                </tr>
              );
            })}
            {filteredUnits.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-400">
                  No units match your search
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Drawers */}
      {selectedUnit && (
        <UnitDrawer
          open={!!selectedUnit}
          onClose={() => setSelectedUnit(null)}
          unitNumber={selectedUnit}
        />
      )}

      <LateUnitsDrawer
        open={showLateDrawer}
        onClose={() => setShowLateDrawer(false)}
      />
    </div>
  );
}
