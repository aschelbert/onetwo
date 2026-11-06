import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import VendorsTab from '@/features/building/tabs/VendorsTab';
import { useVendorTrackerStore } from '@/store/useVendorTrackerStore';
import { fmt } from '@/lib/formatters';
import { Button, Card, Chip, Inner, SectionLabel, Tile, TileRow } from '../../components';
import { dayLabel } from '../../home/calendar';
import { contractRows, contractsSummary, type ContractRow, type BuildingSnapshot } from '../metrics';
import type { BuildingTab } from '../BuildingModule';

const STATE_LABEL: Record<ContractRow['state'], string> = { lapsed: 'Lapsed', ending: 'Ending', active: 'Active', none: 'Per job', inactive: 'Inactive' };
const STATE_TONE: Record<ContractRow['state'], 'red' | 'amber' | 'sage' | 'ghost'> = { lapsed: 'red', ending: 'amber', active: 'sage', none: 'ghost', inactive: 'ghost' };

export default function ContractsTab({ snap, isBoard, onGo }: { snap: BuildingSnapshot; isBoard: boolean; onGo: (tab: BuildingTab, section?: string) => void }) {
  const navigate = useNavigate();
  const rows = useMemo(() => contractRows(snap), [snap]);
  const sum = contractsSummary(rows);
  const bids = useVendorTrackerStore(s => s.bids);
  const openBids = bids.filter(b => b.status === 'pending').length;
  const needs = [...sum.lapsed, ...sum.ending];

  return (
    <div className="flex flex-col gap-5">
      {needs.length > 0 && (
        <Card aria-label="Needs you">
          <SectionLabel>Needs you · {sum.lapsed.length} lapsed · {sum.ending.length} ending in 90 days</SectionLabel>
          <ul className="m-0 list-none divide-y divide-ux2-line p-0">
            {needs.map(r => (
              <li key={r.vendorId} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-ux2-ink">{r.contract?.title ?? r.service} {r.state === 'lapsed' ? 'lapsed' : 'ends'} {r.ends ? dayLabel(r.ends) : ''}</div>
                  <div className="text-xs text-ux2-muted">{r.vendor}{r.contract ? ` · ${fmt(r.contract.amount)}` : ''} · {r.state === 'lapsed' ? 'countersign the renewal or close it out' : `${r.daysLeft} days · collect bids or renew`}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Chip tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}</Chip>
                  {isBoard && <Button size="sm" onClick={() => document.getElementById('ux2-vendors')?.scrollIntoView({ behavior: 'smooth' })}>{r.state === 'lapsed' ? 'Sign renewal' : 'Renew or bid'}</Button>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <TileRow>
        <Tile tone={sum.lapsed.length ? 'red' : 'grey'} label="Vendors and contracts" value={sum.vendors} unit="vendors" sub={`${sum.signed} with a contract on file · ${sum.lapsed.length} lapsed · ${sum.ending.length} ending soon`} className="min-h-[150px]" />
        <Tile tone={openBids > 0 ? 'navy' : 'grey'} label="Bids" value={openBids} unit="open" sub={openBids > 0 ? 'Compare them below, then put the choice to the board' : 'Collect three bids when a job is over the bylaws limit'} className="min-h-[150px]" />
        <Tile tone="teal" label="Paperwork on file" value={`${sum.needs1099.length - sum.missingW9.length} of ${sum.needs1099.length}`} unit="W-9s" sub={sum.missingW9.length ? `${sum.missingW9.map(r => r.vendor).join(', ')} missing · needed for the 1099s by Jan 31` : 'Every vendor over $600 has a W-9 · 1099s go out from Funds'} className="min-h-[150px]" />
      </TileRow>

      <Card aria-label="Contracts">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Every vendor the building pays</SectionLabel>
          <Button size="sm" variant="ghost" onClick={() => navigate('/funds?tab=expenses')}>Bills by vendor · Funds › Expenses</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.06em] text-ux2-muted">
                <th className="py-2 pr-3 font-semibold">Vendor</th><th className="py-2 pr-3 font-semibold">What they do</th><th className="py-2 pr-3 font-semibold">Contract</th><th className="py-2 pr-3 font-semibold">Ends</th><th className="py-2 pr-3 text-right font-semibold">Paid this year</th><th className="py-2 pr-3 font-semibold">1099</th><th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.vendorId} data-vendor={r.vendorId} className={`border-t border-ux2-line ${r.state === 'inactive' ? 'opacity-60' : ''}`}>
                  <td className="py-2 pr-3 font-semibold text-ux2-ink">{r.vendor}</td>
                  <td className="py-2 pr-3 text-ux2-muted">{r.service}</td>
                  <td className="py-2 pr-3 text-ux2-ink">{r.contract ? `${r.contract.title} · ${fmt(r.contract.amount)}${r.contract.autoRenew ? ' · auto-renews' : ''}` : <span className="text-ux2-dim">Per job</span>}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-ux2-muted">{r.ends ? dayLabel(r.ends) : '—'}</td>
                  <td className="py-2 pr-3 text-right font-semibold text-ux2-ink">{fmt(r.paidThisYear)}</td>
                  <td className="py-2 pr-3 text-xs text-ux2-muted">{r.needs1099 ? (r.w9OnFile ? 'Yes · W-9 on file' : 'Yes · W-9 missing') : 'Under $600'}</td>
                  <td className="py-2"><Chip tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}{r.state === 'ending' && r.daysLeft !== undefined ? ` · ${r.daysLeft}d` : ''}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Inner className="text-xs text-ux2-muted">Bills, work orders and payments stay in Funds › Expenses; this list is who they are and what they signed. Each gap is an obligation on Obligations and a Home card for the Treasurer.</Inner>
      </Card>

      {isBoard && (
        <Card id="ux2-vendors" aria-label="Vendor directory, bids and contracts">
          <SectionLabel>Vendor directory, bids and contracts</SectionLabel>
          <p className="text-sm text-ux2-muted">Add or edit a vendor, record a bid, review a vendor, and add or renew a contract.</p>
          <div className="ux2-legacy"><VendorsTab /></div>
        </Card>
      )}
      {!isBoard && <Button size="sm" variant="ghost" className="self-start" onClick={() => onGo('obligations')}>Obligations</Button>}
    </div>
  );
}
