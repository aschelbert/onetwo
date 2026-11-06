import { useNavigate } from 'react-router-dom';
import BuildingPage from '@/features/building/BuildingPage';
import ArchivesPage from '@/features/archives/ArchivesPage';
import { useReportsStore } from '@/store/useReportsStore';
import { useArchiveStore } from '@/store/useArchiveStore';
import { Button, Card, Chip, Inner, PillTabs, SectionLabel, TileSwitcher, type TileSection } from '../../components';
import { dayLabel } from '../../home/calendar';
import { documentsSummary, insuranceStatus, type BuildingSnapshot } from '../metrics';
import type { BuildingTab } from '../BuildingModule';

type Section = 'governing' | 'certificates' | 'reports' | 'archives';
const SECTIONS: Section[] = ['governing', 'certificates', 'reports', 'archives'];
type TileId = 'governing' | 'certificates' | 'records';

export default function DocumentsTab({ snap, section, onSection, onGo, isBoard }: { snap: BuildingSnapshot; section?: string; onSection: (s: string) => void; onGo: (tab: BuildingTab, section?: string) => void; isBoard: boolean }) {
  const navigate = useNavigate();
  const docs = documentsSummary(snap);
  const ins = insuranceStatus(snap);
  const reports = useReportsStore(s => s.reports);
  const archives = useArchiveStore(s => s.archives);
  const current: Section = (SECTIONS as string[]).includes(section ?? '') ? (section as Section) : 'governing';
  const tile: TileId = current === 'reports' || current === 'archives' ? 'records' : current;
  const needs = [
    ...docs.reviewDue.map(d => ({ id: `rev:${d.id}`, title: `${d.name} is due for review`, detail: 'Its obligation stays open until the reviewed version is on file', tone: 'amber' as const, section: 'governing' as Section })),
    ...docs.missingFile.filter(d => d.status === 'current').map(d => ({ id: `file:${d.id}`, title: `${d.name} has no file attached`, detail: 'Owners can see the entry but not the document', tone: 'ghost' as const, section: 'governing' as Section })),
    ...ins.filter(p => p.state !== 'current').map(p => ({ id: `cert:${p.id}`, title: `${p.type} certificate ${p.state === 'lapsed' ? 'has expired' : `expires ${dayLabel(p.expires)}`}`, detail: 'The new certificate arrives with the renewal', tone: (p.state === 'lapsed' ? 'red' : 'amber') as 'red' | 'amber', section: 'certificates' as Section })),
  ];

  const sections: TileSection<TileId>[] = [
    {
      id: 'governing',
      tile: {
        tone: docs.reviewDue.length > 0 ? 'navy' : 'grey',
        label: 'Governing and policies',
        value: docs.total,
        unit: 'documents',
        sub: `${docs.withFile} with a file · ${docs.reviewDue.length} due for review · bylaws, CC&Rs, rules and policies`,
      },
      detail: <div className="ux2-legacy"><BuildingPage embedded tab="legal" /></div>,
    },
    {
      id: 'certificates',
      tile: {
        tone: ins.some(p => p.state === 'lapsed') ? 'red' : 'grey',
        label: 'Insurance certificates',
        value: docs.certificates,
        unit: `of ${docs.policies} on file`,
        sub: ins[0] ? `${ins[0].type} ${ins[0].state === 'lapsed' ? 'lapsed' : 'expires'} ${dayLabel(ins[0].expires)}` : 'No policies yet',
      },
      detail: (
        <Card aria-label="Insurance certificates">
          <SectionLabel>Insurance certificates</SectionLabel>
          {ins.length === 0 ? <p className="text-sm text-ux2-muted">No policies on file.</p> : (
            <ul className="m-0 list-none divide-y divide-ux2-line p-0">
              {ins.map(p => (
                <li key={p.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-ux2-ink">{p.type} certificate</div>
                    <div className="text-xs text-ux2-muted">{p.carrier} · {p.state === 'lapsed' ? `lapsed ${dayLabel(p.expires)}` : `expires ${dayLabel(p.expires)}`} · {p.hasCertificate ? 'on file' : 'no file attached'}</div>
                  </div>
                  <Chip tone={p.state === 'lapsed' ? 'red' : p.state === 'expiring' ? 'amber' : p.hasCertificate ? 'sage' : 'ghost'}>{p.state === 'lapsed' ? 'Expired' : p.state === 'expiring' ? `${p.daysLeft} days` : p.hasCertificate ? 'Current' : 'Missing file'}</Chip>
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" variant="ghost" className="self-start" onClick={() => onGo('overview', 'insurance')}>Policies and attachments · Overview</Button>
        </Card>
      ),
    },
    {
      id: 'records',
      tile: {
        tone: 'teal',
        label: 'Reports and annual archives',
        value: archives.length,
        unit: `archived year${archives.length === 1 ? '' : 's'}`,
        sub: `${reports.length} report${reports.length === 1 ? '' : 's'} generated · board packet, financial statement, delinquency, compliance summary, minutes, annual report${archives[0] ? ` · latest ${archives[0].label}` : ''}`,
      },
      detail: (
        <div className="flex flex-col gap-4">
          <PillTabs size="filter" aria-label="Records" value={current === 'archives' ? 'archives' : 'reports'} onChange={onSection} tabs={[{ id: 'reports', label: 'Reports', badge: reports.length || undefined }, { id: 'archives', label: 'Annual archives', badge: archives.length || undefined }]} />
          {current === 'archives' ? <div className="ux2-legacy"><ArchivesPage key="archives" embedded tab="archives" /></div> : <div className="ux2-legacy"><ArchivesPage key="reports" embedded tab="reports" /></div>}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {needs.length > 0 && (
        <Card aria-label="Needs you">
          <SectionLabel>Needs you</SectionLabel>
          <ul className="m-0 list-none divide-y divide-ux2-line p-0">
            {needs.slice(0, 5).map(n => (
              <li key={n.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-ux2-ink">{n.title}</div>
                  <div className="text-xs text-ux2-muted">{n.detail}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Chip tone={n.tone}>{n.tone === 'red' ? 'Expired' : n.tone === 'amber' ? 'Due' : 'Missing file'}</Chip>
                  {isBoard && <Button size="sm" onClick={() => onSection(n.section)}>Open</Button>}
                </div>
              </li>
            ))}
          </ul>
          <Inner className="text-xs text-ux2-muted">A missing document leaves its obligation open until it is on file.</Inner>
        </Card>
      )}
      <TileSwitcher sections={sections} value={tile} onChange={id => onSection(id === 'records' ? 'reports' : id)} hint="Tap a tile to open it below. Minutes live with the meetings in Community." />
      <Card aria-label="Minutes">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <SectionLabel>Minutes archive</SectionLabel>
            <p className="text-sm text-ux2-muted">Every approved set of board and annual meeting minutes stays with its meeting.</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => navigate('/community?tab=meetings')}>Open in Community</Button>
        </div>
      </Card>
    </div>
  );
}
