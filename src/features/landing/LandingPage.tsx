import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/* ─── Types ─── */
type DemoTab = 'dashboard' | 'boardroom' | 'building' | 'fiscal' | 'cases' | 'archives';

const DEMO_URLS: Record<DemoTab, string> = {
  dashboard: 'getonetwo.com/dashboard',
  boardroom: 'getonetwo.com/boardroom',
  building: 'getonetwo.com/building',
  fiscal: 'getonetwo.com/financial',
  cases: 'getonetwo.com/cases',
  archives: 'getonetwo.com/archives',
};

const DEMO_TABS: { id: DemoTab; icon: string; label: string }[] = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'boardroom', icon: '🏛', label: 'Board Room' },
  { id: 'building', icon: '🏢', label: 'The Building' },
  { id: 'fiscal', icon: '💰', label: 'Fiscal Lens' },
  { id: 'cases', icon: '⚡', label: 'Cases' },
  { id: 'archives', icon: '📦', label: 'Archives' },
];

const DEMO_DESCS: Record<DemoTab, { icon: string; title: string; badge?: string; badgeColor?: string; desc: string }> = {
  dashboard: { icon: '📊', title: 'Dashboard', desc: 'Your command center. Building and compliance grades, fiduciary alerts, collection rates, reserve funding, open cases, and role-based action items — everything you need at a glance to know where your community stands.' },
  boardroom: { icon: '🏛', title: 'Board Room', badge: 'Compliance engine', badgeColor: 'bg-accent-800/20 text-red-300', desc: 'Governance calendar, fiduciary duties (Care, Loyalty, Obedience), role responsibility matrix, daily operations tracker, votes & resolutions, and communications — all tied to DC jurisdiction requirements.' },
  building: { icon: '🏢', title: 'The Building', desc: 'Building health score (A–F), property details, unit directory, contacts, legal & bylaws tracking, insurance status, vendor management, PM scorecard, and mailing tools.' },
  fiscal: { icon: '💰', title: 'Fiscal Lens', badge: 'Full accounting', badgeColor: 'bg-green-500/20 text-green-400', desc: 'Double-entry general ledger, chart of accounts, budget burn rate tracking, reserve fund monitoring, delinquency aging, unit ledger with payment actions, work orders & invoices, and financial reports.' },
  cases: { icon: '⚡', title: 'Case Workflow', badge: 'Unique to ONE two', badgeColor: 'bg-yellow-500/20 text-yellow-400', desc: 'Step-by-step case management with priority triage, pre-legal escalation paths, progress tracking, unit or common area association, and compliant resolution workflows. Community Room requests flow directly in.' },
  archives: { icon: '📦', title: 'The Archives', desc: 'Permanent, read-only annual snapshots of all compliance, financial, and governance records. Automatic regulatory refresh ensures requirements stay current year over year.' },
};

const PRICES = {
  compliance: { monthly: '$179', yearly: '$1,800' },
  community: { monthly: '$279', yearly: '$2,850' },
  management: { monthly: '$399', yearly: '$4,250' },
};

/* ─── Count-Up Hook ─── */
function useCountUp(target: number, suffix = '', prefix = '', delay = 200, format?: string, active = false) {
  const [display, setDisplay] = useState('—');
  const ran = useRef(false);

  useEffect(() => {
    if (!active || ran.current) return;
    ran.current = true;
    const duration = 800;
    const steps = 20;
    const stepTime = duration / steps;
    const timer = setTimeout(() => {
      let step = 0;
      const interval = setInterval(() => {
        step++;
        const progress = step / steps;
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(target * eased);
        const d = format === 'dollar' ? current.toLocaleString() : String(current);
        setDisplay(prefix + d + suffix);
        if (step >= steps) {
          clearInterval(interval);
          const final = format === 'dollar' ? target.toLocaleString() : String(target);
          setDisplay(prefix + final + suffix);
        }
      }, stepTime);
    }, delay);
    return () => clearTimeout(timer);
  }, [active, target, suffix, prefix, delay, format]);

  // Reset when not active
  useEffect(() => {
    if (!active) {
      setDisplay('—');
      ran.current = false;
    }
  }, [active]);

  return display;
}

/* ─── CountUp Component ─── */
function CountUp({ target, suffix = '', prefix = '', delay = 200, format, active, className, style }: {
  target: number; suffix?: string; prefix?: string; delay?: number; format?: string; active: boolean; className?: string; style?: React.CSSProperties;
}) {
  const display = useCountUp(target, suffix, prefix, delay, format, active);
  return <span className={`count-up ${className || ''}`} style={style}>{display}</span>;
}

/* ─── Step Track Component ─── */
function StepTrack({ lit, total, active }: { lit: number; total: number; active: boolean }) {
  const [litDots, setLitDots] = useState<Set<number>>(new Set());
  const [currentDot, setCurrentDot] = useState(-1);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (!active) { setLitDots(new Set()); setCurrentDot(-1); return; }
    for (let i = 0; i < total; i++) {
      const t = setTimeout(() => {
        if (i < lit - 1) {
          setLitDots(prev => new Set(prev).add(i));
        } else if (i === lit - 1) {
          setCurrentDot(i);
        }
      }, 400 + i * 80);
      timersRef.current.push(t);
    }
    return () => timersRef.current.forEach(clearTimeout);
  }, [active, lit, total]);

  return (
    <div className="step-track">
      {Array.from({ length: total }, (_, i) => (
        <span key={i}>
          {i > 0 && <span className={`step-connector${litDots.has(i) || i === currentDot ? ' done' : ''}`} />}
          <span className={`step-dot${litDots.has(i) ? ' lit' : ''}${i === currentDot ? ' current' : ''}`}>{i + 1}</span>
        </span>
      ))}
    </div>
  );
}

/* ─── Scroll Animation Hook ─── */
function useScrollAnimate() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.unobserve(el); }
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return { ref, visible };
}

function Animate({ children, className = '', delay = '' }: { children: React.ReactNode; className?: string; delay?: string }) {
  const { ref, visible } = useScrollAnimate();
  const delayStyle = delay ? { animationDelay: delay } : undefined;
  return (
    <div ref={ref} className={`landing-animate${visible ? '' : ' paused'} ${className}`} style={delayStyle}>
      {children}
    </div>
  );
}

/* ─── Demo Screens ─── */
function DashboardScreen({ active }: { active: boolean }) {
  return (
    <div className={active ? 'demo-screen-active' : 'hidden'}>
      {/* Welcome banner with radar scan */}
      <div className="demo-anim relative overflow-hidden rounded-xl p-4 mb-3" style={{ background: 'linear-gradient(135deg, #7f1d1d, #991b1b, #450a0a)' }}>
        <div className="scan-line" />
        <div className="relative z-[1] flex justify-between items-center">
          <div>
            <div className="text-white text-base font-bold">Welcome back, Sarah</div>
            <div className="text-[0.75rem] mt-0.5" style={{ color: 'rgba(252,165,165,0.7)' }}>Parkview Terrace HOA · Board President</div>
          </div>
          <div className="flex gap-2">
            <div className="grade-reveal rounded-lg px-2 py-1 text-center min-w-[44px]" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <div className="text-[0.55rem]" style={{ color: 'rgba(255,255,255,0.6)' }}>Building</div>
              <div className="text-lg font-extrabold relative">
                <span className="grade-q absolute inset-0 flex items-center justify-center" style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
                <span className="grade-val text-green-400">A</span>
              </div>
            </div>
            <div className="grade-reveal rounded-lg px-2 py-1 text-center min-w-[44px]" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <div className="text-[0.55rem]" style={{ color: 'rgba(255,255,255,0.6)' }}>Compliance</div>
              <div className="text-lg font-extrabold relative">
                <span className="grade-q absolute inset-0 flex items-center justify-center" style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
                <span className="grade-val text-green-400">A</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Fiduciary alert */}
      <div className="demo-anim flex items-center gap-2 rounded-lg px-3 py-2 mb-3" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
        <span className="text-[0.75rem] font-bold text-green-400 px-2 py-0.5 rounded-md" style={{ background: 'rgba(34,197,94,0.15)' }}>⚖ Fiduciary Alerts</span>
        <span className="text-[0.75rem]" style={{ color: 'rgba(255,255,255,0.5)' }}>0 critical · 0 total — All obligations current ✓</span>
      </div>
      {/* 4 stat cards */}
      <div className="demo-anim grid grid-cols-4 gap-3 mb-3">
        {[
          { label: 'Collection Rate', target: 97, suffix: '%', color: 'text-green-400', sub: '$8,200/mo', delay: 300 },
          { label: 'Reserve Funding', target: 82, suffix: '%', color: 'text-green-400', sub: '$271K funded', delay: 450 },
          { label: 'Compliance Score', target: 92, suffix: '%', color: 'text-green-400', sub: 'A grade · 39/42', delay: 600 },
          { label: 'Open Cases', target: 2, suffix: '', color: 'text-blue-400', sub: '0 urgent', delay: 750 },
        ].map(s => (
          <div key={s.label} className="rounded-lg p-3 text-center" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="text-[0.65rem]" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label}</div>
            <CountUp target={s.target} suffix={s.suffix} delay={s.delay} active={active} className={`text-2xl font-extrabold font-display ${s.color}`} />
            <div className="text-[0.6rem]" style={{ color: 'rgba(255,255,255,0.3)' }}>{s.sub}</div>
          </div>
        ))}
      </div>
      {/* Action items */}
      <div className="demo-anim rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex justify-between mb-2">
          <span className="text-white text-[0.8rem] font-semibold">⚡ Your Action Items <span className="text-[0.65rem] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.2)', color: '#4ade80' }}>3</span></span>
          <span className="text-[0.65rem]" style={{ color: 'rgba(255,255,255,0.35)' }}>Role: President</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {[
            { text: 'Annual reserve study — schedule vendor', color: '#fbbf24', meta: 'medium · open' },
            { text: 'Review Q1 financial report', color: '#22c55e', meta: 'low · open' },
          ].map(item => (
            <div key={item.text} className="notif-drop flex justify-between items-center rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="flex items-center gap-2">
                <span className="w-[7px] h-[7px] rounded-sm" style={{ background: item.color }} />
                <span className="text-white text-[0.75rem] font-medium">{item.text}</span>
              </div>
              <span className="text-[0.6rem]" style={{ color: 'rgba(255,255,255,0.3)' }}>{item.meta}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BoardRoomScreen({ active }: { active: boolean }) {
  return (
    <div className={active ? 'demo-screen-active' : 'hidden'}>
      {/* Header with compliance ring */}
      <div className="demo-anim rounded-xl p-4 mb-3" style={{ background: 'linear-gradient(135deg, #7f1d1d, #991b1b, #450a0a)' }}>
        <div className="flex justify-between items-center">
          <div>
            <div className="text-white text-base font-bold">🏛 Board Room</div>
            <div className="text-[0.75rem]" style={{ color: 'rgba(252,165,165,0.7)' }}>Governance calendar, meetings, votes & communications · DC jurisdiction</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-[52px] h-[52px]">
              <svg className="compliance-ring" width="52" height="52" viewBox="0 0 52 52" style={{ '--circ': '138.2', '--offset': '11.1' } as React.CSSProperties}>
                <circle className="track" cx="26" cy="26" r="22" strokeWidth="5" />
                <circle className="ring-fill" cx="26" cy="26" r="22" strokeWidth="5" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <CountUp target={92} suffix="%" delay={400} active={active} className="text-[0.75rem] font-extrabold text-green-400" />
              </div>
            </div>
            <div className="text-[0.55rem] leading-snug" style={{ color: 'rgba(255,255,255,0.5)' }}>Compliance<br /><span className="text-green-400 font-bold">39/42 items</span></div>
          </div>
        </div>
      </div>
      {/* Fiduciary duties */}
      <div className="demo-anim rounded-lg p-3 mb-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="text-white text-[0.85rem] font-bold mb-2">⚖ The Three Fiduciary Duties</div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: '🔍', name: 'Duty of Care', color: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.15)', textColor: '#fca5a5', stroke: '#4ade80', count: 25, countSuffix: '/25 current', countDelay: 600 },
            { icon: '🤝', name: 'Duty of Loyalty', color: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.15)', textColor: '#fbbf24', stroke: '#4ade80', count: 3, countSuffix: '/3 current', countDelay: 750 },
            { icon: '📜', name: 'Duty of Obedience', color: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.15)', textColor: '#4ade80', stroke: '#fbbf24', count: 13, countSuffix: '/14 — 1 pending', countDelay: 900 },
          ].map(d => (
            <div key={d.name} className="demo-card-pop rounded-lg p-3" style={{ background: d.color, border: `1px solid ${d.border}` }}>
              <div className="flex justify-between items-center">
                <span className="text-[0.9rem]">{d.icon}</span>
                <svg width="16" height="16" viewBox="0 0 16 16"><polyline className="duty-check" points="3,8 6.5,11.5 13,4.5" fill="none" stroke={d.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div className="text-[0.8rem] font-bold mt-1" style={{ color: d.textColor }}>{d.name}</div>
              <div className="text-[0.65rem] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{d.name === 'Duty of Care' ? 'Act as a reasonably prudent person.' : d.name === 'Duty of Loyalty' ? "Put the association's interests first." : 'Follow governing documents & law.'}</div>
              <div className="mt-1.5">
                <CountUp target={d.count} suffix={d.countSuffix} delay={d.countDelay} active={active} className="text-[0.65rem] font-semibold" style={{ color: d.count === 13 ? '#fbbf24' : '#4ade80' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Bottom grid */}
      <div className="demo-anim grid grid-cols-2 gap-3">
        <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="text-white text-[0.8rem] font-semibold mb-2">Upcoming Meetings</div>
          {[
            { day: '15', month: 'MAR', title: 'Q1 Board Meeting', time: '19:00 · Community Room', bg: 'rgba(239,68,68,0.2)', color: '#fca5a5' },
            { day: '12', month: 'MAY', title: 'Annual Meeting', time: '18:00 · Community Room', bg: 'rgba(96,165,250,0.2)', color: '#93c5fd' },
          ].map(m => (
            <div key={m.title} className="demo-row-slide flex items-center gap-2 rounded-lg p-2 mb-1" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="rounded-md px-1.5 py-0.5 text-center min-w-[38px]" style={{ background: m.bg, color: m.color, fontSize: '0.55rem' }}>
                <span className="block font-extrabold text-sm">{m.day}</span>{m.month}
              </div>
              <div>
                <div className="text-white text-[0.75rem] font-semibold">{m.title}</div>
                <div className="text-[0.6rem]" style={{ color: 'rgba(255,255,255,0.4)' }}>{m.time}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="text-white text-[0.8rem] font-semibold mb-2">Role Responsibility Matrix</div>
          {[
            { role: 'President', items: '16 items · 0 overdue', color: '#4ade80' },
            { role: 'Secretary', items: '10 items · 0 overdue', color: '#4ade80' },
            { role: 'Treasurer', items: '8 items · 1 overdue', color: '#fbbf24' },
            { role: 'VP', items: '8 items · 0 overdue', color: '#4ade80' },
          ].map((r, i) => (
            <div key={r.role} className="demo-row-slide flex justify-between py-1 text-[0.7rem]" style={{ borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.06)' : undefined }}>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>{r.role}</span>
              <span className="font-semibold" style={{ color: r.color }}>{r.items}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BuildingScreen({ active }: { active: boolean }) {
  return (
    <div className={active ? 'demo-screen-active' : 'hidden'}>
      <div className="demo-anim rounded-xl p-4 mb-3" style={{ background: 'linear-gradient(135deg, #7f1d1d, #991b1b, #450a0a)' }}>
        <div className="flex justify-between items-center">
          <div>
            <div className="text-white text-base font-bold">🏢 Parkview Terrace</div>
            <div className="text-[0.75rem]" style={{ color: 'rgba(252,165,165,0.7)' }}>1420 R Street NW, Washington, DC 20009</div>
          </div>
          <div className="health-grade text-right">
            <div className="text-[0.55rem]" style={{ color: 'rgba(255,255,255,0.5)' }}>Health Score</div>
            <div className="font-display text-3xl font-black text-green-400 leading-none">A</div>
            <div className="text-[0.6rem]" style={{ color: 'rgba(255,255,255,0.4)' }}>91%</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3">
          {[
            { label: 'Legal & Bylaws', pct: '88%', cls: 'ab1' },
            { label: 'Insurance', pct: '100%', cls: 'ab2' },
            { label: 'Governance', pct: '100%', cls: 'ab3' },
            { label: 'Delinquency', pct: '3%', cls: 'ab4' },
          ].map(b => (
            <div key={b.label}>
              <div className="flex justify-between text-[0.6rem] mb-0.5">
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>{b.label}</span>
                <span className="text-green-400 font-semibold">{b.pct}</span>
              </div>
              <div className="assess-bar-track">
                <div className={`assess-bar-fill ${b.cls}`} style={{ '--bar-w': b.label === 'Delinquency' ? '97%' : b.pct } as React.CSSProperties} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="demo-anim flex gap-2 mb-3 flex-wrap">
        {['Building Details', 'Contacts', 'The Units', 'Legal & Bylaws', 'Insurance', 'Vendors'].map((t, i) => (
          <span key={t} className="px-3 py-1 rounded-full text-[0.7rem]" style={i === 0 ? { fontWeight: 600, background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' } : { fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>{t}</span>
        ))}
      </div>
      <div className="demo-anim grid grid-cols-4 gap-2 mb-3">
        {[
          { label: 'Year Built', val: '2004' }, { label: 'Units', val: '24' },
          { label: 'Floors', val: '6' }, { label: 'Type', val: 'Mid-rise Condo' },
        ].map(c => (
          <div key={c.label} className="demo-card-pop rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="text-[0.6rem]" style={{ color: 'rgba(255,255,255,0.4)' }}>{c.label}</div>
            <div className="text-white font-bold">{c.val}</div>
          </div>
        ))}
      </div>
      <div className="demo-anim flex flex-wrap gap-1.5">
        {['Rooftop Deck', 'Fitness Center', 'Secure Lobby', 'Elevator', 'Package Room', 'Garage Parking'].map(a => (
          <span key={a} className="demo-tag-pop px-2.5 py-1 rounded-full text-[0.7rem]" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}>✓ {a}</span>
        ))}
      </div>
    </div>
  );
}

function FiscalScreen({ active }: { active: boolean }) {
  return (
    <div className={active ? 'demo-screen-active' : 'hidden'}>
      <div className="demo-anim rounded-xl p-4 mb-3" style={{ background: 'linear-gradient(135deg, #7f1d1d, #991b1b, #450a0a)' }}>
        <div className="flex justify-between items-center">
          <div>
            <div className="text-white text-base font-bold">💰 Fiscal Lens</div>
            <div className="text-[0.75rem]" style={{ color: 'rgba(252,165,165,0.7)' }}>Double-entry general ledger, chart of accounts, budgets, reserves & reports</div>
          </div>
          <div className="text-right">
            <CountUp target={87} suffix="%" delay={300} active={active} className="font-display text-3xl font-black text-green-400" />
            <div className="text-[0.55rem]" style={{ color: 'rgba(255,255,255,0.5)' }}>Financial Health</div>
          </div>
        </div>
        <div className="flex gap-1.5 mt-3">
          {[
            { label: 'Operating Cash', target: 42100, prefix: '$', format: 'dollar', color: '#fff', delay: 400 },
            { label: 'Collection Rate', target: 97, suffix: '%', color: '#4ade80', delay: 500 },
            { label: 'Budget Used', target: 41, suffix: '%', color: '#4ade80', delay: 600 },
            { label: 'Reserves', target: 82, suffix: '%', color: '#4ade80', delay: 700 },
            { label: 'Receivables', target: 475, prefix: '$', format: 'dollar', color: '#fbbf24', delay: 800 },
          ].map(m => (
            <div key={m.label} className="flex-1 rounded-md p-1 text-center text-[0.55rem]" style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }}>
              <div className="font-bold" style={{ color: m.color }}>
                <CountUp target={m.target} prefix={m.prefix || ''} suffix={m.suffix || ''} format={m.format} delay={m.delay} active={active} />
              </div>
              {m.label}
            </div>
          ))}
        </div>
      </div>
      <div className="demo-anim grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="text-white text-[0.8rem] font-semibold mb-2">Budget Burn Rate</div>
          <div className="flex justify-between text-[0.75rem] mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
            <span>Spent</span><span className="text-white font-semibold">$12,340 / $30,000</span>
          </div>
          <div className="rounded-full h-2 overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <div className="demo-bar-fill h-full rounded-full" style={{ '--bar-w': '41%', background: 'linear-gradient(90deg, #22c55e, #4ade80)' } as React.CSSProperties} />
          </div>
          <div className="text-[0.65rem] mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>41% consumed · $17,660 remaining</div>
        </div>
        <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="text-white text-[0.8rem] font-semibold mb-2">Delinquency Aging</div>
          {[
            { label: 'Current (0–30 days)', val: '1 unit · $475', color: '#fbbf24' },
            { label: '31–60 days', val: '0 units · $0', color: '#4ade80' },
          ].map(r => (
            <div key={r.label} className="flex justify-between text-[0.7rem] py-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>{r.label}</span>
              <span className="font-semibold" style={{ color: r.color }}>{r.val}</span>
            </div>
          ))}
          <div className="flex justify-between text-[0.75rem] py-1.5 font-bold">
            <span style={{ color: 'rgba(255,255,255,0.7)' }}>Total Outstanding</span>
            <span style={{ color: '#fbbf24' }}>$475</span>
          </div>
        </div>
      </div>
      <div className="demo-anim grid grid-cols-4 gap-2">
        {[
          { icon: '📊', label: 'Chart of Accounts' },
          { icon: '📒', label: 'General Ledger' },
          { icon: '📋', label: 'WO & Invoices' },
          { icon: '📈', label: 'Financial Reports' },
        ].map(c => (
          <div key={c.label} className="demo-card-pop rounded-lg p-2 text-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="text-base mb-0.5">{c.icon}</div>
            <div className="text-white text-[0.7rem] font-semibold">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CasesScreen({ active }: { active: boolean }) {
  return (
    <div className={active ? 'demo-screen-active' : 'hidden'}>
      <div className="demo-anim rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex justify-between items-center mb-3">
          <div>
            <div className="text-white text-base font-bold">⚡ Case Workflow</div>
            <div className="text-[0.75rem]" style={{ color: 'rgba(255,255,255,0.5)' }}>Create, open, or resume a case</div>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-white text-[0.8rem] font-semibold">Open Cases <span className="ml-1 px-2 py-0.5 rounded-full text-[0.65rem]" style={{ background: 'rgba(96,165,250,0.2)', color: '#60a5fa' }}>2</span></span>
            <button className="text-white text-[0.75rem] font-semibold px-3 py-1.5 rounded-lg border-none cursor-pointer" style={{ background: 'var(--accent, #d62839)' }}>+ New Case</button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {[
            { priority: 'medium', priColor: 'rgba(251,191,36,0.15)', priText: '#fbbf24', unit: '🏢 Unit Common', title: 'Garage door sensor replacement', pct: 64, pctColor: '#4ade80', lit: 9, total: 14, stepLabel: 'Pre-Legal', stepColor: '#fbbf24' },
            { priority: 'low', priColor: 'rgba(96,165,250,0.15)', priText: '#60a5fa', unit: '👤 Unit 402', title: 'Noise complaint — recurring late-night music', pct: 21, pctColor: '#60a5fa', lit: 3, total: 14, stepLabel: 'Pre-Legal', stepColor: '#60a5fa' },
          ].map(c => (
            <div key={c.title} className="demo-row-slide rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1">
                  <div className="flex gap-1.5 items-center mb-0.5">
                    <span className="text-[0.65rem] font-semibold px-1.5 py-0.5 rounded" style={{ background: c.priColor, color: c.priText }}>{c.priority}</span>
                    <span className="text-[0.6rem]" style={{ color: 'rgba(255,255,255,0.4)' }}>{c.unit}</span>
                  </div>
                  <div className="text-white text-[0.85rem] font-semibold">{c.title}</div>
                </div>
                <CountUp target={c.pct} suffix="%" delay={400} active={active} className={`text-lg font-extrabold`} style={{ color: c.pctColor }} />
              </div>
              <div className="mb-1">
                <StepTrack lit={c.lit} total={c.total} active={active} />
              </div>
              <div className="flex justify-between items-center">
                <div className="text-[0.6rem]" style={{ color: 'rgba(255,255,255,0.4)' }}>Step {c.lit} of {c.total} · <span style={{ color: c.stepColor }}>{c.stepLabel}</span></div>
                <div className="text-[0.8rem]" style={{ color: 'rgba(255,255,255,0.3)' }}>→</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ArchivesScreen({ active }: { active: boolean }) {
  return (
    <div className={active ? 'demo-screen-active' : 'hidden'}>
      <div className="demo-anim rounded-xl p-4 mb-3 flex justify-between items-center" style={{ background: 'linear-gradient(135deg, #7f1d1d, #991b1b, #450a0a)' }}>
        <div>
          <div className="text-white text-base font-bold">📦 The Archives</div>
          <div className="text-[0.75rem]" style={{ color: 'rgba(252,165,165,0.7)' }}>Historical compliance records and audit trail</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="lock-anim text-base">🔒</span>
          <button className="text-white text-[0.75rem] font-semibold px-3 py-2 rounded-lg cursor-pointer" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}>📦 Create Archive</button>
        </div>
      </div>
      <div className="demo-anim flex gap-3 mb-3">
        <span className="px-3 py-1 rounded-full text-[0.75rem] font-semibold text-white" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>Archives</span>
        <span className="px-3 py-1 rounded-full text-[0.75rem] font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>Reports</span>
      </div>
      <div className="demo-anim grid grid-cols-2 gap-3">
        {[
          { year: 'FY 2025', date: 'Created Jan 15, 2026', grade: 'A (94%)', fin: 'A (91%)', items: '42', badgeColor: '#4ade80', badgeBg: 'rgba(34,197,94,0.15)' },
          { year: 'FY 2024', date: 'Created Jan 10, 2025', grade: 'B (83%)', fin: 'A (88%)', items: '40', badgeColor: '#60a5fa', badgeBg: 'rgba(96,165,250,0.15)' },
        ].map(a => (
          <div key={a.year} className="demo-card-pop relative rounded-xl p-4 overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="seal-stamp">🔒 Sealed</div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xl">📦</span>
              <span className="text-[0.6rem] font-semibold px-2 py-0.5 rounded-full" style={{ color: a.badgeColor, background: a.badgeBg }}>Complete</span>
            </div>
            <div className="text-white text-[0.9rem] font-bold">{a.year} Annual Archive</div>
            <div className="text-[0.7rem] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{a.date} · Read-only snapshot</div>
            <div className="text-[0.65rem] mt-2 pt-2" style={{ color: 'rgba(255,255,255,0.5)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              Compliance: {a.grade} · Financial: {a.fin} · {a.items} items archived
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main Landing Page ─── */
export default function LandingPage() {
  const navigate = useNavigate();
  const [activeDemo, setActiveDemo] = useState<DemoTab>('dashboard');
  const [isYearly, setIsYearly] = useState(false);

  const handleDemoSwitch = useCallback((id: DemoTab) => {
    setActiveDemo(id);
  }, []);

  const mode = isYearly ? 'yearly' : 'monthly';
  const period = isYearly ? '/yr' : '/mo';

  return (
    <div className="min-h-screen" style={{ background: '#faf9f7', color: '#0f1a2e' }}>
      {/* ─── NAV ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b" style={{ background: 'rgba(250,249,247,0.85)', backdropFilter: 'blur(20px)', borderColor: '#e2e0dc' }}>
        <div className="max-w-[1200px] mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <a href="#" className="font-display font-black text-2xl no-underline" style={{ color: '#0f1a2e' }}>
              ONE <span className="text-accent-600">two</span>
            </a>
            <span className="text-[0.85rem] font-normal ml-3 pl-3 border-l" style={{ color: '#64748b', borderColor: '#e2e0dc' }}>HOA handled.</span>
          </div>
          <div className="flex gap-8 items-center">
            <a href="#features" className="no-underline text-[0.9rem] font-medium hover:text-ink-900 transition-colors hidden md:inline" style={{ color: '#64748b' }}>Features</a>
            <a href="#differentiators" className="no-underline text-[0.9rem] font-medium hover:text-ink-900 transition-colors hidden md:inline" style={{ color: '#64748b' }}>Why Us</a>
            <a href="#pricing" className="no-underline text-[0.9rem] font-medium hover:text-ink-900 transition-colors hidden md:inline" style={{ color: '#64748b' }}>Pricing</a>
            <button onClick={() => navigate('/login')} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-[0.9rem] text-white cursor-pointer border-none transition-all hover:-translate-y-px" style={{ background: '#d62839', boxShadow: '0 2px 8px rgba(214,40,57,0.25)' }}>
              Get Early Access →
            </button>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="pt-40 pb-12 px-8 max-w-[1200px] mx-auto text-center">
        <div className="landing-animate max-w-[780px] mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[0.8rem] font-semibold mb-6" style={{ background: '#ecfeff', color: '#155e75', border: '1px solid #a5f3fc' }}>
            🏛 Launching in Washington, DC
          </div>
          <h1 className="font-display text-5xl md:text-6xl font-black leading-[1.1] tracking-tight mb-6" style={{ letterSpacing: '-0.02em' }}>
            Governance on autopilot. Compliance by default. <em className="italic text-accent-600">HOA handled.</em>
          </h1>
          <p className="text-lg mx-auto mb-8 max-w-[620px] leading-relaxed" style={{ color: '#64748b' }}>
            <strong>ONE two</strong> weaves your HOA bylaws, local codes and fiduciary duties into every step of running your building — guiding through every decision so you can govern with the confidence that you're protecting your community for the long run.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <a href="#pricing" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-[0.9rem] text-white no-underline transition-all hover:-translate-y-px" style={{ background: '#d62839', boxShadow: '0 2px 8px rgba(214,40,57,0.25)' }}>
              See Plans & Pricing →
            </a>
            <a href="#features" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-[0.9rem] no-underline transition-all" style={{ color: '#d62839', border: '2px solid #d62839', background: 'transparent' }}>
              See It In Action ↓
            </a>
          </div>
        </div>
      </section>

      {/* ─── INTERACTIVE DEMO ─── */}
      <section id="demo" className="px-8 pb-20 pt-8">
        <div id="features" />
        <Animate>
          <div className="max-w-[1200px] mx-auto rounded-3xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', boxShadow: '0 30px 80px rgba(15,26,46,0.3)' }}>
            {/* Tabs header */}
            <div className="px-8 pt-8 text-center">
              <div className="text-[0.8rem] font-bold uppercase tracking-wider mb-3" style={{ color: '#a5f3fc', letterSpacing: '0.08em' }}>⚡ Platform Features</div>
              <h2 className="font-display text-3xl font-bold text-white max-w-[650px] mx-auto mb-2 leading-tight">Everything your board needs. Nothing it doesn't.</h2>
              <p className="text-[0.95rem] max-w-[560px] mx-auto mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Here's a look at what you'll find inside <strong style={{ color: 'rgba(255,255,255,0.8)' }}>ONE two</strong>.
              </p>
              <div className="flex gap-2 justify-center flex-wrap mb-6">
                {DEMO_TABS.map(t => (
                  <button key={t.id} onClick={() => handleDemoSwitch(t.id)}
                    className={`px-4 py-2 rounded-full text-[0.85rem] font-semibold cursor-pointer border transition-all whitespace-nowrap ${
                      activeDemo === t.id
                        ? 'text-white border-white/20'
                        : 'text-white/50 border-transparent hover:text-white/80 hover:bg-white/[0.06]'
                    }`}
                    style={activeDemo === t.id ? { background: 'rgba(255,255,255,0.12)' } : { background: 'transparent' }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Feature description */}
            <div className="px-8">
              {DEMO_TABS.map(t => {
                const d = DEMO_DESCS[t.id];
                if (activeDemo !== t.id) return null;
                return (
                  <div key={t.id} className="flex items-start gap-4 rounded-2xl p-4 mb-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="text-2xl flex-shrink-0 mt-0.5">{d.icon}</div>
                    <div>
                      <div className="text-white text-base font-bold mb-1">
                        {d.title}
                        {d.badge && <span className={`text-[0.65rem] font-semibold ${d.badgeColor} px-2 py-0.5 rounded-full ml-1.5 align-middle`}>{d.badge}</span>}
                      </div>
                      <div className="text-[0.85rem] leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>{d.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Browser frame */}
            <div className="mx-8 mb-8 rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-2 px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex gap-[5px]">
                  <span className="w-[9px] h-[9px] rounded-full" style={{ background: '#ef4444' }} />
                  <span className="w-[9px] h-[9px] rounded-full" style={{ background: '#f59e0b' }} />
                  <span className="w-[9px] h-[9px] rounded-full" style={{ background: '#22c55e' }} />
                </div>
                <div className="flex-1 rounded-md px-3 py-1 text-[0.7rem]" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }}>{DEMO_URLS[activeDemo]}</div>
              </div>
              <div className="p-4">
                <DashboardScreen active={activeDemo === 'dashboard'} />
                <BoardRoomScreen active={activeDemo === 'boardroom'} />
                <BuildingScreen active={activeDemo === 'building'} />
                <FiscalScreen active={activeDemo === 'fiscal'} />
                <CasesScreen active={activeDemo === 'cases'} />
                <ArchivesScreen active={activeDemo === 'archives'} />
              </div>
            </div>
          </div>
        </Animate>
      </section>

      {/* ─── WHAT SETS US APART ─── */}
      <section id="differentiators" className="py-20 px-8">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-12">
            <div className="text-[0.8rem] font-bold uppercase tracking-wider text-accent-600 mb-3" style={{ letterSpacing: '0.08em' }}>🔍 What Sets Us Apart</div>
            <h2 className="font-display text-4xl font-bold max-w-[700px] mx-auto mb-4 leading-tight">Compliance isn't a feature. It's the foundation.</h2>
            <p className="text-lg max-w-[560px] mx-auto" style={{ color: '#64748b' }}>Most HOA tools give you spreadsheets. <strong>ONE two</strong> gives you a governance framework built on fiduciary law.</p>
          </div>

          <Animate className="grid grid-cols-1 md:grid-cols-[1fr_56px_1fr] max-w-[1060px] mx-auto">
            {/* WITHOUT column */}
            <div className="rounded-2xl p-8" style={{ background: '#f1eeea', border: '1px solid #ddd8d1' }}>
              <div className="font-display text-lg font-bold pb-4 mb-6" style={{ color: '#94a3b8', borderBottom: '2px solid #ddd8d1' }}>Without ONE two</div>
              {[
                { icon: '⚖️', title: 'Fiduciary duties are abstract', desc: 'You know "duty of care" exists — but which tasks map to it? Which role is responsible? Nobody tracks it.' },
                { icon: '💰', title: 'Finances live in spreadsheets', desc: 'No double-entry ledger. Budget tracking is manual. Delinquencies surface too late. Reserve fund status is a guess.' },
                { icon: '⚡', title: 'Issues vanish into email threads', desc: "Resident complains about noise. Board member says \"I'll handle it.\" No steps documented, no escalation path, no audit trail." },
                { icon: '🏘', title: 'Residents are in the dark', desc: 'No portal, no visibility into what the board is doing. Annual meetings are the only touchpoint. Trust erodes quietly.' },
                { icon: '📦', title: 'Records are scattered', desc: "Past decisions live in someone's inbox. New board members start from zero. No institutional memory." },
              ].map((item, i) => (
                <div key={item.title} className={`flex items-start gap-3 ${i < 4 ? 'mb-6' : ''}`}>
                  <div className="w-[34px] h-[34px] rounded-lg flex items-center justify-center text-[0.95rem] flex-shrink-0" style={{ background: '#e5e0d9' }}>{item.icon}</div>
                  <div>
                    <div className="text-[0.85rem] font-semibold" style={{ color: '#94a3b8' }}>{item.title}</div>
                    <div className="text-[0.78rem] leading-relaxed mt-0.5" style={{ color: '#b0a99e' }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* VS divider */}
            <div className="hidden md:flex items-center justify-center">
              <div className="w-11 h-11 rounded-full flex items-center justify-center text-[0.7rem] font-extrabold text-white" style={{ background: '#d62839', boxShadow: '0 4px 16px rgba(214,40,57,0.25)' }}>VS</div>
            </div>

            {/* WITH column */}
            <div className="relative rounded-2xl p-8 overflow-hidden" style={{ background: '#fff', border: '2px solid #d62839' }}>
              <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: 'linear-gradient(90deg, #d62839, #f59e0b, #059669)' }} />
              <div className="font-display text-lg font-bold pb-4 mb-6" style={{ borderBottom: '2px solid #e2e0dc' }}>
                With <span className="text-accent-600">ONE two</span>
              </div>
              {[
                { icon: '⚖️', bg: '#fde8ea', title: 'Every task tagged to its fiduciary duty', badge: 'Board Room', badgeBg: '#fde8ea', badgeColor: '#d62839', desc: 'Care, Loyalty, Obedience — 42 obligations mapped to roles, deadlines, and compliance status. You always know why it matters.' },
                { icon: '💰', bg: '#d1fae5', title: 'Full double-entry accounting', badge: 'Fiscal Lens', badgeBg: '#d1fae5', badgeColor: '#059669', desc: 'GL, chart of accounts, budget burn rate, reserve goals, delinquency aging, unit ledger — with one Financial Health score.' },
                { icon: '⚡', bg: '#fef3c7', title: 'Step-by-step compliant resolution', badge: 'Case Workflow', badgeBg: '#fef3c7', badgeColor: '#92400e', desc: 'Priority triage, pre-legal escalation, progress tracking, full audit trail. Accessible from anywhere in the app.' },
                { icon: '🏘', bg: '#dbeafe', title: 'Owners submit → Board resolves → Everyone sees', badge: 'Community', badgeBg: '#dbeafe', badgeColor: '#1d4ed8', desc: 'Community Room requests flow into Case Workflow. Residents feel heard, the board has context, and every resolution is documented.' },
                { icon: '📦', bg: '#ede9fe', title: 'Permanent annual archives', badge: 'Archives', badgeBg: '#ede9fe', badgeColor: '#6d28d9', desc: 'Read-only compliance snapshots with automatic regulatory refresh. New board members inherit full institutional memory.' },
              ].map((item, i) => (
                <div key={item.title} className={`flex items-start gap-3 ${i < 4 ? 'mb-6' : ''}`}>
                  <div className="w-[34px] h-[34px] rounded-lg flex items-center justify-center text-[0.95rem] flex-shrink-0" style={{ background: item.bg }}>{item.icon}</div>
                  <div>
                    <div className="text-[0.85rem] font-semibold" style={{ color: '#0f1a2e' }}>
                      {item.title} <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded ml-1 align-middle" style={{ background: item.badgeBg, color: item.badgeColor }}>{item.badge}</span>
                    </div>
                    <div className="text-[0.78rem] leading-relaxed mt-0.5" style={{ color: '#64748b' }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Animate>
        </div>
      </section>

      {/* ─── PRICING ─── */}
      <section id="pricing" className="py-20 px-8">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-12">
            <div className="text-[0.8rem] font-bold uppercase tracking-wider text-accent-600 mb-3" style={{ letterSpacing: '0.08em' }}>💎 Simple Pricing</div>
            <h2 className="font-display text-4xl font-bold max-w-[600px] mx-auto mb-4 leading-tight">Plans that scale with your community</h2>
            <p className="text-lg max-w-[560px] mx-auto mb-8" style={{ color: '#64748b' }}>
              No per-unit nickel-and-diming. Flat pricing so you know exactly what you'll pay.
            </p>
            {/* Billing toggle */}
            <div className="inline-flex items-center gap-3 bg-white rounded-full px-5 py-2" style={{ border: '1px solid #e2e0dc' }}>
              <span className={`text-[0.9rem] font-medium transition-colors ${!isYearly ? 'font-semibold text-ink-900' : ''}`} style={{ color: isYearly ? '#64748b' : undefined }}>Monthly</span>
              <button onClick={() => setIsYearly(!isYearly)} className="relative w-12 h-[26px] rounded-full border-none cursor-pointer p-0 transition-colors" style={{ background: isYearly ? '#d62839' : '#e2e0dc' }} aria-label="Toggle billing period">
                <span className="absolute top-[3px] left-[3px] w-5 h-5 bg-white rounded-full transition-transform" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.15)', transform: isYearly ? 'translateX(22px)' : 'none' }} />
              </button>
              <span className={`text-[0.9rem] font-medium transition-colors ${isYearly ? 'font-semibold text-ink-900' : ''}`} style={{ color: !isYearly ? '#64748b' : undefined }}>
                Yearly <span className="text-[0.7rem] font-bold px-2 py-0.5 rounded-full ml-1" style={{ color: '#059669', background: '#d1fae5' }}>Save up to 16%</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start max-w-[1060px] mx-auto">
            {/* Compliance Pro */}
            <Animate>
              <div className="relative bg-white rounded-2xl p-8" style={{ border: '2px solid #d62839', boxShadow: '0 12px 40px rgba(214,40,57,0.12)' }}>
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-white text-[0.75rem] font-bold px-5 py-1 rounded-full" style={{ background: '#d62839', letterSpacing: '0.03em' }}>Most Popular</div>
                <h3 className="font-display text-xl font-bold mb-1">Compliance Pro</h3>
                <div className="text-[0.85rem] mb-6" style={{ color: '#64748b' }}>Full governance & compliance engine for serious boards</div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="font-display text-5xl font-black">{PRICES.compliance[mode]}</span>
                  <span className="text-[0.9rem] font-medium" style={{ color: '#64748b' }}>{period}</span>
                </div>
                <ul className="list-none mb-8 space-y-2">
                  {['Dashboard with Fiduciary Alerts & compliance grades', 'Board Room: governance calendar, duties & roles', 'Fiscal Lens: double-entry GL, budgets & reserves', 'The Building: contacts, bylaws, insurance, vendors', 'Case Workflow with pre-legal escalation paths', 'Property Log: inspections & condition tracking', 'The Archives: annual compliance snapshots', 'DC jurisdiction compliance built in'].map(f => (
                    <li key={f} className="flex items-start gap-2 text-[0.88rem] py-1"><span className="text-green-600 font-bold flex-shrink-0">✓</span>{f}</li>
                  ))}
                </ul>
                <button onClick={() => navigate('/login?create=1')} className="w-full text-center py-3 rounded-lg font-semibold text-[0.9rem] text-white border-none cursor-pointer transition-all hover:-translate-y-px" style={{ background: '#d62839', boxShadow: '0 2px 8px rgba(214,40,57,0.25)' }}>
                  Start Free Trial →
                </button>
              </div>
            </Animate>

            {/* Community Plus */}
            <Animate delay="0.1s">
              <div className="bg-white rounded-2xl p-8 transition-all hover:shadow-lg" style={{ border: '2px solid #e2e0dc' }}>
                <h3 className="font-display text-xl font-bold mb-1">Community Plus</h3>
                <div className="text-[0.85rem] mb-6" style={{ color: '#64748b' }}>Compliance Pro + full community engagement</div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="font-display text-5xl font-black">{PRICES.community[mode]}</span>
                  <span className="text-[0.9rem] font-medium" style={{ color: '#64748b' }}>{period}</span>
                </div>
                <ul className="list-none mb-8 space-y-2">
                  {['Everything in Compliance Pro', 'Resident portal with issue reporting', 'Community voting & resolutions', 'Assessment tracking & processing', 'Communications & notice templates', 'PM Scorecard & vendor management'].map(f => (
                    <li key={f} className="flex items-start gap-2 text-[0.88rem] py-1"><span className="text-green-600 font-bold flex-shrink-0">✓</span>{f}</li>
                  ))}
                </ul>
                <button onClick={() => navigate('/login?create=1')} className="w-full text-center py-3 rounded-lg font-semibold text-[0.9rem] border-none cursor-pointer transition-all" style={{ color: '#d62839', border: '2px solid #d62839', background: 'transparent' }}>
                  Start Free Trial
                </button>
              </div>
            </Animate>

            {/* Management Suite */}
            <Animate delay="0.2s">
              <div className="bg-white rounded-2xl p-8 transition-all hover:shadow-lg" style={{ border: '2px solid #e2e0dc' }}>
                <h3 className="font-display text-xl font-bold mb-1">Management Suite</h3>
                <div className="text-[0.85rem] mb-6" style={{ color: '#64748b' }}>Full platform for managed communities</div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="font-display text-5xl font-black">{PRICES.management[mode]}</span>
                  <span className="text-[0.9rem] font-medium" style={{ color: '#64748b' }}>{period}</span>
                </div>
                <ul className="list-none mb-8 space-y-2">
                  {['Everything in Community Plus', 'Property Manager role & tools', 'Work order & invoice generation', 'Email & postal distributions', 'Mailing list management', 'Priority support'].map(f => (
                    <li key={f} className="flex items-start gap-2 text-[0.88rem] py-1"><span className="text-green-600 font-bold flex-shrink-0">✓</span>{f}</li>
                  ))}
                </ul>
                <button onClick={() => navigate('/login?create=1')} className="w-full text-center py-3 rounded-lg font-semibold text-[0.9rem] border-none cursor-pointer transition-all" style={{ color: '#d62839', border: '2px solid #d62839', background: 'transparent' }}>
                  Start Free Trial
                </button>
              </div>
            </Animate>
          </div>

          {/* Add-Ons */}
          <div className="max-w-[600px] mx-auto mt-12">
            <div className="text-center mb-6">
              <h3 className="font-display text-2xl font-bold">Add-Ons</h3>
              <p className="text-[0.9rem]" style={{ color: '#64748b' }}>Available with any plan</p>
            </div>
            <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #e2e0dc' }}>
              <div className="flex justify-between items-center px-7 py-5">
                <div>
                  <div className="font-semibold text-[0.95rem]">One-Time Setup & Onboarding</div>
                  <div className="text-[0.82rem]" style={{ color: '#64748b' }}>Guided configuration, data migration, and board training</div>
                </div>
                <div className="font-display font-bold text-lg whitespace-nowrap ml-6">$299</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section id="cta" className="text-center py-24 px-8">
        <div className="text-[0.8rem] font-bold uppercase tracking-wider text-accent-600 mb-3" style={{ letterSpacing: '0.08em' }}>🚀 Get Started</div>
        <h2 className="font-display text-4xl font-bold max-w-[700px] mx-auto mb-4 leading-tight">Stop guessing. Start governing.</h2>
        <p className="text-lg max-w-[500px] mx-auto mb-8" style={{ color: '#64748b' }}>
          Join the waitlist for early access when we launch in Washington, DC. Start with Compliance Pro at $179/mo — full governance, fiduciary tracking, and double-entry accounting from day one.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <button onClick={() => navigate('/login?create=1')} className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-semibold text-base text-white border-none cursor-pointer transition-all hover:-translate-y-px" style={{ background: '#d62839', boxShadow: '0 2px 8px rgba(214,40,57,0.25)' }}>
            Join the Waitlist →
          </button>
          <button className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-semibold text-base border-none cursor-pointer transition-all" style={{ color: '#d62839', border: '2px solid #d62839', background: 'transparent' }}>
            Book a Demo
          </button>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="max-w-[1200px] mx-auto px-8 py-12 flex justify-between items-center flex-wrap gap-4" style={{ borderTop: '1px solid #e2e0dc' }}>
        <p className="text-[0.85rem]" style={{ color: '#64748b' }}>© 2026 <strong>ONE two</strong>, Inc. All rights reserved.</p>
        <div className="flex gap-6">
          {['Privacy', 'Terms', 'Contact'].map(link => (
            <a key={link} href="#" className="text-[0.85rem] no-underline hover:text-ink-900 transition-colors" style={{ color: '#64748b' }}>{link}</a>
          ))}
        </div>
      </footer>
    </div>
  );
}
