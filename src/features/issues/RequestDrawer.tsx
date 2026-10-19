/**
 * RequestDrawer — shows request (issue) details with "Reply" (opens ComposeDrawer)
 * or "Make it a case" (opens OpenCaseDrawer with request prefill).
 */

import { MessageCircle, Briefcase, Calendar, Tag, User } from 'lucide-react';
import DrawerShell from '@/components/ui/DrawerShell';
import { useIssuesStore } from '@/store/useIssuesStore';
import type { Issue } from '@/types/issues';

interface RequestDrawerProps {
  open: boolean;
  onClose: () => void;
  requestId?: string;
  /** Called when user taps "Reply" — parent opens ComposeDrawer */
  onReply?: (requestId: string) => void;
  /** Called when user taps "Make it a case" — parent opens OpenCaseDrawer */
  onMakeCase?: (request: Issue) => void;
}

const PRIO_STYLES: Record<string, string> = {
  URGENT: 'bg-red-100 text-red-700',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW: 'bg-ink-100 text-ink-600',
};

const STATUS_STYLES: Record<string, string> = {
  SUBMITTED: 'bg-accent-100 text-accent-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  RESOLVED: 'bg-sage-100 text-sage-700',
  CLOSED: 'bg-ink-100 text-ink-500',
};

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function RequestDrawer({ open, onClose, requestId, onReply, onMakeCase }: RequestDrawerProps) {
  const issues = useIssuesStore(s => s.issues);
  const request = issues.find(i => i.id === requestId);

  if (!request) {
    return (
      <DrawerShell
        open={open}
        onClose={onClose}
        breadcrumb={['Cases', 'Request']}
        title="Request not found"
        footer={{ primaryLabel: 'Close', onPrimary: onClose }}
      >
        <div className="py-8 text-center text-sm text-ink-400">
          This request could not be found.
        </div>
      </DrawerShell>
    );
  }

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      breadcrumb={['Cases', 'Requests', request.category]}
      title={request.title}
      footer={{
        primaryLabel: 'Reply',
        onPrimary: () => onReply?.(request.id),
        secondaryLabel: 'Make it a case',
        onSecondary: () => onMakeCase?.(request),
      }}
    >
      <div className="space-y-4">
        {/* Status + Priority */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_STYLES[request.status]}`}>
            {request.status}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${PRIO_STYLES[request.priority]}`}>
            {request.priority}
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-ink-100 text-ink-600">
            {request.category}
          </span>
        </div>

        {/* Details */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-ink-500">
            <User size={12} />
            <span>{request.reporterName}</span>
            {request.unitNumber && <span>Unit {request.unitNumber}</span>}
          </div>
          <div className="flex items-center gap-2 text-xs text-ink-500">
            <Calendar size={12} />
            <span>Submitted {formatDate(request.submittedDate)}</span>
          </div>
        </div>

        {/* Description */}
        <div className="p-3 bg-ink-50 rounded-lg">
          <p className="text-sm text-ink-700 whitespace-pre-wrap">
            {request.description || 'No description provided.'}
          </p>
        </div>

        {/* Comments */}
        {request.comments.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-ink-500 uppercase tracking-wide mb-2">
              Comments ({request.comments.length})
            </p>
            <div className="space-y-2">
              {request.comments.map((c) => (
                <div key={c.id} className="p-2 bg-white border border-ink-200 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-ink-700">{c.author}</span>
                    <span className="text-[10px] text-ink-400">{formatDate(c.date)}</span>
                  </div>
                  <p className="text-xs text-ink-600">{c.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upvotes */}
        {request.upvotes.length > 0 && (
          <div className="text-xs text-ink-500">
            {request.upvotes.length} upvote{request.upvotes.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </DrawerShell>
  );
}
