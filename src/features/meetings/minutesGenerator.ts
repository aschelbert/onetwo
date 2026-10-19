/**
 * minutesGenerator -- Generate meeting minutes from structured meeting data.
 *
 * Produces both HTML and plain-text versions from the meeting record,
 * agenda items, board member attendance, and settings.
 */

import type { Meeting, AgendaItem, MeetingAttendance } from '@/store/useMeetingsStore';
import type { BoardMember } from '@/store/useBuildingStore';

interface GenerateMinutesArgs {
  meeting: Meeting;
  items: AgendaItem[];
  members: BoardMember[];
  settings: { quorumPct: number };
}

export interface GeneratedMinutes {
  html: string;
  text: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function outcomeLabel(outcome: string): string {
  switch (outcome) {
    case 'passed': return 'Passed';
    case 'failed': return 'Failed';
    case 'tabled': return 'Tabled';
    case 'noted': return 'Noted';
    case 'discussed': return 'Discussed';
    default: return outcome;
  }
}

export function generateMinutes(args: GenerateMinutesArgs): GeneratedMinutes {
  const { meeting, items, members } = args;
  const attendance: MeetingAttendance[] = meeting.boardAttendance || [];
  const present = attendance.filter(a => a.present);
  const absent = attendance.filter(a => !a.present);
  const byVideo = present.filter(a => a.byVideo);

  const textParts: string[] = [];
  const htmlParts: string[] = [];

  // ── Header ──
  const headerText = `${meeting.title}\n${formatDate(meeting.date)}\n${meeting.location}${meeting.virtualLink ? ` / ${meeting.virtualLink}` : ''}`;
  textParts.push(headerText);
  htmlParts.push(
    `<h1>${meeting.title}</h1>`,
    `<p><strong>Date:</strong> ${formatDate(meeting.date)}</p>`,
    `<p><strong>Location:</strong> ${meeting.location}${meeting.virtualLink ? ` / <a href="${meeting.virtualLink}">Virtual Link</a>` : ''}</p>`,
  );

  // ── Attendance ──
  if (present.length > 0 || absent.length > 0) {
    const presentLine = `Present: ${present.map(a => a.name + (a.byVideo ? ' (video)' : '')).join(', ')}`;
    textParts.push('');
    textParts.push(presentLine);
    htmlParts.push(`<h2>Attendance</h2>`);
    htmlParts.push(`<p><strong>Present:</strong> ${present.map(a => a.name + (a.byVideo ? ' <em>(video)</em>' : '')).join(', ')}</p>`);

    if (absent.length > 0) {
      const absentLine = `Absent: ${absent.map(a => a.name).join(', ')}`;
      textParts.push(absentLine);
      htmlParts.push(`<p><strong>Absent:</strong> ${absent.map(a => a.name).join(', ')}</p>`);
    }

    if (meeting.ownersPresent && meeting.ownersPresent > 0) {
      textParts.push(`Owners present: ${meeting.ownersPresent}`);
      htmlParts.push(`<p><strong>Owners present:</strong> ${meeting.ownersPresent}</p>`);
    }

    if (meeting.quorumMet !== undefined) {
      const quorumLine = meeting.quorumMet ? 'Quorum met.' : 'Quorum NOT met.';
      textParts.push(quorumLine);
      htmlParts.push(`<p>${quorumLine}</p>`);
    }
  }

  // ── Call to Order ──
  if (meeting.calledToOrderAt) {
    const ctoLine = `Meeting called to order at ${formatTime(meeting.calledToOrderAt)}.`;
    textParts.push('');
    textParts.push(ctoLine);
    htmlParts.push(`<h2>Call to Order</h2>`);
    htmlParts.push(`<p>${ctoLine}</p>`);
  }

  // ── Agenda Items ──
  const sortedItems = [...items].sort((a, b) => a.position - b.position);
  for (const item of sortedItems) {
    textParts.push('');
    textParts.push(`${item.position + 1}. ${item.title}`);
    htmlParts.push(`<h2>${item.position + 1}. ${item.title}</h2>`);

    if (item.notes) {
      textParts.push(`   ${item.notes}`);
      htmlParts.push(`<p>${item.notes}</p>`);
    }

    if (item.requiresVote && item.tally && item.outcome) {
      const tallyEntries = Object.entries(item.tally);
      const yes = tallyEntries.filter(([, v]) => v === 'yes').length;
      const no = tallyEntries.filter(([, v]) => v === 'no').length;
      const abstain = tallyEntries.filter(([, v]) => v === 'abstain').length;

      if (item.motionText) {
        textParts.push(`   Motion: ${item.motionText}`);
        htmlParts.push(`<p><strong>Motion:</strong> ${item.motionText}</p>`);
      }
      if (item.movedBy) {
        const secondLine = item.secondedBy ? `, seconded by ${item.secondedBy}` : '';
        textParts.push(`   Moved by ${item.movedBy}${secondLine}`);
        htmlParts.push(`<p>Moved by ${item.movedBy}${secondLine}</p>`);
      }

      if (item.outcome === 'tabled') {
        textParts.push(`   Tabled`);
        htmlParts.push(`<p><strong>Tabled</strong></p>`);
      } else {
        const tallyLine = `${outcomeLabel(item.outcome)} ${yes} to ${no}${abstain > 0 ? ` (${abstain} abstain${abstain !== 1 ? 's' : ''})` : ''}`;
        textParts.push(`   ${tallyLine}`);
        htmlParts.push(`<p><strong>${tallyLine}</strong></p>`);
      }

      // Individual votes
      if (tallyEntries.length > 0) {
        const voteLine = tallyEntries.map(([name, v]) => `${name}: ${v}`).join('; ');
        textParts.push(`   Votes: ${voteLine}`);
        htmlParts.push(`<p class="votes">Votes: ${voteLine}</p>`);
      }
    } else if (item.outcome) {
      textParts.push(`   ${outcomeLabel(item.outcome)}`);
      htmlParts.push(`<p><em>${outcomeLabel(item.outcome)}</em></p>`);
    }

    if (item.conflictsDeclared && item.conflictsDeclared.length > 0) {
      const conflictLine = `Conflicts declared: ${item.conflictsDeclared.join(', ')}`;
      textParts.push(`   ${conflictLine}`);
      htmlParts.push(`<p><em>${conflictLine}</em></p>`);
    }
  }

  // ── Adjournment ──
  if (meeting.adjournedAt) {
    const adjLine = `Meeting adjourned at ${formatTime(meeting.adjournedAt)}.`;
    textParts.push('');
    textParts.push(adjLine);
    htmlParts.push(`<h2>Adjournment</h2>`);
    htmlParts.push(`<p>${adjLine}</p>`);
  }

  return {
    text: textParts.join('\n'),
    html: htmlParts.join('\n'),
  };
}
