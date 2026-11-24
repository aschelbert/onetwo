import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCapitalProjectsStore } from '@/store/useCapitalProjectsStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';
import { FUNDING_LABEL, awardedBid, blankProject, permitNeeded, projectCost, projectSteps, type CapitalProject } from '@/lib/capitalProject';
import { Button, Card, Chip, Inner, SectionLabel, Table, Th, Td, Cell, Why, Field, INPUT, HeaderActions } from '../../components';
import { projectCase, runCapitalImprovement } from '../../boardroom/capitalImprovement';
import PermitRegister from './PermitRegister';

function StartForm({ today, onStarted, onClose }: { today: string; onStarted: (projectId: string) => void; onClose: () => void }) {
  const add = useCapitalProjectsStore(s => s.add);
  const assets = useBuildingStore(s => s.assets);
  const [title, setTitle] = useState('');
  const [need, setNeed] = useState('');
  const [assetId, setAssetId] = useState('');
  const start = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !need.trim()) return;
    const asset = assets.find(a => a.id === assetId);
    const id = add({ ...blankProject(title.trim(), need.trim(), today), assetId, reserveItemId: asset?.reserveItemId ?? '' });
    onStarted(id);
  };
  return (
    <form aria-label="Start a project" onSubmit={start} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <Field label="Project" className="min-w-[220px] flex-1"><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Garage gate system" className={INPUT} /></Field>
      <Field label="The asset it replaces or improves" className="w-[240px]"><select value={assetId} onChange={e => { setAssetId(e.target.value); const a = assets.find(x => x.id === e.target.value); if (a && !title) setTitle(a.name); }} className={INPUT}><option value="">None, or not listed</option>{assets.map(a => <option key={a.id} value={a.id}>{a.name} · {a.condition.toLowerCase()}</option>)}</select></Field>
      <Field label="Why it is needed" className="min-w-[280px] flex-[2]"><input value={need} onChange={e => setNeed(e.target.value)} placeholder="Controller failing; two outages this month; parts no longer made" className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!title.trim() || !need.trim()}>Start and open its action</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

function stageChip(p: CapitalProject, limit: number) {
  const steps = projectSteps(p, limit);
  const cur = steps.find(s => !s.done);
  if (!cur) return <Chip tone="sage">Closed {p.closedOn}</Chip>;
  return <Chip tone={cur.waitsOn ? 'amber' : 'navy'}>Step {steps.indexOf(cur) + 1} of {steps.length} · {cur.title}</Chip>;
}

/** Building › Projects: every capital improvement, where it stands, and the way into its action. */
export default function ProjectsTab({ today, isBoard }: { today: string; isBoard: boolean }) {
  const navigate = useNavigate();
  const projects = useCapitalProjectsStore(s => s.projects);
  const saveError = useCapitalProjectsStore(s => s.saveError);
  const cases = useIssuesStore(s => s.cases);
  const reserves = useFinancialStore(s => s.reserveItems);
  const workOrders = useFinancialStore(s => s.workOrders);
  const limit = useBuildingStore(s => s.bylawsConfig?.boardSpendingLimit) || 5000;
  const [starting, setStarting] = useState(false);
  const rows = useMemo(() => [...projects].sort((a, b) => Number(!!a.closedOn) - Number(!!b.closedOn) || b.openedOn.localeCompare(a.openedOn)), [projects]);
  const open = rows.filter(p => !p.closedOn);
  const committed = open.reduce((t, p) => t + (awardedBid(p)?.amount ?? 0), 0);
  const openAction = (projectId: string) => {
    // The runbook opens the action as the project starts; run it here so the action exists before the page turns.
    runCapitalImprovement(today);
    const c = projectCase(useIssuesStore.getState().cases, projectId);
    if (c) navigate(`/boardroom?view=case:${c.id}`);
  };

  return (
    <div className="flex flex-col gap-4">
      {isBoard && <HeaderActions><Button onClick={() => setStarting(v => !v)}>Start a project</Button></HeaderActions>}
      {starting && <StartForm today={today} onClose={() => setStarting(false)} onStarted={id => { setStarting(false); openAction(id); }} />}
      {saveError && <div role="alert" className="rounded-[10px] bg-ux2-red-tint px-3 py-2 text-xs text-ux2-ink">{saveError}</div>}
      <Card aria-label="Capital projects" className="gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Capital projects · {open.length} open</SectionLabel>{committed > 0 && <span className="text-xs text-ux2-muted">{fmt(committed)} under contract</span>}</div>
        {rows.length === 0 ? <Inner className="text-sm text-ux2-muted">No projects yet. Start one when something has to be replaced or improved: the roof, a boiler, the lobby. Its action walks the board from the options to the close-out.</Inner> : (
          <Table minWidth={860}>
            <thead><tr><Th>Project</Th><Th>Replaces</Th><Th num>Cost</Th><Th>Paid from</Th><Th>Permit</Th><Th>Stage</Th><Th aria-label="Open" /></tr></thead>
            <tbody>
              {rows.map(p => {
                const reserve = reserves.find(r => r.id === p.reserveItemId);
                const wo = workOrders.find(w => w.id === p.workOrderId);
                const linked = projectCase(cases, p.id);
                return (
                  <tr key={p.id} data-project={p.id} className={p.closedOn ? 'opacity-70' : ''}>
                    <Td><Cell title={p.title} note={`opened ${p.openedOn}${awardedBid(p) ? ` · ${awardedBid(p)!.vendor}` : ''}`} /></Td>
                    <Td>{reserve ? `Reserve item · ${reserve.name}` : <span className="text-ux2-muted">An improvement</span>}</Td>
                    <Td num className="font-semibold">{projectCost(p) ? fmt(projectCost(p)) : '—'}{wo?.status === 'paid' && <span className="block text-xs font-normal text-ux2-muted">paid</span>}</Td>
                    <Td>{p.funding.source ? FUNDING_LABEL[p.funding.source] : <span className="text-ux2-muted">To decide</span>}</Td>
                    <Td>{!p.permit.answered ? <span className="text-ux2-muted">Not asked yet</span> : !permitNeeded(p) ? 'Not needed' : p.permit.number ? <Chip tone={p.permit.finalInspectionOn ? 'sage' : 'navy'}>{p.permit.number}{p.permit.finalInspectionOn ? ' · final passed' : ''}</Chip> : <Chip tone="amber">Needed · not on file</Chip>}</Td>
                    <Td>{stageChip(p, limit)}</Td>
                    <Td num>{isBoard && (linked || !p.closedOn) ? <Button size="sm" variant="ghost" onClick={() => openAction(p.id)}>Open the action</Button> : null}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Why>A project is worked in its action, step by step: the options and what each pays back, how it is paid for, whether it needs a permit, the scope and bids, the award, the work, the sign-off, and the close-out that resets its reserve component. This list is where the results are read.</Why>
      </Card>
      <PermitRegister isBoard={isBoard} />
    </div>
  );
}
