'use client'

import { useState, useCallback, useRef, useTransition } from 'react'
import { StepShell } from '../shared/StepShell'
import { Input, Select, FormGroup } from '@/components/ui/input'
import { saveBuildingProfile, updateChecklistStep } from '@/app/app/onboarding/[tenancy]/actions'
import type { BuildingProfileData } from '@/types/onboarding'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]

const ENTITY_TYPES = [
  { value: 'incorporated', label: 'Incorporated Association' },
  { value: 'unincorporated', label: 'Unincorporated Association' },
  { value: 'cooperative', label: 'Cooperative' },
  { value: 'condominium', label: 'Condominium Association' },
  { value: 'hoa', label: 'Homeowners Association' },
  { value: 'other', label: 'Other' },
]

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

interface Props {
  tenancyId: string
  tenancySlug: string
  initialData: BuildingProfileData
}

export function Step1BuildingProfile({ tenancyId, tenancySlug, initialData }: Props) {
  const [data, setData] = useState<BuildingProfileData>({
    name: initialData.name || '',
    address: (initialData as any).address || '',
    city: initialData.city || '',
    state: initialData.state || '',
    zip: initialData.zip || '',
    year_built: initialData.year_built || '',
    total_units: initialData.total_units ?? null,
    entity_type: initialData.entity_type || 'incorporated',
    fiscal_year_end_month: initialData.fiscal_year_end_month ?? 12,
  })
  const [, startTransition] = useTransition()
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  const autoSave = useCallback((updates: Partial<BuildingProfileData>) => {
    setData(prev => ({ ...prev, ...updates }))

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        await saveBuildingProfile(tenancyId, updates)
      })
    }, 800)
  }, [tenancyId])

  const immediateAutoSave = useCallback((updates: Partial<BuildingProfileData>) => {
    setData(prev => ({ ...prev, ...updates }))
    startTransition(async () => {
      await saveBuildingProfile(tenancyId, updates)
    })
  }, [tenancyId])

  const canProceed = !!data.name

  const handleSave = async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    await saveBuildingProfile(tenancyId, data)
    await updateChecklistStep(tenancyId, 'building_profile_complete', true)
  }

  return (
    <StepShell
      stepNumber={1}
      totalSteps={8}
      title="Building Profile"
      description="Set up your building's basic information, address, and property details."
      required
      tenancySlug={tenancySlug}
      canProceed={canProceed}
      onSave={handleSave}
    >
      <div className="bg-white border border-[#e6e8eb] rounded-[10px] p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-0">
          <FormGroup label="Building / Association Name *">
            <Input
              value={data.name}
              onChange={(e) => autoSave({ name: e.target.value })}
              placeholder="e.g. Sunset Ridge Condominiums"
            />
          </FormGroup>

          <FormGroup label="Entity Type">
            <Select
              value={data.entity_type}
              onChange={(e) => immediateAutoSave({ entity_type: e.target.value })}
            >
              {ENTITY_TYPES.map(et => (
                <option key={et.value} value={et.value}>{et.label}</option>
              ))}
            </Select>
          </FormGroup>

          <FormGroup label="Street Address" className="md:col-span-2">
            <Input
              value={(data as any).address || ''}
              onChange={(e) => autoSave({ address: e.target.value } as any)}
              placeholder="123 Main Street"
            />
          </FormGroup>

          <FormGroup label="City">
            <Input
              value={data.city}
              onChange={(e) => autoSave({ city: e.target.value })}
              placeholder="City"
            />
          </FormGroup>

          <div className="grid grid-cols-2 gap-4">
            <FormGroup label="State">
              <Select
                value={data.state}
                onChange={(e) => immediateAutoSave({ state: e.target.value })}
              >
                <option value="">Select...</option>
                {US_STATES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </FormGroup>

            <FormGroup label="ZIP Code">
              <Input
                value={data.zip}
                onChange={(e) => autoSave({ zip: e.target.value })}
                placeholder="12345"
                maxLength={10}
              />
            </FormGroup>
          </div>

          <FormGroup label="Year Built">
            <Input
              value={data.year_built}
              onChange={(e) => autoSave({ year_built: e.target.value })}
              placeholder="e.g. 1998"
              maxLength={4}
            />
          </FormGroup>

          <FormGroup label="Total Units">
            <Input
              type="number"
              value={data.total_units ?? ''}
              onChange={(e) => autoSave({ total_units: e.target.value ? parseInt(e.target.value) : null })}
              placeholder="e.g. 120"
              min={1}
            />
          </FormGroup>

          <FormGroup label="Fiscal Year End Month">
            <Select
              value={data.fiscal_year_end_month}
              onChange={(e) => immediateAutoSave({ fiscal_year_end_month: parseInt(e.target.value) })}
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </Select>
          </FormGroup>
        </div>
      </div>
    </StepShell>
  )
}
