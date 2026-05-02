'use client'

import { useCaseChat } from '@/hooks/useCaseChat'
import { useTenant } from '@/lib/tenant-context'
import { CaseChatPanel } from './CaseChatPanel'
import { CaseChatToggleButton } from './CaseChatToggleButton'

interface Props {
  caseId: string
  caseTitle: string
  caseLocalId: string
  caseStatus: string
  children: React.ReactNode
}

export function CaseChatWrapper({ caseId, caseTitle, caseLocalId, caseStatus, children }: Props) {
  const { user } = useTenant()
  const chat = useCaseChat(caseId)
  const totalUnread = chat.unreadCounts.internal + chat.unreadCounts.owner
  const canSeeInternal = ['BOARD_MEMBER', 'PROPERTY_MANAGER', 'STAFF'].includes(user.role_id?.toUpperCase() ?? '')

  return (
    <>
      {children}

      {/* Floating chat toggle — bottom-right corner */}
      <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-30">
        <CaseChatToggleButton
          isOpen={chat.isOpen}
          totalUnread={totalUnread}
          onClick={() => chat.isOpen ? chat.closeChat() : chat.openChat()}
        />
      </div>

      {/* Chat panel */}
      <CaseChatPanel
        caseId={caseId}
        caseTitle={caseTitle}
        caseLocalId={caseLocalId}
        caseStatus={caseStatus}
        activeStep=""
        canSeeInternal={canSeeInternal}
        chat={chat}
      />
    </>
  )
}
