import { useState } from 'react';
/**
 * Building — the redesign's module for the building itself (ux2.building).
 *
 *  Overview     what it is, what protects it, what it is made of (details, assets), with Insurance as its second section
 *  Care         looking after it: the upkeep schedule, the capital projects and the utilities, one tab with three sections
 *  Obligations  the compliance record: every requirement and its state, filings, duties and roles
 *  Contracts    every vendor, the contract behind each, when it ends
 *  Directory    units and owners, board, management and counsel, staff
 *
 * Documents and the Archive live in Records now (`/records`); `BuildingRoute`
 * redirects their old addresses, and `go('documents' | 'archive')` leads there.
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
import { useNavigate, useSearchParams } from 'react-router-dom';
import { recordsPath } from '../records/paths';
import { useAuthStore } from '@/store/useAuthStore';
import { Chip, PillTabs, ModuleHeader, STATUS_CHIP, HeaderSlotProvider } from '../components';
import { useBuildingSnapshot } from './useBuildingSnapshot';
import { maintenanceOverdue, buildingScore, contractRows, contractsSummary, insuranceStatus, obligationRows, obligationsSummary } from './metrics';
import { dayLabel } from '../home/calendar';
import OverviewTab from './tabs/OverviewTab';
import ProjectsTab from './tabs/ProjectsTab';
import UtilitiesTab from './tabs/UtilitiesTab';
import PlanTab from './tabs/PlanTab';
import UpkeepTab from './tabs/UpkeepTab';
import InsuranceTab from './tabs/InsuranceTab';
import { useCapitalProjectsStore } from '@/store/useCapitalProjectsStore';
import ObligationsTab from './tabs/ObligationsTab';
import ContractsTab from './tabs/ContractsTab';
import DirectoryTab from './tabs/DirectoryTab';

/** `documents` and `archive` are still valid targets for `go`, but they open in Records. */
export type BuildingTab = 'overview' | 'plan' | 'care' | 'documents' | 'obligations' | 'contracts' | 'directory' | 'archive';
const TAB_IDS: BuildingTab[] = ['overview', 'plan', 'care', 'documents', 'obligations', 'contracts', 'directory', 'archive'];

/** Legacy tab ids (Building page, Association Team, Archives, Board Room) → Building tab and section. */
export const LEGACY_TABS: Record<string, { tab: BuildingTab; section?: string }> = {
  details: { tab: 'overview', section: 'details' },
  // Insurance is Overview's second section; Upkeep, Projects and Utilities are the sections of Care.
  insurance: { tab: 'overview', section: 'insurance' },
  upkeep: { tab: 'care', section: 'schedule' },
  projects: { tab: 'care', section: 'projects' },
  utilities: { tab: 'care', section: 'utilities' },
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
  const section = params.get('section') ?? resolved.section;
  const role = useAuthStore(s => s.currentRole);
  const isBoard = role === 'BOARD_MEMBER' || role === 'PROPERTY_MANAGER' || role === 'PLATFORM_ADMIN';
  const navigate = useNavigate();
  // Documents and the Archive are in Records; `BuildingRoute` redirects before this renders.
  const tab: BuildingTab = resolved.tab === 'archive' || resolved.tab === 'documents' ? 'overview' : resolved.tab;

  const snap = useBuildingSnapshot();
  const score = buildingScore(snap);
  const ins = insuranceStatus(snap);
  const alert = ins.find(p => p.state !== 'current');
  const obl = obligationsSummary(obligationRows(snap));
  const con = contractsSummary(contractRows(snap));

  const go = (next: BuildingTab, nextSection?: string) => {
    if (next === 'documents' || next === 'archive') { navigate(recordsPath(next, nextSection)); return; }
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

  const upkeepOverdue = maintenanceOverdue(snap).length;
  const insuranceLapsed = insuranceStatus(snap).filter(p => p.state === 'lapsed').length;
  const openProjects = useCapitalProjectsStore(s => s.projects.filter(x => !x.closedOn).length);
  const tabs = [
    { id: 'overview' as BuildingTab, label: 'Overview', badge: insuranceLapsed || undefined, badgeTone: 'red' as const },
    { id: 'plan' as BuildingTab, label: 'Goals' },
    { id: 'care' as BuildingTab, label: 'Care', badge: upkeepOverdue || openProjects || undefined, badgeTone: upkeepOverdue ? 'red' as const : 'navy' as const },
    { id: 'obligations' as BuildingTab, label: 'Obligations', badge: obl.overdue.length + obl.inProgress.length || undefined, badgeTone: obl.overdue.length ? 'red' as const : 'navy' as const },
    { id: 'contracts' as BuildingTab, label: 'Contracts', badge: con.lapsed.length ? `${con.lapsed.length} lapsed` : undefined, badgeTone: 'red' as const },
    { id: 'directory' as BuildingTab, label: 'Directory' },
  ];

  const showInsurance = tab === 'overview' && section === 'insurance';
  const careSection = section === 'projects' || section === 'utilities' ? section : 'schedule';
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  return (
    <HeaderSlotProvider value={headerSlot}>
      <div data-page="ux2-building" className="flex flex-col gap-5">
        <ModuleHeader
          slotRef={setHeaderSlot}
          title={snap.name}
          subtitle={<><span className="block font-semibold">{line}</span><span className="mt-1 block">{{
            overview: 'What the building is, what protects it, what it is made of and who keeps it running. The board edits; every owner can read it.',
            plan: 'What the board is trying to do this year, where each goal stands, and how past years turned out. Every owner can read it.',
            schedule: 'The recurring work that keeps the building running: what is scheduled, what was done and what it found. Inspections are walked in their own Board Room action; every owner can read the schedule.',
            projects: 'What is being replaced or improved, what it costs and how it is paid for. Each project is worked in its Board Room action; every owner can read where it stands.',
            utilities: 'What the building uses and what it costs, meter by meter and month by month. A month far above usual opens its own action.',
            insurance: "The association's policies, whether the building is insured for enough, and the policies owners carry on their own units. Reading a declarations page fills in a policy's details.",
            obligations: "The things DC and the bylaws require of this building, and whether they are done. Every owner can see this list; it is the building's compliance record.",
            contracts: 'Every vendor the building pays, the contract behind each, when it ends, and the bids that replace it.',
            directory: 'The one directory: units and owners, the board, advisers, staff, and who to call at 2am.',
          }[showInsurance ? 'insurance' : tab === 'care' ? careSection : tab] ?? 'The building itself: what it is, what it must keep, who is in it.'}</span></>}
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

        {tab === 'overview' && <PillTabs size="filter" aria-label="Overview sections" value={showInsurance ? 'insurance' : 'building'} onChange={id => go('overview', id === 'insurance' ? 'insurance' : undefined)} tabs={[{ id: 'building', label: 'The building' }, { id: 'insurance', label: 'Insurance', badge: insuranceLapsed ? `${insuranceLapsed} lapsed` : undefined, badgeTone: 'red' as const }]} />}
        {tab === 'care' && <PillTabs size="filter" aria-label="Care sections" value={careSection} onChange={id => go('care', id)} tabs={[{ id: 'schedule', label: 'Upkeep', badge: upkeepOverdue ? `${upkeepOverdue} overdue` : undefined, badgeTone: 'red' as const }, { id: 'projects', label: 'Projects', badge: openProjects || undefined, badgeTone: 'navy' as const }, { id: 'utilities', label: 'Utilities' }]} />}
        {tab === 'overview' && !showInsurance && <OverviewTab snap={snap} section={section} onSection={s => go('overview', s)} onGo={go} isBoard={isBoard} />}
        {tab === 'plan' && <PlanTab isBoard={isBoard} />}
        {showInsurance && <InsuranceTab today={snap.today} isBoard={isBoard} />}
        {tab === 'care' && careSection === 'schedule' && <UpkeepTab today={snap.today} isBoard={isBoard} />}
        {tab === 'care' && careSection === 'projects' && <ProjectsTab today={snap.today} isBoard={isBoard} />}
        {tab === 'care' && careSection === 'utilities' && <UtilitiesTab today={snap.today} isBoard={isBoard} />}
        {tab === 'obligations' && <ObligationsTab snap={snap} section={section} onSection={s => go('obligations', s)} isBoard={isBoard} />}
        {tab === 'contracts' && <ContractsTab snap={snap} isBoard={isBoard} onGo={go} />}
        {tab === 'directory' && <DirectoryTab snap={snap} section={section} onSection={s => go('directory', s)} isBoard={isBoard} />}
      </div>
    </HeaderSlotProvider>
  );
}
