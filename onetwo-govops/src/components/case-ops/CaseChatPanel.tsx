'use client'

import { useEffect } from 'react'
import { CaseChatHeader } from './CaseChatHeader'
import { CaseChatThread } from './CaseChatThread'
import { CaseChatInput } from './CaseChatInput'
import type { useCaseChat } from '@/hooks/useCaseChat'

const NAV_HEIGHT = 58 // must match TopNav height

interface Props {
  caseId: string
  caseTitle: string
  caseLocalId: string
  caseStatus: string
  activeStep: string
  canSeeInternal: boolean
  chat: ReturnType<typeof useCaseChat>
}

export function CaseChatPanel({ caseId, caseTitle, caseLocalId, caseStatus, activeStep, canSeeInternal, chat }: Props) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') chat.closeChat() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [chat.closeChat])

  return (
    <>
      {/* Backdrop on mobile only */}
      {chat.isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-30 sm:hidden"
          onClick={chat.closeChat}
        />
      )}

      <div
        className={[
          'fixed right-0 bottom-0 z-40',
          'flex flex-col bg-white',
          'border-l border-[#e6e8eb]',
          'transition-transform duration-[250ms] ease-in-out',
          'w-full sm:w-80',
          chat.isOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
        style={{ top: NAV_HEIGHT }}
        aria-label="Case chat panel"
        aria-hidden={!chat.isOpen}
      >
        <CaseChatHeader
          caseLocalId={caseLocalId}
          caseTitle={caseTitle}
          caseStatus={caseStatus}
          activeStep={activeStep}
          activeThread={chat.activeThread}
          onSwitchThread={chat.switchThread}
          onClose={chat.closeChat}
          canSeeInternal={canSeeInternal}
        />

        <CaseChatThread
          messages={chat.messages[chat.activeThread]}
          isLoading={chat.isLoading}
          activeThread={chat.activeThread}
        />

        <CaseChatInput
          activeThread={chat.activeThread}
          isSending={chat.isSending}
          onSend={chat.send}
          caseId={caseId}
        />
      </div>
    </>
  )
}
