/**
 * The assists under one checklist item: open the information to review in
 * place, use the step's tools (letter, vote, attach, work order, invoice,
 * meeting, note), go to the module where the work happens (the case dock
 * follows), or open the official site for work done outside the app.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CaseTrackerCase, CaseStep } from '@/types/issues';
import type { StepAction } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useCaseDockStore } from '@/ux2/shell/caseDock';
import { resolveCheck, type Assist, type ToolId } from '../../checkAssist';
import { isOwnTask } from '../../stepGuide';
import { CheckPanel } from './CheckPanels';

const TOOL_ACTION: Partial<Record<ToolId, string>> = {
  'send-comm': 'send-comm', 'board-vote': 'board-vote', 'owner-vote': 'owner-vote', 'upload-doc': 'upload-doc',
  'create-wo': 'create-wo', 'create-invoice': 'create-invoice', 'create-meeting': 'create-meeting',
};

export function CheckAssist({ c, step, stepIndex, checkId, label, note, onSaveNote, onAction, onAddNote, onUploadCheckDoc }: {
  c: CaseTrackerCase;
  step: CaseStep;
  stepIndex: number;
  checkId: string;
  label: string;
  /** What has been written for this item. */
  note?: string;
  /** Save what is written for this item, in place. Without it the note goes on the step. */
  onSaveNote?: (text: string) => void;
  onAction?: (action: StepAction, stepIdx: number) => void;
  onAddNote?: (stepIdx: number) => void;
  onUploadCheckDoc?: (checkId: string) => void;
}) {
  const navigate = useNavigate();
  const units = useFinancialStore(s => s.units);
  const rememberCheck = useCaseDockStore(s => s.rememberCheck);
  const [open, setOpen] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState(note ?? '');
  useEffect(() => { if (!writing) setText(note ?? ''); }, [note, writing]);
  const hasUnit = !!c.unit && units.some(u => u.number === c.unit);
  // An item that is the step's own task is done where the step's guidance says.
  const { assists } = resolveCheck(label, { catId: c.catId, sitId: c.sitId, step: step.s, hasUnit, guidance: isOwnTask(step, label) ? step.detail : null });

  const run = (a: Assist) => {
    if (a.kind === 'panel') { setOpen(o => (o === a.panel ? null : a.panel)); return; }
    if (a.kind === 'route') { navigate(a.path); return; }
    if (a.kind === 'external') return; // rendered as a link
    if (a.tool === 'note') { if (onSaveNote) setWriting(w => !w); else onAddNote?.(stepIndex); return; }
    if (a.tool === 'upload-doc' && onUploadCheckDoc) { onUploadCheckDoc(checkId); return; }
    const target = TOOL_ACTION[a.tool];
    if (target) onAction?.({ type: 'modal', target, label: a.label }, stepIndex);
  };

  return (
    // Any assist you use (including a panel's link out of the case) marks this item as where you
    // were, so the case dock's Back returns you to it.
    <div className="mt-2" data-check-assist={checkId} onClickCapture={() => rememberCheck(c.id, checkId)}>
      <div className="flex flex-wrap gap-1.5">
        {assists.map((a, i) => {
          const primary = i === 0;
          const cls = `inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${primary ? 'border border-accent-200 bg-accent-50 text-accent-700 hover:bg-accent-100' : 'border border-ink-200 bg-white text-ink-600 hover:bg-mist-50'}`;
          if (a.kind === 'external') return <a key={i} href={a.href} target="_blank" rel="noreferrer" className={cls}>{a.label} ↗</a>;
          const isOpen = a.kind === 'panel' && open === a.panel;
          const isNote = a.kind === 'tool' && a.tool === 'note' && !!onSaveNote;
          return (
            <button key={i} type="button" onClick={() => run(a)} aria-expanded={a.kind === 'panel' ? isOpen : isNote ? writing : undefined} className={cls}>
              {isNote && note ? 'Edit what you wrote' : a.label}{a.kind === 'panel' ? (isOpen ? ' ▴' : ' ▾') : a.kind === 'route' ? ' ↗' : isNote ? (writing ? ' ▴' : ' ▾') : ''}
            </button>
          );
        })}
      </div>
      {/* What was written for this item, and the place to write it. */}
      {note && !writing && <p data-check-note className="mt-2 whitespace-pre-wrap rounded-lg border border-sand-200 bg-sand-100 px-3 py-2 text-[13px] leading-relaxed text-ink-700">{note}</p>}
      {writing && onSaveNote && (
        <form className="mt-2" onSubmit={e => { e.preventDefault(); onSaveNote(text.trim()); setWriting(false); }}>
          <textarea
            autoFocus
            aria-label={`Write it here: ${label}`}
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            placeholder="Write it here. It stays with this item."
            className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] leading-relaxed text-ink-700 placeholder:text-ink-300 focus:border-accent-400 focus:outline-none"
          />
          <div className="mt-1.5 flex gap-2">
            <button type="submit" className="rounded-lg bg-accent-600 px-3 py-1 text-xs font-semibold text-white hover:bg-accent-700">Save</button>
            <button type="button" onClick={() => { setText(note ?? ''); setWriting(false); }} className="rounded-lg border border-ink-200 bg-white px-3 py-1 text-xs font-medium text-ink-600 hover:bg-ink-50">Cancel</button>
          </div>
        </form>
      )}
      {open && <CheckPanel panel={open as never} c={c} step={step} stepIndex={stepIndex} label={label} />}
    </div>
  );
}
