'use client'
import { createContext, useContext, useMemo } from 'react'

interface TenantContextInput {
  tenancy: {
    id: string
    name: string
    slug: string
    subscription_id: string
  }
  user: {
    id: string
    email: string
    display_name: string
    role_id: string
    role_name: string
  }
  permissions: {
    atom_type: string
    atom_id: string
    atom_name: string
    module_name: string
    effective_access: string
  }[]
  accessibleModules: string[]
  isPlatformAdmin?: boolean
}

interface TenantContextType extends TenantContextInput {
  canAccess: (atomId: string) => boolean
  canWrite: (atomId: string) => boolean
}

const TenantContext = createContext<TenantContextType | null>(null)

export function TenantProvider({ value, children }: { value: TenantContextInput, children: React.ReactNode }) {
  const ctx = useMemo<TenantContextType>(() => ({
    ...value,
    canAccess: (atomId: string) => {
      const p = value.permissions.find(x => x.atom_id === atomId)
      return !!p && p.effective_access !== 'not_entitled' && p.effective_access !== 'no_access'
    },
    canWrite: (atomId: string) => {
      const p = value.permissions.find(x => x.atom_id === atomId)
      return p?.effective_access === 'contributor'
    },
  }), [value])

  return <TenantContext.Provider value={ctx}>{children}</TenantContext.Provider>
}

export function useTenant() {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant must be used within TenantProvider')
  return ctx
}
