/**
 * Every step of every action gets a checklist to work through.
 *
 * Steps written with one (`ck`) keep it. A step without one (most runbook
 * steps, custom steps, about half the wizard's) gets its checklist from its
 * own words: the tasks in its title ("Present the budget; prepare the
 * report" is two) and the instructions in its guidance ("Verify each
 * proxy is signed." is one). Each item then gets its assists from
 * checkAssist, the same as a written item: the information to review in
 * place, the tool to do it, the page in the app where it lives.
 *
 * Also here: the pages a piece of text names ("Funds › Planning › Budget"),
 * so a step's guidance and its items link to them, and the words that mean
 * "write something down" (note, describe, list...), so those items get a
 * place to write.
 */

/** Sentences that say what the app does, not what a person does. */
const APP_DOES = /ticks itself|does this itself|the app (does|puts|writes|copies|opens|starts)|done as the (case|action) opens/i;

const VERBS = 'verify|confirm|review|include|prepare|send|use|check|record|document|obtain|notify|post|file|attach|upload|schedule|collect|compare|calculate|identify|list|note|describe|ensure|keep|maintain|print|test|book|appoint|announce|retain|count|get|ask|request|pick|choose|set|add|update|enter|open|create|draft|write|sign|pay|issue|track|reconcile|approve|adopt|present|distribute|provide|respond|engage|hire|contact|inform|mail|deliver|publish|log|photograph|inspect|assess|evaluate|determine|decide|consult|refer|read|look|search|gather|compile|complete|submit|follow|monitor|report|disclose|hold|conduct|call|offer|negotiate|execute|store|save|close|mark|assign|estimate|transfer|invoice|charge|waive|apply|cite|state|explain|outline|specify|itemi[sz]e|summari[sz]e|define|allow|give|make|put|take|change|accept|confirm|remove|restore|secure|shut|dispatch|tell|answer|bring|run|share';
const IMPERATIVE = new RegExp(`^(?:must |should |always |then |also |first |next |finally )?(?:${VERBS})\\b`, 'i');

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const clean = (s: string) => cap(s.trim().replace(/[.;,]+$/, '').trim());

/** The tasks a title names: "A; b" is two; "Conduct the meeting: verify quorum, approve minutes, hold the election" is three. */
export function titleTasks(title: string): string[] {
  const t = title.trim();
  const colon = t.indexOf(': ');
  if (colon > 0) {
    const list = t.slice(colon + 2).split(/,\s+(?:and\s+)?|;\s+/).map(x => x.trim()).filter(Boolean);
    // A list after the colon, each part a task of its own (not "Tell owners by Dec 2: the adopted budget and the dues").
    if (list.length >= 3 && list.every(x => x.length < 70) && list.filter(x => IMPERATIVE.test(x)).length >= 2) return list.map(clean);
  }
  const parts = t.split(/;\s+/).map(x => x.trim()).filter(Boolean);
  return parts.length > 1 ? parts.map(clean) : [];
}

/** The instructions in a step's guidance: each sentence that tells a person to do something. */
export function guidanceTasks(detail: string | null | undefined): string[] {
  if (!detail) return [];
  return detail
    // Not after an abbreviation's dot ("e.g. the roof", "§ 29-1109.02").
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map(x => x.trim())
    .filter(x => x.length > 8 && !APP_DOES.test(x) && IMPERATIVE.test(x))
    .map(clean);
}

/** The item is the step's own task (its title, or one of the tasks in it), not a detail written under it. */
export function isOwnTask(step: { s: string }, label: string): boolean {
  return clean(step.s) === label || titleTasks(step.s).includes(label);
}

/** The checklist for a step that was written without one. Never empty. */
export function deriveChecks(step: { s: string; detail?: string | null }): string[] {
  const fromTitle = titleTasks(step.s);
  const fromGuidance = guidanceTasks(step.detail);
  const items = [...(fromTitle.length ? fromTitle : [clean(step.s)]), ...fromGuidance];
  const seen = new Set<string>();
  return items.filter(x => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
}

// ── Writing something down ──────────────────────────────────────────────────
/** The item is itself something to write: "List the open seats", "Describe the damage". */
export const WRITE_FIRST = /^(note|describe|list|document|record|identify|summari[sz]e|write|log|explain|outline|specify|itemi[sz]e|state|define|detail)\b/i;
/** The item asks for something to be written somewhere along the way. */
export const WRITE_ANY = /\b(note|notes|describe|list|document(?:ed)?|record(?:ed)?|identify|summari[sz]e|write|written|log|explain|outline|specify|itemi[sz]e|rationale|reason(?:s|ing)?|findings?|justif\w+|why)\b/i;

// ── Pages named in text ─────────────────────────────────────────────────────
/** Page names as the app writes them, longest first, and where each one is. */
const PAGES: [label: string, path: string][] = ([
  ['Funds › Planning › Next year draft', '/funds?tab=planning&section=draft'],
  ['Funds › Planning › Next year', '/funds?tab=planning&section=draft'],
  ['Funds › Planning › Reserves', '/funds?tab=planning&section=reserves'],
  ['Funds › Planning › Budget', '/funds?tab=planning&section=budget'],
  ['Funds › Planning', '/funds?tab=planning'],
  ['Funds › Income › Units', '/funds?tab=income&section=ledger'],
  ['Funds › Income › Behind', '/funds?tab=income&section=behind'],
  ['Funds › Income › Invoices', '/funds?tab=income&section=invoices'],
  ['Funds › Income', '/funds?tab=income'],
  ['Funds › Expenses › Bills', '/funds?tab=expenses&section=bills'],
  ['Funds › Expenses › Decisions', '/funds?tab=expenses&section=decisions'],
  ['Funds › Expenses › Work orders', '/funds?tab=expenses&section=workorders'],
  ['Funds › Work orders', '/funds?tab=expenses&section=workorders'],
  ['Funds › Expenses', '/funds?tab=expenses'],
  ['Funds › Statements & taxes', '/funds?tab=statements'],
  ['Funds › Statements', '/funds?tab=statements'],
  ['Funds › Settings › Fee schedule', '/funds?tab=settings&section=fees'],
  ['Funds › Settings › Billing rules', '/funds?tab=settings&section=rules'],
  ['Funds › Settings', '/funds?tab=settings'],
  ['Funds › Online payments', '/funds?tab=payments'],
  ['Building › Documents › Budgets', '/building?tab=documents'],
  ['Building › Documents', '/building?tab=documents'],
  ['Building › Overview › Insurance', '/building?tab=overview&section=insurance'],
  ['Building › Overview › Assets', '/building?tab=overview&section=assets'],
  ['Building › Insurance', '/building?tab=overview&section=insurance'],
  ['Building › Overview', '/building?tab=overview'],
  ['Building › Obligations › Filings', '/building?tab=obligations&section=filings'],
  ['Building › Obligations', '/building?tab=obligations'],
  ['Building › Contracts', '/building?tab=contracts'],
  ['Building › Directory', '/building?tab=directory'],
  ['Building › Archive', '/building?tab=archive'],
  ['Community › Meetings', '/community?tab=meetings'],
  ['Community › Votes', '/community?tab=votes'],
  ['Community › Notices', '/community?tab=notices'],
  ['Community › Requests', '/community?tab=requests'],
  ['Community › Amenities', '/community?tab=amenities'],
  ['Community › Property log', '/community?tab=log'],
  ['Board Room › Inbox', '/boardroom?tab=inbox'],
  ['Board Room › Runbooks', '/boardroom?tab=runbooks'],
  ['Board Room › Outbox', '/boardroom?tab=outbox'],
  ['Board Room › Tasks', '/boardroom?tab=tasks'],
  ['Me › Units', '/me?tab=units'],
] as [string, string][]).sort((a, b) => b[0].length - a[0].length);

/** The pages a piece of text names, in the order it names them, each once. */
export function pagesInText(text: string | null | undefined): { label: string; path: string }[] {
  if (!text) return [];
  const found: { at: number; label: string; path: string }[] = [];
  let rest = text;
  for (const [label, path] of PAGES) {
    const at = rest.toLowerCase().indexOf(label.toLowerCase());
    if (at < 0) continue;
    found.push({ at, label, path });
    // A longer name hides the shorter ones inside it ("Funds › Planning › Budget" is not also "Funds › Planning").
    rest = rest.slice(0, at) + ' '.repeat(label.length) + rest.slice(at + label.length);
  }
  const seen = new Set<string>();
  return found.sort((a, b) => a.at - b.at).filter(f => !seen.has(f.path) && !!seen.add(f.path)).map(({ label, path }) => ({ label, path }));
}
