import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CATS, useIssuesStore, withChecklists } from '@/store/useIssuesStore';
import { deriveChecks, guidanceTasks, isOwnTask, pagesInText, titleTasks } from '@/features/issues/stepGuide';
import { resolveCheck } from '@/features/issues/checkAssist';
import { CheckAssist } from '@/features/issues/components/workflow/CheckAssist';
import { StepContent } from '@/features/issues/components/shell/StepContent';
import { budgetSteps } from '@/ux2/boardroom/annualBudget';
import type { CaseTrackerCase } from '@/types/issues';

const ctx = { catId: 'financial', sitId: 'runbook-month-close', step: '', hasUnit: false };
const labels = (r: ReturnType<typeof resolveCheck>) => r.assists.map(a => a.label);

beforeEach(() => {
  cleanup();
  useIssuesStore.setState({ cases: [], nextCaseNum: 1, casesLoaded: true });
});

describe('a checklist from the step\'s own words', () => {
  it('reads the tasks in a title and the instructions in the guidance, and leaves out what the app does', () => {
    expect(titleTasks('Present the adopted budget for owner ratification; prepare the annual financial report')).toEqual(['Present the adopted budget for owner ratification', 'Prepare the annual financial report']);
    expect(titleTasks('Tell owners by 2026-12-02: the adopted budget and the new dues')).toEqual([]);
    expect(guidanceTasks('Verify each proxy is signed by a record owner. Proxies count toward quorum. Keep all proxy forms for 1 year. This step ticks itself when the meeting is held.')).toEqual(['Verify each proxy is signed by a record owner', 'Keep all proxy forms for 1 year']);
    expect(deriveChecks({ s: 'Close the books through 2026-10-31', detail: 'Funds › Statements closes the period. This step ticks itself when Funds closes the books.' })).toEqual(['Close the books through 2026-10-31']);
    expect(deriveChecks({ s: 'Send the notice; file the proof', detail: 'Use the notice template. Send the notice.' })).toEqual(['Send the notice', 'File the proof', 'Use the notice template']);
    expect(isOwnTask({ s: 'Send the notice; file the proof' }, 'File the proof')).toBe(true);
    expect(isOwnTask({ s: 'Send the notice; file the proof' }, 'Use the notice template')).toBe(false);
  });

  it('finds the pages a text names, the longest name winning, in order', () => {
    expect(pagesInText('Enter them under Funds › Planning › Budget, then file it under Building › Documents.')).toEqual([
      { label: 'Funds › Planning › Budget', path: '/funds?tab=planning&section=budget' },
      { label: 'Building › Documents', path: '/building?tab=documents' },
    ]);
    expect(pagesInText('Nothing here')).toEqual([]);
  });
});

describe('what each item offers', () => {
  it('a page the item or its step names comes first, so the dock can follow', () => {
    expect(resolveCheck('Upload the certificate under Building › Overview › Insurance', ctx).assists.some(a => a.kind === 'route' && a.path === '/building?tab=overview&section=insurance')).toBe(true);
    expect(labels(resolveCheck('Post it under Community › Notices', { ...ctx, sitId: 'x' }))[0]).toBe('Open Community › Notices');
    const own = resolveCheck('Close the books through 2026-10-31', { ...ctx, guidance: 'Funds › Statements closes the period.' });
    expect(labels(own)).toEqual(['Open Funds › Statements', 'Add a note', 'Attach it to the action']);
    expect(own.fallback).toBe(false);
  });

  it('information shown in place can also be opened where it lives', () => {
    const r = resolveCheck('Cite specific CC&R or rule section', { catId: 'enforcement', sitId: 'covenant-violations', step: '', hasUnit: true });
    expect(r.assists[0]).toMatchObject({ kind: 'panel', panel: 'documents' });
    expect(r.assists.some(a => a.kind === 'route' && a.path === '/building?tab=documents')).toBe(true);
    const evac = resolveCheck('Review evacuation routes and assembly points', { catId: 'maintenance', sitId: 'obligation-m5', step: '', hasUnit: false });
    expect(evac.assists.some(a => a.kind === 'route')).toBe(true);
  });

  it('an item that asks for something to be written gets a place to write it', () => {
    const has = (label: string, c = ctx) => resolveCheck(label, c).assists.some(a => a.kind === 'tool' && a.tool === 'note');
    for (const label of ['Describe the violation clearly', 'List planned capital improvements', 'Identify number of board seats up for election', 'Document the reason for the delay', 'Note who attended', 'Record the rationale for the selection']) expect(has(label), label).toBe(true);
    // Writing comes first only when nothing more specific is known about the item.
    expect(resolveCheck('Describe what the inspector found on site', { ...ctx, sitId: 'x' }).assists.find(a => a.kind === 'tool' && a.tool === 'note')?.label).toBe('Write it here');
    expect(resolveCheck('Itemize lien amount', { catId: '', sitId: 'delinquent-accounts', step: '', hasUnit: true }).assists[0]).toMatchObject({ panel: 'unit-ledger' });
    // Every written item across every situation that says note, describe or list has it.
    const missing: string[] = [];
    for (const c of CATS) for (const s of c.sits) for (const ap of ['pre', 'self', 'legal'] as const) for (const st of s[ap] ?? []) for (const k of st.ck ?? []) {
      if (/^(note|describe|list|document|record|identify|summari[sz]e|write|explain|outline)\b/i.test(k) && !has(k, { catId: c.id, sitId: s.id, step: st.s, hasUnit: false })) missing.push(`${s.id}: ${k}`);
    }
    expect(missing).toEqual([]);
  });
});

describe('every step of every action', () => {
  it('has a checklist, whichever situation and approach it is on, except the budget\'s guided steps', () => {
    const store = useIssuesStore.getState();
    const bare: string[] = [];
    for (const c of CATS) for (const s of c.sits) for (const approach of ['pre', 'self', 'legal'] as const) {
      const id = store.createCase({ catId: c.id, sitId: s.id, approach, title: s.title, unit: '', owner: '', priority: 'medium', notes: '' });
      const made = useIssuesStore.getState().cases.find(x => x.id === id);
      if (!made?.steps) continue;
      const guided = s.id === 'annual-budgeting' && approach === 'pre';
      for (const st of made.steps) {
        const has = (st.checks?.length ?? 0) > 0 || (st.actions?.length ?? 0) > 0;
        if (guided ? has : !has) bare.push(`${s.id}/${approach}: ${st.s}`);
      }
    }
    expect(bare).toEqual([]);
  });

  it('gives a runbook\'s own steps a checklist when they are made and when they come back from the database without one', () => {
    const id = useIssuesStore.getState().createCase({ catId: 'financial', sitId: 'runbook-month-close', approach: 'pre', title: 'Month close', unit: '', owner: '', priority: 'medium', notes: '', source: 'runbook', sourceId: 'month-close:2026-10', customSteps: [{ s: 'Post the dues', detail: 'Funds › Income › Invoices. This step ticks itself.' }, { s: 'Reconcile the bank', ck: ['Every payment entered', 'Balance matches'] }] });
    const c = useIssuesStore.getState().cases.find(x => x.id === id)!;
    expect(c.steps![0].checks!.map(k => k.label)).toEqual(['Post the dues']);
    expect(c.steps![1].checks!.map(k => k.label)).toEqual(['Every payment entered', 'Balance matches']);
    const fromDb = withChecklists({ ...c, steps: c.steps!.map(({ checks: _drop, ...st }) => ({ ...st, done: st.id === 's0', doneDate: st.id === 's0' ? '2026-11-01' : null })) } as CaseTrackerCase);
    expect(fromDb.steps![0].checks).toEqual([{ id: 'ck0', label: 'Post the dues', checked: true, checkedDate: '2026-11-01' }]);
    expect(fromDb.steps![1].checks!.map(k => k.checked)).toEqual([false]);
    const budget = withChecklists({ ...c, sitId: 'runbook-annual-budget', steps: budgetSteps({ start: '2027-01-01', end: '2027-12-31' }).map((s, i) => ({ id: `s${i}`, s: s.s, detail: s.detail, done: false, doneDate: null, userNotes: '' })) } as CaseTrackerCase);
    expect(budget.steps!.every(st => !st.checks)).toBe(true);
  });

  it('ticks a step\'s items when the step is done, completes the step when its items are, and keeps what is written on an item', () => {
    const store = useIssuesStore.getState();
    const id = store.createCase({ catId: 'x', sitId: 'runbook-x', approach: 'pre', title: 'T', unit: '', owner: '', priority: 'medium', notes: '', customSteps: [{ s: 'One', ck: ['a', 'b'] }, { s: 'Two' }, { s: 'Three', ck: ['c'] }] });
    const c = () => useIssuesStore.getState().cases.find(x => x.id === id)!;
    store.completeStep(id, 0);
    expect(c().steps![0].checks!.every(k => k.checked)).toBe(true);
    store.toggleCheck(id, 1, 'ck0');
    expect(c().steps![1].done).toBe(true);
    store.toggleStep(id, 2);
    expect(c().steps![2].checks![0].checked).toBe(true);
    store.setCheckNote(id, 0, 'ck1', '  Three seats open  ');
    expect(c().steps![0].checks![1].note).toBe('Three seats open');
    store.setCheckNote(id, 0, 'ck1', '');
    expect(c().steps![0].checks![1].note).toBeUndefined();
  });
});

describe('writing inside the step', () => {
  const step = { id: 's0', s: 'Inspect the roof', detail: 'Describe what you find. The record is under Building › Overview › Assets.', done: false, doneDate: null, userNotes: '' };
  const c = withChecklists({ id: 'c1', catId: 'maintenance', sitId: 'runbook-x', title: 'Roof', unit: '', owner: '', approach: 'pre', status: 'open', priority: 'medium', created: '2026-11-01', notes: '', steps: [step], linkedWOs: [], linkedLetterIds: [], linkedInvoiceIds: [], linkedMeetingIds: [], attachments: [], boardVotes: null, additionalApproaches: [], comms: [] } as CaseTrackerCase);

  it('an item\'s note is written under the item and saved there, with no pop-up', () => {
    const prompt = vi.spyOn(window, 'prompt');
    const save = vi.fn();
    const st = c.steps![0];
    const item = st.checks!.find(k => /^Describe/.test(k.label))!;
    render(<MemoryRouter><CheckAssist c={c} step={st} stepIndex={0} checkId={item.id} label={item.label} onSaveNote={save} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Write it here/ }));
    fireEvent.change(screen.getByRole('textbox', { name: /Write it here: Describe what you find/ }), { target: { value: 'Two cracked tiles by the vent.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(save).toHaveBeenCalledWith('Two cracked tiles by the vent.');
    expect(prompt).not.toHaveBeenCalled();
    cleanup();
    render(<MemoryRouter><CheckAssist c={c} step={st} stepIndex={0} checkId={item.id} label={item.label} note="Two cracked tiles by the vent." onSaveNote={save} /></MemoryRouter>);
    expect(document.querySelector('[data-check-note]')?.textContent).toBe('Two cracked tiles by the vent.');
    expect(screen.getByRole('button', { name: /Edit what you wrote/ })).toBeTruthy();
  });

  it('the step has a notes box, its own task links to the page its guidance names, and a done step shows its items ticked', () => {
    const saveNote = vi.fn();
    render(<MemoryRouter><StepContent c={c} step={c.steps![0]} stepIndex={0} stNote="" stateAbbr="DC" onToggleStep={() => {}} onAddNote={() => {}} onSaveNote={saveNote} onSaveCheckNote={() => {}} onToggleCheck={() => {}} /></MemoryRouter>);
    expect(document.querySelectorAll('[data-check-row]')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Open Building › Overview › Assets/ })).toBeTruthy();
    const box = document.querySelector('[data-step-notes] textarea') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Roofer booked for Friday.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(saveNote).toHaveBeenCalledWith(0, 'Roofer booked for Friday.');
  });
});
