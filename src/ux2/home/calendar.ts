import type { RunbookCard } from '../runbook/model';

export interface MonthGroup {
  /** YYYY-MM */
  key: string;
  label: string;
  cards: RunbookCard[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function dayLabel(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/**
 * Group dated cards by month, starting at the month of `today`, keeping the
 * next `count` months even when empty so the carousel always has columns.
 */
export function groupByMonth(cards: RunbookCard[], today: string, count = 4): MonthGroup[] {
  const [y, m] = today.split('-').map(Number);
  const groups: MonthGroup[] = [];
  for (let i = 0; i < count; i++) {
    const total = m - 1 + i;
    const yy = y + Math.floor(total / 12);
    const mm = (total % 12) + 1;
    const key = `${yy}-${String(mm).padStart(2, '0')}`;
    groups.push({ key, label: monthLabel(key), cards: [] });
  }
  const byKey = new Map(groups.map(g => [g.key, g]));
  for (const c of cards) {
    if (!c.due) continue;
    const g = byKey.get(c.due.slice(0, 7));
    if (g) g.cards.push(c);
  }
  for (const g of groups) g.cards.sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));
  return groups;
}
