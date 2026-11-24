import { useState, type ReactNode } from 'react';
import type { ActionStep } from '@/lib/actions/types';
import { Button, Card, Chip, SectionLabel } from '../../components';

export const AREA = 'w-full rounded-[10px] border border-ux2-line-strong px-3 py-2 text-sm';
export const FORM = 'flex flex-wrap items-end gap-3';
export const NOTE = 'rounded-[10px] bg-ux2-amber-tint px-3 py-2 text-xs text-ux2-ink';
export const money = (s: string) => Math.max(0, Math.round((Number(String(s).replace(/[^0-9.]/g, '')) || 0) * 100) / 100);

/** A guided action's page: its steps on the left, the open step's work on the right. */
export default function ActionShell({ kindName, title, subtitle, steps, how, closed, saveError, onBack, onOpenRecord, panel, dataAttrs }: {
  kindName: string; title: string; subtitle: string; steps: ActionStep[]; how: Record<string, string>; closed: boolean; saveError?: string | null;
  onBack: () => void; onOpenRecord: () => void; panel: (step: ActionStep) => ReactNode; dataAttrs?: Record<string, string>;
}) {
  const current = steps.find(s => !s.done);
  const [picked, setPicked] = useState<string | null>(null);
  const open = steps.find(s => s.key === (picked ?? current?.key)) ?? steps[steps.length - 1];
  if (!open) return null;
  const at = steps.indexOf(open) + 1;
  return (
    <div data-page="ux2-action" {...dataAttrs} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={onBack} className="text-sm font-semibold text-ux2-teal hover:underline">← Current Actions</button>
          <h1 className="m-0 text-[28px] font-medium tracking-[-0.01em] text-ux2-ink">{title}</h1>
          <div className="text-[13px] text-ux2-muted">{kindName}{subtitle ? ` · ${subtitle}` : ''}</div>
        </div>
        <span className="flex flex-wrap items-center gap-2"><Chip tone={closed || !current ? 'sage' : 'navy'}>{closed ? 'Closed' : current ? `Step ${steps.indexOf(current) + 1} of ${steps.length}` : 'All steps done'}</Chip><Button size="sm" variant="ghost" onClick={onOpenRecord}>Notes and decision trail</Button></span>
      </div>
      {saveError && <div role="alert" className="rounded-[10px] bg-ux2-red-tint px-3 py-2 text-xs text-ux2-ink">{saveError}</div>}
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)]">
        <Card aria-label="Steps" className="gap-2">
          <SectionLabel>Steps</SectionLabel>
          <ol className="m-0 flex list-none flex-col gap-1 p-0">
            {steps.map((s, i) => {
              const isOpen = s.key === open.key;
              return (
                <li key={s.key}>
                  <button type="button" aria-current={isOpen ? 'step' : undefined} data-step={s.key} data-done={s.done ? '1' : '0'} onClick={() => setPicked(s.key)} className={`flex w-full items-start gap-3 rounded-[14px] border px-3 py-2 text-left ${isOpen ? 'border-ux2-teal bg-white' : 'border-transparent hover:bg-white'}`}>
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${s.done ? 'bg-ux2-navy text-white' : s.key === current?.key ? 'bg-ux2-teal text-white' : 'border border-ux2-line-strong bg-white text-ux2-muted'}`}>{i + 1}</span>
                    <span className="min-w-0"><span className="block text-[13px] font-semibold text-ux2-ink">{s.title}</span><span className="block text-xs text-ux2-muted">{s.summary || (s.waitsOn ? `Waits on ${s.waitsOn}` : s.key === current?.key ? 'You are here' : '')}</span></span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Card>
        <Card aria-label={`Step ${at}, ${open.title}`} className="gap-3 border-ux2-teal">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="m-0 text-lg font-semibold text-ux2-ink">Step {at} · {open.title}</h2>{open.done ? <Chip tone="sage">Done</Chip> : open.waitsOn ? <Chip tone="amber">Waits on {open.waitsOn}</Chip> : null}</div>
          {open.waitsOn && <div role="alert" className={NOTE}>This step is waiting on {open.waitsOn}.</div>}
          <div key={open.key} className="flex flex-col gap-3">{panel(open)}</div>
          <p className="m-0 text-xs text-ux2-dim">{how[open.key]}.</p>
        </Card>
      </div>
    </div>
  );
}
