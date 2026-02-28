import type { Announcement, OwnerCommunication } from '@/store/useComplianceStore';
import type { GeneratedLetter } from '@/store/useLetterStore';

export type CommunicationFeedItem = {
  id: string;
  type: 'announcement' | 'communication' | 'letter';
  title: string;
  date: string;
  status: string;
  method?: string;
  recipient?: string;
  category?: string;
  pinned?: boolean;
  sourceData: Announcement | OwnerCommunication | GeneratedLetter;
};

export function buildCommunicationsFeed(
  announcements: Announcement[],
  communications: OwnerCommunication[],
  letters: GeneratedLetter[],
): CommunicationFeedItem[] {
  const items: CommunicationFeedItem[] = [];

  for (const a of announcements) {
    items.push({
      id: a.id,
      type: 'announcement',
      title: a.title,
      date: a.postedDate,
      status: 'posted',
      category: a.category,
      pinned: a.pinned,
      sourceData: a,
    });
  }

  for (const c of communications) {
    items.push({
      id: c.id,
      type: 'communication',
      title: c.subject,
      date: c.date,
      status: c.status,
      method: c.method,
      recipient: c.recipients,
      category: c.type,
      sourceData: c,
    });
  }

  for (const l of letters) {
    items.push({
      id: l.id,
      type: 'letter',
      title: l.subject,
      date: l.sentDate || l.id.replace('gl', '').slice(0, -3), // fallback to id timestamp
      status: l.status,
      method: l.sentVia,
      recipient: l.recipient,
      category: l.templateName,
      sourceData: l,
    });
  }

  // Sort: pinned announcements first, then by date descending
  items.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.date.localeCompare(a.date);
  });

  return items;
}
