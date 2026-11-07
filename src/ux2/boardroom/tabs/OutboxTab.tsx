import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLetterStore } from '@/store/useLetterStore';
import { useMailStore } from '@/store/useMailStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { cn, fmt } from '@/lib/formatters';
import type { GeneratedLetter, LetterTemplate } from '@/lib/services/letterEngine';
import { Button, Card, Chip, Inner, PillTabs, SearchInput, SectionLabel, Table, Th, Td, Cell, Why, Field, INPUT } from '../../components';
import { dayLabel } from '../../home/calendar';
import { meetingRows, meetingsSummary } from '../../community/metrics';
import { outboxSummary, type BoardRoomSnapshot } from '../metrics';

type Section = 'drafts' | 'sent' | 'scheduled' | 'templates' | 'older';

const METHOD_NOTE: Record<string, string> = { 'certified': 'certified mail', 'first-class': 'first-class mail', 'in-app': 'in-app', 'email': 'email' };

function deliveryOf(l: GeneratedLetter, certifiedCents: number): { how: string; note: string } {
  const via = (l.sentVia || '').toLowerCase();
  if (/certif/.test(via)) return { how: 'Certified mail', note: `${fmt(certifiedCents / 100)} · card on file` };
  if (/mail|print/.test(via)) return { how: 'Print and mail', note: 'print at the building' };
  if (via) return { how: l.sentVia, note: 'free · instant' };
  return { how: l.unitNumber ? 'Email, print and mail' : 'In-app and email', note: 'free · instant' };
}

/** Compose a letter from a template, or edit a draft: subject, recipient, body. Saves a draft; Send marks it sent. */
function LetterForm({ templates, draft, viewer, onClose }: { templates: LetterTemplate[]; draft?: GeneratedLetter; viewer: string; onClose: () => void }) {
  const addLetter = useLetterStore(s => s.addLetter);
  const updateLetter = useLetterStore(s => s.updateLetter);
  const units = useFinancialStore(s => s.units);
  const [templateId, setTemplateId] = useState(draft?.templateId ?? templates[0]?.id ?? '');
  const t = templates.find(x => x.id === templateId);
  const [to, setTo] = useState(draft ? (draft.unitNumber ? `unit:${draft.unitNumber}` : 'all') : 'all');
  const [subject, setSubject] = useState(draft?.subject ?? t?.subject ?? '');
  const [body, setBody] = useState(draft?.body ?? t?.body ?? '');
  const [via, setVia] = useState(draft?.sentVia || 'In-app and email');
  const pick = (id: string) => { setTemplateId(id); const nt = templates.find(x => x.id === id); if (nt && !draft) { setSubject(nt.subject); setBody(nt.body); } };
  const unit = to.startsWith('unit:') ? to.slice(5) : '';
  const recipient = unit ? (units.find(u => u.number === unit)?.owner || `Unit ${unit}`) : to === 'board' ? 'The board' : 'All owners';
  const save = (status: 'draft' | 'sent') => {
    const today = new Date().toISOString().slice(0, 10);
    const data = { templateId, templateName: t?.name ?? draft?.templateName ?? 'Letter', recipient, unitNumber: unit, subject, body, status, sentDate: status === 'sent' ? today : '', sentVia: via, createdBy: viewer, caseId: draft?.caseId ?? null };
    if (draft) updateLetter(draft.id, data); else addLetter(data);
    onClose();
  };
  return (
    <form aria-label={draft ? `Edit ${draft.subject || draft.templateName}` : 'New letter'} onSubmit={e => { e.preventDefault(); save('sent'); }} className="flex flex-col gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <div className="text-sm font-semibold text-ux2-ink">{draft ? 'Edit the letter' : 'New letter'} · building name, address and signatures fill in on their own</div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Template" className="min-w-[220px] flex-1"><select value={templateId} onChange={e => pick(e.target.value)} className={INPUT}>{templates.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label="To" className="w-[200px]"><select value={to} onChange={e => setTo(e.target.value)} className={INPUT}><option value="all">All owners · {units.length}</option><option value="board">Board</option>{units.map(u => <option key={u.number} value={`unit:${u.number}`}>Unit {u.number} · {u.owner}</option>)}</select></Field>
        <Field label="Delivery" className="w-[200px]"><select value={via} onChange={e => setVia(e.target.value)} className={INPUT}><option>In-app and email</option><option>Email</option><option>Certified mail</option><option>Print and mail</option></select></Field>
      </div>
      <Field label="Subject"><input value={subject} onChange={e => setSubject(e.target.value)} className={INPUT} /></Field>
      <Field label="Letter"><textarea value={body} onChange={e => setBody(e.target.value)} rows={6} className="w-full rounded-[10px] border border-ux2-line-strong px-3 py-2 text-sm font-normal text-ux2-ink" /></Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!subject}>Send</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => save('draft')} disabled={!subject}>Save as draft</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

function TemplateForm({ t, onClose }: { t: LetterTemplate; onClose: () => void }) {
  const update = useLetterStore(s => s.updateTemplate);
  const [subject, setSubject] = useState(t.subject);
  const [body, setBody] = useState(t.body);
  return (
    <form aria-label={`Edit template ${t.name}`} onSubmit={e => { e.preventDefault(); update(t.id, { subject, body }); onClose(); }} className="flex flex-col gap-2 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <Field label="Subject"><input value={subject} onChange={e => setSubject(e.target.value)} className={INPUT} /></Field>
      <Field label="Body · {{placeholders}} fill in when a letter is drafted"><textarea value={body} onChange={e => setBody(e.target.value)} rows={6} className="w-full rounded-[10px] border border-ux2-line-strong px-3 py-2 text-sm font-normal text-ux2-ink" /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm">Save template</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

export default function OutboxTab({ snap, onOpenCase, compose, onComposeDone }: { snap: BoardRoomSnapshot; onOpenCase: (id: string) => void; compose?: boolean; onComposeDone?: () => void }) {
  const navigate = useNavigate();
  const o = outboxSummary(snap);
  const settings = useMailStore(s => s.mailingSettings);
  const meetings = useMeetingsStore(s => s.meetings);
  const communications = useComplianceStore(s => s.communications);
  const announcements = useComplianceStore(s => s.announcements);
  const units = useFinancialStore(s => s.units);
  const board = useBuildingStore(s => s.board);
  const updateLetter = useLetterStore(s => s.updateLetter);
  const addLetter = useLetterStore(s => s.addLetter);
  const [section, setSection] = useState<Section>('drafts');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const certifiedCents = 750;
  const notices = useMemo(() => meetingsSummary(meetingRows({ today: snap.today, viewer: { ...snap.viewer, isBoard: true }, announcements: [], communications, meetings, elections: [], issues: [], units: [] })).noticesOverdue, [snap.today, snap.viewer, communications, meetings]);
  const reachable = units.filter(u => u.email).length;
  const activeAlerts = announcements.filter(a => (a as { priority?: string }).priority === 'urgent' && !(a as { archived?: boolean }).archived).length;
  const sent30 = o.sent.filter(l => l.sentDate && Date.parse(snap.today) - Date.parse(l.sentDate.slice(0, 10)) <= 30 * 86_400_000);
  const q = search.toLowerCase();
  const match = (l: GeneratedLetter) => !q || `${l.subject} ${l.templateName} ${l.recipient} ${l.unitNumber}`.toLowerCase().includes(q);
  const send = (l: GeneratedLetter) => updateLetter(l.id, { status: 'sent', sentDate: new Date().toISOString().slice(0, 10), sentVia: l.sentVia || (l.unitNumber ? 'Email' : 'In-app and email') });
  const resend = (l: GeneratedLetter) => addLetter({ templateId: l.templateId, templateName: l.templateName, recipient: l.recipient, unitNumber: l.unitNumber, subject: l.subject, body: l.body, status: 'sent', sentDate: new Date().toISOString().slice(0, 10), sentVia: l.sentVia, createdBy: snap.viewer.name, caseId: l.caseId ?? null });
  const needs = [
    ...notices.slice(0, 2).map(m => ({ id: `notice:${m.meeting.id}`, title: `Send the notice for the ${m.meeting.title} on ${dayLabel(m.meeting.date)}`, chip: <Chip tone="red">Overdue · was due {dayLabel(m.noticeDue)}</Chip>, detail: `Goes to every active member in-app and by email. The bylaws ask for 10 days; DC's minimum is 48 hours, so sending today still meets the law.`, cite: 'DC Code § 29-1101 et seq.', actions: <><Button size="sm" variant="ghost" onClick={() => navigate(`/community?tab=meetings&meeting=${m.meeting.id}`)}>Open the meeting</Button><Button size="sm" onClick={() => navigate(`/community?tab=meetings&meeting=${m.meeting.id}`)}>Send now</Button></> })),
    ...o.drafts.slice(0, 2).map(l => ({ id: `draft:${l.id}`, title: `Send the ${(l.subject || l.templateName).toLowerCase()}${l.unitNumber ? ` to Unit ${l.unitNumber}` : ''}`, chip: <Chip tone="amber">Draft · {deliveryOf(l, certifiedCents).how.toLowerCase()}</Chip>, detail: `${l.recipient}${l.caseId ? ` · ${l.caseId}` : ''} · drafted by ${l.createdBy} from the ${l.templateName} template.${/certif/i.test(l.sentVia) ? ` Certified mail is ${fmt(certifiedCents / 100)}, charged to the card on file; tracking is attached to the case.` : ''}`, cite: /demand|lien|collection/i.test(l.templateName) ? 'DC Code § 42-1903.13' : '', actions: <>{l.caseId ? <Button size="sm" variant="ghost" onClick={() => onOpenCase(l.caseId!)}>Open the case</Button> : <Button size="sm" variant="ghost" onClick={() => setEditing(l.id)}>Edit</Button>}<Button size="sm" onClick={() => send(l)}>{l.caseId ? 'Review and send' : 'Send now'}</Button></> })),
  ].slice(0, 3);

  const LetterCell = ({ l }: { l: GeneratedLetter }) => <Cell title={`${l.subject || l.templateName}${l.unitNumber ? ` · Unit ${l.unitNumber}` : ''}`} note={<>From the {l.templateName} template{l.caseId ? <> · <button type="button" className="font-semibold text-ux2-teal hover:underline" onClick={() => onOpenCase(l.caseId!)}>{l.caseId}</button></> : null}</>} />;
  const ToCell = ({ l }: { l: GeneratedLetter }) => <Cell title={<Chip tone={l.unitNumber ? 'ghost' : 'navy'}>{l.unitNumber ? 'One unit' : /board/i.test(l.recipient) ? 'Board' : 'All owners'}</Chip>} note={l.unitNumber ? l.recipient : /board/i.test(l.recipient) ? `${board.length} members` : `${units.length} units`} />;

  return (
    <div className="flex flex-col gap-5">
      {compose && <LetterForm templates={o.templates} viewer={snap.viewer.name} onClose={() => onComposeDone?.()} />}

      {needs.length > 0 && (
        <Card aria-label="Needs you" className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Needs you</SectionLabel><span className="text-xs text-ux2-muted">Sending a letter logs who sent it, when, how and to whom</span></div>
          {needs.map((n, i) => (
            <Inner key={n.id} className={cn('flex flex-wrap items-center justify-between gap-3', i === 0 && 'border-ux2-navy')}>
              <div className="min-w-0 text-sm"><b className="font-semibold text-ux2-ink">{n.title}</b> <span className="ml-1.5">{n.chip}</span><div className="mt-1 text-xs text-ux2-muted">{n.detail} {n.cite && <span className="text-ux2-dim">{n.cite}</span>}</div></div>
              <div className="flex flex-wrap gap-1.5">{n.actions}</div>
            </Inner>
          ))}
        </Card>
      )}

      <Card aria-label="Alerts" className="gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><SectionLabel>Alerts · urgent notices to every owner</SectionLabel><Chip tone={activeAlerts ? 'red' : 'sage'}>{activeAlerts ? `${activeAlerts} active` : 'None active'}</Chip></div>
          <Button size="sm" onClick={() => navigate('/community?tab=notices&compose=alert')}>Send an alert</Button>
        </div>
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <Inner><div className="text-sm font-semibold text-ux2-ink">In-app card</div><p className="m-0 text-xs text-ux2-muted">Appears at the top of Home for everyone in the building, until you clear it. {units.length} of {units.length} units reachable.</p></Inner>
          <Inner><div className="text-sm font-semibold text-ux2-ink">Email</div><p className="m-0 text-xs text-ux2-muted">Sent at once to every owner and resident with an address on file. {reachable} of {units.length} units reachable.</p></Inner>
        </div>
        <Why>An alert is for things that cannot wait: water or power off, fire alarm test, elevator out of service. Regular news goes out as a post, with an in-app card and a daily digest email.</Why>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PillTabs size="filter" aria-label="Outbox sections" value={section} onChange={id => { if (id === 'older') navigate('/boardroom?tab=archive'); else setSection(id); }} tabs={[{ id: 'drafts', label: `Drafts · ${o.drafts.length}` }, { id: 'sent', label: `Sent · ${sent30.length}` }, { id: 'scheduled', label: 'Scheduled · 0' }, { id: 'templates', label: `Templates · ${o.templates.length}` }, { id: 'older', label: 'Older letters' }]} />
        <SearchInput value={search} onChange={setSearch} placeholder="Search subject, unit, template" label="Search letters" className="w-[260px] max-w-full" />
      </div>

      {(section === 'drafts' || section === 'scheduled') && (
        <Card aria-label="Drafts" className="gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>{section === 'scheduled' ? 'Scheduled' : 'Drafts'}</SectionLabel><span className="text-xs text-ux2-muted">{section === 'scheduled' ? 'Nothing is scheduled; a draft goes when you send it' : `${o.drafts.length} draft${o.drafts.length === 1 ? '' : 's'}`}</span></div>
          {section === 'drafts' && (o.drafts.filter(match).length === 0 ? <p className="m-0 text-sm text-ux2-muted">Nothing waiting to go out.</p> : (
            <Table minWidth={820}>
              <thead><tr><Th>Letter</Th><Th>To</Th><Th>Delivery</Th><Th>Status</Th><Th>Last edited</Th><Th aria-label="Actions" /></tr></thead>
              <tbody>
                {o.drafts.filter(match).map(l => {
                  const d = deliveryOf(l, certifiedCents);
                  return (
                    <Fragment key={l.id}>
                      <tr data-letter={l.id}>
                        <Td><LetterCell l={l} /></Td>
                        <Td><ToCell l={l} /></Td>
                        <Td><Cell title={<span className="font-normal">{d.how}</span>} note={d.note} /></Td>
                        <Td><Chip tone={l.body ? 'sage' : 'ghost'}>{l.body ? 'Ready to send' : 'Not started'}</Chip></Td>
                        <Td className="whitespace-nowrap text-ux2-muted">{l.createdBy}{l.sentDate ? ` · ${dayLabel(l.sentDate.slice(0, 10))}` : ''}</Td>
                        <Td num><span className="flex justify-end gap-1.5"><Button size="sm" variant="ghost" onClick={() => setEditing(editing === l.id ? null : l.id)}>Edit</Button><Button size="sm" onClick={() => send(l)}>Send</Button></span></Td>
                      </tr>
                      {editing === l.id && <tr><td colSpan={6} className="px-3 py-2"><LetterForm templates={o.templates} draft={l} viewer={snap.viewer.name} onClose={() => setEditing(null)} /></td></tr>}
                    </Fragment>
                  );
                })}
              </tbody>
            </Table>
          ))}
        </Card>
      )}

      {section === 'sent' && (
        <Card aria-label="Sent" className="gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Sent · last 30 days</SectionLabel><button type="button" onClick={() => navigate('/boardroom?tab=archive')} className="text-xs font-semibold text-ux2-teal underline">Everything older is in Archive</button></div>
          {sent30.filter(match).length === 0 ? <p className="m-0 text-sm text-ux2-muted">Nothing sent in the last 30 days.</p> : (
            <Table minWidth={820}>
              <thead><tr><Th>Letter</Th><Th>To</Th><Th>Delivery</Th><Th>Proof</Th><Th>Sent</Th><Th aria-label="Actions" /></tr></thead>
              <tbody>
                {sent30.filter(match).map(l => {
                  const d = deliveryOf(l, certifiedCents);
                  const rec = snap.mailRecords.find(m => m.caseId && m.caseId === l.caseId && m.templateName === l.templateName);
                  return (
                    <Fragment key={l.id}>
                      <tr data-letter={l.id}>
                        <Td><LetterCell l={l} /></Td>
                        <Td><ToCell l={l} /></Td>
                        <Td><Cell title={<span className="font-normal">{d.how}</span>} note={d.note} /></Td>
                        <Td><Cell title={<Chip tone="sage">{rec ? `${rec.status[0].toUpperCase()}${rec.status.slice(1)}` : l.unitNumber ? 'Sent' : `Posted to ${units.length} owners`}</Chip>} note={rec?.letterstreamJobId ? `tracking ${rec.letterstreamJobId}` : l.unitNumber ? 'read log kept' : 'pinned in Community › News'} /></Td>
                        <Td className="whitespace-nowrap text-ux2-muted">{l.createdBy} · {l.sentDate ? dayLabel(l.sentDate.slice(0, 10)) : '—'}</Td>
                        <Td num><span className="flex justify-end gap-1.5"><Button size="sm" variant="ghost" onClick={() => setViewing(viewing === l.id ? null : l.id)}>View</Button><Button size="sm" variant="ghost" onClick={() => resend(l)}>Resend</Button></span></Td>
                      </tr>
                      {viewing === l.id && <tr><td colSpan={6} className="px-3 py-2"><Inner className="whitespace-pre-wrap text-sm text-ux2-ink"><div className="mb-1 font-semibold">{l.subject}</div>{l.body}</Inner></td></tr>}
                    </Fragment>
                  );
                })}
              </tbody>
            </Table>
          )}
          <Why>A sent letter is read-only. Proof means the delivery receipt, the tracking record or the in-app read log, attached to the case or meeting it belongs to.</Why>
        </Card>
      )}

      {(section === 'drafts' || section === 'templates') && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card aria-label="Templates" className="gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="m-0 text-lg font-medium text-ux2-ink">Templates</h2><span className="text-xs text-ux2-muted">Building name, address and signatures fill in on their own</span></div>
            {o.templates.filter(t => !q || `${t.name} ${t.category}`.toLowerCase().includes(q)).slice(0, section === 'templates' ? 40 : 6).map(t => {
              const used = o.sent.filter(l => l.templateId === t.id).sort((a, b) => (b.sentDate || '').localeCompare(a.sentDate || ''))[0];
              return (
                <Fragment key={t.id}>
                  <Inner className="flex items-center justify-between gap-3">
                    <Cell title={t.name} note={`${t.category[0].toUpperCase()}${t.category.slice(1)}${used?.sentDate ? ` · used ${dayLabel(used.sentDate.slice(0, 10))}` : ''}`} />
                    <Button size="sm" variant="ghost" onClick={() => setEditingTemplate(editingTemplate === t.id ? null : t.id)}>Edit template</Button>
                  </Inner>
                  {editingTemplate === t.id && <TemplateForm t={t} onClose={() => setEditingTemplate(null)} />}
                </Fragment>
              );
            })}
            {section !== 'templates' && o.templates.length > 6 && <Button size="sm" variant="ghost" className="self-start" onClick={() => setSection('templates')}>All {o.templates.length} templates</Button>}
            <Why>Editing a template never changes a letter already sent.</Why>
          </Card>
          <Card aria-label="How a letter goes out" className="gap-2">
            <h2 className="m-0 text-lg font-medium text-ux2-ink">How a letter goes out</h2>
            <SectionLabel>Delivery</SectionLabel>
            {[
              ['In-app', "Appears in Community and on the owner's Home · read log kept", 'Free · instant'],
              ['Email', 'To the address on file in Building › Directory · bounces come back here', 'Free · instant'],
              ['Certified mail', 'Printed, mailed and tracked for you · required for demand letters', `${fmt(certifiedCents / 100)} · ${settings.cardLast4 ? 'card on file' : 'no card on file'}`],
              ['Print and mail', 'Print at the building, mark it mailed, the porter drops it off', 'Free · you post it'],
            ].map(([how, note, cost]) => (
              <Inner key={how} className="flex items-center justify-between gap-3"><Cell title={how} note={note} /><Chip tone={/Free/.test(cost) ? 'sage' : 'amber'}>{cost}</Chip></Inner>
            ))}
            <SectionLabel className="mt-1">Who it goes to</SectionLabel>
            <div className="flex flex-wrap gap-1.5"><Chip tone="navy">All owners · {units.length}</Chip><Chip tone="ghost">Board · {board.length}</Chip><Chip tone="ghost">One unit</Chip></div>
            <Why>A letter can use more than one method. Notices to all owners go in-app and by email; the {Math.max(0, units.length - reachable)} owner{units.length - reachable === 1 ? '' : 's'} without email get print and mail on their own. {METHOD_NOTE.certified ? '' : ''}</Why>
          </Card>
        </div>
      )}
    </div>
  );
}
