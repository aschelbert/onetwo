import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import {
  LayoutDashboard, Gavel, Building2, DollarSign, ClipboardList,
  MessageCircle, Archive, Home, ChevronDown, ChevronRight, Search,
} from 'lucide-react';

interface GuideSection {
  id: string;
  title: string;
  icon: React.ElementType;
  route: string;
  summary: string;
  details: string[];
  tips: string[];
  access: string[];
}

const GUIDES: GuideSection[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: LayoutDashboard,
    route: '/dashboard',
    summary: 'Your personalized home screen with key metrics, action items, and activity feed tailored to your role.',
    details: [
      'View financial health indicators including operating cash, collection rate, and budget usage.',
      'Track compliance with a letter-grade score (A through F) that reflects your building\'s governance health.',
      'See pending action items specific to your role — board members see governance tasks, residents see account-related items.',
      'Monitor recent activity across all modules in the activity feed.',
    ],
    tips: [
      'Check the compliance score regularly — it reflects outstanding governance tasks.',
      'Action items link directly to the relevant module so you can resolve them quickly.',
    ],
    access: ['Board Member', 'Resident', 'Staff', 'Property Manager'],
  },
  {
    id: 'boardroom',
    title: 'Board Room',
    icon: Gavel,
    route: '/boardroom',
    summary: 'Central governance hub for compliance tracking, meetings, voting, communications, and daily operations.',
    details: [
      'Duties — View board member roles and responsibilities with assigned duties.',
      'Runbook — Track compliance requirements with a step-by-step workflow. Tasks are role-specific and show completion status.',
      'Meetings — Schedule board meetings, record minutes, track attendance, and manage voting items.',
      'Votes — Conduct board elections and cast votes on motions.',
      'Communications — Draft and send announcements and notices to board members and owners.',
      'Daily Ops — Manage operational cases, assign tasks, and track workflows.',
    ],
    tips: [
      'The Runbook refreshes compliance requirements annually — review it at the start of each fiscal year.',
      'Use Communications to keep owners informed about board decisions and upcoming actions.',
    ],
    access: ['Board Member', 'Property Manager'],
  },
  {
    id: 'building',
    title: 'The Building',
    icon: Building2,
    route: '/building',
    summary: 'Master directory for your building\'s details, contacts, legal documents, insurance, vendors, and unit records.',
    details: [
      'Details — Property specifications, address, amenities, entity type, fiscal year, and key contacts.',
      'Contacts — Board of directors, property management company, and legal counsel directory.',
      'The Units — View all residential units, occupancy status, and owner information.',
      'Legal & Bylaws — Store and version-control governing documents with status tracking.',
      'Insurance — Track policies, coverage amounts, carriers, and expiration dates with renewal alerts.',
      'Vendors — Maintain a directory of service providers with contract details and contact info.',
      'PM Scorecard — Rate and review property manager performance across key metrics.',
    ],
    tips: [
      'Keep insurance policies up to date — the Building Health Score weighs insurance at 35%.',
      'Upload the latest bylaws and amendments to Legal & Bylaws for easy owner access.',
      'Building Health is calculated from Legal & Bylaws (35%), Insurance (35%), and Governance (30%).',
    ],
    access: ['Board Member', 'Property Manager', 'Staff'],
  },
  {
    id: 'fiscal-lens',
    title: 'Fiscal Lens',
    icon: DollarSign,
    route: '/financial',
    summary: 'Complete financial accounting system with double-entry ledger, budgets, reserves, work orders, and reporting.',
    details: [
      'Overview — Financial health score, operating cash balance, collection rate, budget usage, and reserve funding at a glance.',
      'Chart of Accounts — View and manage your GL account structure with real-time balances.',
      'General Ledger — Full double-entry transaction ledger for all financial activity.',
      'WO & Invoices — Create and track work orders and invoices with approval workflows.',
      'Budget — Plan annual budgets and monitor variance against actuals.',
      'Reserves — Track reserve fund items, estimated costs, and contribution targets.',
      'Spending Decisions — Approval workflow for purchases exceeding defined thresholds.',
      'Reports — Generate Board Packets, Financial Statements, Delinquency Reports, Compliance Summaries, Meeting Minutes, and Annual Reports.',
    ],
    tips: [
      'Use the Budget tab to compare planned vs. actual spending throughout the year.',
      'The Reports section can generate board-ready packets — great for meeting preparation.',
      'Reserve funding tracking helps ensure long-term financial stability.',
    ],
    access: ['Board Member', 'Property Manager'],
  },
  {
    id: 'property-log',
    title: 'Property Log',
    icon: ClipboardList,
    route: '/property-log',
    summary: 'Record and track building inspections, walkthroughs, incidents, and maintenance checks with findings and action items.',
    details: [
      'Create log entries for inspections, walkthroughs, incidents, and routine maintenance checks.',
      'Document findings with condition ratings and severity levels.',
      'Assign action items to responsible parties with due dates.',
      'Track resolution status and follow-up on outstanding items.',
      'Build a historical record of building condition over time.',
    ],
    tips: [
      'Log inspections consistently to build a clear maintenance history.',
      'Assign action items with deadlines to ensure timely follow-up on findings.',
    ],
    access: ['Board Member', 'Property Manager', 'Staff'],
  },
  {
    id: 'community',
    title: 'Community Room',
    icon: MessageCircle,
    route: '/community',
    summary: 'Portal for announcements, maintenance requests, meeting info, voting, and amenity reservations.',
    details: [
      'Announcements — Pinned notices categorized by type: General, Maintenance, Financial, Safety, Rules & Policies, and Meeting.',
      'Requests — Submit maintenance requests, noise complaints, common area issues, parking concerns, safety reports, resale/records requests, and architectural modification applications.',
      'Meetings — View upcoming and past meeting schedules and details.',
      'Votes — Participate in community elections and vote on motions (when enabled).',
      'Amenities — Reserve shared amenities and track approval status (when enabled).',
    ],
    tips: [
      'Use specific request categories to ensure your issue is routed to the right person.',
      'Check Announcements regularly for important building updates and policy changes.',
    ],
    access: ['Board Member', 'Resident', 'Staff', 'Property Manager'],
  },
  {
    id: 'archives',
    title: 'The Archives',
    icon: Archive,
    route: '/archives',
    summary: 'Historical record repository organized by fiscal year — preserves snapshots of compliance, filings, meetings, finances, and more.',
    details: [
      'Records are organized by fiscal year for easy retrieval.',
      'Sections include: Compliance, Regulatory Refresh, Filings, Meetings, Communications, Fiscal Snapshot, Insurance, Legal Docs, and Board information.',
      'Each fiscal year captures a point-in-time snapshot of your building\'s governance records.',
      'Use the Archives to review past decisions, audit compliance history, or reference prior financial statements.',
    ],
    tips: [
      'The Archives automatically preserve records at fiscal year end.',
      'Reference prior years when preparing annual reports or responding to audits.',
    ],
    access: ['Board Member', 'Property Manager'],
  },
  {
    id: 'my-unit',
    title: 'My Unit',
    icon: Home,
    route: '/my-unit',
    summary: 'Your personal unit portal for account management, payment status, balance tracking, and association financial metrics.',
    details: [
      'View your current account balance, payment history, and any outstanding fees.',
      'Track late fees and payment due dates.',
      'See association-level financial metrics like reserve fund balance and collection rate.',
      'Manage your unit profile and contact information.',
    ],
    tips: [
      'Keep your contact information current so you receive all building communications.',
      'Review your balance regularly to avoid late fees.',
    ],
    access: ['Resident', 'Board Member'],
  },
];

export default function HowItWorksPage() {
  const { currentRole } = useAuthStore();
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = GUIDES.filter(g => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      g.title.toLowerCase().includes(q) ||
      g.summary.toLowerCase().includes(q) ||
      g.details.some(d => d.toLowerCase().includes(q)) ||
      g.tips.some(t => t.toLowerCase().includes(q))
    );
  });

  const toggle = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="font-display text-xl font-bold text-ink-900 mb-1">How This Works</h2>
        <p className="text-sm text-ink-500">
          Learn how to use each module in ONE two HOA GovOps. Click any section below to see details and tips.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search guides..."
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-ink-200 rounded-lg text-sm text-ink-800 outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
        />
      </div>

      {/* Guide cards */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-ink-400">
            No guides match your search. Try a different term.
          </div>
        ) : (
          filtered.map(guide => {
            const Icon = guide.icon;
            const isOpen = expandedId === guide.id;
            return (
              <div
                key={guide.id}
                className="bg-white border border-ink-200 rounded-xl overflow-hidden"
              >
                {/* Header */}
                <button
                  onClick={() => toggle(guide.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-mist-25 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-mist-50 border border-ink-100 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-ink-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-ink-900">{guide.title}</div>
                    <div className="text-xs text-ink-500 line-clamp-1">{guide.summary}</div>
                  </div>
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-ink-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-ink-400 flex-shrink-0" />
                  )}
                </button>

                {/* Expanded content */}
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-ink-100">
                    <p className="text-sm text-ink-600 mt-3 mb-3">{guide.summary}</p>

                    {/* Features */}
                    <div className="mb-3">
                      <h4 className="text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">Features</h4>
                      <ul className="space-y-1.5">
                        {guide.details.map((detail, i) => (
                          <li key={i} className="text-[13px] text-ink-600 leading-relaxed flex gap-2">
                            <span className="text-ink-300 mt-1 flex-shrink-0">-</span>
                            <span>{detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Tips */}
                    <div className="mb-3">
                      <h4 className="text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">Tips</h4>
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                        <ul className="space-y-1">
                          {guide.tips.map((tip, i) => (
                            <li key={i} className="text-[13px] text-amber-800 leading-relaxed flex gap-2">
                              <span className="text-amber-400 mt-0.5 flex-shrink-0">*</span>
                              <span>{tip}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Access + navigate */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-ink-400 font-medium">Access:</span>
                        {guide.access.map(role => (
                          <span
                            key={role}
                            className="text-[11px] px-1.5 py-0.5 bg-mist-50 border border-ink-100 rounded text-ink-500"
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={() => navigate(guide.route)}
                        className="text-xs font-medium text-accent-600 hover:text-accent-700 hover:underline transition-colors"
                      >
                        Go to {guide.title} &rarr;
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
