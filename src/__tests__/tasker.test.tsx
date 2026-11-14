import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useTaskerStore, jobFor } from '@/store/useTaskerStore';
import { useAuthStore } from '@/store/useAuthStore';
import { resolveCheck } from '@/features/issues/checkAssist';
import { CheckAssist } from '@/features/issues/components/workflow/CheckAssist';
import { guessCategory, needsLicensedTrade } from '@/features/tasker/taskRabbit';
import {
  acceptReturnVisit, answerScope, applyUpdate, book, cancel, confirmAndPay, rate, ratingsHere, rebook, reportProblem, spendGate,
} from '@/features/tasker/lifecycle';
import type { Issue } from '@/types/issues';

const CHECK = 'Work order, letter or decision recorded on this action';
const cases = () => useIssuesStore.getState().cases;
const caseOf = (id: string) => cases().find(c => c.id === id)!;
const wos = () => useFinancialStore.getState().workOrders;
const jobs = () => useTaskerStore.getState().jobs;

/** A resident request action at its "do the work" step, with the owner's request behind it. */
function requestAction(title = 'Lobby pendant light is out'): { caseId: string; checkId: string } {
  useIssuesStore.setState({ issues: [{ id: 'REQ-1', title, comments: [], status: 'IN_PROGRESS', submittedDate: '2026-11-05', reporterName: 'Dana P.' } as unknown as Issue] });
  const caseId = useIssuesStore.getState().createCase({
    catId: 'governance', sitId: 'runbook-resident-request', approach: 'pre', title, unit: '', owner: 'Dana P.', priority: 'medium',
    notes: 'Opened by the Resident request runbook.\n\nThe big pendant over the entrance is out.', source: 'issue', sourceId: 'REQ-1',
    customSteps: [{ s: 'Do the work, or decide why not', ck: [CHECK] }],
  });
  const checkId = caseOf(caseId).steps![0].checks![0].id;
  return { caseId, checkId };
}

const bookAndre = (caseId: string, checkId: string, hours = 1) => book({
  caseId, stepIdx: 0, checkId, category: 'handyman', title: 'Replace the lobby pendant bulb', details: 'Ladder in the bike room',
  date: '2026-11-14', slot: 'afternoon', access: 'Front desk, fob #12', taskerId: 'tr-andre', estimateHours: hours, notifyOwner: true, bookedBy: 'Maya K.',
});

beforeEach(() => {
  useIssuesStore.setState({ cases: [], issues: [], nextCaseNum: 1, casesLoaded: true });
  useFinancialStore.setState({ tenantId: null, workOrders: [], generalLedger: [] });
  useTaskerStore.getState().reset();
  useBuildingStore.setState(s => ({ bylawsConfig: { ...s.bylawsConfig, boardSpendingLimit: 5000, taskerLimit: undefined } }));
});

describe('which jobs are Tasker jobs', () => {
  it('offers Book a Tasker first on the resident request\'s work item, beside the work order and the letter', () => {
    const r = resolveCheck(CHECK, { catId: 'governance', sitId: 'runbook-resident-request', step: 'Do the work, or decide why not', hasUnit: false });
    expect(r.rule).toBe('do-the-work');
    expect(r.assists.map(a => a.label)).toEqual(['Book a Tasker', 'Create a work order', 'Draft and send it', 'Add a note']);
  });

  it('adds it to repair items in common-area situations only', () => {
    const repair = (sitId: string) => resolveCheck('Repair the railing', { catId: 'maintenance', sitId, step: 'Fix it', hasUnit: false }).assists.map(a => a.label);
    expect(repair('common-area-repairs')).toContain('Book a Tasker');
    expect(repair('structural-safety')).not.toContain('Book a Tasker');
  });

  it('spots licensed trades and guesses the kind of job', () => {
    expect(needsLicensedTrade('Slow leak under the 3B sink')).toBe('leak');
    expect(needsLicensedTrade('Lobby pendant bulb is out')).toBeNull();
    expect(needsLicensedTrade('Lobby ceiling water stain')).toBe('water stain');
    expect(guessCategory('Bike room wall rack pulling out')).toBe('mounting');
    expect(guessCategory('Move 14 boxes to the storage cage')).toBe('moving-help');
    expect(guessCategory('Lobby pendant bulb')).toBe('handyman');
  });
});

describe('the spending gate', () => {
  it('books under the Tasker limit, asks for a board vote above it, and refuses anything over the bylaws limit', () => {
    const { caseId } = requestAction();
    expect(spendGate(250, caseOf(caseId)).ok).toBe(true);
    expect(spendGate(340, caseOf(caseId))).toMatchObject({ ok: false, needs: 'board-vote' });
    expect(spendGate(6000, caseOf(caseId))).toMatchObject({ ok: false, needs: 'not-tasker' });
    useIssuesStore.getState().saveBoardVote(caseId, 'Book a Tasker to repaint the railing', '2026-11-14', [{ name: 'A', vote: 'approve' }, { name: 'B', vote: 'approve' }] as never);
    expect(spendGate(340, caseOf(caseId)).ok).toBe(true);
  });

  it('uses the board\'s own Tasker limit when it set one', () => {
    const { caseId } = requestAction();
    useBuildingStore.setState(s => ({ bylawsConfig: { ...s.bylawsConfig, taskerLimit: 500 } }));
    expect(spendGate(450, caseOf(caseId)).ok).toBe(true);
  });

  it('will not book over the limit without the vote', () => {
    const { caseId, checkId } = requestAction();
    expect(bookAndre(caseId, checkId, 6)).toBeNull(); // 6 hr × $58
    expect(jobs()).toEqual([]);
  });
});

describe('the lifecycle on the action', () => {
  it('walks from asked to paid: work order opened on accept, owner told, invoice and payment posted, the item ticked', () => {
    const { caseId, checkId } = requestAction();
    const j = bookAndre(caseId, checkId)!;
    expect(j).toMatchObject({ status: 'requested', estimate: 58, woId: null });
    expect(wos()).toEqual([]); // nothing committed until a Tasker accepts

    applyUpdate(j.id, { kind: 'accepted' });
    const woId = jobFor(jobs(), caseId, checkId)!.woId!;
    expect(wos().find(w => w.id === woId)).toMatchObject({ status: 'approved', amount: 58, vendor: 'TaskRabbit · Andre R.', acctNum: '5010', caseId });
    expect(caseOf(caseId).linkedWOs).toContain(woId);
    expect(useIssuesStore.getState().issues[0].comments.slice(-1)[0]?.text).toMatch(/Tasker is booked/);

    applyUpdate(j.id, { kind: 'on-the-way', eta: '2:10 pm' });
    applyUpdate(j.id, { kind: 'checked-in' });
    applyUpdate(j.id, { kind: 'done', hoursWorked: 0.8, note: 'All done.', photos: 2 });
    expect(jobFor(jobs(), caseId, checkId)).toMatchObject({ status: 'done', final: { billedHours: 1, amount: 58 } });
    expect(caseOf(caseId).steps![0].checks![0].checked).toBe(false);

    confirmAndPay(j.id, 'Maya K.');
    expect(wos().find(w => w.id === woId)).toMatchObject({ status: 'paid', amount: 58 });
    expect(caseOf(caseId).steps![0].checks![0].checked).toBe(true);
    expect(caseOf(caseId).steps![0].done).toBe(true);

    rate(j.id, 5, 'Maya K.');
    expect(ratingsHere()).toEqual({ 'tr-andre': 5 });
    const trail = (caseOf(caseId).decisionTrail ?? []).filter(e => e.type === 'tasker_update').map(e => e.summary);
    expect(trail.length).toBe(7);
    expect(trail[0]).toMatch(/^Asked Andre R\. through TaskRabbit/);
    expect(trail[trail.length - 1]).toBe('Rated Andre R. 5 of 5.');
  });

  it('ignores updates that arrive out of order', () => {
    const { caseId, checkId } = requestAction();
    const j = bookAndre(caseId, checkId)!;
    applyUpdate(j.id, { kind: 'done', hoursWorked: 1, note: '', photos: 0 });
    applyUpdate(j.id, { kind: 'checked-in' });
    expect(jobFor(jobs(), caseId, checkId)!.status).toBe('requested');
  });

  it('approves more time within the limit and resizes the work order; above it, waits for the vote', () => {
    const { caseId, checkId } = requestAction();
    const j = bookAndre(caseId, checkId)!;
    applyUpdate(j.id, { kind: 'accepted' });
    applyUpdate(j.id, { kind: 'checked-in' });
    applyUpdate(j.id, { kind: 'scope-request', extraHours: 1, parts: 14, note: 'Different bulb base' });
    expect(answerScope(j.id, true, 'Maya K.')?.ok).toBe(true);
    const after = jobFor(jobs(), caseId, checkId)!;
    expect(after).toMatchObject({ status: 'working', estimateHours: 2, estimate: 116, parts: 14 });
    expect(wos()[0].amount).toBe(130);

    applyUpdate(j.id, { kind: 'scope-request', extraHours: 4, parts: 0, note: 'Whole fixture' });
    expect(answerScope(j.id, true, 'Maya K.')).toMatchObject({ ok: false, needs: 'board-vote' });
    expect(jobFor(jobs(), caseId, checkId)!.status).toBe('scope-request');
    answerScope(j.id, false, 'Maya K.');
    expect(jobFor(jobs(), caseId, checkId)!.status).toBe('working');
  });

  it('rebooks after no reply or a Tasker cancelling, moving the work order to the new Tasker', () => {
    const { caseId, checkId } = requestAction();
    const j = bookAndre(caseId, checkId)!;
    applyUpdate(j.id, { kind: 'no-reply' });
    rebook(j.id, 'tr-priya', 'Maya K.');
    expect(jobFor(jobs(), caseId, checkId)).toMatchObject({ status: 'requested', taskerName: 'Priya N.', estimate: 52 });
    applyUpdate(j.id, { kind: 'accepted' });
    applyUpdate(j.id, { kind: 'tasker-cancelled', reason: 'Sick' });
    rebook(j.id, 'tr-devon', 'Maya K.');
    expect(wos()).toHaveLength(1);
    expect(wos()[0]).toMatchObject({ vendor: 'TaskRabbit · Devon W.', amount: 64 });
  });

  it('cancels a booking and zeroes its work order; the item can be booked again', () => {
    const { caseId, checkId } = requestAction();
    const j = bookAndre(caseId, checkId)!;
    applyUpdate(j.id, { kind: 'accepted' });
    cancel(j.id, 'Maya K.');
    expect(wos()[0]).toMatchObject({ amount: 0, title: 'Replace the lobby pendant bulb (cancelled)' });
    expect(jobFor(jobs(), caseId, checkId)!.status).toBe('cancelled');
    const again = bookAndre(caseId, checkId)!;
    expect(jobFor(jobs(), caseId, checkId)!.id).toBe(again.id);
  });

  it('holds payment on a problem, takes a free return visit, then pays the original bill once', () => {
    const { caseId, checkId } = requestAction();
    const j = bookAndre(caseId, checkId)!;
    applyUpdate(j.id, { kind: 'accepted' });
    applyUpdate(j.id, { kind: 'checked-in' });
    applyUpdate(j.id, { kind: 'done', hoursWorked: 1, note: 'Done', photos: 1 });
    reportProblem(j.id, 'Still flickers', 'Maya K.');
    confirmAndPay(j.id, 'Maya K.');
    expect(wos()[0].status).toBe('approved'); // held
    acceptReturnVisit(j.id, '2026-11-15', 'morning', 'Maya K.');
    applyUpdate(j.id, { kind: 'checked-in' });
    applyUpdate(j.id, { kind: 'done', hoursWorked: 0.5, note: 'Socket reseated', photos: 1 });
    expect(jobFor(jobs(), caseId, checkId)!.final).toMatchObject({ amount: 58 });
    confirmAndPay(j.id, 'Maya K.');
    expect(wos()[0]).toMatchObject({ status: 'paid', amount: 58 });
  });
});

describe('inside the action', () => {
  it('books from the checklist item and shows the job card in its place', () => {
    useAuthStore.setState(s => ({ currentUser: { ...s.currentUser, role: 'BOARD_MEMBER', name: 'Maya K.' } }));
    const { caseId, checkId } = requestAction();
    const c = () => caseOf(caseId);
    const ui = () => <MemoryRouter><CheckAssist c={c()} step={c().steps![0]} stepIndex={0} checkId={checkId} label={CHECK} /></MemoryRouter>;
    const { rerender, container } = render(ui());
    fireEvent.click(screen.getByRole('button', { name: /Book a Tasker/ }));
    expect(container.querySelector('[data-tasker-status="new"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /Andre R\./ }));
    fireEvent.click(screen.getByRole('button', { name: /^Ask Andre · est\. \$58/ }));
    rerender(ui());
    expect(container.querySelector('[data-tasker-status="requested"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /^Book a Tasker/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tasker accepts' }));
    rerender(ui());
    expect(container.querySelector('[data-tasker-status="scheduled"]')).not.toBeNull();
    expect(screen.getByText(/work order WO-/)).toBeTruthy();
  });

  it('sends licensed work to a vendor unless the board says otherwise', () => {
    const { caseId, checkId } = requestAction('Slow leak under the 3B kitchen sink');
    const c = caseOf(caseId);
    render(<MemoryRouter><CheckAssist c={c} step={c.steps![0]} stepIndex={0} checkId={checkId} label={CHECK} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Book a Tasker/ }));
    expect(screen.getByText(/This reads like leak work/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Book a Tasker anyway/ }));
    expect(screen.getByRole('button', { name: /^Ask / })).toBeTruthy();
  });
});
