import { useAuthStore } from '@/store/useAuthStore';
import { ACCOMMODATION_SETTINGS, mayHandle, settingsFrom } from '../accommodation';
import type { ReactElement } from 'react';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { actionKind, stepsOf, type ActionRecord, type ActionStep } from '@/lib/actions';
import { Card, Inner } from '../../components';
import ActionShell from './ActionShell';
import { PANELS } from './panels';

export interface PanelProps<D = Record<string, unknown>> {
  r: ActionRecord<D>;
  step: ActionStep;
  /** Merge into the record's data. */
  patch: (changes: Partial<D>) => void;
  /** Close the record on a date; its action closes with it. */
  close: (on: string) => void;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Panel = (props: PanelProps<any>) => ReactElement | null;

/** The Board Room page for a record-backed action. */
export default function RecordAction({ recordId, caseId, onBack, onOpenRecord }: { recordId: string; caseId: string; onBack: () => void; onOpenRecord: () => void }) {
  const record = useActionRecordsStore(s => s.records.find(r => r.id === recordId));
  const patchData = useActionRecordsStore(s => s.patchData);
  const patchRecord = useActionRecordsStore(s => s.patch);
  const saveError = useActionRecordsStore(s => s.saveError);
  const def = record ? actionKind(record.kind) : undefined;
  const role = useAuthStore(s => s.currentUser.role);
  const settings = useActionRecordsStore(s => s.records.find(r => r.kind === ACCOMMODATION_SETTINGS))?.data;
  if (!record || !def) {
    return <div className="flex flex-col gap-4"><button type="button" onClick={onBack} className="self-start text-sm font-semibold text-ux2-teal hover:underline">← Current Actions</button><Card><Inner className="text-sm text-ux2-muted">This action's record is not available to you: it is private to the board, or it is no longer on file.</Inner></Card></div>;
  }
  // An accommodation request is private: without the right to see it, not even its steps are shown.
  if (record.kind === 'accommodation' && !mayHandle(role, settingsFrom(settings))) {
    return <div className="flex flex-col gap-4" data-accommodation-private><button type="button" onClick={onBack} className="self-start text-sm font-semibold text-ux2-teal hover:underline">← Current Actions</button><Card><Inner className="text-sm text-ux2-ink"><b className="font-semibold">This request is private to the board.</b> A board member can let the manager see these from the action itself.</Inner></Card></div>;
  }
  const panels = PANELS[record.kind] ?? {};
  return (
    <ActionShell
      kindName={def.name} title={record.title} closed={!!record.closedOn} saveError={saveError}
      subtitle={[`opened ${record.openedOn}`, record.unit && `Unit ${record.unit}`, record.dueOn && !record.closedOn && `due ${record.dueOn}`, record.closedOn && `closed ${record.closedOn}`].filter(Boolean).join(' · ')}
      steps={stepsOf(record)} how={def.how} onBack={onBack} onOpenRecord={onOpenRecord} dataAttrs={{ 'data-record': record.id, 'data-kind': record.kind, 'data-case': caseId }}
      panel={step => { const P = panels[step.key]; return P ? <P r={record} step={step} patch={c => patchData(record.id, c as Record<string, unknown>)} close={on => patchRecord(record.id, { closedOn: on })} /> : null; }}
    />
  );
}
