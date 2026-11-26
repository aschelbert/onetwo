/** Where a Records tab lives: `/records` is Documents, `/records?tab=archive` the Archive. */
export type RecordsTab = 'documents' | 'archive';

export function recordsPath(tab: RecordsTab, section?: string): string {
  const q = new URLSearchParams();
  if (tab !== 'documents') q.set('tab', tab);
  if (section) q.set('section', section);
  return `/records${q.toString() ? `?${q}` : ''}`;
}
