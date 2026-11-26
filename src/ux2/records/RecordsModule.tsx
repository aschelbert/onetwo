import { useState } from 'react';
/**
 * Records — what the building keeps once it is settled (ux2.records).
 *
 *  Documents  governing documents and policies, certificates, reports and annual archives
 *  Archive    closed actions, requests and letters with the decision trail, every held
 *             meeting's sealed record, and how long each kind of record stays (board only)
 *
 * Both moved here from Building, which is now about the building itself and
 * the work of looking after it. The tab bodies are the same components, so
 * uploads, exports and the retention schedule are unchanged. Old
 * `/records?tab=documents` and `/records?tab=archive` links redirect here.
 */
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { PillTabs, ModuleHeader, HeaderSlotProvider } from '../components';
import { useBuildingSnapshot } from '../building/useBuildingSnapshot';
import type { BuildingTab } from '../building/BuildingModule';
import DocumentsTab from '../building/tabs/DocumentsTab';
import ArchiveSection from '../building/tabs/ArchiveSection';
import { recordsPath, type RecordsTab } from './paths';

export default function RecordsModule() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const role = useAuthStore(s => s.currentRole);
  const isBoard = role === 'BOARD_MEMBER' || role === 'PROPERTY_MANAGER' || role === 'PLATFORM_ADMIN';
  // Owners never see the archive; a resident landing on it gets Documents.
  const tab: RecordsTab = params.get('tab') === 'archive' && isBoard ? 'archive' : 'documents';
  const section = params.get('section') ?? undefined;
  const snap = useBuildingSnapshot();

  const go = (next: RecordsTab, nextSection?: string) => {
    setParams(prev => {
      const p = new URLSearchParams(prev);
      if (next === 'documents') p.delete('tab'); else p.set('tab', next);
      if (nextSection) p.set('section', nextSection); else p.delete('section');
      return p;
    }, { replace: true });
  };
  /** A Documents link out to a Building tab, or across to the other Records tab. */
  const goBuilding = (next: BuildingTab, nextSection?: string) => {
    if (next === 'documents' || next === 'archive') { go(next, nextSection); return; }
    const q = new URLSearchParams();
    if (next !== 'overview') q.set('tab', next);
    if (nextSection) q.set('section', nextSection);
    navigate(`/building${q.toString() ? `?${q}` : ''}`);
  };

  const tabs = [
    { id: 'documents' as RecordsTab, label: 'Documents' },
    ...(isBoard ? [{ id: 'archive' as RecordsTab, label: 'Archive' }] : []),
  ];

  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  return (
    <HeaderSlotProvider value={headerSlot}>
      <div data-page="ux2-records" className="flex flex-col gap-5">
        <ModuleHeader
          slotRef={setHeaderSlot}
          title="Records"
          subtitle={<><span className="block font-semibold">{snap.name}</span><span className="mt-1 block">{tab === 'archive'
            ? 'The actions, requests and letters this board has closed, read-only, with the decision trail behind each one. Nothing here needs you; owners never see it.'
            : "The building's papers: what governs it, what insures it, and the record of each year."}</span></>}
          tabs={<PillTabs tabs={tabs} value={tab} onChange={id => go(id)} aria-label="Records sections" />}
        />
        {tab === 'documents' && <DocumentsTab snap={snap} section={section} onSection={s => go('documents', s)} onGo={goBuilding} isBoard={isBoard} />}
        {tab === 'archive' && <ArchiveSection />}
      </div>
    </HeaderSlotProvider>
  );
}

