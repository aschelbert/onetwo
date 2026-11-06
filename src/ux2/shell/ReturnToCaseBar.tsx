import { useLocation, useNavigate } from 'react-router-dom';
import { useIssuesStore } from '@/store/useIssuesStore';
import { Button } from '../components';

/**
 * "Return to case" — when someone leaves a case step to do something elsewhere
 * (record a payment, upload a document) the step they were on follows them as
 * a slim bar under the top nav, from the `activeCaseContext` the case
 * workspace sets. Dismissing it clears the context.
 */
export default function ReturnToCaseBar() {
  const ctx = useIssuesStore(s => s.activeCaseContext);
  const clear = useIssuesStore(s => s.clearActiveCaseContext);
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  if (!ctx || pathname.startsWith('/issues') || (pathname.startsWith('/boardroom') && search.includes('view=case'))) return null;
  return (
    <div data-widget="return-to-case" className="border-b border-ux2-line bg-ux2-teal-tint">
      <div className="mx-auto flex w-full max-w-[1200px] items-center gap-3 px-6 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate text-ux2-teal">
          <b className="font-semibold">{ctx.caseTitle}</b>
          <span className="text-ux2-muted"> · Step {ctx.stepIdx + 1}{ctx.progress ? ` of ${ctx.progress.total}` : ''}: {ctx.stepTitle}</span>
        </span>
        <Button size="sm" onClick={() => navigate(`/issues?view=case:${ctx.caseId}`)}>Back to the step</Button>
        <button type="button" aria-label="Dismiss" onClick={clear} className="grid h-8 w-8 place-items-center rounded-full text-ux2-dim hover:bg-white hover:text-ux2-ink">×</button>
      </div>
    </div>
  );
}
