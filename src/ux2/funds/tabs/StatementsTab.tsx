import FLReports from '@/features/financial/tabs/FLReports';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';
import { Tile, TileRow } from '../../components';
import { monthsOfCash, type FundsSnapshot } from '../metrics';

export default function StatementsTab({ snap }: { snap: FundsSnapshot }) {
  const getIncomeStatement = useFinancialStore(s => s.getIncomeStatement);
  const year = snap.today.slice(0, 4);
  const is = getIncomeStatement(`${year}-01-01`, snap.today) as { totalIncome?: number; totalExpenses?: number; netIncome?: number } | undefined;
  const net = is?.netIncome ?? ((is?.totalIncome ?? 0) - (is?.totalExpenses ?? 0));
  const cash = monthsOfCash(snap);
  return (
    <div className="flex flex-col gap-5">
      <TileRow>
        <Tile tone="grey" label="Owns" value={fmt(snap.operatingCash + snap.reservesCash)} sub={`${fmt(snap.operatingCash)} operating · ${fmt(snap.reservesCash)} reserves · ${cash.months} months of expenses in cash`} className="min-h-[150px]" />
        <Tile tone={net >= 0 ? 'teal' : 'red'} label={`Net income · ${year} to date`} value={`${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))}`} sub={`${fmt(is?.totalIncome ?? 0)} in · ${fmt(is?.totalExpenses ?? 0)} out`} className="min-h-[150px]" />
        <Tile tone="grey" label="Packets and filings" sub="Balance sheet, income statement, budget variance, Form 1120-H and the local return, printable below." className="min-h-[150px]" />
      </TileRow>
      <div className="ux2-legacy"><FLReports /></div>
    </div>
  );
}
