/**
 * The setup card at the top of Home while the building is setting up. Plum,
 * the brand's second colour, so it never reads as an alert. One next action,
 * progress and the seven steps. Hidden, it shrinks to a one-line chip that
 * stays until the building goes live.
 */
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/formatters';
import { useTenantContext } from '@/components/TenantProvider';
import { useSetupStore } from '@/features/setup/useSetupStore';
import { useSetup, useNeedsSetup } from './useSetup';

const Check = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>;

export default function SetupCard() {
  const needs = useNeedsSetup();
  const tenant = useTenantContext();
  const s = useSetup();
  const hidden = useSetupStore(x => x.hidden);
  const setHidden = useSetupStore(x => x.setHidden);
  const navigate = useNavigate();
  if (!needs) return null;
  const go = (step: string) => navigate(`/setup?step=${step}`);

  if (hidden) {
    return (
      <button type="button" data-widget="setup-chip" onClick={() => { setHidden(false); go(s.next.step); }} className="flex min-h-[44px] items-center gap-2 self-start rounded-full bg-ux2-plum-tint px-4 text-sm font-semibold text-ux2-plum">
        Setting up · {s.pct}% · {s.next.label}
      </button>
    );
  }

  const steps = [
    { label: 'Documents', done: s.docs.some(d => d.status === 'read' || d.status === 'filed'), note: s.docs.length ? `${s.docs.filter(d => d.status === 'read' || d.status === 'filed').length} added` : 'Start here' },
    { label: 'Review what we found', done: s.items.length > 0 && s.pending.length === 0, note: s.items.length ? (s.pending.length ? `${s.pending.length} to confirm` : 'Done') : '' },
    { label: 'Fill the gaps', done: s.ready, note: s.missing ? `${s.missing} essential${s.missing === 1 ? '' : 's'} left` : 'Done' },
    { label: 'Get paid online', done: s.payments === 'on', note: s.payments === 'on' ? 'Connected' : s.payments === 'pending' ? 'Stripe verifying' : s.paymentsLater ? 'Later' : 'Optional · about 10 min' },
    { label: 'Send letters by mail', done: s.mail === 'on', note: s.mail === 'on' ? 'Connected' : s.mailLater ? 'Later' : 'Optional · about 5 min' },
    { label: 'Invite people', done: false, note: 'Optional' },
    { label: 'Go live', done: false, note: '' },
  ];
  // The highlighted step follows the next thing to do; optional steps left for later or awaiting Stripe don't hold it.
  const current = s.next.step === 'documents' ? 0 : s.next.step === 'review' ? 1 : s.next.step === 'payments' ? 3 : s.next.step === 'mail' ? 4 : s.missing > 0 ? 2 : 5;

  return (
    <section data-widget="setup-card" aria-labelledby="setup-card-h" className="grid grid-cols-1 gap-6 rounded-[22px] bg-ux2-plum p-6 text-white md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-2.5"><span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ux2-plum">Setting up · {s.pct}%</span><span className="text-[13px] text-white/80">About {s.minutes} minute{s.minutes === 1 ? '' : 's'} left</span></div>
        <h2 id="setup-card-h" className="font-display text-[26px] font-semibold leading-tight">Set up {tenant.name}</h2>
        <p className="m-0 text-[15px] leading-relaxed text-white/[0.88]">{s.next.step === 'payments'
          ? 'Your documents are read and the gaps are filled. Next, connect Stripe so owners can pay dues by card or bank from the day they\'re invited. It\'s optional, and Stripe needs a day or two to verify the association, so starting now pays off.'
          : s.next.step === 'mail'
            ? 'Next, open the building\'s LetterStream account so certified notices and letters print and mail themselves, billed to the building. It\'s optional and takes about five minutes.'
            : "Start with the documents you already have. Add your bylaws, owner list and budget (PDF, spreadsheet or pasted text) and we pick out what the building needs. You confirm each item before it's saved."}</p>
        <div className="flex gap-1" aria-hidden="true">{steps.map((x, i) => <span key={x.label} className={cn('h-1.5 flex-1 rounded-full', x.done ? 'bg-white' : i === current ? 'bg-white/55' : 'bg-white/[0.22]')} />)}</div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => go(s.next.step)} className="h-11 rounded-full bg-white px-5 text-sm font-semibold text-ux2-plum">{s.next.label}</button>
          {s.docs.length > 0 && <button type="button" onClick={() => go('documents')} className="h-11 rounded-full border border-white/45 px-[18px] text-sm font-semibold">Add more documents</button>}
          <button type="button" onClick={() => setHidden(true)} className="h-11 px-3.5 text-[13px] font-semibold text-white/80 hover:text-white">Hide for now</button>
        </div>
      </div>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Setup steps">
        {steps.map((x, i) => (
          <li key={x.label} className={cn('flex min-h-[44px] items-center gap-2.5 rounded-xl px-3 py-2 text-[13px]', i === current ? 'bg-white/20 font-semibold' : 'bg-white/10')}>
            <span className={cn('grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[11px] font-bold', x.done ? 'bg-white text-ux2-plum' : i === current ? 'border-2 border-white' : 'border-[1.5px] border-white/50')}>{x.done ? <Check /> : i + 1}</span>
            <span className="flex-1">{x.label}</span>
            {x.note && <span className="font-normal text-white/80">{x.note}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
