/**
 * agendaDraft — builds a structured agenda from the meeting queue, open cases,
 * approvals needing a vote, season milestones, and runbook items.
 *
 * Pure function: no React, no stores.
 */

import type { AgendaItem, AgendaSourceType } from '@/store/useMeetingsStore';
import type { QueueItem } from '@/lib/queue';
import type { SeasonState } from '@/lib/seasons';
import type { BuildingSettings } from '@/lib/buildingSettings';
import type { Meeting } from '@/store/useMeetingsStore';
import { generateLocalId } from '@/lib/generateId';

export interface DraftAgendaArgs {
  kind: 'board' | 'annual' | 'special';
  date: string;
  queue: QueueItem[];
  openCases: Array<{
    id: string;
    title: string;
    nextStep?: { title: string };
  }>;
  approvalsNeedingVote: Array<{
    id: string;
    title: string;
    amount: number;
  }>;
  season: SeasonState;
  lastMeeting?: Meeting;
  settings: BuildingSettings;
}

function makeItem(
  position: number,
  title: string,
  sourceType: AgendaSourceType,
  sourceId: string | null = null,
  requiresVote = false,
  locked = false,
): Omit<AgendaItem, 'id'> {
  return { position, title, sourceType, sourceId, requiresVote, locked };
}

/**
 * Draft a structured agenda for a meeting.
 *
 * Order:
 * 1. Standing items (Call to Order, Approve Last Minutes if completed prior meeting, Treasurer Report)
 * 2. Season milestone vote items (locked, requires_vote) e.g. budget adoption during Budget season
 * 3. Approvals above spending limit needing a vote (requires_vote)
 * 4. Open cases with a next step due before next regular meeting (source: case)
 * 5. Runbook items with satisfyingAction === 'meeting' due within 45 days (source: runbook)
 * 6. Annual: election and annual report standing items
 * 7. Adjourn
 */
export function draftAgenda(args: DraftAgendaArgs): Omit<AgendaItem, 'id'>[] {
  const { kind, openCases, approvalsNeedingVote, season, lastMeeting, settings } = args;
  const items: Omit<AgendaItem, 'id'>[] = [];
  const seenTitles = new Set<string>();
  let pos = 0;

  function add(
    title: string,
    sourceType: AgendaSourceType,
    sourceId: string | null = null,
    requiresVote = false,
    locked = false,
  ) {
    // Deduplicate by title
    const key = title.toLowerCase().trim();
    if (seenTitles.has(key)) return;
    seenTitles.add(key);
    items.push(makeItem(pos++, title, sourceType, sourceId, requiresVote, locked));
  }

  // ── 1. Standing items ──
  add('Call to Order', 'standing', null, false, true);

  // Approve last minutes if a prior COMPLETED meeting exists
  if (lastMeeting && lastMeeting.status === 'COMPLETED') {
    add(`Approve Minutes: ${lastMeeting.title}`, 'standing', lastMeeting.id, true, false);
  }

  add('Treasurer Report', 'standing', null, false, false);

  // ── 2. Season milestone vote items ──
  if (season) {
    const isBudgetSeason = season.seasonId === 'budget';
    if (isBudgetSeason) {
      add('Budget Adoption', 'season', null, true, true);
    }

    // Check for vote milestones
    for (const milestone of season.milestones) {
      if (milestone.flowId === 'vote' && milestone.status !== 'complete') {
        add(milestone.title, 'season', milestone.id, true, true);
      }
    }
  }

  // ── 3. Approvals above spending limit needing a vote ──
  for (const approval of approvalsNeedingVote) {
    if (approval.amount > settings.spendingLimit) {
      add(
        `Vote: ${approval.title} ($${approval.amount.toLocaleString()})`,
        'approval',
        approval.id,
        true,
      );
    }
  }

  // ── 4. Open cases with a next step ──
  for (const c of openCases) {
    if (c.nextStep) {
      add(`Case: ${c.title} -- ${c.nextStep.title}`, 'case', c.id);
    }
  }

  // ── 5. Runbook items due within 45 days with satisfying action 'meeting' ──
  for (const qi of args.queue) {
    if (qi.source === 'runbook') {
      add(qi.title, 'runbook', qi.sourceId);
    }
  }

  // ── 6. Annual-specific standing items ──
  if (kind === 'annual') {
    add('Board Election', 'standing', null, true, true);
    add('Annual Financial Report', 'standing', null, false, true);
  }

  // ── 7. Adjourn ──
  add('Adjourn', 'standing', null, false, true);

  return items;
}

/**
 * Convert agenda items (without ids) to agenda items with generated ids.
 */
export function assignAgendaIds(items: Omit<AgendaItem, 'id'>[]): AgendaItem[] {
  return items.map(item => ({
    ...item,
    id: generateLocalId('ai'),
  }));
}
