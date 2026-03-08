'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, Download, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  templateHeaders: string[]
  onImport: (csvText: string) => Promise<{ inserted: number; errors: { row: number; message: string }[] }>
}

export function CSVImporter({ templateHeaders, onImport }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const [csvText, setCsvText] = useState<string | null>(null)
  const [previewRows, setPreviewRows] = useState<string[][]>([])
  const [importResult, setImportResult] = useState<{ inserted: number; errors: { row: number; message: string }[] } | null>(null)
  const [importing, setImporting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const downloadTemplate = () => {
    const csv = templateHeaders.join(',') + '\n'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'units_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const parseCSV = (text: string) => {
    setCsvText(text)
    const lines = text.trim().split('\n')
    const rows = lines.map(l => l.split(',').map(c => c.trim()))
    setPreviewRows(rows.slice(0, 6)) // header + up to 5 data rows
    setImportResult(null)
  }

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      parseCSV(text)
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleImport = async () => {
    if (!csvText) return
    setImporting(true)
    try {
      const result = await onImport(csvText)
      setImportResult(result)
      if (result.errors.length === 0) {
        setCsvText(null)
        setPreviewRows([])
      }
    } catch (e) {
      setImportResult({ inserted: 0, errors: [{ row: -1, message: (e as Error).message }] })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Download template */}
      <button
        onClick={downloadTemplate}
        className="flex items-center gap-1.5 text-[12px] font-medium text-[#6e7b8a] hover:text-[#1a1f25] transition-colors"
      >
        <Download size={14} /> Download CSV template
      </button>

      {/* Drop zone */}
      {!csvText && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            isDragging ? 'border-[#047857] bg-[#ecfdf5]' : 'border-[#e6e8eb] hover:border-[#929da8]'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); if (inputRef.current) inputRef.current.value = '' }}
            className="hidden"
          />
          <Upload size={20} className="text-[#929da8] mx-auto mb-2" />
          <p className="text-[13px] text-[#45505a]">Drop a CSV file or click to browse</p>
        </div>
      )}

      {/* Preview table */}
      {previewRows.length > 0 && (
        <div>
          <p className="text-[11px] font-bold text-[#929da8] uppercase tracking-[0.08em] mb-2">
            Preview ({previewRows.length - 1} rows shown)
          </p>
          <div className="overflow-x-auto border border-[#e6e8eb] rounded-lg">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-[#f8f9fa]">
                  {previewRows[0]?.map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left text-[#6e7b8a] font-semibold border-b border-[#e6e8eb]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(1).map((row, ri) => (
                  <tr key={ri} className="border-b border-[#f8f9fa]">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2 text-[#45505a]">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 mt-3">
            <Button variant="accent" size="sm" onClick={handleImport} disabled={importing}>
              {importing ? 'Importing...' : 'Import'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setCsvText(null); setPreviewRows([]); setImportResult(null) }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Import result */}
      {importResult && (
        <div className={`rounded-lg p-3 text-[13px] ${
          importResult.errors.length > 0 ? 'bg-[#fef2f2] text-[#d12626]' : 'bg-[#ecfdf5] text-[#047857]'
        }`}>
          {importResult.inserted > 0 && (
            <p className="font-medium">{importResult.inserted} units imported successfully.</p>
          )}
          {importResult.errors.map((err, i) => (
            <div key={i} className="flex items-start gap-1.5 mt-1">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{err.row >= 0 ? `Row ${err.row}: ` : ''}{err.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
