import { useMemo } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { CATS, useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useLetterStore } from '@/store/useLetterStore';
import { useMailStore } from '@/store/useMailStore';
import { todayIso } from '../runbook/adapters';
import { useRunbookSwitches } from './store';
import { RUNBOOKS } from './runbooks';

const WIRED = new Set(RUNBOOKS.filter(r => r.wired).map(r => r.id));
import type { BoardRoomSnapshot } from './metrics';

/** Collect the Board Room snapshot from the issues, letters, mail and auth stores. */
export function useBoardRoomSnapshot(today: string = todayIso()): BoardRoomSnapshot {
  const currentUser = useAuthStore(s => s.currentUser);
  const currentRole = useAuthStore(s => s.currentRole);
  const board = useBuildingStore(s => s.board);
  const cases = useIssuesStore(s => s.cases);
  const issues = useIssuesStore(s => s.issues);
  const letters = useLetterStore(s => s.letters);
  const templates = useLetterStore(s => s.templates);
  const mailRecords = useMailStore(s => s.mailRecords);
  const off = useRunbookSwitches(s => s.off);
  const monthCloseStartDay = useFinancialStore(s => s.monthCloseStartDay);
  const sharedOff = useFinancialStore(s => s.runbooksOff);
  // A wired runbook's switch is the shared setting (another board member, or the server, may have moved it).
  const runbooksOff = useMemo(() => Array.from(new Set([...off.filter(id => !WIRED.has(id)), ...sharedOff])), [off, sharedOff]);
  return useMemo(() => ({
    today,
    viewer: {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      linkedUnits: currentUser.linkedUnits?.length ? currentUser.linkedUnits : currentUser.unitNumber ? [currentUser.unitNumber] : [],
      isBoard: currentRole !== 'RESIDENT',
      role: board.find(b => b.name === currentUser.name)?.role ?? currentRole,
    },
    cases,
    issues,
    letters,
    templates,
    mailRecords,
    categories: CATS.map(c => ({ id: c.id, label: c.label, sits: c.sits.map(s => ({ id: s.id, title: s.title })) })),
    runbooksOff,
    monthCloseStartDay,
  }), [today, currentUser, currentRole, board, cases, issues, letters, templates, mailRecords, runbooksOff, monthCloseStartDay]);
}
