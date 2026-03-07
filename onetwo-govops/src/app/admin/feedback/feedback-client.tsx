'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChevronRight, ChevronDown, ThumbsUp, MessageCircle } from 'lucide-react'

// --- Types ---

type FeedbackType = 'Bug' | 'Feature' | 'Docs'
type FeedbackStatus = 'open' | 'in_progress' | 'planned' | 'shipped' | 'wont_fix'
type ThemeName = 'Board Room' | 'Fiscal Lens' | 'Compliance' | 'Resident Portal'

interface AssociationSignal {
  name: string
  plan: 'Compliance Pro' | 'Community Plus' | 'Management Suite'
  planColor: string
  units: number
}

interface SourceThread {
  id: string
  subject: string
  association: string
}

interface FeedbackItem {
  id: string
  type: FeedbackType
  title: string
  description: string
  theme: ThemeName
  associations: AssociationSignal[]
  sourceThreads: SourceThread[]
  status: FeedbackStatus
  votes: number
}

// --- Seed Data ---

const feedbackItems: FeedbackItem[] = [
  {
    id: 'fb-1',
    type: 'Bug',
    title: 'Proxy votes not counted in quorum calculation',
    description: 'Quorum tracker excludes proxy votes submitted through the system. Proxy submissions are received but filtered out during the quorum percentage calculation. This was introduced in the March 2026 update to the Board Room module.',
    theme: 'Board Room',
    associations: [
      { name: '1302 R Street NW Condominium', plan: 'Compliance Pro', planColor: '#dc2626', units: 24 },
    ],
    sourceThreads: [
      { id: 'thread-1', subject: 'Quorum tracking not registering proxy votes', association: '1302 R Street NW Condominium' },
    ],
    status: 'in_progress',
    votes: 12,
  },
  {
    id: 'fb-2',
    type: 'Bug',
    title: 'Bank sync zeroes reserve balance on Plaid error',
    description: 'When the Plaid connection returns an error during bank sync, the system sets the account balance to $0 instead of retaining the last known good value. This causes incorrect data on the Fiscal Lens dashboard.',
    theme: 'Fiscal Lens',
    associations: [
      { name: 'Capitol Hill Terraces HOA', plan: 'Community Plus', planColor: '#3b82f6', units: 48 },
    ],
    sourceThreads: [
      { id: 'thread-2', subject: 'Reserve fund balance showing $0 after bank sync', association: 'Capitol Hill Terraces HOA' },
    ],
    status: 'in_progress',
    votes: 8,
  },
  {
    id: 'fb-3',
    type: 'Bug',
    title: 'Vendor dropdown empty after contract status migration',
    description: 'The vendor assignment dropdown shows no options because the contract status field migration did not backfill existing records. Vendors with null contract status are filtered out.',
    theme: 'Compliance',
    associations: [
      { name: 'Meridian Park Estates', plan: 'Management Suite', planColor: '#7c3aed', units: 72 },
    ],
    sourceThreads: [
      { id: 'thread-3', subject: 'Cannot assign vendor to work order — dropdown empty', association: 'Meridian Park Estates' },
    ],
    status: 'shipped',
    votes: 5,
  },
  {
    id: 'fb-4',
    type: 'Feature',
    title: 'Increase document upload size limit to 25MB',
    description: 'Current 5MB upload limit prevents associations from uploading board meeting minutes with embedded photos and scanned documents. Request to increase to at least 25MB.',
    theme: 'Board Room',
    associations: [
      { name: '1302 R Street NW Condominium', plan: 'Compliance Pro', planColor: '#dc2626', units: 24 },
      { name: 'Capitol Hill Terraces HOA', plan: 'Community Plus', planColor: '#3b82f6', units: 48 },
    ],
    sourceThreads: [
      { id: 'thread-4', subject: 'Meeting minutes PDF upload fails over 5MB', association: '1302 R Street NW Condominium' },
    ],
    status: 'planned',
    votes: 19,
  },
  {
    id: 'fb-5',
    type: 'Feature',
    title: 'Add reserve study comparison view across years',
    description: 'Allow board members to compare reserve study data side-by-side across multiple years to see funding trend changes and component cost evolution.',
    theme: 'Fiscal Lens',
    associations: [
      { name: 'Meridian Park Estates', plan: 'Management Suite', planColor: '#7c3aed', units: 72 },
      { name: '1302 R Street NW Condominium', plan: 'Compliance Pro', planColor: '#dc2626', units: 24 },
    ],
    sourceThreads: [],
    status: 'open',
    votes: 24,
  },
  {
    id: 'fb-6',
    type: 'Docs',
    title: 'Add compliance checklist templates for DC regulations',
    description: 'Associations in DC need pre-built compliance checklist templates that reflect DC Condominium Act requirements, including reserve study filing deadlines and annual meeting notice rules.',
    theme: 'Compliance',
    associations: [
      { name: '1302 R Street NW Condominium', plan: 'Compliance Pro', planColor: '#dc2626', units: 24 },
      { name: 'Capitol Hill Terraces HOA', plan: 'Community Plus', planColor: '#3b82f6', units: 48 },
      { name: 'Meridian Park Estates', plan: 'Management Suite', planColor: '#7c3aed', units: 72 },
    ],
    sourceThreads: [],
    status: 'planned',
    votes: 15,
  },
  {
    id: 'fb-7',
    type: 'Bug',
    title: 'Resident portal shows wrong unit maintenance requests',
    description: 'Caching issue in unit-to-user mapping causes residents to see maintenance requests from other units. Privacy concern that was resolved by clearing stale cache mappings.',
    theme: 'Resident Portal',
    associations: [
      { name: 'Capitol Hill Terraces HOA', plan: 'Community Plus', planColor: '#3b82f6', units: 48 },
    ],
    sourceThreads: [
      { id: 'thread-5', subject: 'Resident portal showing wrong unit assignments', association: 'Capitol Hill Terraces HOA' },
    ],
    status: 'shipped',
    votes: 7,
  },
  {
    id: 'fb-8',
    type: 'Feature',
    title: 'Resident self-service amenity booking',
    description: 'Allow residents to book common area amenities (pool, meeting room, rooftop) directly through the portal with availability calendar and automatic approval for standard requests.',
    theme: 'Resident Portal',
    associations: [
      { name: 'Meridian Park Estates', plan: 'Management Suite', planColor: '#7c3aed', units: 72 },
      { name: 'Capitol Hill Terraces HOA', plan: 'Community Plus', planColor: '#3b82f6', units: 48 },
    ],
    sourceThreads: [],
    status: 'open',
    votes: 31,
  },
  {
    id: 'fb-9',
    type: 'Feature',
    title: 'Automated special assessment calculation from reserve shortfall',
    description: 'When a reserve study reveals underfunding, automatically calculate special assessment amounts per unit based on ownership percentage and present options to the board.',
    theme: 'Fiscal Lens',
    associations: [
      { name: '1302 R Street NW Condominium', plan: 'Compliance Pro', planColor: '#dc2626', units: 24 },
    ],
    sourceThreads: [],
    status: 'open',
    votes: 16,
  },
  {
    id: 'fb-10',
    type: 'Docs',
    title: 'Board meeting Robert\'s Rules quick reference guide',
    description: 'Provide an in-app quick reference for Robert\'s Rules of Order as applied to HOA board meetings, including motion procedures, voting requirements, and quorum rules.',
    theme: 'Board Room',
    associations: [
      { name: 'Capitol Hill Terraces HOA', plan: 'Community Plus', planColor: '#3b82f6', units: 48 },
      { name: '1302 R Street NW Condominium', plan: 'Compliance Pro', planColor: '#dc2626', units: 24 },
    ],
    sourceThreads: [],
    status: 'open',
    votes: 11,
  },
]

const themes: ThemeName[] = ['Board Room', 'Fiscal Lens', 'Compliance', 'Resident Portal']

// --- Helpers ---

const typeVariant: Record<FeedbackType, 'red' | 'purple' | 'blue'> = {
  Bug: 'red',
  Feature: 'purple',
  Docs: 'blue',
}

const statusConfig: Record<FeedbackStatus, { label: string; variant: 'gray' | 'amber' | 'blue' | 'green' | 'red' }> = {
  open: { label: 'Open', variant: 'gray' },
  in_progress: { label: 'In Progress', variant: 'amber' },
  planned: { label: 'Planned', variant: 'blue' },
  shipped: { label: 'Shipped', variant: 'green' },
  wont_fix: { label: "Won't Fix", variant: 'red' },
}

// --- Component ---

export function FeedbackClient() {
  const [collapsedThemes, setCollapsedThemes] = useState<Record<string, boolean>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selectedItem = selectedId ? feedbackItems.find(f => f.id === selectedId) : null

  function toggleTheme(theme: string) {
    setCollapsedThemes(prev => ({ ...prev, [theme]: !prev[theme] }))
  }

  return (
    <div className="-m-8 flex" style={{ height: 'calc(100vh - 73px)' }}>
      {/* Left — theme-grouped list */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="font-serif text-2xl font-bold">Feedback</h2>
              <p className="text-sm text-gray-500 mt-1">{feedbackItems.length} items across {themes.length} themes</p>
            </div>
          </div>

          <div className="space-y-3">
            {themes.map(theme => {
              const items = feedbackItems.filter(f => f.theme === theme)
              const isCollapsed = collapsedThemes[theme]
              return (
                <div key={theme} className="bg-white rounded-[10px] border border-gray-200 overflow-hidden">
                  {/* Theme header */}
                  <button
                    onClick={() => toggleTheme(theme)}
                    className="w-full flex items-center gap-2.5 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer border-none text-left"
                  >
                    {isCollapsed ? <ChevronRight size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                    <span className="font-semibold text-[0.82rem] text-gray-900">{theme}</span>
                    <span className="text-[0.7rem] text-gray-500 ml-1">{items.length} items</span>
                  </button>

                  {/* Items */}
                  {!isCollapsed && (
                    <div>
                      {items.map(item => (
                        <div
                          key={item.id}
                          onClick={() => setSelectedId(item.id)}
                          className={cn(
                            'flex items-center gap-3 px-4 py-2.5 border-t border-gray-100 cursor-pointer transition-colors',
                            selectedId === item.id ? 'bg-gray-50' : 'hover:bg-gray-50/60'
                          )}
                        >
                          {/* Type tag */}
                          <Badge variant={typeVariant[item.type]} className="text-[0.6rem] w-14 justify-center flex-shrink-0">
                            {item.type}
                          </Badge>

                          {/* Title */}
                          <span className={cn('text-[0.82rem] flex-1 min-w-0 truncate', selectedId === item.id ? 'font-semibold text-gray-900' : 'text-gray-700')}>
                            {item.title}
                          </span>

                          {/* Association dots */}
                          <div className="flex -space-x-1 flex-shrink-0">
                            {item.associations.map((a, i) => (
                              <span key={i} className="w-2.5 h-2.5 rounded-full border-2 border-white" style={{ background: a.planColor }} title={a.name} />
                            ))}
                          </div>

                          {/* Source threads count */}
                          {item.sourceThreads.length > 0 && (
                            <span className="flex items-center gap-0.5 text-[0.7rem] text-gray-400 flex-shrink-0">
                              <MessageCircle size={12} />
                              {item.sourceThreads.length}
                            </span>
                          )}

                          {/* Status pill */}
                          <Badge variant={statusConfig[item.status].variant} className="text-[0.6rem] flex-shrink-0">
                            {statusConfig[item.status].label}
                          </Badge>

                          {/* Votes */}
                          <span className="flex items-center gap-0.5 text-[0.7rem] text-gray-500 font-semibold w-8 justify-end flex-shrink-0">
                            <ThumbsUp size={12} />
                            {item.votes}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Right — detail panel */}
      {selectedItem && (
        <div className="w-96 border-l border-gray-200 bg-white overflow-y-auto flex-shrink-0">
          <div className="p-5">
            {/* Header */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={typeVariant[selectedItem.type]}>{selectedItem.type}</Badge>
                <Badge variant={statusConfig[selectedItem.status].variant}>{statusConfig[selectedItem.status].label}</Badge>
              </div>
              <h3 className="font-serif text-lg font-bold mb-2">{selectedItem.title}</h3>
              <p className="text-[0.82rem] text-gray-600 leading-relaxed">{selectedItem.description}</p>
            </div>

            {/* Votes */}
            <div className="flex items-center gap-2 mb-5 pb-4 border-b border-gray-200">
              <ThumbsUp size={16} className="text-gray-400" />
              <span className="text-[0.82rem] font-semibold">{selectedItem.votes} votes</span>
            </div>

            {/* Status changer */}
            <div className="mb-5">
              <h4 className="text-[0.78rem] font-semibold text-gray-700 mb-2">Status</h4>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(statusConfig) as FeedbackStatus[]).map(s => (
                  <Button
                    key={s}
                    variant={selectedItem.status === s ? 'primary' : 'secondary'}
                    size="xs"
                  >
                    {statusConfig[s].label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Association Signals */}
            <div className="mb-5">
              <h4 className="text-[0.78rem] font-semibold text-gray-700 mb-2">Association Signals ({selectedItem.associations.length})</h4>
              <div className="space-y-2">
                {selectedItem.associations.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: a.planColor }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[0.78rem] font-semibold text-gray-700 truncate">{a.name}</div>
                      <div className="text-[0.65rem] text-gray-500">{a.plan} · {a.units} units</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Source Threads */}
            <div>
              <h4 className="text-[0.78rem] font-semibold text-gray-700 mb-2">Source Threads ({selectedItem.sourceThreads.length})</h4>
              {selectedItem.sourceThreads.length === 0 ? (
                <div className="text-[0.78rem] text-gray-400 p-2">No linked support threads.</div>
              ) : (
                <div className="space-y-1.5">
                  {selectedItem.sourceThreads.map(t => (
                    <div key={t.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                      <MessageCircle size={14} className="text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[0.78rem] font-semibold text-gray-700 truncate">{t.subject}</div>
                        <div className="text-[0.65rem] text-gray-500">{t.association}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
