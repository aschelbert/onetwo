import { getStepResponse } from '../actions'
import { Step2ReserveStudy } from '@/components/case-ops/steps/Step2ReserveStudy'
import type { Step2Data } from '@/types/case-steps'

export default async function StepPage({
  params,
}: {
  params: Promise<{ tenancy: string; caseId: string; stepNumber: string }>
}) {
  const { caseId, stepNumber: stepNumberStr } = await params
  const stepNum = parseInt(stepNumberStr, 10)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await getStepResponse(caseId, stepNum) as any

  if (stepNum === 2) {
    return (
      <Step2ReserveStudy
        caseId={caseId}
        initialData={(response?.step_data as Partial<Step2Data>) ?? {}}
        confirmedSections={(response?.confirmed_sections as string[]) ?? []}
        isComplete={response?.is_complete ?? false}
      />
    )
  }

  // fallback for other steps
  return <div>Step {stepNum}</div>
}
