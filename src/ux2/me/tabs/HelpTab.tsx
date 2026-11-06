import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SupportPage from '@/features/support/SupportPage';
import HowItWorksPage, { GUIDES } from '@/features/support/HowItWorksPage';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFeeScheduleStore } from '@/store/useFeeScheduleStore';
import { refreshComplianceRequirements } from '@/lib/complianceRefresh';
import { Card, Chip, Inner, PillTabs, SectionLabel } from '../../components';
import { isUx2 } from '../../flags';
import { RUNBOOKS } from '../../boardroom/runbooks';
import { searchHelp, type HelpHit } from '../help';
import type { MeSnapshot } from '../metrics';

const KIND_TONE: Record<HelpHit['kind'], 'ghost' | 'teal' | 'navy' | 'amber'> = { guide: 'ghost', runbook: 'teal', obligation: 'navy', fee: 'amber' };

export default function HelpTab({ snap }: { snap: MeSnapshot }) {
  const navigate = useNavigate();
  const building = useBuildingStore();
  const fees = useFeeScheduleStore(s => s.fees);
  const [q, setQ] = useState('');
  const [view, setView] = useState<'chat' | 'guides'>('chat');
  const obligations = useMemo(() => refreshComplianceRequirements({
    state: building.address.state,
    legalDocuments: building.legalDocuments.map(d => ({ name: d.name, status: d.status })),
    insurance: building.insurance.map(p => ({ type: p.type, expires: p.expires })),
    boardCount: building.board.length,
    hasManagement: !!building.management.company,
  }).categories.flatMap(c => c.items), [building.address.state, building.legalDocuments, building.insurance, building.board.length, building.management.company]);
  const routes = useMemo(() => ({
    obligations: isUx2('building') ? '/building?tab=obligations' : '/boardroom?tab=runbook',
    runbooks: isUx2('boardroom') ? '/boardroom?tab=runbooks' : '/issues',
    fees: isUx2('funds') ? '/funds?tab=settings&section=fees' : '/building?tab=fees',
  }), []);
  const hits = useMemo(() => searchHelp(q, {
    guides: GUIDES.map(g => ({ id: g.id, title: g.title, summary: g.summary, route: g.route, howTos: g.howTos })),
    obligations: obligations.map(o => ({ id: o.id, task: o.task, due: o.due, role: o.role, legalRef: o.legalRef })),
    fees: fees.map(f => ({ id: f.id, name: f.name, amount: f.amount, amountType: f.amountType, frequency: f.frequency, description: f.description })),
    routes,
  }), [q, obligations, fees, routes]);

  return (
    <div className="flex flex-col gap-5">
      <Card tone="teal" aria-label="Find an answer">
        <SectionLabel className="text-white/[0.66]">Find an answer · guides, runbooks, this building's rules and the law</SectionLabel>
        <input aria-label="Search help" value={q} onChange={e => setQ(e.target.value)} placeholder="Search guides, runbooks, obligations and fees" className="h-11 rounded-xl border border-white/30 bg-white px-4 text-sm text-ux2-ink" />
        {q && (hits.length === 0 ? <p className="text-sm text-white/[0.85]">Nothing matched. Try one word, or ask below.</p> : (
          <ul className="m-0 list-none divide-y divide-white/15 p-0">
            {hits.map((h, i) => (
              <li key={i}>
                <button type="button" onClick={() => navigate(h.path)} className="flex w-full items-start gap-3 py-2 text-left hover:underline">
                  <Chip tone={KIND_TONE[h.kind]}>{h.kind}</Chip>
                  <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">{h.title}</span><span className="block text-xs text-white/[0.8]">{h.detail}</span></span>
                </button>
              </li>
            ))}
          </ul>
        ))}
        {!q && <p className="text-xs text-white/[0.7]">Matches by keyword across the {GUIDES.length} guides, {RUNBOOKS.length} runbooks, this building's {obligations.length} obligations and {fees.length} fees, and takes you to the page that holds the answer.</p>}
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { title: 'Runbooks', detail: `Every obligation has steps, dates and a letter ready · ${RUNBOOKS.length}`, path: routes.runbooks },
          { title: 'Stewardship score', detail: 'Five dimensions, scored monthly, a receipt for each event', path: '/account' },
          { title: 'Obligations', detail: `${obligations.length} this year from the law, the bylaws and policies`, path: routes.obligations },
        ].map(c => (
          <button key={c.title} type="button" onClick={() => navigate(c.path)} className="rounded-[22px] border border-ux2-line bg-ux2-surface px-5 py-4 text-left hover:bg-white">
            <div className="text-[15px] font-semibold text-ux2-ink">{c.title} ›</div>
            <div className="text-xs text-ux2-muted">{c.detail}</div>
          </button>
        ))}
      </div>

      <Card aria-label="Contact and guides">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>{view === 'chat' ? 'Support · a person, not a bot' : 'How ONE two works'}</SectionLabel>
          <PillTabs size="filter" aria-label="Help views" value={view} onChange={setView} tabs={[{ id: 'chat', label: 'Support' }, { id: 'guides', label: 'Guides', badge: GUIDES.length }]} />
        </div>
        {view === 'chat' && <Inner className="text-xs text-ux2-muted">Email support@getonetwo.com, answered within a business day, or start a thread here. Replies land here and in {snap.viewer.email}.</Inner>}
        <div className="ux2-legacy">{view === 'chat' ? <SupportPage /> : <HowItWorksPage />}</div>
      </Card>
    </div>
  );
}
