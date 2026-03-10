'use client'

import Link from 'next/link'
import { Card, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { AssociationTask } from '@/types/association-team'
import { PRIORITY_CONFIG, STATUS_CONFIG, TASK_CATEGORIES } from '@/types/association-team'
import { Calendar, User } from 'lucide-react'

export function TaskCard({ task, tenancySlug }: { task: AssociationTask; tenancySlug: string }) {
  const priorityInfo = PRIORITY_CONFIG[task.priority]
  const statusInfo = STATUS_CONFIG[task.status]
  const categoryLabel = TASK_CATEGORIES.find((c) => c.value === task.category)?.label || task.category

  return (
    <Link href={`/app/${tenancySlug}/association-team/task-tracking/${task.id}`} className="no-underline block">
      <Card className="cursor-pointer">
        <CardBody>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[0.7rem] font-semibold text-[#929da8] uppercase tracking-wide">
                  {categoryLabel}
                </span>
              </div>
              <h3 className="text-sm font-bold text-[#1a1f25] mb-1.5 truncate">{task.title}</h3>
              {task.description && (
                <p className="text-[0.75rem] text-[#45505a] line-clamp-1 mb-2">{task.description}</p>
              )}
              <div className="flex items-center gap-3 text-[0.75rem] text-[#929da8]">
                {task.assigned_user_name && (
                  <span className="inline-flex items-center gap-1">
                    <User size={12} /> {task.assigned_user_name}
                  </span>
                )}
                {task.due_date && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={12} /> {formatDate(task.due_date)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <Badge variant={statusInfo.variant as 'green' | 'amber' | 'blue' | 'gray'}>
                {statusInfo.label}
              </Badge>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[0.7rem] font-semibold ${priorityInfo.className}`}>
                {priorityInfo.label}
              </span>
            </div>
          </div>
        </CardBody>
      </Card>
    </Link>
  )
}
