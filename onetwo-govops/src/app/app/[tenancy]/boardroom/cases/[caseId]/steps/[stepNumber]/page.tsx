import { getStepResponse, getCaseById } from '../actions'
import { Step2ReserveStudy } from '@/components/case-ops/steps/Step2ReserveStudy'
import { CaseUnitLedger } from '@/components/case-ops/steps/shared/CaseUnitLedger'
import type { Step2Data } from '@/types/case-steps'

export default async function StepPage({
  params,
}: {
  params: Promise<{ tenancy: string; caseId: string; stepNumber: string }>
}) {
  const { caseId, stepNumber: stepNumberStr } = await params
  const stepNum = parseInt(stepNumberStr, 10)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [response, caseData] = await Promise.all([
    getStepResponse(caseId, stepNum) as any,
    getCaseById(caseId),
  ])

  // ── Delinquent Accounts — Step 1: Verify delinquency ────────────────────
  if (caseData.sit_id === 'delinquent-accounts' && stepNum === 1) {
    return (
      <div className="px-7 py-[18px] pb-8">
        <CaseUnitLedger unitId={caseData.unit} tenantId={caseData.tenant_id} />
      </div>
    )
  }

  // ── Annual Budgeting — Step 2: Reserve Study ────────────────────────────
  if (stepNum === 2) {
    return (
      <Step2ReserveStudy
        caseId={caseId}
        initialData={(response?.step_data as Partial<Step2Data>) ?? {}}
        confirmedSections={(response?.confirmed_sections as string[]) ?? []}
        isComplete={response?.is_complete ?? false}
        caseTitle={caseData.title}
        caseLocalId={caseData.local_id}
        caseStatus={caseData.status}
        stepNumber={stepNum}
      />
    )
  }

  // fallback for other steps
  return <div>Step {stepNum}</div>
}
