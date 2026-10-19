/**
 * Calendar Feed — builds an ICS (iCalendar) string from compliance items,
 * filings, and meetings for a given role.
 */

import type { ComplianceItem } from '@/lib/complianceRefresh';
import type { Meeting } from '@/store/useMeetingsStore';
import type { BuildingSettings } from '@/lib/buildingSettings';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CalendarFiling {
  id: string;
  name: string;
  dueDate: string;
  responsible: string;
  category: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format a date string (YYYY-MM-DD) to ICS DATE format (YYYYMMDD). */
function toIcsDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

/** Escape text for ICS content (fold, escape commas/semicolons/backslashes). */
function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Generate a stable UID for a calendar event. */
function uid(prefix: string, id: string, domain: string): string {
  return `${prefix}-${id}@${domain}`;
}

// ── Builder ──────────────────────────────────────────────────────────────────

export function buildIcs(
  items: ComplianceItem[],
  filings: CalendarFiling[],
  meetings: Meeting[],
  role: string | null,
  settings: BuildingSettings,
): string {
  const domain = 'getonetwo.com';
  const lines: string[] = [];

  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//ONE two//Governance Calendar//EN');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  lines.push(`X-WR-CALNAME:ONE two Governance${role ? ` (${role})` : ''}`);

  // 1. Compliance items with fixed due dates
  for (const item of items) {
    // Filter by role if specified
    if (role && item.primaryRole && item.primaryRole !== role && item.backstopRole !== role) {
      continue;
    }

    // Only include items with fixed dates (YYYY-MM-DD format)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.due)) continue;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid('item', item.id, domain)}`);
    lines.push(`DTSTART;VALUE=DATE:${toIcsDate(item.due)}`);
    lines.push(`SUMMARY:${escapeIcs(item.task)}`);
    lines.push(`DESCRIPTION:${escapeIcs(item.legalRef)}${item.consequence ? '\\n' + escapeIcs(item.consequence) : ''}`);
    lines.push(`CATEGORIES:${escapeIcs(item.freq)}`);
    lines.push('END:VEVENT');
  }

  // 2. Regulatory filings
  for (const f of filings) {
    if (role && f.responsible.toLowerCase() !== role.toLowerCase()) continue;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid('filing', f.id, domain)}`);
    lines.push(`DTSTART;VALUE=DATE:${toIcsDate(f.dueDate)}`);
    lines.push(`SUMMARY:${escapeIcs(f.name)}`);
    lines.push(`DESCRIPTION:Filing category: ${escapeIcs(f.category)}`);
    lines.push('CATEGORIES:Filing');
    lines.push('END:VEVENT');
  }

  // 3. Meetings
  for (const m of meetings) {
    if (m.status === 'CANCELLED') continue;

    const dtStart = toIcsDate(m.date);
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid('mtg', m.id, domain)}`);
    lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
    lines.push(`SUMMARY:${escapeIcs(m.title)}`);
    lines.push(`LOCATION:${escapeIcs(m.location)}`);
    if (m.agenda.length > 0) {
      lines.push(`DESCRIPTION:Agenda:\\n${m.agenda.map(escapeIcs).join('\\n')}`);
    }
    lines.push('CATEGORIES:Meeting');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}
