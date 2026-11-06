import { useMemo, useState } from 'react';
import { Button, Card, Chip, Inner, SectionLabel, Tile, TileRow } from '../../components';
import { dayLabel } from '../../home/calendar';
import { useRunbookSwitches } from '../store';
import { runbookStatuses, runbooksSummary, type RunbookStatus, type BoardRoomSnapshot } from '../metrics';

export default function RunbooksTab({ snap, onOpenCase, onNewCase }: { snap: BoardRoomSnapshot; onOpenCase: (id: string) => void; onNewCase: (prefill?: { catId: string; sitId: string }) => void }) {
  const list = useMemo(() => runbookStatuses(snap), [snap]);
  const sum = runbooksSummary(list);
  const setOn = useRunbookSwitches(s => s.setOn);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? list : list.filter(r => r.openCases.length > 0);

  const Row = ({ r }: { r: RunbookStatus }) => (
    <tr data-runbook={r.def.id} className={`border-t border-ux2-line align-top ${r.on ? '' : 'opacity-70'}`}>
      <td className="py-2.5 pr-3">
        <div className="font-semibold text-ux2-ink">{r.def.name}</div>
        <div className="text-xs text-ux2-dim">{r.def.visibility === 'owners' ? 'Owners see this' : 'Board only · the unit sees its own view'}{r.def.sitId ? '' : ' · automation only, no case'}</div>
      </td>
      <td className="hidden py-2.5 pr-3 text-ux2-muted md:table-cell">{r.def.trigger}</td>
      <td className="py-2.5 pr-3 whitespace-nowrap text-ux2-ink">{r.def.automated} of {r.def.steps}<div className="text-xs text-ux2-muted">automated</div></td>
      <td className="hidden py-2.5 pr-3 md:table-cell">
        {r.openCases.length > 0
          ? <div className="flex flex-wrap gap-1">{r.openCases.slice(0, 3).map(c => <button key={c.id} type="button" onClick={() => onOpenCase(c.id)} className="rounded-full"><Chip tone="navy">Open now · {c.unit && !/^(common|n\/a)$/i.test(c.unit) ? `Unit ${c.unit}` : c.title.slice(0, 28)}</Chip></button>)}{r.openCases.length > 3 && <Chip tone="ghost">+{r.openCases.length - 3}</Chip>}</div>
          : r.lastRan ? <span className="text-sm text-ux2-muted">{dayLabel(r.lastRan.date)} · {r.lastRan.title}</span> : <span className="text-xs text-ux2-dim">Never ran</span>}
      </td>
      <td className="py-2.5 whitespace-nowrap">
        <div className="flex items-center justify-end gap-2">
          {r.def.sitId && r.def.catId && <Button size="sm" variant="ghost" onClick={() => onNewCase({ catId: r.def.catId!, sitId: r.def.sitId! })}>Open a case</Button>}
          <button type="button" role="switch" aria-checked={r.on} aria-label={`${r.def.name} ${r.on ? 'on' : 'off'}`} onClick={() => setOn(r.def.id, !r.on)} className={`relative h-6 w-11 rounded-full transition-colors ${r.on ? 'bg-ux2-teal' : 'bg-ux2-line-strong'}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${r.on ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="flex flex-col gap-5">
      <TileRow>
        <Tile tone={sum.withOpenCase.length ? 'navy' : 'grey'} label="With an open case" value={sum.withOpenCase.length} unit={`of ${sum.total}`} sub={sum.withOpenCase.slice(0, 3).map(r => r.def.name).join(' · ') || 'Nothing running right now'} className="min-h-[150px]" />
        <Tile tone="teal" label="Runs on its own" value={sum.automatedSteps} unit={`of ${sum.steps} steps`} sub="The app does these; a person decides the rest, each arriving as a Home card for its role" className="min-h-[150px]" />
        <Tile tone="grey" label="Switched on" value={sum.on} unit={`of ${sum.total}`} sub={sum.on < sum.total ? `${list.filter(r => !r.on).map(r => r.def.name).join(', ')} off · manual` : 'Every runbook is on'} className="min-h-[150px]" />
      </TileRow>

      {sum.withOpenCase.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {sum.withOpenCase.slice(0, 3).map(r => {
            const c = r.openCases[0];
            const steps = c.steps ?? [];
            const idx = Math.max(0, steps.findIndex(s => !s.done));
            return (
              <Card key={r.def.id} aria-label={r.def.name}>
                <div className="flex items-center justify-between"><SectionLabel>{r.def.name}</SectionLabel><Chip tone="teal">{r.def.automated} of {r.def.steps} automated</Chip></div>
                <div className="text-sm text-ux2-muted">{r.def.visibility === 'owners' ? 'Owners see this' : 'Board only'} · {c.title}{steps.length ? ` · step ${idx + 1} of ${steps.length}` : ''}{c.assignedTo ? ` · ${c.assignedTo}` : ''}</div>
                <ol className="m-0 flex list-none flex-wrap gap-1 p-0">
                  {steps.slice(0, 6).map((s, i) => <li key={s.id}><Chip tone={s.done ? 'sage' : i === idx ? 'navy' : 'ghost'}>{s.s.length > 18 ? `${s.s.slice(0, 18)}…` : s.s}</Chip></li>)}
                </ol>
                <Button size="sm" className="self-start" onClick={() => onOpenCase(c.id)}>Open the case</Button>
              </Card>
            );
          })}
        </div>
      )}

      <Card aria-label="All runbooks">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>{showAll ? `All ${sum.total}` : `With an open case · ${sum.withOpenCase.length}`} · on by default · switching one off keeps the playbook for manual cases</SectionLabel>
          <Button size="sm" variant="ghost" onClick={() => setShowAll(v => !v)}>{showAll ? 'With an open case' : `All ${sum.total}`}</Button>
        </div>
        {shown.length === 0 ? <p className="text-sm text-ux2-muted">No runbook has a case open.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.06em] text-ux2-muted">
                  <th className="py-2 pr-3 font-semibold">Runbook</th><th className="hidden py-2 pr-3 font-semibold md:table-cell">Starts when</th><th className="py-2 pr-3 font-semibold">Steps</th><th className="hidden py-2 pr-3 font-semibold md:table-cell">Last ran</th><th className="py-2 text-right font-semibold">On</th>
                </tr>
              </thead>
              <tbody>{shown.map(r => <Row key={r.def.id} r={r} />)}</tbody>
            </table>
          </div>
        )}
        <Inner className="text-xs text-ux2-muted">A runbook with a situation in the case wizard opens its case with the same steps the wizard creates. The others are automations the app runs on its own; switching one off only stops the trigger.</Inner>
      </Card>
    </div>
  );
}
