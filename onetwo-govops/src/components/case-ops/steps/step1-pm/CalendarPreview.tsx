'use client'

import { SectionCard } from '../shared/SectionCard'
import type { PMTask, PMCategory } from '@/types/case-steps'
import { buildCalendarGrid } from '@/types/case-steps'

const MONTH_NAMES: Record<number, string> = {
  1: 'January', 2: 'February', 3: 'March', 4: 'April',
  5: 'May', 6: 'June', 7: 'July', 8: 'August',
  9: 'September', 10: 'October', 11: 'November', 12: 'December',
}

const CATEGORY_DOT_COLORS: Record<PMCategory, string> = {
  hvac: 'bg-[#3b82f6]',          // blue
  roofing: 'bg-[#f59e0b]',       // amber
  plumbing: 'bg-[#06b6d4]',      // cyan
  electrical: 'bg-[#eab308]',    // yellow
  fire_safety: 'bg-[#ef4444]',   // red
  elevator: 'bg-[#8b5cf6]',      // violet
  exterior: 'bg-[#84cc16]',      // lime
  pest_control: 'bg-[#f97316]',  // orange
  common_areas: 'bg-[#10b981]',  // emerald
  other: 'bg-[#929da8]',         // gray
}

interface Props {
  tasks: PMTask[]
  isConfirmed: boolean
  isOpen: boolean
  onToggle: () => void
  onConfirm: (confirmed: boolean) => void
}

export function CalendarPreview({ tasks, isConfirmed, isOpen, onToggle, onConfirm }: Props) {
  const grid = buildCalendarGrid(tasks)

  // Summary stats
  const freqCounts: Record<string, number> = {}
  for (const task of tasks) {
    freqCounts[task.frequency] = (freqCounts[task.frequency] ?? 0) + 1
  }

  const badge = isConfirmed
    ? { label: 'Confirmed', variant: 'confirmed' as const }
    : { label: `${tasks.length} task${tasks.length !== 1 ? 's' : ''}`, variant: 'pending' as const }

  return (
    <SectionCard
      title="Calendar Preview"
      badge={badge}
      isConfirmed={isConfirmed}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="pt-2.5">
        {/* Summary stats */}
        {tasks.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-3 text-[10px] font-semibold text-[#6e7b8a] uppercase tracking-[0.04em]">
            <span>Total: {tasks.length}</span>
            {freqCounts.monthly ? <span>Monthly: {freqCounts.monthly}</span> : null}
            {freqCounts.quarterly ? <span>Quarterly: {freqCounts.quarterly}</span> : null}
            {freqCounts.semi_annual ? <span>Semi-Annual: {freqCounts.semi_annual}</span> : null}
            {freqCounts.annual ? <span>Annual: {freqCounts.annual}</span> : null}
            {freqCounts.as_needed ? <span>As Needed: {freqCounts.as_needed}</span> : null}
          </div>
        )}

        {tasks.length === 0 ? (
          <p className="text-[12px] text-[#929da8] py-3 text-center">No tasks to preview. Add tasks in the Task List section above.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => {
              const monthTasks = grid[month]
              return (
                <div
                  key={month}
                  className="border border-[#e6e8eb] rounded-lg p-2 min-h-[80px]"
                >
                  <div className="text-[10px] font-bold text-[#45505a] uppercase tracking-[0.06em] mb-1.5">
                    {MONTH_NAMES[month]}
                  </div>
                  {monthTasks.length === 0 ? (
                    <p className="text-[9px] text-[#929da8] italic">No tasks</p>
                  ) : (
                    <div className="space-y-0.5">
                      {monthTasks.map((task) => (
                        <div key={task.id} className="flex items-start gap-1">
                          <span
                            className={`w-1.5 h-1.5 rounded-full mt-[3px] shrink-0 ${CATEGORY_DOT_COLORS[task.category]}`}
                          />
                          <span className="text-[9px] text-[#45505a] leading-tight">
                            {task.name || 'Untitled'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Confirm section button */}
        <button
          onClick={() => onConfirm(!isConfirmed)}
          className={`mt-2.5 w-full py-2 rounded-lg text-[12px] font-semibold ${
            isConfirmed
              ? 'bg-[#ecfdf5] text-[#047857] border border-[#6ee7b7]'
              : 'bg-white text-[#6e7b8a] border border-[#e6e8eb] hover:border-[#047857]'
          }`}
        >
          {isConfirmed ? '\u2713 Section Confirmed' : 'Confirm Section'}
        </button>
      </div>
    </SectionCard>
  )
}
