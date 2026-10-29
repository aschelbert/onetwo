'use client'

import { useState, useEffect, useTransition } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { FileUploader, FileListItem } from '@/components/onboarding/shared/FileUploader'
import {
  uploadStepAttachment,
  deleteStepAttachment,
  getStepAttachments,
  getAttachmentSignedUrl,
} from '@/app/app/[tenancy]/boardroom/cases/[caseId]/inline-actions'
import type { StepAttachment } from '@/types/inline-actions'
import { Download } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  caseId: string
  stepNumber: number
  tenantId: string
  onAttachmentsChange?: (attachments: StepAttachment[]) => void
}

export function UploadDocumentDialog({ open, onClose, caseId, stepNumber, tenantId, onAttachmentsChange }: Props) {
  const [attachments, setAttachments] = useState<StepAttachment[]>([])
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      getStepAttachments(caseId, stepNumber).then((atts) => {
        setAttachments(atts)
      })
    }
  }, [open, caseId, stepNumber])

  const handleUpload = async (formData: FormData) => {
    const newAtt = await uploadStepAttachment(caseId, stepNumber, tenantId, formData)
    const updated = [newAtt, ...attachments]
    setAttachments(updated)
    onAttachmentsChange?.(updated)
  }

  const handleDelete = (att: StepAttachment) => {
    startTransition(async () => {
      await deleteStepAttachment(att.id)
      const updated = attachments.filter((a) => a.id !== att.id)
      setAttachments(updated)
      onAttachmentsChange?.(updated)
    })
  }

  const handleDownload = async (att: StepAttachment) => {
    const url = await getAttachmentSignedUrl(att.storage_path)
    window.open(url, '_blank')
  }

  return (
    <Dialog open={open} onClose={onClose} title="Upload Document" size="sm">
      <FileUploader
        onUpload={handleUpload}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png"
        label="Upload a document for this step"
      />

      {attachments.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-[10px] font-bold text-[#929da8] uppercase tracking-[0.08em]">
            Attached Files
          </p>
          {attachments.map((att) => (
            <div key={att.id} className="flex items-center gap-2">
              <div className="flex-1">
                <FileListItem
                  name={att.file_name}
                  size={att.file_size}
                  onRemove={() => handleDelete(att)}
                />
              </div>
              <button
                onClick={() => handleDownload(att)}
                className="text-[#929da8] hover:text-[#45505a] transition-colors shrink-0 p-1"
                title="Download"
              >
                <Download size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  )
}
