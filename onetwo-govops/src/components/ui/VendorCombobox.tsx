'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createVendor } from '@/app/app/[tenancy]/boardroom/cases/[caseId]/vendor-actions'
import type { Vendor } from '@/types/case-steps'

interface Props {
  vendors: Vendor[]
  value: { vendorId: string | null; vendorName: string }
  onChange: (vendorId: string | null, vendorName: string) => void
  onVendorCreated: (vendor: Vendor) => void
  tenantId: string
}

export function VendorCombobox({ vendors, value, onChange, onVendorCreated, tenantId }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value.vendorName)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [creating, setCreating] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Sync external value changes
  useEffect(() => {
    setQuery(value.vendorName)
  }, [value.vendorName])

  // Close on click outside
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  const filtered = vendors.filter((v) =>
    v.name.toLowerCase().includes(query.toLowerCase())
  )

  const exactMatch = vendors.some((v) => v.name.toLowerCase() === query.trim().toLowerCase())
  const showAddOption = query.trim().length > 0 && !exactMatch

  const totalItems = filtered.length + (showAddOption ? 1 : 0)

  const selectVendor = useCallback((vendor: Vendor) => {
    onChange(vendor.id, vendor.name)
    setQuery(vendor.name)
    setOpen(false)
  }, [onChange])

  const handleAddVendor = useCallback(async () => {
    if (creating || !query.trim()) return
    setCreating(true)
    try {
      const newVendor = await createVendor(tenantId, { name: query.trim() })
      onVendorCreated(newVendor)
      selectVendor(newVendor)
    } finally {
      setCreating(false)
    }
  }, [creating, query, tenantId, onVendorCreated, selectVendor])

  const handleClear = () => {
    onChange(null, '')
    setQuery('')
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setOpen(true)
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightIndex((prev) => Math.min(prev + 1, totalItems - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightIndex((prev) => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightIndex < filtered.length) {
          selectVendor(filtered[highlightIndex])
        } else if (showAddOption) {
          handleAddVendor()
        }
        break
      case 'Escape':
        setOpen(false)
        break
    }
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return
    const item = listRef.current.children[highlightIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex, open])

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center gap-0.5">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setHighlightIndex(0)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Select vendor..."
          className="text-[11px] px-1.5 py-1 border-[1.5px] border-[#e6e8eb] rounded-md text-[#1a1f25] bg-white focus:outline-none focus:border-[#d12626] w-full min-w-[100px]"
        />
        {value.vendorId && (
          <button
            onClick={handleClear}
            className="text-[10px] text-[#929da8] hover:text-[#d12626] px-0.5 shrink-0"
            title="Clear vendor"
          >
            \u2715
          </button>
        )}
      </div>

      {open && totalItems > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-[#e6e8eb] rounded-md shadow-lg max-h-[200px] overflow-y-auto"
        >
          {filtered.map((vendor, i) => (
            <div
              key={vendor.id}
              onMouseDown={(e) => {
                e.preventDefault()
                selectVendor(vendor)
              }}
              onMouseEnter={() => setHighlightIndex(i)}
              className={`px-2 py-1.5 text-[11px] cursor-pointer ${
                i === highlightIndex ? 'bg-[#f8f9fa] text-[#1a1f25]' : 'text-[#45505a]'
              }`}
            >
              {vendor.name}
            </div>
          ))}

          {showAddOption && (
            <div
              onMouseDown={(e) => {
                e.preventDefault()
                handleAddVendor()
              }}
              onMouseEnter={() => setHighlightIndex(filtered.length)}
              className={`px-2 py-1.5 text-[11px] cursor-pointer border-t border-[#f8f9fa] font-medium ${
                highlightIndex === filtered.length ? 'bg-[#f8f9fa] text-[#d12626]' : 'text-[#d12626]'
              }`}
            >
              {creating ? 'Adding...' : `+ Add "${query.trim()}"`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
