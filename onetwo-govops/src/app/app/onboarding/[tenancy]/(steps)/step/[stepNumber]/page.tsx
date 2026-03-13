import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  getOnboardingChecklist,
  getBuildingProfile,
  getBoardMembers,
  getManagementInfo,
  getLegalCounsel,
  getLegalDocuments,
  getUnits,
  getChartOfAccounts,
  getBudgetCategories,
  getReserveItems,
  getFinancialSettings,
  getExistingUsers,
  getTenantFeatures,
  getUserRoles,
} from '../../../actions'

import { Step1BuildingProfile } from '@/components/onboarding/steps/Step1BuildingProfile'
import { Step2Governance } from '@/components/onboarding/steps/Step2Governance'
import { Step3LegalCompliance } from '@/components/onboarding/steps/Step3LegalCompliance'
import { Step4UnitRoster } from '@/components/onboarding/steps/Step4UnitRoster'
import { Step5FinancialSetup } from '@/components/onboarding/steps/Step5FinancialSetup'
import { Step6PaymentSetup } from '@/components/onboarding/steps/Step6PaymentSetup'
import { Step7InviteUsers } from '@/components/onboarding/steps/Step7InviteUsers'
import { Step8ReviewSummary } from '@/components/onboarding/steps/Step8ReviewSummary'

export default async function StepPage({
  params,
}: {
  params: Promise<{ tenancy: string; stepNumber: string }>
}) {
  const { tenancy: slug, stepNumber: stepStr } = await params
  const stepNum = parseInt(stepStr, 10)

  if (isNaN(stepNum) || stepNum < 1 || stepNum > 8) {
    redirect(`/app/onboarding/${slug}`)
  }

  const supabase = await createServerSupabase()
  const { data: tenancy } = await supabase
    .from('tenancies')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!tenancy) redirect(`/app/${slug}`)

  const tenancyId = tenancy.id
  const checklist = await getOnboardingChecklist(tenancyId)

  switch (stepNum) {
    case 1: {
      const profile = await getBuildingProfile(tenancyId)
      return (
        <Step1BuildingProfile
          tenancyId={tenancyId}
          tenancySlug={slug}
          initialData={profile}
        />
      )
    }

    case 2: {
      const [boardMembers, managementInfo, legalCounsel] = await Promise.all([
        getBoardMembers(tenancyId),
        getManagementInfo(tenancyId),
        getLegalCounsel(tenancyId),
      ])
      return (
        <Step2Governance
          tenancyId={tenancyId}
          tenancySlug={slug}
          initialBoardMembers={boardMembers}
          initialManagementInfo={managementInfo}
          initialLegalCounsel={legalCounsel}
        />
      )
    }

    case 3: {
      const documents = await getLegalDocuments(tenancyId)
      return (
        <Step3LegalCompliance
          tenancyId={tenancyId}
          tenancySlug={slug}
          initialDocuments={documents}
        />
      )
    }

    case 4: {
      const units = await getUnits(tenancyId)
      return (
        <Step4UnitRoster
          tenancyId={tenancyId}
          tenancySlug={slug}
          initialUnits={units}
        />
      )
    }

    case 5: {
      const [accounts, categories, reserves, settings] = await Promise.all([
        getChartOfAccounts(tenancyId),
        getBudgetCategories(tenancyId),
        getReserveItems(tenancyId),
        getFinancialSettings(tenancyId),
      ])
      return (
        <Step5FinancialSetup
          tenancyId={tenancyId}
          tenancySlug={slug}
          initialAccounts={accounts}
          initialCategories={categories}
          initialReserves={reserves}
          initialSettings={settings}
        />
      )
    }

    case 6: {
      const [settings, features] = await Promise.all([
        getFinancialSettings(tenancyId),
        getTenantFeatures(tenancyId),
      ])
      if (!features?.payment_processing) {
        redirect(`/app/onboarding/${slug}/step/7`)
      }
      return (
        <Step6PaymentSetup
          tenancyId={tenancyId}
          tenancySlug={slug}
          initialSettings={settings}
        />
      )
    }

    case 7: {
      const [users, roles] = await Promise.all([
        getExistingUsers(tenancyId),
        getUserRoles(),
      ])
      return (
        <Step7InviteUsers
          tenancyId={tenancyId}
          tenancySlug={slug}
          initialUsers={users}
          roles={roles}
        />
      )
    }

    case 8: {
      const features = await getTenantFeatures(tenancyId)
      return (
        <Step8ReviewSummary
          tenancyId={tenancyId}
          tenancySlug={slug}
          checklist={checklist}
          showPaymentStep={features?.payment_processing ?? false}
        />
      )
    }

    default:
      redirect(`/app/onboarding/${slug}`)
  }
}
