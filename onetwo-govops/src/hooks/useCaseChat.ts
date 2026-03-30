'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTenant } from '@/lib/tenant-context'
import type { CaseChatState, CaseMessage, ThreadType } from '@/types/caseChat'
import {
  getOrCreateThread,
  fetchMessages,
  sendMessage,
  subscribeToThread,
  markMessagesRead,
} from '@/lib/caseChat'

/** Map role_id / role_name from tenant context to chat sender_role */
function mapSenderRole(roleId: string): string {
  const id = roleId.toLowerCase()
  if (id.includes('board') || id.includes('president') || id.includes('treasurer') || id.includes('secretary')) return 'board'
  if (id.includes('property_manager') || id.includes('pm') || id.includes('staff')) return 'pm'
  if (id.includes('resident') || id.includes('owner')) return 'owner'
  return 'board'
}

export function useCaseChat(caseId: string) {
  const { tenancy, user } = useTenant()

  const [state, setState] = useState<CaseChatState>({
    isOpen: false,
    activeThread: 'internal',
    threads: { internal: null, owner: null },
    messages: { internal: [], owner: [] },
    unreadCounts: { internal: 0, owner: 0 },
    isSending: false,
    isLoading: false,
  })

  const unsubscribeRefs = useRef<Record<string, () => void>>({})

  const loadThread = useCallback(async (threadType: ThreadType) => {
    if (!caseId || !tenancy?.id) return

    const thread = await getOrCreateThread(caseId, tenancy.id, threadType)
    const messages = await fetchMessages(thread.id)

    setState(s => ({
      ...s,
      threads: { ...s.threads, [threadType]: thread },
      messages: { ...s.messages, [threadType]: messages },
      unreadCounts: { ...s.unreadCounts, [threadType]: 0 },
    }))

    // Subscribe to realtime if not already subscribed
    if (!unsubscribeRefs.current[threadType]) {
      const unsub = subscribeToThread(thread.id, (newMsg) => {
        setState(s => ({
          ...s,
          messages: {
            ...s.messages,
            [threadType]: [...s.messages[threadType], newMsg],
          },
          unreadCounts: {
            ...s.unreadCounts,
            [threadType]: s.isOpen && s.activeThread === threadType
              ? s.unreadCounts[threadType]
              : s.unreadCounts[threadType] + 1,
          },
        }))
      })
      unsubscribeRefs.current[threadType] = unsub
    }
  }, [caseId, tenancy?.id])

  const openChat = useCallback(async (threadType: ThreadType = 'internal') => {
    setState(s => ({ ...s, isOpen: true, activeThread: threadType, isLoading: true }))
    await loadThread(threadType)
    setState(s => ({ ...s, isLoading: false }))
  }, [loadThread])

  const closeChat = useCallback(() => {
    setState(s => ({ ...s, isOpen: false }))
  }, [])

  const switchThread = useCallback(async (threadType: ThreadType) => {
    setState(s => ({ ...s, activeThread: threadType, isLoading: true }))
    await loadThread(threadType)
    setState(s => ({ ...s, isLoading: false }))
  }, [loadThread])

  const send = useCallback(async (body: string, opts?: {
    msgType?: string
    eventMeta?: Record<string, unknown>
    attachmentUrl?: string
    attachmentName?: string
  }) => {
    if (!body.trim() && !opts?.eventMeta) return
    if (!user || !tenancy?.id) return

    // For event messages, ensure internal thread exists
    let thread = state.threads[state.activeThread]
    if (!thread && opts?.msgType === 'event') {
      thread = await getOrCreateThread(caseId, tenancy.id, 'internal')
      setState(s => ({
        ...s,
        threads: { ...s.threads, internal: thread },
      }))
    }
    if (!thread) return

    setState(s => ({ ...s, isSending: true }))
    try {
      await sendMessage({
        threadId: thread.id,
        caseId,
        tenantId: tenancy.id,
        senderId: user.id,
        senderName: user.display_name || 'Board Member',
        senderRole: mapSenderRole(user.role_id),
        body: body.trim(),
        msgType: opts?.msgType,
        eventMeta: opts?.eventMeta,
        attachmentUrl: opts?.attachmentUrl,
        attachmentName: opts?.attachmentName,
      })
    } finally {
      setState(s => ({ ...s, isSending: false }))
    }
  }, [state.activeThread, state.threads, caseId, user, tenancy?.id])

  // Cleanup subscriptions on unmount or case change
  useEffect(() => {
    return () => {
      Object.values(unsubscribeRefs.current).forEach(unsub => unsub())
      unsubscribeRefs.current = {}
    }
  }, [caseId])

  return { ...state, openChat, closeChat, switchThread, send }
}
