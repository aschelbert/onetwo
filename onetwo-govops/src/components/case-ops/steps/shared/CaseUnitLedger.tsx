'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface LedgerHints {
  totalOwed: number
  unpaidAssessmentCount: number
  lateFeeTotal: number
  creditCount: number
}

interface UnitInvoiceRow {
  id: string
  unit_number: string
  type: string
  description: string
  amount: number
  status: string
  due_date: string
  paid_amount: number | null
}

interface CaseUnitLedgerProps {
  unitId: string
  tenantId: string
  onHintsReady?: (hints: LedgerHints) => void
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function monthsBetween(a: string, b: Date): number {
  const d = new Date(a + 'T00:00:00')
  return Math.max(0, (b.getFullYear() - d.getFullYear()) * 12 + (b.getMonth() - d.getMonth()))
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function CaseUnitLedger({ unitId, tenantId, onHintsReady }: CaseUnitLedgerProps) {
  const [rows, setRows] = useState<UnitInvoiceRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchLedger = useCallback(async () => {
    const supabase = createClient()
    const { data, error: err } = await (supabase as any)
      .from('unit_invoices')
      .select('id, unit_number, type, description, amount, status, due_date, paid_amount')
      .eq('unit_number', unitId)
      .eq('tenant_id', tenantId)
      .order('due_date', { ascending: false })
      .limit(12)

    if (err) {
      setError(err.message)
      return
    }
    setRows((data ?? []) as UnitInvoiceRow[])
  }, [unitId, tenantId])

  useEffect(() => { fetchLedger() }, [fetchLedger])

  // Derive hints when rows change
  useEffect(() => {
    if (!rows || !onHintsReady) return

    const unpaid = rows.filter((r) => r.status !== 'paid')
    const totalOwed = unpaid.reduce((sum, r) => sum + (r.amount - (r.paid_amount ?? 0)), 0)
    const unpaidAssessmentCount = unpaid.filter((r) => r.type === 'assessment').length
    const lateFeeTotal = rows
      .filter((r) => r.type === 'late_fee')
      .reduce((sum, r) => sum + r.amount, 0)
    const creditCount = rows.filter((r) => r.amount < 0).length

    onHintsReady({ totalOwed, unpaidAssessmentCount, lateFeeTotal, creditCount })
  }, [rows, onHintsReady])

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (rows === null && !error) {
    return (
      <div className="bg-[#0D1B2E] rounded-xl p-5 mb-4 animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 w-28 bg-[#1a2d44] rounded" />
          <div className="h-5 w-24 bg-[#1a2d44] rounded-full" />
        </div>
        <div className="grid grid-cols-3 gap-4 mb-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-[#1a2d44] rounded-lg" />
          ))}
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-6 bg-[#1a2d44] rounded" />
          ))}
        </div>
      </div>
    )
  }

  // ── Error state ─────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="bg-[#0D1B2E] rounded-xl p-5 mb-4">
        <p className="text-[13px] text-[#f87171]">Failed to load ledger: {error}</p>
      </div>
    )
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (rows!.length === 0) {
    return (
      <div className="bg-[#0D1B2E] rounded-xl p-5 mb-4">
        <p className="text-[13px] text-[#929da8]">No ledger entries found for this unit.</p>
      </div>
    )
  }

  // ── Derived KPIs ────────────────────────────────────────────────────────────
  const unpaid = rows!.filter((r) => r.status !== 'paid')
  const totalOwed = unpaid.reduce((sum, r) => sum + (r.amount - (r.paid_amount ?? 0)), 0)

  const now = new Date()
  const oldestUnpaid = unpaid.length > 0
    ? unpaid.reduce((oldest, r) => (r.due_date < oldest.due_date ? r : oldest))
    : null
  const monthsPastDue = oldestUnpaid ? monthsBetween(oldestUnpaid.due_date, now) : 0

  const assessmentRows = rows!.filter((r) => r.type === 'assessment')
  const latestAssessment = assessmentRows.length > 0 ? assessmentRows[0] : null
  const monthlyAssessment = latestAssessment ? latestAssessment.amount : 0

  // Running balance for table (ascending order)
  const tableRows = rows!.slice(0, 8).reverse()
  let runningBalance = 0
  const tableData = tableRows.map((r) => {
    const debit = r.amount > 0 ? r.amount : 0
    const credit = r.amount < 0 ? Math.abs(r.amount) : (r.paid_amount ?? 0)
    runningBalance += r.amount - (r.paid_amount ?? 0)
    return { ...r, debit, credit, balance: runningBalance }
  })

  return (
    <div className="bg-[#0D1B2E] rounded-xl overflow-hidden mb-4">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <span className="text-[13px] font-semibold text-[#A5F3FC]">
          Unit {unitId}
        </span>
        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#7f1d1d] text-[#fca5a5] uppercase tracking-[0.06em]">
          Delinquent
        </span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-px bg-[#1a2d44] mx-4 rounded-lg overflow-hidden mb-4">
        <div className="bg-[#0f2035] px-3 py-3">
          <span className="text-[9px] font-bold text-[#929da8] uppercase tracking-[0.06em] block mb-1">Total Owed</span>
          <span className="text-[18px] font-bold text-[#f87171]">{fmt(totalOwed)}</span>
        </div>
        <div className="bg-[#0f2035] px-3 py-3">
          <span className="text-[9px] font-bold text-[#929da8] uppercase tracking-[0.06em] block mb-1">Months Past Due</span>
          <span className="text-[18px] font-bold text-[#fbbf24]">{monthsPastDue}</span>
        </div>
        <div className="bg-[#0f2035] px-3 py-3">
          <span className="text-[9px] font-bold text-[#929da8] uppercase tracking-[0.06em] block mb-1">Monthly Assessment</span>
          <span className="text-[18px] font-bold text-white">{fmt(monthlyAssessment)}</span>
        </div>
      </div>

      {/* Mini ledger table */}
      <div className="px-4 pb-2">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] font-bold text-[#929da8] uppercase tracking-[0.06em]">
              <th className="text-left pb-2 pl-1">Date</th>
              <th className="text-left pb-2">Description</th>
              <th className="text-right pb-2">Debit</th>
              <th className="text-right pb-2">Credit</th>
              <th className="text-right pb-2 pr-1">Balance</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((r) => (
              <tr key={r.id} className="border-t border-[#1a2d44]">
                <td className="py-1.5 pl-1 text-[#cbd5e1] whitespace-nowrap">{fmtDate(r.due_date)}</td>
                <td className="py-1.5 text-white truncate max-w-[140px]">{r.description}</td>
                <td className="py-1.5 text-right text-[#f87171] tabular-nums">
                  {r.debit > 0 ? fmt(r.debit) : '—'}
                </td>
                <td className="py-1.5 text-right text-[#4ade80] tabular-nums">
                  {r.credit > 0 ? fmt(r.credit) : '—'}
                </td>
                <td className="py-1.5 text-right pr-1 text-white font-medium tabular-nums">
                  {fmt(r.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-[#1a2d44]">
        <span className="text-[10px] font-bold text-[#929da8] uppercase tracking-[0.06em]">
          Balance as of today
        </span>
        <span className="text-[16px] font-bold text-[#f87171]">{fmt(totalOwed)}</span>
      </div>
    </div>
  )
}
