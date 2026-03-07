'use client'

import { useState, useEffect, useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CheckCircle, Sparkles, User } from 'lucide-react'

// --- Types ---

type Priority = 'high' | 'medium' | 'low'
type ThreadStatus = 'open' | 'pending' | 'resolved'
type PlanName = 'Compliance Pro' | 'Community Plus' | 'Management Suite'

interface Association {
  id: string
  name: string
  slug: string
  address: string
  jurisdiction: string
  plan: PlanName
  planColor: string
  status: 'active' | 'trial' | 'suspended'
  units: number
  billingCycle: string
  users: { boardMembers: number; residents: number; managers: number; staff: number }
  primaryContact: { name: string; role: string; email: string }
  members: { name: string; role: string; email: string; lastActive: string }[]
  createdAt: string
}

interface CapturedItem {
  type: 'bug' | 'feature' | 'docs'
  title: string
  feedbackId: string | null
}

interface Message {
  id: number
  from: 'assoc' | 'support'
  name: string
  role?: string
  avatar: string
  text: string
  time: string
}

interface SupportThread {
  id: string
  assocId: string
  subject: string
  status: ThreadStatus
  priority: Priority
  module: string
  unread: number
  lastAt: string
  assignee: string
  capturedItems: CapturedItem[]
  aiSummary: string | null
  messages: Message[]
}

// --- Plan meta ---

const PLAN_META: Record<PlanName, { color: string; bg: string; dot: string }> = {
  'Compliance Pro':   { color: '#dc2626', bg: '#fef2f2', dot: '#dc2626' },
  'Community Plus':   { color: '#2563eb', bg: '#eff6ff', dot: '#2563eb' },
  'Management Suite': { color: '#7c3aed', bg: '#f5f3ff', dot: '#7c3aed' },
}

const PRIORITY_META: Record<Priority, { color: string; label: string }> = {
  high:   { color: '#dc2626', label: 'High' },
  medium: { color: '#d97706', label: 'Medium' },
  low:    { color: '#6b7280', label: 'Low' },
}

const THREAD_STATUS_META: Record<ThreadStatus, { label: string; variant: 'amber' | 'blue' | 'green' }> = {
  open:     { label: 'Open',     variant: 'amber' },
  pending:  { label: 'Pending',  variant: 'blue' },
  resolved: { label: 'Resolved', variant: 'green' },
}

const TYPE_META: Record<string, { label: string; variant: 'red' | 'purple' | 'amber' }> = {
  bug:     { label: 'Bug',     variant: 'red' },
  feature: { label: 'Feature', variant: 'purple' },
  docs:    { label: 'Docs',    variant: 'amber' },
}

// --- Seed data ---

const ASSOCIATIONS: Association[] = [
  {
    id: 'assoc_1302rstnw', name: '1302 R Street NW Condominium', slug: '1302rstnw',
    address: '1302 R Street NW, Washington, DC 20009', jurisdiction: 'Washington, DC',
    plan: 'Compliance Pro', planColor: '#dc2626', status: 'active', units: 12, billingCycle: 'Monthly',
    users: { boardMembers: 3, residents: 12, managers: 0, staff: 0 },
    primaryContact: { name: 'Robert Chen', role: 'Board President', email: 'r.chen@1302rstnw.org' },
    members: [
      { name: 'Robert Chen',    role: 'Board Member', email: 'r.chen@1302rstnw.org',   lastActive: 'today' },
      { name: 'Patricia Walsh', role: 'Board Member', email: 'p.walsh@1302rstnw.org',  lastActive: '2d ago' },
      { name: 'James Okafor',   role: 'Resident',     email: 'j.okafor@1302rstnw.org', lastActive: '5d ago' },
    ],
    createdAt: 'Mar 2, 2026',
  },
  {
    id: 'assoc_capitolhill', name: 'Capitol Hill Terraces HOA', slug: 'capitolhill',
    address: '450 E Street SE, Washington, DC 20003', jurisdiction: 'Washington, DC',
    plan: 'Community Plus', planColor: '#3b82f6', status: 'active', units: 48, billingCycle: 'Monthly',
    users: { boardMembers: 5, residents: 48, managers: 0, staff: 0 },
    primaryContact: { name: 'Sandra Osei', role: 'HOA President', email: 's.osei@caphillhoa.org' },
    members: [
      { name: 'Sandra Osei',  role: 'Board Member', email: 's.osei@caphillhoa.org',   lastActive: 'today' },
      { name: 'Marcus Webb',  role: 'Board Member', email: 'm.webb@caphillhoa.org',   lastActive: 'today' },
      { name: 'Diane Foster', role: 'Resident',     email: 'd.foster@caphillhoa.org', lastActive: '1d ago' },
    ],
    createdAt: 'Mar 2, 2026',
  },
  {
    id: 'assoc_dupont', name: 'Dupont Circle Lofts', slug: 'dupontcircle',
    address: '1600 Q Street NW, Washington, DC 20009', jurisdiction: 'Washington, DC',
    plan: 'Management Suite', planColor: '#7c3aed', status: 'active', units: 32, billingCycle: 'Monthly',
    users: { boardMembers: 4, residents: 32, managers: 1, staff: 2 },
    primaryContact: { name: 'Alicia Moreno', role: 'Property Manager', email: 'a.moreno@mgmt.com' },
    members: [
      { name: 'Alicia Moreno', role: 'Property Manager', email: 'a.moreno@mgmt.com',   lastActive: 'today' },
      { name: 'Tom Nguyen',    role: 'Board Member',     email: 't.nguyen@dupont.org',  lastActive: 'today' },
      { name: 'Keisha Brown',  role: 'Staff',            email: 'k.brown@mgmt.com',     lastActive: '3d ago' },
    ],
    createdAt: 'Mar 2, 2026',
  },
  {
    id: 'assoc_adamsmorg', name: 'Adams Morgan Commons', slug: 'adamsmorgan',
    address: '2420 18th Street NW, Washington, DC 20009', jurisdiction: 'Washington, DC',
    plan: 'Compliance Pro', planColor: '#dc2626', status: 'trial', units: 24, billingCycle: 'Monthly',
    users: { boardMembers: 3, residents: 11, managers: 0, staff: 0 },
    primaryContact: { name: 'David Kim', role: 'Board Treasurer', email: 'd.kim@amcommons.org' },
    members: [
      { name: 'David Kim',     role: 'Board Member', email: 'd.kim@amcommons.org',    lastActive: 'today' },
      { name: 'Fatima Hassan', role: 'Board Member', email: 'f.hassan@amcommons.org', lastActive: '3d ago' },
    ],
    createdAt: 'Mar 2, 2026',
  },
  {
    id: 'assoc_georgemews', name: 'Georgetown Mews', slug: 'georgetownmews',
    address: '3200 N Street NW, Washington, DC 20007', jurisdiction: 'Washington, DC',
    plan: 'Compliance Pro', planColor: '#dc2626', status: 'suspended', units: 8, billingCycle: 'Monthly',
    users: { boardMembers: 2, residents: 8, managers: 0, staff: 0 },
    primaryContact: { name: 'Linda Park', role: 'Board Secretary', email: 'l.park@georgemews.org' },
    members: [
      { name: 'Linda Park', role: 'Board Member', email: 'l.park@georgemews.org', lastActive: '14d ago' },
    ],
    createdAt: 'Mar 2, 2026',
  },
]

const INITIAL_THREADS: SupportThread[] = [
  {
    id: 'SUP-001', assocId: 'assoc_capitolhill',
    subject: 'Votes & Resolutions — quorum tracking not updating',
    status: 'open', priority: 'high', module: 'Board Room', unread: 2, lastAt: '12m ago', assignee: 'Alex K.',
    capturedItems: [
      { type: 'bug',     title: 'Live quorum count not updating after member joins meeting', feedbackId: 'F-003' },
      { type: 'feature', title: 'Email notification when quorum is reached',                feedbackId: 'F-004' },
    ],
    aiSummary: null,
    messages: [
      { id: 1, from: 'assoc',   name: 'Sandra Osei',  role: 'Board Member', avatar: 'SO', text: 'During our meeting last night the quorum tracker stayed stuck at 3/5 even after Marcus and Diane joined. We had to manually count heads. Is this a known issue?', time: '9:14 AM' },
      { id: 2, from: 'support', name: 'Alex K.',       avatar: 'AK', text: 'Hi Sandra — thanks for flagging. Can you tell me which browser you were using, and was this in the Board Room > Meetings module?', time: '9:28 AM' },
      { id: 3, from: 'assoc',   name: 'Sandra Osei',  role: 'Board Member', avatar: 'SO', text: "Yes, Meetings module. Chrome on Mac. Marcus was joining from a tablet (Safari) — could that be causing it?", time: '9:41 AM' },
      { id: 4, from: 'assoc',   name: 'Marcus Webb',  role: 'Board Member', avatar: 'MW', text: "I can confirm — the count showed me as present on my screen but not on Sandra's.", time: '9:44 AM' },
    ],
  },
  {
    id: 'SUP-002', assocId: 'assoc_1302rstnw',
    subject: 'Fiscal Lens — reserve fund balance showing incorrect figure',
    status: 'open', priority: 'high', module: 'Fiscal Lens', unread: 1, lastAt: '1h ago', assignee: 'Maya R.',
    capturedItems: [
      { type: 'bug', title: 'Reserve fund balance not reflecting recent general ledger entry', feedbackId: 'F-001' },
    ],
    aiSummary: null,
    messages: [
      { id: 1, from: 'assoc',   name: 'Robert Chen', role: 'Board Member', avatar: 'RC', text: "Our Reserves balance shows $47,200 but our accountant confirmed it should be $52,400 after last month's deposit. The GL entry is there but Reserves hasn't updated.", time: '8:05 AM' },
      { id: 2, from: 'support', name: 'Maya R.',      avatar: 'MR', text: "Hi Robert — I can see the GL entry from March 1st. It looks like the sync between the General Ledger and Reserves module may have a propagation delay. Let me check with engineering.", time: '8:22 AM' },
      { id: 3, from: 'assoc',   name: 'Robert Chen', role: 'Board Member', avatar: 'RC', text: "Our annual meeting is next week and we'll need to present accurate reserve figures. Can this be resolved before then?", time: '8:35 AM' },
    ],
  },
  {
    id: 'SUP-003', assocId: 'assoc_dupont',
    subject: 'Work order workflow — vendor assignment not saving',
    status: 'open', priority: 'medium', module: 'Fiscal Lens', unread: 0, lastAt: '3h ago', assignee: 'Sam L.',
    capturedItems: [
      { type: 'bug',     title: 'Vendor assignment on WO form resets on save',   feedbackId: 'F-005' },
      { type: 'feature', title: 'Recurring work order templates',                feedbackId: 'F-006' },
    ],
    aiSummary: 'Property manager unable to assign vendors to work orders — assignment field resets on save. Also requested recurring WO templates.',
    messages: [
      { id: 1, from: 'assoc',   name: 'Alicia Moreno', role: 'Property Manager', avatar: 'AM', text: "When I create a work order and assign a vendor, the assignment is gone when I save. I have to re-assign every time but it doesn't persist.", time: '7:30 AM' },
      { id: 2, from: 'support', name: 'Sam L.',         avatar: 'SL', text: "Hi Alicia — we're reproducing this on our end. It appears to be a state management issue in the WO form. I'll log it as a bug.", time: '8:15 AM' },
      { id: 3, from: 'assoc',   name: 'Alicia Moreno', role: 'Property Manager', avatar: 'AM', text: "Also — is there any plan to support recurring work orders? We have monthly HVAC inspections and it'd save a lot of time.", time: '8:30 AM' },
    ],
  },
  {
    id: 'SUP-004', assocId: 'assoc_dupont',
    subject: 'Bylaws & Legal — document upload failing for large PDFs',
    status: 'pending', priority: 'medium', module: 'Board Room', unread: 0, lastAt: '1d ago', assignee: 'Maya R.',
    capturedItems: [
      { type: 'bug',  title: 'PDF upload fails silently for files over 10MB',  feedbackId: 'F-002' },
      { type: 'docs', title: 'Document size limits not stated in upload UI',   feedbackId: null },
    ],
    aiSummary: 'Upload fails for PDFs over ~10MB with no error shown. Bylaws document is 14MB. Docs issue: limit not communicated in UI.',
    messages: [
      { id: 1, from: 'assoc',   name: 'Tom Nguyen', role: 'Board Member', avatar: 'TN', text: "Trying to upload our 14MB bylaws PDF in the Bylaws & Legal section. Upload shows progress then fails silently — no error, file doesn't appear.", time: 'Yesterday 2:00 PM' },
      { id: 2, from: 'support', name: 'Maya R.',     avatar: 'MR', text: "Hi Tom — there is a 10MB limit on document uploads currently. Your file at 14MB is exceeding it. We don't surface this clearly in the UI which is a gap we'll fix. For now, can you compress the PDF?", time: 'Yesterday 2:45 PM' },
      { id: 3, from: 'assoc',   name: 'Tom Nguyen', role: 'Board Member', avatar: 'TN', text: "That worked, thanks. But that limit should definitely be shown upfront — wasted 30 minutes troubleshooting.", time: 'Yesterday 3:10 PM' },
    ],
  },
  {
    id: 'SUP-005', assocId: 'assoc_adamsmorg',
    subject: 'Governance Calendar — meeting invitations not sending to residents',
    status: 'open', priority: 'medium', module: 'Board Room', unread: 1, lastAt: '4h ago', assignee: 'Unassigned',
    capturedItems: [],
    aiSummary: null,
    messages: [
      { id: 1, from: 'assoc', name: 'David Kim', role: 'Board Member', avatar: 'DK', text: 'We scheduled our annual meeting in Governance Calendar and the system said invitations were sent, but none of our residents received the email. Checked spam too.', time: '11:00 AM' },
    ],
  },
  {
    id: 'SUP-006', assocId: 'assoc_1302rstnw',
    subject: 'Permission question — resident access to board minutes',
    status: 'resolved', priority: 'low', module: 'Access & Permissions', unread: 0, lastAt: '3d ago', assignee: 'Alex K.',
    capturedItems: [
      { type: 'docs', title: 'Clarify which modules residents can access per plan', feedbackId: null },
    ],
    aiSummary: 'Board wanted to grant residents read access to approved meeting minutes. Resolved via Permission Simulator — resident role has read access to approved minutes by default.',
    messages: [
      { id: 1, from: 'assoc',   name: 'Patricia Walsh', role: 'Board Member', avatar: 'PW', text: 'Can residents see approved board meeting minutes in the system? If so, how do we control that?', time: 'Mon 10:00 AM' },
      { id: 2, from: 'support', name: 'Alex K.',         avatar: 'AK', text: 'Yes — residents with the Resident role can view approved meeting minutes. You can verify and adjust this through the Permission Simulator in your admin panel.', time: 'Mon 10:30 AM' },
      { id: 3, from: 'assoc',   name: 'Patricia Walsh', role: 'Board Member', avatar: 'PW', text: "Found it — that's exactly what we needed. Thank you!", time: 'Mon 11:00 AM' },
    ],
  },
]

const FEEDBACK_ITEMS = [
  { id: 'F-001', title: 'Reserve fund balance sync delay from General Ledger', status: 'In Development' },
  { id: 'F-002', title: 'PDF upload fails silently over 10MB limit',           status: 'In Development' },
  { id: 'F-003', title: 'Live quorum count not updating for all participants',  status: 'Exploring' },
  { id: 'F-004', title: 'Email notification when quorum is reached',           status: 'Backlog' },
  { id: 'F-005', title: 'Vendor assignment on work order form not persisting',  status: 'In Development' },
  { id: 'F-006', title: 'Recurring work order templates',                       status: 'In Roadmap' },
  { id: 'F-007', title: 'Compliance grade breakdown — drill-down detail',       status: 'Planned' },
  { id: 'F-008', title: 'Resident portal — maintenance request submission',     status: 'In Roadmap' },
  { id: 'F-009', title: 'Budget vs actuals comparison report',                  status: 'Planned' },
  { id: 'F-010', title: 'Bulk resident import via CSV',                         status: 'Backlog' },
]

// --- Helpers ---

function assocById(id: string) {
  return ASSOCIATIONS.find(a => a.id === id)
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function totalUsers(a: Association) {
  return a.users.boardMembers + a.users.residents + a.users.managers + a.users.staff
}

// --- Component ---

export function SupportClient() {
  const [threads, setThreads] = useState(INITIAL_THREADS)
  const [scopeAssocId, setScopeAssocId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [replyText, setReplyText] = useState('')
  const [rightPanel, setRightPanel] = useState<'capture' | 'association'>('capture')
  const [linkTarget, setLinkTarget] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const visible = threads
    .filter(t => scopeAssocId ? t.assocId === scopeAssocId : true)
    .filter(t => statusFilter === 'all' ? true : t.status === statusFilter)
    .sort((a, b) => {
      const p: Record<string, number> = { high: 0, medium: 1, low: 2 }
      if (a.status !== 'resolved' && b.status === 'resolved') return -1
      if (a.status === 'resolved' && b.status !== 'resolved') return 1
      return (p[a.priority] ?? 2) - (p[b.priority] ?? 2)
    })

  useEffect(() => {
    if ((!selectedId || !visible.find(t => t.id === selectedId)) && visible.length) {
      setSelectedId(visible[0].id)
    }
  }, [scopeAssocId, statusFilter])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selectedId])

  const thread = threads.find(t => t.id === selectedId)
  const assoc = thread ? assocById(thread.assocId) : null
  const pm = assoc ? PLAN_META[assoc.plan] : null

  const sendReply = () => {
    if (!replyText.trim() || !selectedId) return
    setThreads(prev => prev.map(t =>
      t.id === selectedId
        ? { ...t, messages: [...t.messages, { id: Date.now(), from: 'support' as const, name: 'You', avatar: 'YO', text: replyText, time: 'just now' }] }
        : t
    ))
    setReplyText('')
  }

  const handleSummarize = (threadId: string) => {
    const t = threads.find(th => th.id === threadId)
    if (!t) return
    const summary = t.priority === 'high'
      ? `Critical issue reported by ${assocById(t.assocId)?.name}. ${t.subject.split('—')[1]?.trim() || t.subject}. Requires engineering escalation.`
      : `${t.subject.split('—')[1]?.trim() || t.subject}. Issue identified and being tracked.`
    setThreads(prev => prev.map(th => th.id === threadId ? { ...th, aiSummary: summary } : th))
  }

  const openThreads = threads.filter(t => t.status === 'open').length

  return (
    <div className="-m-8 flex flex-col" style={{ height: 'calc(100vh - 73px)' }}>
      {/* Association scope tabs */}
      <div className="flex items-center gap-0 border-b border-gray-200 bg-white px-6 overflow-x-auto">
        <button
          onClick={() => setScopeAssocId(null)}
          className={cn(
            'px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-all cursor-pointer bg-transparent border-x-0 border-t-0 whitespace-nowrap',
            scopeAssocId === null ? 'text-gray-900 font-semibold border-b-gray-900' : 'text-gray-400 border-b-transparent hover:text-gray-700'
          )}
        >
          All associations
        </button>
        {ASSOCIATIONS.map(a => {
          const apm = PLAN_META[a.plan]
          const unread = threads.filter(t => t.assocId === a.id).reduce((s, t) => s + t.unread, 0)
          const active = scopeAssocId === a.id
          return (
            <button
              key={a.id}
              onClick={() => setScopeAssocId(active ? null : a.id)}
              className={cn(
                'px-3.5 py-2.5 text-xs font-medium border-b-2 -mb-px transition-all cursor-pointer bg-transparent border-x-0 border-t-0 flex items-center gap-1.5 whitespace-nowrap',
                active ? 'font-semibold' : 'text-gray-400 border-b-transparent hover:text-gray-700'
              )}
              style={active ? { color: apm.dot, borderBottomColor: apm.dot } : undefined}
            >
              <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: apm.dot }} />
              {a.name.split(' ').slice(0, 3).join(' ')}
              {unread > 0 && (
                <span className="bg-[#dc2626] text-white rounded-full w-3.5 h-3.5 text-[8px] font-bold inline-flex items-center justify-center flex-shrink-0">{unread}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* 3-pane layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left — thread list */}
        <div className="w-[280px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
          {/* Status filter pills */}
          <div className="p-2.5 border-b border-gray-100 flex gap-1">
            {[['all', 'All'], ['open', 'Open'], ['pending', 'Pending'], ['resolved', 'Resolved']].map(([v, l]) => (
              <button
                key={v}
                onClick={() => setStatusFilter(v)}
                className={cn(
                  'flex-1 py-1.5 text-[11px] font-medium rounded-[5px] cursor-pointer transition-all border bg-transparent',
                  statusFilter === v
                    ? 'text-gray-900 font-semibold border-gray-200 bg-gray-50'
                    : 'text-gray-400 border-transparent'
                )}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {visible.length === 0 && <div className="p-5 text-[13px] text-gray-400">No threads.</div>}
            {visible.map(t => {
              const a = assocById(t.assocId)
              const ap = a ? PLAN_META[a.plan] : null
              const isActive = t.id === selectedId
              const ps = PRIORITY_META[t.priority]
              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={cn(
                    'px-3.5 py-3 border-b border-gray-100 cursor-pointer transition-colors',
                    isActive ? 'bg-blue-50' : 'bg-white hover:bg-gray-50/60'
                  )}
                  style={{ borderLeft: `3px solid ${isActive ? (ap?.dot || '#3b82f6') : 'transparent'}` }}
                >
                  {/* Top row: assoc name + unread + time */}
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {!scopeAssocId && ap && <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: ap.dot }} />}
                      <span className={cn('text-xs font-semibold overflow-hidden text-ellipsis whitespace-nowrap flex-1', isActive ? 'text-blue-800' : 'text-gray-900')}>
                        {scopeAssocId ? t.id : a?.name?.split(' ').slice(0, 3).join(' ')}
                      </span>
                      {t.unread > 0 && (
                        <span className="bg-[#dc2626] text-white rounded-full w-[15px] h-[15px] text-[8px] font-bold inline-flex items-center justify-center flex-shrink-0">{t.unread}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 ml-1.5 flex-shrink-0">{t.lastAt}</span>
                  </div>
                  {/* Subject */}
                  <div className="text-xs text-gray-700 overflow-hidden text-ellipsis whitespace-nowrap mb-1.5">{t.subject}</div>
                  {/* Priority + module + captured */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium" style={{ color: ps.color }}>● {ps.label}</span>
                    <span className="text-[10px] text-gray-400">· {t.module}</span>
                    {t.capturedItems.length > 0 && <span className="text-[10px] text-emerald-600 ml-auto">✦ {t.capturedItems.length}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Center — message thread */}
        <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
          {thread && assoc && pm ? (
            <>
              {/* Thread header */}
              <div className="bg-white border-b border-gray-200 px-5 py-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: pm.dot }} />
                  <span className="text-xs font-semibold" style={{ color: pm.color }}>{assoc.name}</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-[11px] text-gray-400">{assoc.plan}</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-[11px] text-gray-400">{assoc.address}</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-[11px] text-gray-400">{thread.id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-sm font-semibold text-gray-900 mb-1">{thread.subject}</div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={THREAD_STATUS_META[thread.status].variant}>{THREAD_STATUS_META[thread.status].label}</Badge>
                      <span className="text-[11px] bg-gray-100 border border-gray-200 rounded px-1.5 py-px text-gray-500">{thread.module}</span>
                      <span className="text-[11px] font-medium" style={{ color: PRIORITY_META[thread.priority].color }}>
                        ● {PRIORITY_META[thread.priority].label} priority
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select className="bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-700 outline-none cursor-pointer">
                      <option>{thread.assignee || 'Assign…'}</option>
                      <option>Alex K.</option>
                      <option>Maya R.</option>
                      <option>Sam L.</option>
                    </select>
                    {thread.status !== 'resolved' && (
                      <Button
                        variant="sage"
                        size="sm"
                        onClick={() => setThreads(prev => prev.map(t => t.id === selectedId ? { ...t, status: 'resolved' as const } : t))}
                      >
                        <CheckCircle size={14} />
                        Resolve
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-3.5">
                {thread.messages.map(msg => {
                  const isSupport = msg.from === 'support'
                  return (
                    <div key={msg.id} className={cn('flex gap-2.5', isSupport ? 'flex-row-reverse' : 'flex-row')}>
                      <div
                        className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
                        style={{ background: isSupport ? '#6b7280' : pm.dot, color: '#fff' }}
                      >
                        {getInitials(msg.name)}
                      </div>
                      <div className="max-w-[68%]">
                        <div className={cn('flex items-baseline gap-1.5 mb-1', isSupport ? 'flex-row-reverse' : 'flex-row')}>
                          <span className="text-xs font-semibold text-gray-700">{msg.name}</span>
                          {msg.role && !isSupport && (
                            <span className="text-[11px] text-gray-400 bg-gray-100 px-1.5 py-px rounded">{msg.role}</span>
                          )}
                          <span className="text-[11px] text-gray-300">{msg.time}</span>
                        </div>
                        <div
                          className={cn(
                            'border px-3.5 py-2.5',
                            isSupport
                              ? 'bg-blue-50 border-blue-200 rounded-xl rounded-tr-sm'
                              : 'bg-white border-gray-200 rounded-xl rounded-tl-sm'
                          )}
                        >
                          <p className="text-[13px] text-gray-700 leading-relaxed m-0">{msg.text}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply box */}
              <div className="bg-white border-t border-gray-200 px-5 py-3">
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                  placeholder={`Reply to ${assoc.name}…`}
                  rows={2}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 resize-none outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                />
                <div className="flex justify-end mt-2">
                  <Button onClick={sendReply} disabled={!replyText.trim()}>Send reply ↑</Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-300 text-[13px]">Select a thread</div>
          )}
        </div>

        {/* Right panel */}
        {thread && assoc && pm && (
          <div className="w-[290px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col">
            {/* Panel tabs */}
            <div className="flex border-b border-gray-200">
              {[['capture', 'Capture'], ['association', 'Association']].map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setRightPanel(v as 'capture' | 'association')}
                  className={cn(
                    'flex-1 py-2.5 text-xs font-medium border-b-2 -mb-px transition-all cursor-pointer bg-transparent border-x-0 border-t-0',
                    rightPanel === v ? 'text-gray-900 font-semibold border-b-gray-900' : 'text-gray-400 border-b-transparent hover:text-gray-700'
                  )}
                >
                  {l}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {rightPanel === 'capture' ? (
                <div className="p-4 flex flex-col gap-3">
                  {/* AI Summary */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-100 px-3 py-2 flex justify-between items-center">
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">AI Summary</span>
                      <button
                        onClick={() => handleSummarize(thread.id)}
                        className="text-[11px] text-blue-600 bg-transparent border-none cursor-pointer font-medium"
                      >
                        {thread.aiSummary ? 'Refresh' : 'Generate'}
                      </button>
                    </div>
                    <div className="px-3 py-2.5">
                      {thread.aiSummary ? (
                        <p className="text-xs text-gray-700 leading-relaxed m-0">{thread.aiSummary}</p>
                      ) : (
                        <p className="text-xs text-gray-300 m-0">Not yet generated.</p>
                      )}
                    </div>
                  </div>

                  {/* Captured Items */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-100 px-3 py-2 flex justify-between items-center">
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Captured Items</span>
                      <button className="text-[11px] text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-px cursor-pointer font-medium">
                        <Sparkles size={10} className="inline mr-0.5" />
                        Analyze
                      </button>
                    </div>
                    <div className="py-2">
                      {thread.capturedItems.length === 0 ? (
                        <p className="text-xs text-gray-300 m-0 px-3">Run analysis to surface items.</p>
                      ) : (
                        thread.capturedItems.map((item, i) => {
                          const linked = item.feedbackId ? FEEDBACK_ITEMS.find(f => f.id === item.feedbackId) : null
                          const tm = TYPE_META[item.type]
                          return (
                            <div key={i} className="px-3 py-1.5 border-b border-gray-50 last:border-b-0">
                              <div className="flex items-start gap-1.5 mb-0.5">
                                <Badge variant={tm?.variant || 'gray'} className="text-[10px]">{tm?.label || item.type}</Badge>
                                <span className="text-xs text-gray-700 leading-snug">{item.title}</span>
                              </div>
                              {linked && (
                                <div className="ml-0.5 mt-1">
                                  <span className="text-[11px] text-gray-500">→ </span>
                                  <span className="text-[11px] text-blue-600 font-medium">{linked.id} · {linked.status}</span>
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  {/* Link to Feedback */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-100 px-3 py-2">
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Link to Feedback</span>
                    </div>
                    <div className="px-3 py-2.5 flex gap-1.5">
                      <select
                        value={linkTarget}
                        onChange={e => setLinkTarget(e.target.value)}
                        className="flex-1 bg-white border border-gray-200 rounded-[5px] px-2 py-1.5 text-[11px] text-gray-700 outline-none"
                      >
                        <option value="">Select item…</option>
                        {FEEDBACK_ITEMS.map(f => (
                          <option key={f.id} value={f.id}>{f.id}: {f.title.slice(0, 35)}</option>
                        ))}
                      </select>
                      <Button size="xs" onClick={() => setLinkTarget('')} disabled={!linkTarget}>Link</Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 flex flex-col gap-3.5">
                  {/* Association summary card */}
                  <div className="rounded-lg p-3.5" style={{ border: `1px solid ${pm.dot}33`, background: pm.bg }}>
                    <div className="text-sm font-bold text-gray-900 mb-1">{assoc.name}</div>
                    <div className="text-xs text-gray-500 mb-2.5">{assoc.address}</div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: pm.dot }} />
                      <span className="text-[13px] text-gray-700">{assoc.plan}</span>
                      <Badge variant={assoc.status === 'active' ? 'green' : assoc.status === 'trial' ? 'amber' : 'red'}>{assoc.status}</Badge>
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['Units', assoc.units],
                      ['Total Users', totalUsers(assoc)],
                      ['Board Members', assoc.users.boardMembers],
                      ['Residents', assoc.users.residents],
                    ].map(([k, v]) => (
                      <div key={k as string} className="bg-gray-50 border border-gray-100 rounded-md p-2.5">
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{k}</div>
                        <div className="text-lg font-bold text-gray-900">{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Members */}
                  <div>
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Members</div>
                    {assoc.members.map(m => (
                      <div key={m.email} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-b-0">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0"
                          style={{ background: pm.dot }}
                        >
                          {getInitials(m.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium text-gray-900">{m.name}</div>
                          <div className="text-[11px] text-gray-400">{m.role}</div>
                        </div>
                        <div className="text-[10px] text-gray-300">{m.lastActive}</div>
                      </div>
                    ))}
                  </div>

                  {/* All threads for association */}
                  <div>
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">All Threads</div>
                    {threads.filter(t => t.assocId === assoc.id).map(t => (
                      <div
                        key={t.id}
                        onClick={() => setSelectedId(t.id)}
                        className={cn(
                          'flex items-center gap-1.5 px-2 py-1.5 rounded-[5px] cursor-pointer',
                          t.id === selectedId ? 'bg-blue-50' : 'hover:bg-gray-50'
                        )}
                      >
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: t.status === 'resolved' ? '#10b981' : '#f59e0b' }} />
                        <span className="text-xs text-gray-700 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{t.subject}</span>
                        <span className="text-[10px] text-gray-400">{t.id}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
