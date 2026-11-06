import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import CommunicationsTab from '@/features/boardroom/tabs/CommunicationsTab';
import { useMailStore } from '@/store/useMailStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { fmt } from '@/lib/formatters';
import { Button, Card, Chip, Inner, SectionLabel, Tile, TileRow } from '../../components';
import { dayLabel } from '../../home/calendar';
import { meetingRows, meetingsSummary } from '../../community/metrics';
import { outboxSummary, type BoardRoomSnapshot } from '../metrics';

export default function OutboxTab({ snap, onOpenCase }: { snap: BoardRoomSnapshot; onOpenCase: (id: string) => void }) {
  const navigate = useNavigate();
  const o = outboxSummary(snap);
  const settings = useMailStore(s => s.mailingSettings);
  const meetings = useMeetingsStore(s => s.meetings);
  const communications = useComplianceStore(s => s.communications);
  const notices = useMemo(() => meetingsSummary(meetingRows({ today: snap.today, viewer: { ...snap.viewer, isBoard: true }, announcements: [], communications, meetings, elections: [], issues: [], units: [] })).noticesOverdue, [snap.today, snap.viewer, communications, meetings]);
  const needs = [
    ...notices.slice(0, 2).map(m => ({ id: `notice:${m.meeting.id}`, title: `Send the notice for the ${m.meeting.title} on ${dayLabel(m.meeting.date)}`, detail: `Overdue · was due ${dayLabel(m.noticeDue)} · goes to every active member by email · the bylaws ask for ${10} days; sending today still meets DC's 48-hour minimum`, action: () => navigate(`/community?tab=meetings&meeting=${m.meeting.id}`), label: 'Open the meeting' })),
    ...o.drafts.slice(0, 3).map(l => ({ id: `draft:${l.id}`, title: `${l.subject || l.templateName}${l.unitNumber ? ` · Unit ${l.unitNumber}` : ''}`, detail: `Draft from the ${l.templateName} template · ${l.recipient}${l.caseId ? ` · ${l.caseId}` : ''} · by ${l.createdBy}`, action: l.caseId ? () => onOpenCase(l.caseId!) : undefined, label: 'Open the case' })),
  ];

  return (
    <div className="flex flex-col gap-5">
      {needs.length > 0 && (
        <Card aria-label="Needs you">
          <div className="flex items-center justify-between"><SectionLabel>Needs you</SectionLabel><span className="text-xs text-ux2-dim">Sending a letter logs who sent it, when, how and to whom</span></div>
          <ul className="m-0 list-none divide-y divide-ux2-line p-0">
            {needs.map(n => (
              <li key={n.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1"><div className="text-[15px] font-semibold text-ux2-ink">{n.title}</div><div className="text-xs text-ux2-muted">{n.detail}</div></div>
                {n.action && <Button size="sm" onClick={n.action}>{n.label}</Button>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <TileRow>
        <Tile tone={o.drafts.length ? 'navy' : 'grey'} label="Drafts" value={o.drafts.length} sub={o.drafts[0] ? `${o.drafts[0].subject || o.drafts[0].templateName} · ${o.drafts[0].recipient}` : 'Nothing waiting to go out'} className="min-h-[150px]" />
        <Tile tone="grey" label="Sent" value={o.sent.length} unit={`· ${o.sentThisMonth} this month`} sub={o.sent[0] ? `Latest ${dayLabel(o.sent[0].sentDate)} · ${o.sent[0].subject || o.sent[0].templateName}` : 'Nothing sent yet'} className="min-h-[150px]" />
        <Tile tone="teal" label="Certified and first-class mail" value={o.inTransit.length} unit="in transit" sub={`${o.delivered.length} delivered · ${fmt(o.spentCents / 100)} postage this year${settings.cardLast4 ? ` · ${settings.cardBrand} ····${settings.cardLast4} on file` : ' · no card on file'}`} className="min-h-[150px]" />
      </TileRow>

      <Card aria-label="Alerts and delivery">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Inner>
            <div className="text-sm font-semibold text-ux2-ink">Alerts · urgent notices to every owner</div>
            <p className="text-xs text-ux2-muted">An alert is for things that cannot wait: water or power off, fire alarm test, elevator out of service. It posts as a notice, appears at the top of Home, and emails at once. Regular news goes out as a post.</p>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => navigate('/community?tab=notices')}>Send an alert · Community › Notices</Button>
          </Inner>
          <Inner>
            <div className="text-sm font-semibold text-ux2-ink">Delivery · {settings.enabled ? 'certified mail on' : 'certified mail off'}</div>
            <p className="text-xs text-ux2-muted">In-app and email are free and instant. Certified and first-class letters go through the mailing service, charged to the card on file{settings.senderName ? ` and sent from ${settings.senderName}` : ''}.</p>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => navigate('/funds?tab=settings&section=mailing')}>Card on file and defaults · Funds › gear</Button>
          </Inner>
        </div>
      </Card>

      {o.sent.length > 0 && (
        <Card aria-label="Letters">
          <SectionLabel>Letters · {o.sent.length} sent · {o.drafts.length} drafts · {o.templates.length} templates</SectionLabel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.06em] text-ux2-muted">
                  <th className="py-2 pr-3 font-semibold">Letter</th><th className="py-2 pr-3 font-semibold">To</th><th className="hidden py-2 pr-3 font-semibold md:table-cell">Delivery</th><th className="py-2 pr-3 font-semibold">Status</th><th className="py-2 font-semibold">When</th>
                </tr>
              </thead>
              <tbody>
                {[...o.drafts, ...o.sent].slice(0, 30).map(l => (
                  <tr key={l.id} data-letter={l.id} className="border-t border-ux2-line">
                    <td className="py-2 pr-3"><div className="font-semibold text-ux2-ink">{l.subject || l.templateName}</div><div className="text-xs text-ux2-dim">From the {l.templateName} template{l.caseId ? <> · <button type="button" className="text-ux2-teal hover:underline" onClick={() => onOpenCase(l.caseId!)}>{l.caseId}</button></> : null}</div></td>
                    <td className="py-2 pr-3 text-ux2-ink">{l.recipient}{l.unitNumber ? ` · Unit ${l.unitNumber}` : ''}</td>
                    <td className="hidden py-2 pr-3 text-ux2-muted md:table-cell">{l.sentVia || '—'}</td>
                    <td className="py-2 pr-3"><Chip tone={l.status === 'sent' ? 'sage' : l.status === 'draft' ? 'navy' : 'ghost'}>{l.status === 'sent' ? 'Sent' : l.status === 'draft' ? 'Draft' : 'Archived'}</Chip></td>
                    <td className="py-2 whitespace-nowrap text-ux2-muted">{l.sentDate ? dayLabel(l.sentDate.slice(0, 10)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card aria-label="Compose and templates">
        <SectionLabel>Compose, the feed and the templates</SectionLabel>
        <div className="ux2-legacy"><CommunicationsTab /></div>
      </Card>
    </div>
  );
}
