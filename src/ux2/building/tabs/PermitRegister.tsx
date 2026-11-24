import { useNavigate } from 'react-router-dom';
import { useCapitalProjectsStore } from '@/store/useCapitalProjectsStore';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { permitNeeded } from '@/lib/capitalProject';
import type { RepairData } from '@/lib/actions/repair';
import { Button, Card, Chip, Inner, SectionLabel, Table, Th, Td, Why } from '../../components';
import { projectCase } from '../../boardroom/capitalImprovement';
import { recordCase } from '../../boardroom/recordActions';

export interface PermitRow { id: string; work: string; kind: 'Capital project' | 'Repair'; number: string; issuedOn: string; finalInspectionOn: string; caseId: string | null; closed: boolean }

/** Where a permit stands: needed and not on file, on file and open, or finished with its final inspection. */
export function permitStanding(r: Pick<PermitRow, 'number' | 'finalInspectionOn'>): { tone: 'red' | 'amber' | 'sage'; label: string } {
  if (!r.number.trim()) return { tone: 'red', label: 'Needed, not on file' };
  if (!r.finalInspectionOn) return { tone: 'amber', label: 'Open · final inspection to come' };
  return { tone: 'sage', label: `Final inspection ${r.finalInspectionOn}` };
}

/** The permit register: every job that needed a building permit, from the permit step of its action. */
export default function PermitRegister({ isBoard }: { isBoard: boolean }) {
  const navigate = useNavigate();
  const projects = useCapitalProjectsStore(s => s.projects);
  const records = useActionRecordsStore(s => s.records);
  const cases = useIssuesStore(s => s.cases);
  const rows: PermitRow[] = [
    ...projects.filter(permitNeeded).map(p => ({ id: p.id, work: p.title, kind: 'Capital project' as const, number: p.permit.number, issuedOn: p.permit.issuedOn, finalInspectionOn: p.permit.finalInspectionOn, caseId: projectCase(cases, p.id)?.id ?? null, closed: !!p.closedOn })),
    ...records.filter(r => r.kind === 'repair').map(r => ({ r, d: r.data as unknown as RepairData })).filter(x => x.d.permit?.answered && x.d.permit.answers.length > 0)
      .map(({ r, d }) => ({ id: r.id, work: r.title, kind: 'Repair' as const, number: d.permit.number, issuedOn: '', finalInspectionOn: d.permit.finalInspectionOn, caseId: recordCase(cases, r)?.id ?? null, closed: !!r.closedOn })),
  ];
  const open = rows.filter(r => !r.finalInspectionOn).length;
  return (
    <Card aria-label="Permits" className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Permits · {rows.length}</SectionLabel>{open > 0 && <Chip tone="amber">{open} open</Chip>}</div>
      {rows.length === 0 ? <Inner className="text-sm text-ux2-muted">No job has needed a building permit yet. The permit questions are asked in each capital improvement and maintenance repair action.</Inner> : (
        <Table minWidth={640}>
          <thead><tr><Th>Work</Th><Th>From</Th><Th>Permit number</Th><Th>Standing</Th><Th aria-label="Open" /></tr></thead>
          <tbody>{rows.map(r => { const st = permitStanding(r); return <tr key={r.id} data-permit={r.id}><Td className="font-semibold">{r.work}</Td><Td>{r.kind}</Td><Td>{r.number || '—'}{r.issuedOn && <span className="block text-xs text-ux2-muted">Issued {r.issuedOn}</span>}</Td><Td><Chip tone={st.tone}>{st.label}</Chip></Td><Td num>{isBoard && r.caseId ? <Button size="sm" variant="ghost" onClick={() => navigate(`/boardroom?view=case:${r.caseId}`)}>Open the action</Button> : null}</Td></tr>; })}</tbody>
        </Table>
      )}
      <Why>A permit is entered once, in the permit step of the job's action. This list is where it is looked up afterwards: which jobs needed one, its number, and whether the final inspection passed.</Why>
    </Card>
  );
}
