/**
 * Building — the redesign's module for the building itself (ux2.building).
 *
 *  Overview     what it is, what protects it, what it is made of (details, insurance, assets)
 *  Documents    governing documents and policies, certificates, reports and annual archives
 *  Obligations  the compliance record: every requirement and its state, filings, duties and roles
 *  Contracts    every vendor, the contract behind each, when it ends
 *  Directory    units and owners, board, management and counsel, staff, log, tasks, scorecard, intercom
 *
 * The detail under each section is the production page that owns the records
 * (Building page tabs, Board Room's Duties and Governance Calendar, Archives,
 * Association Team tabs, the Vendors tab), mounted embedded, so uploads,
 * filings, vendor flows, the kanban and the realtime intercom are the same
 * code paths production runs today.
 *
 * Deep links: `/building?tab=obligations&section=duties`. Legacy Building,
 * Association Team and Archives tab ids are accepted and mapped.
 */
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { Chip, PillTabs } from '../components';
import { useBuildingSnapshot } from './useBuildingSnapshot';
import { buildingScore, contractRows, contractsSummary, insuranceStatus, obligationRows, obligationsSummary } from './metrics';
import { dayLabel } from '../home/calendar';
import OverviewTab from './tabs/OverviewTab';
import DocumentsTab from './tabs/DocumentsTab';
import ObligationsTab from './tabs/ObligationsTab';
import ContractsTab from './tabs/ContractsTab';
import DirectoryTab from './tabs/DirectoryTab';

export type BuildingTab = 'overview' | 'documents' | 'obligations' | 'contracts' | 'directory';
const TAB_IDS: BuildingTab[] = ['overview', 'documents', 'obligations', 'contracts', 'directory'];

/** Legacy tab ids (Building page, Association Team, Archives, Board Room) → Building tab and section. */
export const LEGACY_TABS: Record<string, { tab: BuildingTab; section?: string }> = {
  details: { tab: 'overview', section: 'details' },
  insurance: { tab: 'overview', section: 'insurance' },
  assets: { tab: 'overview', section: 'assets' },
  legal: { tab: 'documents', section: 'governing' },
  contacts: { tab: 'directory', section: 'people' },
  units: { tab: 'directory', section: 'units' },
  vendors: { tab: 'contracts' },
  reports: { tab: 'documents', section: 'reports' },
  archives: { tab: 'documents', section: 'archives' },
  duties: { tab: 'obligations', section: 'duties' },
  runbook: { tab: 'obligations', section: 'calendar' },
  'property-log': { tab: 'directory', section: 'log' },
  'task-tracking': { tab: 'directory', section: 'tasks' },
  'pm-scorecard': { tab: 'directory', section: 'scorecard' },
  communications: { tab: 'directory', section: 'intercom' },
};

export function resolveBuildingTab(raw: string | null): { tab: BuildingTab; section?: string } {
  if (!raw) return { tab: 'overview' };
  if ((TAB_IDS as string[]).includes(raw)) return { tab: raw as BuildingTab };
  return LEGACY_TABS[raw] ?? { tab: 'overview' };
}

export default function BuildingModule() {
  const [params, setParams] = useSearchParams();
  const resolved = resolveBuildingTab(params.get('tab'));
  const tab = resolved.tab;
  const section = params.get('section') ?? resolved.section;
  const role = useAuthStore(s => s.currentRole);
  const isBoard = role === 'BOARD_MEMBER' || role === 'PROPERTY_MANAGER' || role === 'PLATFORM_ADMIN';

  const snap = useBuildingSnapshot();
  const score = buildingScore(snap);
  const ins = insuranceStatus(snap);
  const alert = ins.find(p => p.state !== 'current');
  const obl = obligationsSummary(obligationRows(snap));
  const con = contractsSummary(contractRows(snap));

  const go = (next: BuildingTab, nextSection?: string) => {
    setParams(prev => {
      const p = new URLSearchParams(prev);
      if (next === 'overview') p.delete('tab'); else p.set('tab', next);
      if (nextSection) p.set('section', nextSection); else p.delete('section');
      return p;
    }, { replace: true });
  };

  const fy = snap.details.fiscalYearEnd ? (() => { const [m, d] = snap.details.fiscalYearEnd.split('-').map(Number); return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${d}`; })() : null;
  const line = [
    snap.address.street,
    snap.details.totalUnits ? `${snap.details.totalUnits} units` : null,
    snap.details.yearBuilt ? `built ${snap.details.yearBuilt}` : null,
    snap.managementCompany ? snap.managementCompany : 'Self-managed',
    fy ? `FY ends ${fy}` : null,
  ].filter(Boolean).join(' · ');

  const tabs = [
    { id: 'overview' as BuildingTab, label: 'Overview' },
    { id: 'documents' as BuildingTab, label: 'Documents' },
    { id: 'obligations' as BuildingTab, label: 'Obligations', badge: obl.overdue.length + obl.inProgress.length || undefined, badgeTone: obl.overdue.length ? 'red' as const : 'navy' as const },
    { id: 'contracts' as BuildingTab, label: 'Contracts', badge: con.lapsed.length ? `${con.lapsed.length} lapsed` : undefined, badgeTone: 'red' as const },
    { id: 'directory' as BuildingTab, label: 'Directory' },
  ];

  return (
    <div data-page="ux2-building" className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ux2-ink">{snap.name}</h1>
            <p className="max-w-[760px] text-sm text-ux2-muted">{line} · the building itself: what it is, what it must keep, who is in it</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={score.total >= 80 ? 'teal' : score.total >= 60 ? 'amber' : 'red'} title="Documents 35, insurance 35, governance 30: the Dashboard's building health">Building score {score.total} · {score.label}</Chip>
            {alert && (
              <button type="button" onClick={() => go('overview', 'insurance')} className="rounded-full">
                <Chip tone="red">{alert.type} {alert.state === 'lapsed' ? `lapsed ${dayLabel(alert.expires)}` : `expires ${dayLabel(alert.expires)}`}</Chip>
              </button>
            )}
          </div>
        </div>
        <PillTabs tabs={tabs} value={tab} onChange={id => go(id)} aria-label="Building sections" />
      </header>

      {tab === 'overview' && <OverviewTab snap={snap} section={section} onSection={s => go('overview', s)} onGo={go} isBoard={isBoard} />}
      {tab === 'documents' && <DocumentsTab snap={snap} section={section} onSection={s => go('documents', s)} onGo={go} isBoard={isBoard} />}
      {tab === 'obligations' && <ObligationsTab snap={snap} section={section} onSection={s => go('obligations', s)} isBoard={isBoard} />}
      {tab === 'contracts' && <ContractsTab snap={snap} isBoard={isBoard} onGo={go} />}
      {tab === 'directory' && <DirectoryTab snap={snap} section={section} onSection={s => go('directory', s)} isBoard={isBoard} />}
    </div>
  );
}
