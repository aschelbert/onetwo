'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import type { PropertyLog, PropertyLogStatus, PropertyLogType } from '@/types/association-team'
import { ClipboardList, Eye, AlertTriangle, Wrench, MapPin } from 'lucide-react'

const TYPE_CONFIG: Record<PropertyLogType, { label: string; icon: React.ReactNode }> = {
  walkthrough: { label: 'Walkthrough', icon: <MapPin size={14} /> },
  inspection: { label: 'Inspection', icon: <Eye size={14} /> },
  condition_assessment: { label: 'Condition Assessment', icon: <ClipboardList size={14} /> },
  incident: { label: 'Incident', icon: <AlertTriangle size={14} /> },
  maintenance_observation: { label: 'Maintenance', icon: <Wrench size={14} /> },
}

const STATUS_VARIANT: Record<PropertyLogStatus, 'green' | 'amber' | 'blue' | 'gray'> = {
  open: 'blue',
  in_progress: 'amber',
  resolved: 'green',
  closed: 'gray',
}

const STATUS_LABEL: Record<PropertyLogStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

export function PropertyLogCard({ log, tenancySlug }: { log: PropertyLog; tenancySlug: string }) {
  const typeInfo = TYPE_CONFIG[log.type] || TYPE_CONFIG.walkthrough
  const findings = log.findings || []
  const actionItems = log.action_items || []

  return (
    <Link href={`/app/${tenancySlug}/association-team/property-log/${log.id}`} className="no-underline block">
      <Card className="cursor-pointer">
        <CardBody>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[#929da8]">{typeInfo.icon}</span>
                <span className="text-[0.7rem] font-semibold text-[#929da8] uppercase tracking-wide">
                  {typeInfo.label}
                </span>
              </div>
              <h3 className="text-sm font-bold text-[#1a1f25] mb-1 truncate">{log.title}</h3>
              <div className="flex items-center gap-3 text-[0.75rem] text-[#45505a]">
                {log.date && <span>{formatDate(log.date)}</span>}
                {log.conducted_by && <span>by {log.conducted_by}</span>}
                {log.location && <span>{log.location}</span>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <Badge variant={STATUS_VARIANT[log.status]}>{STATUS_LABEL[log.status]}</Badge>
              <div className="flex items-center gap-2 text-[0.7rem] text-[#929da8]">
                {findings.length > 0 && <span>{findings.length} finding{findings.length !== 1 ? 's' : ''}</span>}
                {actionItems.length > 0 && <span>{actionItems.length} action{actionItems.length !== 1 ? 's' : ''}</span>}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </Link>
  )
}
