import { useState, useCallback } from 'react';
import { Search } from 'lucide-react';
import type { QueueItem } from '@/lib/queue';

interface AskBoxProps {
  queueItems: QueueItem[];
  onOpenDrawer: (drawer: string, params: Record<string, string>) => void;
}

/**
 * Keyword router: lowercase input is matched against known keywords.
 * Falls back to opening case_new with the text as the title param.
 */
function routeInput(
  input: string,
  queueItems: QueueItem[],
): { drawer: string; params: Record<string, string> } {
  const lower = input.toLowerCase().trim();

  if (!lower) return { drawer: '', params: {} };

  // Direct keyword matches
  if (lower.includes('paid') || lower.includes('payment')) {
    return { drawer: 'payment', params: {} };
  }
  if (lower.includes('meeting')) {
    return { drawer: 'meeting', params: {} };
  }
  if (lower.includes('case') || lower.includes('issue') || lower.includes('repair')) {
    return { drawer: 'case_new', params: {} };
  }

  // Insurance: find runbook item with "insurance" in task
  if (lower.includes('insurance')) {
    const match = queueItems.find(
      (qi) => qi.source === 'runbook' && qi.title.toLowerCase().includes('insurance'),
    );
    if (match) {
      return {
        drawer: match.primaryAction.drawer,
        params: match.primaryAction.params,
      };
    }
    return { drawer: 'runbook', params: { search: 'insurance' } };
  }

  // Default: open case_new with text as title
  return { drawer: 'case_new', params: { title: lower } };
}

export default function AskBox({ queueItems, onOpenDrawer }: AskBoxProps) {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const route = routeInput(value, queueItems);
      if (route.drawer) {
        onOpenDrawer(route.drawer, route.params);
        setValue('');
      }
    },
    [value, queueItems, onOpenDrawer],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleSubmit(e);
      }
    },
    [handleSubmit],
  );

  return (
    <div className="mt-4">
      <form onSubmit={handleSubmit} className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-300" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask something or start a task..."
          className="w-full pl-9 pr-4 py-2.5 text-sm bg-ink-50 border border-ink-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal text-ink-700 placeholder:text-ink-300"
        />
      </form>
    </div>
  );
}
