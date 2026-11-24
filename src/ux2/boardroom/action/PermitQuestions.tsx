import { useState } from 'react';
import { PERMIT_QUESTIONS } from '@/lib/capitalProject';
import { Button, Chip, Field, INPUT, Inner, Why } from '../../components';
import { FORM } from './ActionShell';

export interface PermitAnswers { answered: boolean; answers: string[]; number: string; finalInspectionOn: string }

/** The permit step, shared by every action that does work on the building: six questions, and the permit's number and final inspection when one is needed. */
export default function PermitQuestions({ value, onSave }: { value: PermitAnswers; onSave: (v: PermitAnswers) => void }) {
  const [answers, setAnswers] = useState<string[]>(value.answers);
  const [number, setNumber] = useState(value.number);
  const [finalOn, setFinalOn] = useState(value.finalInspectionOn);
  const needed = answers.length > 0;
  const toggle = (id: string) => setAnswers(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id]));
  return (
    <>
      <Inner className="flex flex-col gap-2">
        {PERMIT_QUESTIONS.map(q => (
          <label key={q.id} className="flex items-start gap-2.5 text-sm text-ux2-ink"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={answers.includes(q.id)} onChange={() => toggle(q.id)} /><span>{q.label}{q.also && answers.includes(q.id) && <span className="block text-xs text-ux2-amber">{q.also}</span>}</span></label>
        ))}
      </Inner>
      <Inner className={needed ? 'border-ux2-teal' : ''}>
        <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm font-semibold text-ux2-ink">{needed ? 'A building permit is needed' : 'No permit is needed, on these answers'}</b>{needed && <Chip tone={number.trim() ? 'sage' : 'amber'}>{number.trim() ? 'On file' : 'Not on file yet'}</Chip>}</div>
        {needed && (
          <div className={`${FORM} mt-2`}>
            <Field label="Permit number" className="w-[180px]"><input value={number} onChange={e => setNumber(e.target.value)} className={INPUT} /></Field>
            <Field label="Final inspection passed" className="w-[190px]"><input type="date" value={finalOn} onChange={e => setFinalOn(e.target.value)} className={INPUT} /></Field>
          </div>
        )}
      </Inner>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Why className="min-w-[240px] flex-1">{needed ? 'The work cannot be marked done until the permit number is entered, and the sign-off waits on its final inspection. Come back to this step to enter them.' : 'Answering is the step. With every box clear, "no permit needed" goes on the record.'} The permit office decides in the end.</Why>
        <Button size="sm" onClick={() => onSave({ answered: true, answers, number: needed ? number.trim() : '', finalInspectionOn: needed ? finalOn : '' })}>{value.answered ? 'Save' : 'Save the answers'}</Button>
      </div>
    </>
  );
}
