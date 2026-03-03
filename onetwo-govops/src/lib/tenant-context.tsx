'use client'
import { createContext, useContext } from 'react'

interface TenantContextType {
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
  canAccess: (atomId: string) => boolean
  canWrite: (atomId: string) => boolean
  accessibleModules: string[]
}

const TenantContext = createContext<TenantContextType | null>(null)

export function TenantProvider({ value, children }: { value: TenantContextType, children: React.ReactNode }) {
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant() {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant must be used within TenantProvider')
  return ctx
}
