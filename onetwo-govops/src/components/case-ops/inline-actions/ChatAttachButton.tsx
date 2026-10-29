'use client'

import { useRef, useState } from 'react'
import { uploadStepAttachment, getAttachmentSignedUrl } from '@/app/app/[tenancy]/boardroom/cases/[caseId]/inline-actions'
import { Paperclip } from 'lucide-react'

interface Props {
  caseId: string
  tenantId: string
  onAttached: (attachmentUrl: string, attachmentName: string) => void
}

export function ChatAttachButton({ caseId, tenantId, onAttached }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      // step_number 0 = case-level attachment (not tied to a specific step)
      const att = await uploadStepAttachment(caseId, 0, tenantId, formData)
      const url = await getAttachmentSignedUrl(att.storage_path)
      onAttached(url, att.file_name)
    } catch (e) {
      console.error('Upload failed:', e)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        onChange={handleFileChange}
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif"
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="text-[10px] px-2 py-1 rounded border border-[#e6e8eb] bg-[#f8f9fa] text-[#45505a] hover:border-[#929da8] disabled:opacity-50 inline-flex items-center gap-1"
      >
        <Paperclip size={10} />
        {uploading ? 'Uploading...' : 'Attach'}
      </button>
    </>
  )
}
