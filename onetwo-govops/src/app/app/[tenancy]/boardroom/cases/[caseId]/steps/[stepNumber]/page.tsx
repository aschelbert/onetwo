import { getStepResponse, getCaseById, getCaseStepDef } from '../actions'
import { Step2ReserveStudy } from '@/components/case-ops/steps/Step2ReserveStudy'
import { CaseUnitLedger } from '@/components/case-ops/steps/shared/CaseUnitLedger'
import { StepDescriptionCard } from '@/components/case-ops/steps/shared/StepDescriptionCard'
import { MarkCompleteCard } from '@/components/case-ops/steps/shared/MarkCompleteCard'
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
    // sort_order is 0-based in case_steps, stepNum is 1-based
    const stepDef = await getCaseStepDef(caseId, stepNum - 1)

    return (
      <div className="px-7 py-[18px] pb-8">
        {/* Mark Complete */}
        <MarkCompleteCard
          stepNumber={stepNum}
          isComplete={response?.is_complete ?? false}
          canComplete={response?.is_complete ?? false}
          onComplete={() => {}}
        />

        {/* Step description */}
        <StepDescriptionCard
          question={stepDef?.step_text ?? 'Verify delinquency and confirm amount owed'}
          timeline={stepDef?.timing ?? 'Immediately upon missed payment'}
          reference={stepDef?.doc_ref ?? 'Assessment ledger & Bylaws'}
          guidance={stepDef?.detail ?? 'Pull the owner\'s full ledger history. Verify the assessment amount is correct per the budget resolution and payments were properly applied.'}
        />

        {/* Unit Ledger — ABOVE checklist, BELOW description */}
        {caseData.unit && (
          <CaseUnitLedger unitId={caseData.unit} tenantId={caseData.tenant_id} />
        )}
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
