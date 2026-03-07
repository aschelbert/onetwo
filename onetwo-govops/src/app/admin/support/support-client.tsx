'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MessageCircle, CheckCircle, Sparkles, Link2, ChevronDown, User } from 'lucide-react'

// --- Types ---

type Priority = 'high' | 'medium' | 'low'
type ThreadStatus = 'open' | 'resolved'

interface Association {
  id: string
  name: string
  plan: 'Compliance Pro' | 'Community Plus' | 'Management Suite'
  planColor: string
  address: string
  units: number
  boardMembers: number
  residents: number
  managers: number
  staff: number
  status: 'active' | 'trial'
  members: { name: string; role: string; email: string }[]
}

interface Message {
  id: string
  from: 'association' | 'support'
  sender: string
  content: string
  timestamp: string
}

interface SupportThread {
  id: string
  associationId: string
  subject: string
  priority: Priority
  module: string
  status: ThreadStatus
  unread: number
  messages: Message[]
  createdAt: string
}

// --- Seed Data ---

const associations: Association[] = [
  {
    id: 'assoc-1',
    name: '1302 R Street NW Condominium',
    plan: 'Compliance Pro',
    planColor: '#dc2626',
    address: '1302 R Street NW, Washington, DC 20009',
    units: 24,
    boardMembers: 5,
    residents: 38,
    managers: 2,
    staff: 1,
    status: 'active',
    members: [
      { name: 'Patricia Langley', role: 'Board President', email: 'plangley@1302r.org' },
      { name: 'David Kim', role: 'Treasurer', email: 'dkim@1302r.org' },
      { name: 'Sandra Okafor', role: 'Property Manager', email: 'sokafor@1302r.org' },
    ],
  },
  {
    id: 'assoc-2',
    name: 'Capitol Hill Terraces HOA',
    plan: 'Community Plus',
    planColor: '#3b82f6',
    address: '415 East Capitol Street SE, Washington, DC 20003',
    units: 48,
    boardMembers: 7,
    residents: 112,
    managers: 3,
    staff: 2,
    status: 'active',
    members: [
      { name: 'Marcus Thompson', role: 'Board President', email: 'mthompson@chterra.org' },
      { name: 'Lisa Chen', role: 'Secretary', email: 'lchen@chterra.org' },
      { name: 'Robert Vasquez', role: 'Community Manager', email: 'rvasquez@chterra.org' },
    ],
  },
  {
    id: 'assoc-3',
    name: 'Meridian Park Estates',
    plan: 'Management Suite',
    planColor: '#7c3aed',
    address: '2800 16th Street NW, Washington, DC 20009',
    units: 72,
    boardMembers: 9,
    residents: 185,
    managers: 4,
    staff: 3,
    status: 'active',
    members: [
      { name: 'Angela Rivera', role: 'Board President', email: 'arivera@meridianpark.org' },
      { name: 'James Worthington', role: 'Treasurer', email: 'jworthington@meridianpark.org' },
      { name: 'Nina Patel', role: 'General Manager', email: 'npatel@meridianpark.org' },
    ],
  },
]

const threads: SupportThread[] = [
  {
    id: 'thread-1',
    associationId: 'assoc-1',
    subject: 'Quorum tracking not registering proxy votes',
    priority: 'high',
    module: 'Board Room',
    status: 'open',
    unread: 2,
    createdAt: '2026-03-05T14:30:00Z',
    messages: [
      {
        id: 'msg-1a',
        from: 'association',
        sender: 'Patricia Langley',
        content: 'We held our annual meeting last night and the quorum tracker showed 8/24 units present, but we had 14 owners in the room plus 3 proxy votes submitted through the system. The proxy votes aren\'t being counted toward quorum.',
        timestamp: '2026-03-05T14:30:00Z',
      },
      {
        id: 'msg-1b',
        from: 'support',
        sender: 'Admin Support',
        content: 'Thank you for reporting this, Patricia. I can see the proxy submissions in the system — they were received but the quorum calculation is filtering them out. This looks like a bug introduced in last week\'s update. Let me escalate to engineering.',
        timestamp: '2026-03-05T15:12:00Z',
      },
      {
        id: 'msg-1c',
        from: 'association',
        sender: 'Patricia Langley',
        content: 'This is urgent — we need to certify the election results by Friday. Can we get a manual override or a fix before then?',
        timestamp: '2026-03-06T09:00:00Z',
      },
      {
        id: 'msg-1d',
        from: 'association',
        sender: 'David Kim',
        content: 'Adding on — we also noticed the vote tallies on Resolution 3 (special assessment) don\'t match our hand count. Could be related?',
        timestamp: '2026-03-06T10:15:00Z',
      },
    ],
  },
  {
    id: 'thread-2',
    associationId: 'assoc-2',
    subject: 'Reserve fund balance showing $0 after bank sync',
    priority: 'high',
    module: 'Fiscal Lens',
    status: 'open',
    unread: 1,
    createdAt: '2026-03-04T11:00:00Z',
    messages: [
      {
        id: 'msg-2a',
        from: 'association',
        sender: 'Marcus Thompson',
        content: 'Our reserve fund account synced this morning and now shows a $0 balance. The actual balance at PNC Bank is $347,250. This is causing panic among board members who can see the dashboard.',
        timestamp: '2026-03-04T11:00:00Z',
      },
      {
        id: 'msg-2b',
        from: 'support',
        sender: 'Admin Support',
        content: 'Marcus, I\'m looking into this right now. It appears the Plaid connection for your PNC reserve account returned an error during sync and the system zeroed the balance instead of retaining the last known value. I\'m working on restoring the correct figure.',
        timestamp: '2026-03-04T11:45:00Z',
      },
      {
        id: 'msg-2c',
        from: 'association',
        sender: 'Lisa Chen',
        content: 'Board members are asking about this. Can we get an ETA? We have a finance committee meeting tomorrow.',
        timestamp: '2026-03-05T08:30:00Z',
      },
    ],
  },
  {
    id: 'thread-3',
    associationId: 'assoc-3',
    subject: 'Cannot assign vendor to work order — dropdown empty',
    priority: 'medium',
    module: 'Compliance',
    status: 'open',
    unread: 0,
    createdAt: '2026-03-03T16:20:00Z',
    messages: [
      {
        id: 'msg-3a',
        from: 'association',
        sender: 'Nina Patel',
        content: 'When I try to assign a vendor to work order #WO-2847 (elevator maintenance), the vendor dropdown is completely empty. We have 12 approved vendors in the system. This started happening after the Tuesday update.',
        timestamp: '2026-03-03T16:20:00Z',
      },
      {
        id: 'msg-3b',
        from: 'support',
        sender: 'Admin Support',
        content: 'Nina, I can reproduce this. The vendor list query was updated to filter by active contracts, but the contract status field migration didn\'t backfill existing records. I\'m pushing a fix now that will treat null contract status as active.',
        timestamp: '2026-03-03T17:00:00Z',
      },
      {
        id: 'msg-3c',
        from: 'association',
        sender: 'Nina Patel',
        content: 'Thanks for the quick response. The dropdown is populated again. However, I noticed that vendors without contracts are now showing — should those be filtered out?',
        timestamp: '2026-03-04T09:15:00Z',
      },
    ],
  },
  {
    id: 'thread-4',
    associationId: 'assoc-1',
    subject: 'Meeting minutes PDF upload fails over 5MB',
    priority: 'low',
    module: 'Board Room',
    status: 'open',
    unread: 0,
    createdAt: '2026-03-02T13:45:00Z',
    messages: [
      {
        id: 'msg-4a',
        from: 'association',
        sender: 'Sandra Okafor',
        content: 'I\'m trying to upload the February board meeting minutes (8.2MB PDF with embedded photos) and keep getting "Upload failed" with no other details. Smaller files work fine.',
        timestamp: '2026-03-02T13:45:00Z',
      },
      {
        id: 'msg-4b',
        from: 'support',
        sender: 'Admin Support',
        content: 'Sandra, the current upload limit is 5MB per file. I\'ve filed a request to increase this to 25MB. In the meantime, you can compress the PDF using a tool like Smallpdf, or I can upload it for you from our side.',
        timestamp: '2026-03-02T14:30:00Z',
      },
    ],
  },
  {
    id: 'thread-5',
    associationId: 'assoc-2',
    subject: 'Resident portal showing wrong unit assignments',
    priority: 'medium',
    module: 'Resident Portal',
    status: 'resolved',
    unread: 0,
    createdAt: '2026-02-28T10:00:00Z',
    messages: [
      {
        id: 'msg-5a',
        from: 'association',
        sender: 'Robert Vasquez',
        content: 'Three residents reported they\'re seeing maintenance requests from other units when they log into the portal. Unit 204 can see Unit 312\'s requests, etc. This is a privacy concern.',
        timestamp: '2026-02-28T10:00:00Z',
      },
      {
        id: 'msg-5b',
        from: 'support',
        sender: 'Admin Support',
        content: 'Robert, this was caused by a caching issue in the unit-to-user mapping. We\'ve cleared the cache and deployed a fix to prevent stale mappings. Can you ask the affected residents to log out and back in?',
        timestamp: '2026-02-28T11:30:00Z',
      },
      {
        id: 'msg-5c',
        from: 'association',
        sender: 'Robert Vasquez',
        content: 'Confirmed — all three residents now see only their own unit data. Thank you for the fast turnaround.',
        timestamp: '2026-02-28T14:00:00Z',
      },
    ],
  },
]

// --- Helpers ---

const priorityVariant: Record<Priority, 'red' | 'amber' | 'gray'> = {
  high: 'red',
  medium: 'amber',
  low: 'gray',
}

function formatTime(ts: string) {
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// --- Component ---

export function SupportClient() {
  const [scopeId, setScopeId] = useState<string | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string>(threads[0].id)
  const [rightTab, setRightTab] = useState<'capture' | 'association'>('capture')
  const [replyText, setReplyText] = useState('')

  const filteredThreads = scopeId ? threads.filter(t => t.associationId === scopeId) : threads
  const selectedThread = threads.find(t => t.id === selectedThreadId) || threads[0]
  const threadAssociation = associations.find(a => a.id === selectedThread.associationId)!
  const assocThreads = threads.filter(t => t.associationId === selectedThread.associationId)

  return (
    <div className="-m-8 flex flex-col" style={{ height: 'calc(100vh - 73px)' }}>
      {/* Association scope tabs */}
      <div className="flex items-center gap-0 border-b border-gray-200 bg-white px-4">
        <button
          onClick={() => setScopeId(null)}
          className={cn(
            'px-4 py-2.5 text-[0.82rem] font-medium border-b-2 -mb-px transition-all cursor-pointer bg-transparent border-x-0 border-t-0',
            scopeId === null ? 'text-gray-900 font-semibold border-b-gray-900' : 'text-gray-500 border-b-transparent hover:text-gray-700'
          )}
        >
          All Threads
        </button>
        {associations.map(a => (
          <button
            key={a.id}
            onClick={() => setScopeId(a.id)}
            className={cn(
              'px-4 py-2.5 text-[0.82rem] font-medium border-b-2 -mb-px transition-all cursor-pointer bg-transparent border-x-0 border-t-0 flex items-center gap-1.5',
              scopeId === a.id ? 'text-gray-900 font-semibold' : 'text-gray-500 border-b-transparent hover:text-gray-700'
            )}
            style={scopeId === a.id ? { borderBottomColor: a.planColor } : undefined}
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.planColor }} />
            <span className="truncate max-w-[160px]">{a.name}</span>
          </button>
        ))}
      </div>

      {/* 3-pane layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left pane — thread list */}
        <div className="w-80 border-r border-gray-200 bg-white overflow-y-auto flex-shrink-0">
          {filteredThreads.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">No threads for this association.</div>
          ) : (
            filteredThreads.map(t => {
              const assoc = associations.find(a => a.id === t.associationId)!
              const isActive = t.id === selectedThreadId
              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedThreadId(t.id)}
                  className={cn(
                    'px-4 py-3 border-b border-gray-100 cursor-pointer transition-colors',
                    isActive ? 'bg-gray-50' : 'hover:bg-gray-50/60'
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: assoc.planColor }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={cn('text-[0.82rem] truncate', isActive ? 'font-semibold text-gray-900' : 'font-medium text-gray-700')}>
                          {t.subject}
                        </span>
                        {t.unread > 0 && (
                          <span className="ml-auto bg-[#c42030] text-white text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">{t.unread}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={priorityVariant[t.priority]} className="text-[0.6rem]">{t.priority}</Badge>
                        <Badge variant="blue" className="text-[0.6rem]">{t.module}</Badge>
                        {t.status === 'resolved' && <Badge variant="green" className="text-[0.6rem]">resolved</Badge>}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Center pane — message thread */}
        <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
          {/* Thread header */}
          <div className="px-5 py-3 bg-white border-b border-gray-200">
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
              <span className="w-2 h-2 rounded-full" style={{ background: threadAssociation.planColor }} />
              <span>{threadAssociation.name}</span>
              <span>·</span>
              <span>{threadAssociation.plan}</span>
              <span>·</span>
              <span>{threadAssociation.address}</span>
            </div>
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-lg font-bold">{selectedThread.subject}</h3>
              <div className="flex items-center gap-2">
                <Badge variant={priorityVariant[selectedThread.priority]}>{selectedThread.priority}</Badge>
                <Badge variant="blue">{selectedThread.module}</Badge>
                {selectedThread.status === 'open' && (
                  <Button variant="sage" size="sm">
                    <CheckCircle size={14} />
                    Resolve
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {selectedThread.messages.map(msg => (
              <div key={msg.id} className={cn('flex', msg.from === 'support' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[75%] rounded-[10px] px-4 py-3',
                  msg.from === 'support'
                    ? 'bg-gray-900 text-white'
                    : 'bg-white border border-gray-200'
                )}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn('text-[0.7rem] font-semibold', msg.from === 'support' ? 'text-gray-300' : 'text-gray-500')}>
                      {msg.sender}
                    </span>
                    <span className={cn('text-[0.65rem]', msg.from === 'support' ? 'text-gray-400' : 'text-gray-400')}>
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                  <p className={cn('text-[0.82rem] leading-relaxed m-0', msg.from === 'support' ? 'text-gray-100' : 'text-gray-700')}>
                    {msg.content}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Reply box */}
          {selectedThread.status === 'open' && (
            <div className="px-5 py-3 bg-white border-t border-gray-200">
              <div className="flex gap-2">
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Type a reply..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 resize-none min-h-[40px] max-h-[120px] focus:outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                  rows={1}
                />
                <Button disabled={!replyText.trim()}>Send</Button>
              </div>
            </div>
          )}
        </div>

        {/* Right pane */}
        <div className="w-80 border-l border-gray-200 bg-white overflow-y-auto flex-shrink-0 flex flex-col">
          {/* Right panel tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setRightTab('capture')}
              className={cn(
                'flex-1 px-4 py-2.5 text-[0.82rem] font-medium border-b-2 -mb-px transition-all cursor-pointer bg-transparent border-x-0 border-t-0',
                rightTab === 'capture' ? 'text-gray-900 font-semibold border-b-gray-900' : 'text-gray-500 border-b-transparent hover:text-gray-700'
              )}
            >
              Capture
            </button>
            <button
              onClick={() => setRightTab('association')}
              className={cn(
                'flex-1 px-4 py-2.5 text-[0.82rem] font-medium border-b-2 -mb-px transition-all cursor-pointer bg-transparent border-x-0 border-t-0',
                rightTab === 'association' ? 'text-gray-900 font-semibold border-b-gray-900' : 'text-gray-500 border-b-transparent hover:text-gray-700'
              )}
            >
              Association
            </button>
          </div>

          <div className="p-4 flex-1">
            {rightTab === 'capture' ? (
              <CapturePanel thread={selectedThread} />
            ) : (
              <AssociationPanel association={threadAssociation} threads={assocThreads} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Capture Panel ---

function CapturePanel({ thread }: { thread: SupportThread }) {
  const [summaryGenerated, setSummaryGenerated] = useState(false)
  const [itemsCaptured, setItemsCaptured] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)

  return (
    <div className="space-y-5">
      {/* AI Summary */}
      <div>
        <h4 className="text-[0.78rem] font-semibold text-gray-700 mb-2">AI Summary</h4>
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
          {summaryGenerated ? (
            <p className="text-[0.78rem] text-gray-600 leading-relaxed m-0">
              {thread.priority === 'high'
                ? 'Critical issue affecting core workflow. Association reports data integrity problem impacting board operations. Engineering escalation recommended.'
                : 'Moderate issue related to system configuration. User reports unexpected behavior after recent update. Fix identified and being deployed.'}
            </p>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setSummaryGenerated(true)} className="w-full justify-center">
              <Sparkles size={14} />
              Generate Summary
            </Button>
          )}
        </div>
      </div>

      {/* Captured Items */}
      <div>
        <h4 className="text-[0.78rem] font-semibold text-gray-700 mb-2">Captured Items</h4>
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
          {itemsCaptured ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="red" className="text-[0.6rem]">Bug</Badge>
                <span className="text-[0.78rem] text-gray-700">{thread.subject}</span>
              </div>
              <div className="text-[0.7rem] text-gray-500">Module: {thread.module} · Priority: {thread.priority}</div>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setItemsCaptured(true)} className="w-full justify-center">
              <MessageCircle size={14} />
              Analyze Thread
            </Button>
          )}
        </div>
      </div>

      {/* Link to Feedback */}
      <div>
        <h4 className="text-[0.78rem] font-semibold text-gray-700 mb-2">Link to Feedback</h4>
        <div className="relative">
          <button
            onClick={() => setLinkOpen(!linkOpen)}
            className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-700 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Link2 size={14} className="text-gray-400" />
              Select feedback item...
            </span>
            <ChevronDown size={14} className="text-gray-400" />
          </button>
          {linkOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
              {['Proxy votes not counted in quorum', 'Bank sync zeroes balances on error', 'Vendor dropdown empty after migration', 'File upload size limit too low'].map((item, i) => (
                <button
                  key={i}
                  onClick={() => setLinkOpen(false)}
                  className="w-full text-left px-3 py-2 text-[0.82rem] text-gray-700 hover:bg-gray-50 cursor-pointer bg-transparent border-none"
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Association Panel ---

function AssociationPanel({ association, threads }: { association: Association; threads: SupportThread[] }) {
  return (
    <div className="space-y-5">
      {/* Association details card */}
      <div>
        <h4 className="text-[0.78rem] font-semibold text-gray-700 mb-2">Association Details</h4>
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: association.planColor }} />
            <span className="font-semibold text-[0.82rem]">{association.name}</span>
          </div>
          <div className="text-[0.7rem] text-gray-500 mb-3">{association.address}</div>
          <div className="flex items-center gap-1.5 mb-3">
            <Badge variant={association.plan === 'Compliance Pro' ? 'red' : association.plan === 'Community Plus' ? 'blue' : 'purple'}>
              {association.plan}
            </Badge>
            <Badge variant="green">{association.status}</Badge>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div>
        <h4 className="text-[0.78rem] font-semibold text-gray-700 mb-2">Unit & User Stats</h4>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Units', value: association.units },
            { label: 'Board', value: association.boardMembers },
            { label: 'Residents', value: association.residents },
            { label: 'Managers', value: association.managers },
          ].map(s => (
            <div key={s.label} className="bg-gray-50 rounded-lg border border-gray-200 p-2.5 text-center">
              <div className="text-lg font-bold font-serif">{s.value}</div>
              <div className="text-[0.65rem] text-gray-500 uppercase tracking-wider">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Members list */}
      <div>
        <h4 className="text-[0.78rem] font-semibold text-gray-700 mb-2">Members</h4>
        <div className="space-y-2">
          {association.members.map(m => (
            <div key={m.email} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100">
              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                <User size={14} className="text-gray-500" />
              </div>
              <div className="min-w-0">
                <div className="text-[0.78rem] font-semibold text-gray-700 truncate">{m.name}</div>
                <div className="text-[0.65rem] text-gray-500">{m.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* All threads for association */}
      <div>
        <h4 className="text-[0.78rem] font-semibold text-gray-700 mb-2">All Threads ({threads.length})</h4>
        <div className="space-y-1.5">
          {threads.map(t => (
            <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100">
              <Badge variant={t.status === 'resolved' ? 'green' : priorityVariant[t.priority]} className="text-[0.6rem] flex-shrink-0">
                {t.status === 'resolved' ? 'resolved' : t.priority}
              </Badge>
              <span className="text-[0.78rem] text-gray-700 truncate">{t.subject}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
