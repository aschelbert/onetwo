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

// The tenant nav still uses its original page names. The module registry is
// now grouped by the product's modules, so each nav entry maps to the
// registry module that governs it.
const REGISTRY_MODULE: Record<string, string> = {
  'Board Room': 'Board Room',
  'The Building': 'Building',
  'The Archives': 'Building',
  'Fiscal Lens': 'Funds',
  'Community Room': 'Community',
  'Association Team': 'Community',
  'Account Management': 'Me',
}

/** Whether a tenant nav entry is open to the user, given the registry modules they can reach. */
export function navModuleAccessible(accessibleModules: string[], navModule: string): boolean {
  return accessibleModules.includes(REGISTRY_MODULE[navModule] ?? navModule)
}
