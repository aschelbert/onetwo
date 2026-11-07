/**
 * The assists under one checklist item: open the information to review in
 * place, use the step's tools (letter, vote, attach, work order, invoice,
 * meeting, note), go to the module where the work happens (the case dock
 * follows), or open the official site for work done outside the app.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CaseTrackerCase, CaseStep } from '@/types/issues';
import type { StepAction } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { resolveCheck, type Assist, type ToolId } from '../../checkAssist';
import { CheckPanel } from './CheckPanels';

const TOOL_ACTION: Partial<Record<ToolId, string>> = {
  'send-comm': 'send-comm', 'board-vote': 'board-vote', 'owner-vote': 'owner-vote', 'upload-doc': 'upload-doc',
  'create-wo': 'create-wo', 'create-invoice': 'create-invoice', 'create-meeting': 'create-meeting',
};

export function CheckAssist({ c, step, stepIndex, checkId, label, onAction, onAddNote, onUploadCheckDoc }: {
  c: CaseTrackerCase;
  step: CaseStep;
  stepIndex: number;
  checkId: string;
  label: string;
  onAction?: (action: StepAction, stepIdx: number) => void;
  onAddNote?: (stepIdx: number) => void;
  onUploadCheckDoc?: (checkId: string) => void;
}) {
  const navigate = useNavigate();
  const units = useFinancialStore(s => s.units);
  const [open, setOpen] = useState<string | null>(null);
  const hasUnit = !!c.unit && units.some(u => u.number === c.unit);
  const { assists } = resolveCheck(label, { catId: c.catId, sitId: c.sitId, step: step.s, hasUnit });

  const run = (a: Assist) => {
    if (a.kind === 'panel') { setOpen(o => (o === a.panel ? null : a.panel)); return; }
    if (a.kind === 'route') { navigate(a.path); return; }
    if (a.kind === 'external') return; // rendered as a link
    if (a.tool === 'note') { onAddNote?.(stepIndex); return; }
    if (a.tool === 'upload-doc' && onUploadCheckDoc) { onUploadCheckDoc(checkId); return; }
    const target = TOOL_ACTION[a.tool];
    if (target) onAction?.({ type: 'modal', target, label: a.label }, stepIndex);
  };

  return (
    <div className="mt-2" data-check-assist={checkId}>
      <div className="flex flex-wrap gap-1.5">
        {assists.map((a, i) => {
          const primary = i === 0;
          const cls = `inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${primary ? 'border border-accent-200 bg-accent-50 text-accent-700 hover:bg-accent-100' : 'border border-ink-200 bg-white text-ink-600 hover:bg-mist-50'}`;
          if (a.kind === 'external') return <a key={i} href={a.href} target="_blank" rel="noreferrer" className={cls}>{a.label} ↗</a>;
          const isOpen = a.kind === 'panel' && open === a.panel;
          return (
            <button key={i} type="button" onClick={() => run(a)} aria-expanded={a.kind === 'panel' ? isOpen : undefined} className={cls}>
              {a.label}{a.kind === 'panel' ? (isOpen ? ' ▴' : ' ▾') : a.kind === 'route' ? ' ↗' : ''}
            </button>
          );
        })}
      </div>
      {open && <CheckPanel panel={open as never} c={c} step={step} stepIndex={stepIndex} label={label} />}
    </div>
  );
}
