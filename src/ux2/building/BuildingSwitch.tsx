import type { ReactElement } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import BuildingPage from '@/features/building/BuildingPage';
import AssociationTeamPage from '@/features/association-team/AssociationTeamPage';
import ArchivesPage from '@/features/archives/ArchivesPage';
import { useUx2 } from '../flags';
import BuildingModule, { resolveBuildingTab } from './BuildingModule';

/** `/building` shows the redesigned Building module behind ux2.building, the production Building page otherwise. */
export default function BuildingSwitch() {
  return useUx2('building') ? <BuildingModule /> : <BuildingPage />;
}

/** Legacy pages absorbed by the module: with the flag on they redirect into the module's section; otherwise they render as before. */
function absorbed(Legacy: () => ReactElement, defaultTab: string) {
  return function Absorbed() {
    const on = useUx2('building');
    const [params] = useSearchParams();
    if (!on) return <Legacy />;
    const { tab, section } = resolveBuildingTab(params.get('tab') ?? defaultTab);
    const q = new URLSearchParams();
    if (tab !== 'overview') q.set('tab', tab);
    if (section) q.set('section', section);
    return <Navigate to={`/building${q.toString() ? `?${q}` : ''}`} replace />;
  };
}

export const AssociationTeamSwitch = absorbed(AssociationTeamPage, 'property-log');
export const ArchivesSwitch = absorbed(ArchivesPage, 'archives');
