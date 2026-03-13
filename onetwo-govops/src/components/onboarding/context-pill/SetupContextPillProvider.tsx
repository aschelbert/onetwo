'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import type { SetupContextPillState } from '@/types/onboarding'

const PILL_STORAGE_KEY = 'setup-context-pill'

interface PillContextType {
  pillState: SetupContextPillState | null
  dismissPill: () => void
}

const PillContext = createContext<PillContextType>({
  pillState: null,
  dismissPill: () => {},
})

export function usePillContext() {
  return useContext(PillContext)
}

export function SetupContextPillProvider({ children }: { children: React.ReactNode }) {
  const [pillState, setPillState] = useState<SetupContextPillState | null>(null)
  const pathname = usePathname()

  // Read from sessionStorage on mount and pathname changes
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(PILL_STORAGE_KEY)
      if (stored) {
        setPillState(JSON.parse(stored))
      } else {
        setPillState(null)
      }
    } catch {
      setPillState(null)
    }
  }, [pathname])

  const dismissPill = useCallback(() => {
    try {
      sessionStorage.removeItem(PILL_STORAGE_KEY)
    } catch {
      // ignore
    }
    setPillState(null)
  }, [])

  const value = useMemo(() => ({ pillState, dismissPill }), [pillState, dismissPill])

  return (
    <PillContext.Provider value={value}>
      {children}
    </PillContext.Provider>
  )
}
