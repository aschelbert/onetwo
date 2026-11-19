import { useState } from 'react';
import { useMailStore } from '@/store/useMailStore';
import { MAIL_ENDED, MAIL_PROVIDERS, formatDeliveryMethod, formatMailStatus, hasReturnReceipt, uspsTrackingUrl } from '@/types/mail';
import type { MailRecord, MailStatus } from '@/types/mail';

/** What a board member can read off the vendor's tracking and record here. */
const OUTCOMES: MailStatus[] = ['mailed', 'in-transit', 'delivered', 'returned'];
const TONE: Partial<Record<MailStatus, string>> = {
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  returned: 'bg-red-50 text-red-700 border-red-200',
  'awaiting-payment': 'bg-amber-50 text-amber-800 border-amber-200',
};
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : '');
const today = () => new Date().toISOString().slice(0, 10);

/**
 * The building's letters, the same list for every board member (it loads from
 * the building's record, not this browser). Opening one shows where it
 * stands. LetterStream answers a status call; DocuPost has no status API, so
 * the board copies the USPS tracking number from the letter's page there and
 * marks the outcome, and the app links straight to USPS from then on.
 */
export default function MailHistory() {
  const records = useMailStore(s => s.mailRecords);
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const sent = records.filter(r => r.status !== 'failed' && r.status !== 'draft' && r.status !== 'approved');
  const totalCostCents = sent.reduce((sum, r) => sum + (r.cost?.totalCents ?? 0), 0);
  const untracked = sent.filter(r => !MAIL_ENDED.includes(r.status) && !r.trackingNumber && r.deliveryMethod !== 'first-class' && r.mailProvider && !MAIL_PROVIDERS[r.mailProvider].hasStatusApi);
  const shown = showAll ? records : records.slice(0, 8);

  return (
    <div className="bg-white border border-ink-200 rounded-xl p-5" data-testid="mail-history">
      <h4 className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-3">Mailing History</h4>
      {records.length === 0 ? (
        <p className="text-sm text-ink-400 text-center py-4">No mailings sent yet</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-mist-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-ink-900">{sent.length}</p>
              <p className="text-xs text-ink-500">Letters sent</p>
            </div>
            <div className="bg-mist-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-ink-900">${(totalCostCents / 100).toFixed(2)}</p>
              <p className="text-xs text-ink-500">Estimated Postage</p>
            </div>
          </div>
          {untracked.length > 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" data-testid="mail-untracked">
              {untracked.length} certified {untracked.length === 1 ? 'letter has' : 'letters have'} no tracking number recorded yet. Open {untracked.length === 1 ? 'it' : 'each'} below and copy the number from the vendor, so the proof of mailing sits with the building's record.
            </p>
          )}
          <ul className="divide-y divide-ink-50">
            {shown.map(r => (
              <li key={r.id} data-mail-record={r.id}>
                <button type="button" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full flex items-center justify-between gap-3 py-2 text-left">
                  <span className="min-w-0">
                    <span className="block text-sm text-ink-700 truncate">{r.templateName}</span>
                    <span className="block text-xs text-ink-400">{r.recipient.name} &middot; {day(r.sentAt || r.createdAt)} &middot; {formatDeliveryMethod(r.deliveryMethod)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`inline-block text-[11px] font-semibold border rounded-full px-2 py-0.5 ${TONE[r.status] ?? 'bg-ink-50 text-ink-700 border-ink-200'}`}>{formatMailStatus(r.status)}</span>
                    <span className="block text-xs text-ink-400 mt-0.5">est. ${((r.cost?.totalCents ?? 0) / 100).toFixed(2)}</span>
                  </span>
                </button>
                {open === r.id && <Detail r={r} />}
              </li>
            ))}
          </ul>
          {records.length > shown.length && (
            <button type="button" onClick={() => setShowAll(true)} className="text-xs text-accent-600 hover:text-accent-700 font-medium">Show all {records.length} letters</button>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ r }: { r: MailRecord }) {
  const recordTracking = useMailStore(s => s.recordTracking);
  const refreshMailStatus = useMailStore(s => s.refreshMailStatus);
  const vendor = r.mailProvider ? MAIL_PROVIDERS[r.mailProvider] : null;
  const [tracking, setTracking] = useState(r.trackingNumber || '');
  const [status, setStatus] = useState<MailStatus | ''>(OUTCOMES.includes(r.status) ? r.status : '');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const failed = r.status === 'failed';
  const portalUrl = r.letterstreamPortalUrl || vendor?.portalUrl;

  const save = async () => {
    setBusy(true); setNote(null);
    try {
      await recordTracking(r.id, { trackingNumber: tracking, status: status || undefined, date: status ? date : undefined });
      setNote({ ok: true, text: 'Saved to the building\'s record.' });
    } catch (e) { setNote({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(false); }
  };

  const refresh = async () => {
    setBusy(true); setNote(null);
    try {
      const res = await refreshMailStatus(r.id);
      setNote({ ok: true, text: res.note || `Checked with ${vendor?.label}.` });
    } catch (e) { setNote({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(false); }
  };

  return (
    <div className="mb-3 rounded-lg bg-mist-50 border border-mist-200 p-3 space-y-3 text-xs text-ink-600">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>To {r.recipient.name}, {r.recipient.address.line1}{r.recipient.address.line2 ? `, ${r.recipient.address.line2}` : ''}, {r.recipient.address.city}, {r.recipient.address.state} {r.recipient.address.zip}</span>
        {r.sentBy && <span>Sent by {r.sentBy}</span>}
        {r.letterstreamJobId && <span>{vendor?.label ?? 'Vendor'} reference {r.letterstreamJobId}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {r.trackingNumber && <a href={uspsTrackingUrl(r.trackingNumber)} target="_blank" rel="noreferrer" className="text-accent-600 hover:text-accent-700 font-medium">Track with USPS · {r.trackingNumber} ↗</a>}
        {portalUrl && <a href={portalUrl} target="_blank" rel="noreferrer" className="text-accent-600 hover:text-accent-700 font-medium">Open {vendor?.label ?? 'the vendor'} ↗</a>}
        {vendor?.hasStatusApi && !failed && <button type="button" onClick={() => void refresh()} disabled={busy} className="text-accent-600 hover:text-accent-700 font-medium disabled:opacity-50">Check with {vendor.label}</button>}
      </div>

      {!failed && vendor && (
        <div className="space-y-2">
          <p>
            {vendor.hasStatusApi
              ? `${vendor.label} reports where the letter stands; you can also record it yourself.`
              : r.deliveryMethod === 'first-class'
                ? `${vendor.label} has no status API and USPS does not track First Class letters. ${vendor.label} shows it as processed for delivery under ${vendor.trackingHint}; mark it here once it does.`
                : `${vendor.label} has no status API. Copy the USPS tracking number from ${vendor.trackingHint} in ${vendor.label}, usually a day or two after sending, and mark the outcome once USPS shows it.`}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {r.deliveryMethod !== 'first-class' && (
              <label className="block">
                <span className="block font-medium text-ink-700 mb-1">USPS tracking number</span>
                <input value={tracking} onChange={e => setTracking(e.target.value)} autoComplete="off" inputMode="numeric" placeholder="9407 1000 0000 0000 0000 00" className="w-full px-2 py-1.5 border border-ink-200 rounded-lg text-xs font-mono bg-white" />
              </label>
            )}
            <label className="block">
              <span className="block font-medium text-ink-700 mb-1">Where it stands</span>
              <select value={status} onChange={e => setStatus(e.target.value as MailStatus | '')} className="w-full px-2 py-1.5 border border-ink-200 rounded-lg text-xs bg-white">
                <option value="">{formatMailStatus(r.status)} (no change)</option>
                {OUTCOMES.filter(o => o !== r.status).map(o => <option key={o} value={o}>{formatMailStatus(o)}</option>)}
              </select>
            </label>
            {status && status !== r.status && (
              <label className="block">
                <span className="block font-medium text-ink-700 mb-1">On</span>
                <input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} className="w-full px-2 py-1.5 border border-ink-200 rounded-lg text-xs bg-white" />
              </label>
            )}
          </div>
          <button type="button" onClick={() => void save()} disabled={busy} className="px-3 py-1.5 bg-ink-900 hover:bg-ink-800 text-white rounded-lg text-xs font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Save tracking'}</button>
        </div>
      )}

      {hasReturnReceipt(r.deliveryMethod) && vendor && !failed && <p>{vendor.receiptNote}</p>}
      {note && <p role="status" className={note.ok ? 'text-emerald-700' : 'text-red-700'}>{note.text}</p>}

      <ol className="space-y-1 border-t border-mist-200 pt-2">
        {r.statusHistory.map((h, i) => (
          <li key={i} className="flex gap-2"><span className="shrink-0 text-ink-400 w-20">{day(h.timestamp)}</span><span><span className="font-medium text-ink-700">{formatMailStatus(h.status)}</span>{h.detail ? ` · ${h.detail}` : ''}</span></li>
        ))}
      </ol>
    </div>
  );
}
