'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Shield } from 'lucide-react'
import {
  BOARD_ROLE_RESPONSIBILITIES,
  UNIT_OWNER_RESPONSIBILITIES,
  FIDUCIARY_LABELS,
} from '@/lib/data/roleResponsibilities'
import type { BoardMember } from '@/types/onboarding'
import type { FiduciaryDuty } from '@/lib/data/roleResponsibilities'

interface Props {
  boardMembers: BoardMember[]
}

function FiduciaryBadge({ duty }: { duty: FiduciaryDuty }) {
  const { label, color, bg } = FIDUCIARY_LABELS[duty]
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
      style={{ color, backgroundColor: bg }}
    >
      <Shield size={10} />
      {label}
    </span>
  )
}

function RoleCard({
  role,
  assignedMember,
}: {
  role: (typeof BOARD_ROLE_RESPONSIBILITIES)[number]
  assignedMember: BoardMember | undefined
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white rounded-[10px] border border-[#e6e8eb] overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#f8f9fa] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          {expanded ? (
            <ChevronDown size={16} className="text-[#929da8] shrink-0" />
          ) : (
            <ChevronRight size={16} className="text-[#929da8] shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-semibold text-[#1a1f25]">
                {role.title}
              </span>
              {assignedMember && (
                <span className="text-[12px] text-[#6e7b8a]">
                  {assignedMember.name}
                </span>
              )}
            </div>
          </div>
        </div>
        <FiduciaryBadge duty={role.fiduciaryFocus} />
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-[#f0f1f3]">
          <div className="space-y-4 pt-4">
            {role.responsibilities.map(group => (
              <div key={group.category}>
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="text-[12px] font-semibold text-[#45505a] uppercase tracking-wide">
                    {group.category}
                  </h4>
                  {group.fiduciaryDuty && (
                    <FiduciaryBadge duty={group.fiduciaryDuty} />
                  )}
                </div>
                <ul className="space-y-1.5 ml-1">
                  {group.items.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[13px] text-[#1a1f25]"
                    >
                      <span className="text-[#929da8] mt-1.5 shrink-0 w-1 h-1 rounded-full bg-[#929da8]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function WhoDoesWhatSection({ boardMembers }: Props) {
  const memberByRole = new Map<string, BoardMember>()
  for (const m of boardMembers) {
    if (!memberByRole.has(m.role)) {
      memberByRole.set(m.role, m)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-[16px] font-semibold text-[#1a1f25]">
          Who Does What
        </h2>
        <p className="text-[13px] text-[#6e7b8a] mt-1">
          Board governance is a shared stewardship. Each role carries specific
          fiduciary duties and responsibilities to the association and its members.
        </p>
      </div>

      {/* Board Responsibilities */}
      <div className="space-y-3">
        <h3 className="text-[13px] font-semibold text-[#45505a] uppercase tracking-wide">
          Board Responsibilities
        </h3>
        {BOARD_ROLE_RESPONSIBILITIES.map(role => (
          <RoleCard
            key={role.roleKey}
            role={role}
            assignedMember={memberByRole.get(role.roleKey)}
          />
        ))}
      </div>

      {/* Unit Owner Responsibilities */}
      <div className="space-y-3">
        <h3 className="text-[13px] font-semibold text-[#45505a] uppercase tracking-wide">
          Unit Owner Responsibilities
        </h3>
        <div className="bg-white rounded-[10px] border border-[#e6e8eb] p-5">
          <p className="text-[13px] text-[#6e7b8a] mb-4">
            Every owner shares in the stewardship of the building. These
            responsibilities help maintain property values and community standards.
          </p>
          <div className="space-y-4">
            {UNIT_OWNER_RESPONSIBILITIES.map(group => (
              <div key={group.category}>
                <h4 className="text-[12px] font-semibold text-[#45505a] uppercase tracking-wide mb-2">
                  {group.category}
                </h4>
                <ul className="space-y-1.5 ml-1">
                  {group.items.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[13px] text-[#1a1f25]"
                    >
                      <span className="text-[#929da8] mt-1.5 shrink-0 w-1 h-1 rounded-full bg-[#929da8]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
