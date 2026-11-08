/**
 * `/obligations/start?kind=obligation|filing&id=…`: opens (or resumes) the
 * case that works through an obligation and goes straight to it. Home's
 * "Up next" cards and Building › Obligations link here, so Start always lands
 * on the steps, wherever it was pressed.
 */
import { useEffect, useRef } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useStoreSnapshot } from './adapters';
import { startObligationCase, type ObligationKind } from './obligationCases';

export default function ObligationStart() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const snap = useStoreSnapshot();
  const kind: ObligationKind = params.get('kind') === 'filing' ? 'filing' : 'obligation';
  const id = params.get('id') ?? '';
  const started = useRef(false);
  const item = kind === 'obligation' ? snap.obligations.find(o => o.id === id) : undefined;
  const filing = kind === 'filing' ? snap.filings.find(f => f.id === id) : undefined;
  const found = !!(item || filing);

  useEffect(() => {
    if (started.current || !found) return;
    started.current = true;
    const caseId = startObligationCase({ kind, id, item, filing });
    navigate(caseId ? `/issues?view=case:${encodeURIComponent(caseId)}` : '/building?tab=obligations', { replace: true });
  }, [found, kind, id, item, filing, navigate]);

  if (!found) return <Navigate to="/building?tab=obligations" replace />;
  return <p className="py-6 text-sm text-ux2-muted">Opening the steps…</p>;
}
