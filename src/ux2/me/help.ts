/**
 * "Find an answer": a keyword search across the guides, the runbooks, this
 * building's obligations and the fee schedule, each hit linking to the page
 * that holds the answer. Pure, so it can be tested without the stores.
 */
import { RUNBOOKS } from '../boardroom/runbooks';

export interface HelpSource {
  guides: { id: string; title: string; summary: string; route: string; howTos: { title: string; steps: string[] }[] }[];
  obligations: { id: string; task: string; due: string; role: string; legalRef?: string }[];
  fees: { id: string; name: string; amount: number; amountType: string; frequency: string; description: string }[];
  /** Routes depend on which modules are on. */
  routes: { obligations: string; runbooks: string; fees: string };
}

export interface HelpHit {
  kind: 'guide' | 'runbook' | 'obligation' | 'fee';
  title: string;
  detail: string;
  path: string;
  score: number;
}

const tokens = (q: string) => q.toLowerCase().split(/\s+/).map(t => t.replace(/[^a-z0-9$%.-]/g, '')).filter(t => t.length > 1);

function scoreText(terms: string[], ...fields: string[]): number {
  const text = fields.join(' ').toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (!text.includes(t)) return 0;
    score += fields[0]?.toLowerCase().includes(t) ? 3 : 1;
  }
  return score;
}

export function searchHelp(query: string, src: HelpSource, limit = 8): HelpHit[] {
  const terms = tokens(query);
  if (terms.length === 0) return [];
  const hits: HelpHit[] = [];
  for (const g of src.guides) {
    const s = scoreText(terms, g.title, g.summary, g.howTos.map(h => `${h.title} ${h.steps.join(' ')}`).join(' '));
    if (s) hits.push({ kind: 'guide', title: g.title, detail: g.summary, path: g.route, score: s });
    for (const h of g.howTos) {
      const hs = scoreText(terms, h.title, h.steps.join(' '));
      if (hs) hits.push({ kind: 'guide', title: h.title, detail: `${g.title} · ${h.steps.length} steps`, path: g.route, score: hs + 1 });
    }
  }
  for (const r of RUNBOOKS) {
    const s = scoreText(terms, r.name, r.trigger);
    if (s) hits.push({ kind: 'runbook', title: r.name, detail: `Runbook · starts when ${r.trigger.toLowerCase()} · ${r.automated} of ${r.steps} steps automated`, path: src.routes.runbooks, score: s });
  }
  for (const o of src.obligations) {
    const s = scoreText(terms, o.task, o.role, o.legalRef ?? '');
    if (s) hits.push({ kind: 'obligation', title: o.task, detail: `Obligation · ${o.role} · due ${o.due}${o.legalRef ? ` · ${o.legalRef}` : ''}`, path: src.routes.obligations, score: s });
  }
  for (const f of src.fees) {
    const s = scoreText(terms, f.name, f.description, f.frequency);
    if (s) hits.push({ kind: 'fee', title: f.name, detail: `Fee schedule · ${f.amountType === 'percentage' ? `${f.amount}%` : `$${f.amount}`} · ${f.frequency}${f.description ? ` · ${f.description}` : ''}`, path: src.routes.fees, score: s });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
