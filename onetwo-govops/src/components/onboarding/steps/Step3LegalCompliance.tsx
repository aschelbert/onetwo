'use client'

import { useState, useTransition } from 'react'
import { StepShell } from '../shared/StepShell'
import { FileUploader, FileListItem } from '../shared/FileUploader'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Input, Select, FormGroup } from '@/components/ui/input'
import {
  uploadLegalDocument,
  deleteLegalDocument,
  saveBylawsRules,
  updateChecklistStep,
} from '@/app/app/onboarding/[tenancy]/actions'
import type { LegalDocument, BylawsRules } from '@/types/onboarding'

const DOC_TYPES = [
  { value: 'bylaws', label: 'Bylaws' },
  { value: 'cc_and_r', label: 'CC&Rs' },
  { value: 'rules_regulations', label: 'Rules & Regulations' },
  { value: 'declaration', label: 'Declaration' },
  { value: 'articles_of_incorporation', label: 'Articles of Incorporation' },
  { value: 'insurance_certificate', label: 'Insurance Certificate' },
  { value: 'other', label: 'Other' },
]

interface Props {
  tenancyId: string
  tenancySlug: string
  initialDocuments: LegalDocument[]
}

export function Step3LegalCompliance({ tenancyId, tenancySlug, initialDocuments }: Props) {
  const [documents, setDocuments] = useState<LegalDocument[]>(initialDocuments)
  const [selectedDocType, setSelectedDocType] = useState('bylaws')
  const [bylawsRules, setBylawsRules] = useState<BylawsRules>(() => {
    const bylawsDoc = initialDocuments.find(d => d.doc_type === 'bylaws')
    return bylawsDoc?.bylaws_rules || {
      quorum_percentage: null,
      amendment_threshold: null,
      annual_meeting_month: null,
      assessment_increase_cap: null,
    }
  })
  const [, startTransition] = useTransition()

  const handleUpload = async (formData: FormData) => {
    formData.append('doc_type', selectedDocType)
    await uploadLegalDocument(tenancyId, formData)
    // Re-fetch would be ideal but for now we add locally
    const file = formData.get('file') as File
    setDocuments(prev => [{
      id: crypto.randomUUID(),
      tenancy_id: tenancyId,
      name: file.name,
      doc_type: selectedDocType,
      version: null,
      file_size: file.size,
      status: 'active',
      storage_path: `${tenancyId}/${file.name}`,
      bylaws_rules: null,
      created_at: new Date().toISOString(),
    }, ...prev])
  }

  const handleRemove = async (doc: LegalDocument) => {
    if (!doc.storage_path) return
    await deleteLegalDocument(doc.id, doc.storage_path)
    setDocuments(prev => prev.filter(d => d.id !== doc.id))
  }

  const handleBylawsRulesChange = (field: keyof BylawsRules, value: string) => {
    const numValue = value === '' ? null : parseFloat(value)
    setBylawsRules(prev => ({ ...prev, [field]: numValue }))

    const bylawsDoc = documents.find(d => d.doc_type === 'bylaws')
    if (bylawsDoc) {
      startTransition(async () => {
        await saveBylawsRules(tenancyId, bylawsDoc.id, { ...bylawsRules, [field]: numValue })
      })
    }
  }

  const handleSave = async () => {
    if (documents.length > 0) {
      await updateChecklistStep(tenancyId, 'bylaws_uploaded', true)
    }
  }

  return (
    <StepShell
      stepNumber={3}
      totalSteps={8}
      title="Legal & Compliance"
      description="Upload governing documents and configure bylaws rules."
      required={false}
      tenancySlug={tenancySlug}
      onSave={handleSave}
    >
      <div className="space-y-5">
        {/* Document Upload */}
        <Card>
          <CardHeader>
            <span className="text-[14px] font-semibold text-[#1a1f25]">Governing Documents</span>
          </CardHeader>
          <CardBody>
            <div className="mb-4">
              <FormGroup label="Document Type">
                <Select value={selectedDocType} onChange={e => setSelectedDocType(e.target.value)}>
                  {DOC_TYPES.map(dt => (
                    <option key={dt.value} value={dt.value}>{dt.label}</option>
                  ))}
                </Select>
              </FormGroup>
            </div>

            <FileUploader
              onUpload={handleUpload}
              accept=".pdf,.doc,.docx"
              label="Upload governing document (PDF)"
            />

            {documents.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-[11px] font-bold text-[#929da8] uppercase tracking-[0.08em]">
                  Uploaded Documents ({documents.length})
                </p>
                {documents.map(doc => (
                  <FileListItem
                    key={doc.id}
                    name={`${doc.name} (${DOC_TYPES.find(dt => dt.value === doc.doc_type)?.label || doc.doc_type})`}
                    size={doc.file_size}
                    onRemove={() => handleRemove(doc)}
                  />
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Bylaws Rules */}
        <Card>
          <CardHeader>
            <span className="text-[14px] font-semibold text-[#1a1f25]">Bylaws Key Rules</span>
          </CardHeader>
          <CardBody>
            <p className="text-[12px] text-[#6e7b8a] mb-4">
              Enter key thresholds from your governing documents. These will be used to validate governance actions.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-0">
              <FormGroup label="Quorum Percentage (%)">
                <Input
                  type="number"
                  value={bylawsRules.quorum_percentage ?? ''}
                  onChange={e => handleBylawsRulesChange('quorum_percentage', e.target.value)}
                  placeholder="e.g. 51"
                  min={0}
                  max={100}
                />
              </FormGroup>
              <FormGroup label="Amendment Threshold (%)">
                <Input
                  type="number"
                  value={bylawsRules.amendment_threshold ?? ''}
                  onChange={e => handleBylawsRulesChange('amendment_threshold', e.target.value)}
                  placeholder="e.g. 67"
                  min={0}
                  max={100}
                />
              </FormGroup>
              <FormGroup label="Annual Meeting Month">
                <Select
                  value={bylawsRules.annual_meeting_month ?? ''}
                  onChange={e => handleBylawsRulesChange('annual_meeting_month', e.target.value)}
                >
                  <option value="">Select...</option>
                  {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </Select>
              </FormGroup>
              <FormGroup label="Assessment Increase Cap (%)">
                <Input
                  type="number"
                  value={bylawsRules.assessment_increase_cap ?? ''}
                  onChange={e => handleBylawsRulesChange('assessment_increase_cap', e.target.value)}
                  placeholder="e.g. 10"
                  min={0}
                />
              </FormGroup>
            </div>
          </CardBody>
        </Card>
      </div>
    </StepShell>
  )
}
