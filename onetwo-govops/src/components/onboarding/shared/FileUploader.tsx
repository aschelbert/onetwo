'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, X, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  onUpload: (formData: FormData) => Promise<void>
  accept?: string
  label?: string
}

export function FileUploader({ onUpload, accept = '.pdf', label = 'Upload Document' }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    setUploading(true)
    setFileName(file.name)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await onUpload(formData)
    } catch (e) {
      console.error('Upload failed:', e)
    } finally {
      setUploading(false)
      setFileName(null)
    }
  }, [onUpload])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-[#047857] bg-[#ecfdf5]'
            : 'border-[#e6e8eb] hover:border-[#929da8]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
        />

        {uploading ? (
          <div className="flex items-center justify-center gap-2">
            <FileText size={16} className="text-[#6e7b8a]" />
            <span className="text-[13px] text-[#45505a]">Uploading {fileName}...</span>
          </div>
        ) : (
          <>
            <Upload size={20} className="text-[#929da8] mx-auto mb-2" />
            <p className="text-[13px] text-[#45505a] mb-1">{label}</p>
            <p className="text-[11px] text-[#929da8]">Drag & drop or click to browse</p>
          </>
        )}
      </div>
    </div>
  )
}

export function FileListItem({
  name,
  size,
  onRemove,
}: {
  name: string
  size?: number | null
  onRemove: () => void
}) {
  const sizeStr = size ? `${(size / 1024).toFixed(0)} KB` : ''

  return (
    <div className="flex items-center gap-3 py-2 px-3 bg-[#f8f9fa] rounded-lg">
      <FileText size={16} className="text-[#6e7b8a] shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-[#1a1f25] truncate">{name}</p>
        {sizeStr && <p className="text-[11px] text-[#929da8]">{sizeStr}</p>}
      </div>
      <button
        onClick={onRemove}
        className="text-[#929da8] hover:text-[#d12626] transition-colors shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  )
}
