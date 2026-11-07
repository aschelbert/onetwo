import { useState } from 'react';
/**
 * Building — the redesign's module for the building itself (ux2.building).
 *
 *  Overview     what it is, what protects it, what it is made of (details, insurance, assets)
 *  Documents    governing documents and policies, certificates, reports and annual archives
 *  Obligations  the compliance record: every requirement and its state, filings, duties and roles
 *  Contracts    every vendor, the contract behind each, when it ends
 *  Directory    units and owners, board, management and counsel, staff
 *
 * The detail under each section is the production page that owns the records
 * (Building page tabs, Board Room's Duties and Governance Calendar, Archives,
 * the Vendors tab), mounted embedded, so uploads, filings and vendor flows
 * are the same code paths production runs today. The Association Team's
 * tabs live elsewhere now: the property log and the PM scorecard in
 * Community, tasks and the intercom in the Board Room (`MOVED_TABS`).
 *
 * Deep links: `/building?tab=obligations&section=duties`. Legacy Building,
 * Association Team and Archives tab ids are accepted and mapped.
 */
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { Chip, PillTabs, ModuleHeader, STATUS_CHIP, HeaderSlotProvider } from '../components';
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
};

/** Association Team tab ids that now live in another module (`BuildingRoute` and `BuildingRedirect` send them there). */
export const MOVED_TABS: Record<string, string> = {
  'property-log': '/community?tab=log',
  'pm-scorecard': '/community?tab=scorecard',
  'task-tracking': '/boardroom?tab=tasks',
  communications: '/boardroom?tab=intercom',
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

  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  return (
    <HeaderSlotProvider value={headerSlot}>
      <div data-page="ux2-building" className="flex flex-col gap-5">
        <ModuleHeader
          slotRef={setHeaderSlot}
          title={snap.name}
          subtitle={<><span className="block font-semibold">{line}</span><span className="mt-1 block">{{
            overview: 'What the building is, what protects it, what it is made of and who keeps it running. The board edits; every owner can read it.',
            documents: "The building's papers: what governs it, what insures it, and the record of each year.",
            obligations: "The things DC and the bylaws require of this building, and whether they are done. Every owner can see this list; it is the building's compliance record.",
            contracts: 'Every vendor the building pays, the contract behind each, when it ends, and the bids that replace it.',
            directory: 'The one directory: units and owners, the board, advisers, staff, and who to call at 2am.',
          }[tab] ?? 'The building itself: what it is, what it must keep, who is in it.'}</span></>}
          status={<>
            <Chip tone={score.total >= 80 ? 'teal' : score.total >= 60 ? 'amber' : 'red'} className={STATUS_CHIP} title="Documents 35, insurance 35, governance 30: the Dashboard's building health">Building score {score.total} · {score.label}</Chip>
            {alert && (
              <button type="button" onClick={() => go('overview', 'insurance')} className="rounded-full">
                <Chip tone="red" className={STATUS_CHIP}>{alert.type} {alert.state === 'lapsed' ? `lapsed ${dayLabel(alert.expires)}` : `expires ${dayLabel(alert.expires)}`}</Chip>
              </button>
            )}
          </>}
          tabs={<PillTabs tabs={tabs} value={tab} onChange={id => go(id)} aria-label="Building sections" />}
        />

        {tab === 'overview' && <OverviewTab snap={snap} section={section} onSection={s => go('overview', s)} onGo={go} isBoard={isBoard} />}
        {tab === 'documents' && <DocumentsTab snap={snap} section={section} onSection={s => go('documents', s)} onGo={go} isBoard={isBoard} />}
        {tab === 'obligations' && <ObligationsTab snap={snap} section={section} onSection={s => go('obligations', s)} isBoard={isBoard} />}
        {tab === 'contracts' && <ContractsTab snap={snap} isBoard={isBoard} onGo={go} />}
        {tab === 'directory' && <DirectoryTab snap={snap} section={section} onSection={s => go('directory', s)} isBoard={isBoard} />}
      </div>
    </HeaderSlotProvider>
  );
}
