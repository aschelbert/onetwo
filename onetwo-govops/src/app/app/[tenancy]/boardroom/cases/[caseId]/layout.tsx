import { getCaseById } from './steps/actions'
import { CaseChatWrapper } from '@/components/case-ops/CaseChatWrapper'

export default async function CaseLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ tenancy: string; caseId: string }>
}) {
  const { caseId } = await params
  const caseData = await getCaseById(caseId)

  return (
    <CaseChatWrapper
      caseId={caseId}
      caseTitle={caseData.title}
      caseLocalId={caseData.local_id}
      caseStatus={caseData.status}
    >
      {children}
    </CaseChatWrapper>
  )
}
