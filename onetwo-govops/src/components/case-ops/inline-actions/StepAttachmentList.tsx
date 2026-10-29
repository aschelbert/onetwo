'use client'

import { FileText } from 'lucide-react'
import { getAttachmentSignedUrl } from '@/app/app/[tenancy]/boardroom/cases/[caseId]/inline-actions'
import type { StepAttachment } from '@/types/inline-actions'

interface Props {
  attachments: StepAttachment[]
}

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function StepAttachmentList({ attachments }: Props) {
  if (attachments.length === 0) return null

  const handleClick = async (att: StepAttachment) => {
    const url = await getAttachmentSignedUrl(att.storage_path)
    window.open(url, '_blank')
  }

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {attachments.map((att) => (
        <button
          key={att.id}
          onClick={() => handleClick(att)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#f8f9fa] border border-[#e6e8eb] rounded-lg text-[11px] text-[#45505a] hover:border-[#929da8] transition-colors"
        >
          <FileText size={12} className="text-[#6e7b8a] shrink-0" />
          <span className="truncate max-w-[140px]">{att.file_name}</span>
          {att.file_size && (
            <span className="text-[#929da8] shrink-0">{formatSize(att.file_size)}</span>
          )}
        </button>
      ))}
    </div>
  )
}
