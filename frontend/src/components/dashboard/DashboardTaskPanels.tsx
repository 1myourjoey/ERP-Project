import { memo, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import EmptyState from '../EmptyState'
import type { DashboardPrioritizedTask, Task } from '../../lib/api'
import { formatShortDate, groupPrioritizedTasks } from './dashboardUtils'

interface DashboardTaskPanelsProps {
  prioritizedTasks: DashboardPrioritizedTask[]
  thisWeekTasks: Task[]
  completedTasks: Task[]
  completingTaskId: number | null
  onOpenTask: (task: Task, editable?: boolean) => void
  onQuickComplete: (task: Task) => void
  onOpenTaskBoard: () => void
}

function urgencyBadge(item: DashboardPrioritizedTask): { text: string; className: string } {
  const { urgency, d_day } = item
  if (urgency === 'overdue') {
    return { text: `지연 D+${Math.abs(d_day ?? 0)}`, className: 'tag tag-red' }
  }
  if (urgency === 'today') {
    return { text: 'D-day', className: 'tag tag-red' }
  }
  if (urgency === 'tomorrow') {
    return { text: 'D-1', className: 'tag tag-amber' }
  }
  if (urgency === 'this_week') {
    return { text: `D-${d_day ?? '-'}`, className: 'tag tag-blue' }
  }
  return { text: d_day != null ? `D-${d_day}` : '예정', className: 'tag tag-gray' }
}

function taskMeta(task: Task): string {
  const parts = [
    task.fund_name || task.gp_entity_name || '-',
    task.category || '일반',
    task.deadline ? formatShortDate(task.deadline) : '기한 없음',
  ]
  return parts.join(' | ')
}

function DashboardTaskPanels({
  prioritizedTasks,
  thisWeekTasks,
  completedTasks,
  completingTaskId,
  onOpenTask,
  onQuickComplete,
  onOpenTaskBoard,
}: DashboardTaskPanelsProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const taskGroups = useMemo(() => groupPrioritizedTasks(prioritizedTasks), [prioritizedTasks])

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }))
  }

  const renderTaskRow = (item: DashboardPrioritizedTask, prefix?: string) => {
    const task = item.task
    const badge = urgencyBadge(item)

    return (
      <div
        key={`prio-${task.id}`}
        onClick={() => onOpenTask(task, true)}
        className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-2 hover:bg-gray-50"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-gray-800">
            {prefix ? `${prefix} ` : ''}
            {task.title}
          </p>
          <span className={badge.className}>{badge.text}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-500">{taskMeta(task)}</p>
        {item.workflow_info && (
          <p className="mt-0.5 truncate text-[11px] text-indigo-700">
            {item.workflow_info.name} | {item.workflow_info.step} | {item.workflow_info.step_name}
          </p>
        )}
        {task.status !== 'completed' && (
          <div className="mt-2 flex justify-end">
            <button
              onClick={(event) => {
                event.stopPropagation()
                onQuickComplete(task)
              }}
              disabled={completingTaskId === task.id}
              className="secondary-btn btn-xs"
            >
              {completingTaskId === task.id ? '처리중' : '완료'}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">오늘 할 일 우선순위</h3>
        <button
          onClick={onOpenTaskBoard}
          className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
        >
          업무보드
        </button>
      </div>

      <div className="card-base dashboard-card">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-700">우선순위 ({prioritizedTasks.length}건, {taskGroups.length}그룹)</h4>
        </div>
        {taskGroups.length === 0 ? (
          <EmptyState emoji="📌" message="우선순위 업무가 없습니다." className="py-6" />
        ) : (
          <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
            {taskGroups.map((group) => {
              if (group.tasks.length === 1) {
                return renderTaskRow(group.tasks[0])
              }

              const isExpanded = expandedGroups[group.groupKey] === true
              const previewFunds =
                group.fundNames.length > 3
                  ? `${group.fundNames.slice(0, 3).join(', ')} 외 ${group.fundNames.length - 3}`
                  : group.fundNames.join(', ')
              const badge = urgencyBadge({
                task: group.tasks[0].task,
                urgency: group.urgencyMax,
                d_day: group.dDayMin,
                workflow_info: null,
                source: group.tasks[0].source,
              })

              return (
                <div
                  key={group.groupKey}
                  className="rounded-lg border border-gray-200 bg-white"
                >
                  <button
                    onClick={() => toggleGroup(group.groupKey)}
                    className="w-full cursor-pointer px-3 py-2 text-left hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-2">
                      <p className="flex-1 truncate text-sm font-semibold text-gray-800">
                        {group.groupLabel}
                      </p>
                      <span className="text-xs text-gray-500">{group.tasks.length}건</span>
                      <span className={badge.className}>{badge.text}</span>
                      <ChevronDown size={14} className={`text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {previewFunds || '개별 업무'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      {isExpanded ? '접기' : '펼치기'}
                    </p>
                  </button>
                  <div className={`${isExpanded ? 'block' : 'hidden'} border-t border-gray-100 px-2 pb-2 pt-1`}>
                    <div className="max-h-[180px] space-y-1.5 overflow-y-auto pr-1">
                      {group.tasks.map((item, index) => renderTaskRow(item, `${index + 1}.`))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="card-base dashboard-card">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-700">이번주 마감</h4>
            <span className="text-xs text-gray-400">{thisWeekTasks.length}건</span>
          </div>
          {thisWeekTasks.length === 0 ? (
            <EmptyState emoji="📆" message="이번주 마감 업무가 없습니다." className="py-6" />
          ) : (
            <div className="max-h-[180px] space-y-1.5 overflow-y-auto pr-1">
              {thisWeekTasks.slice(0, 8).map((task) => (
                <button
                  key={`week-${task.id}`}
                  onClick={() => onOpenTask(task, true)}
                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <p className="truncate">{task.title}</p>
                  <p className="truncate text-xs text-gray-500">{taskMeta(task)}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card-base dashboard-card">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-emerald-700">완료</h4>
            <span className="text-xs text-gray-400">{completedTasks.length}건</span>
          </div>
          {completedTasks.length === 0 ? (
            <EmptyState emoji="✅" message="오늘 완료한 업무가 없습니다." className="py-6" />
          ) : (
            <div className="max-h-[180px] space-y-1.5 overflow-y-auto pr-1">
              {completedTasks.slice(0, 8).map((task) => (
                <button
                  key={`done-${task.id}`}
                  onClick={() => onOpenTask(task, true)}
                  className="w-full rounded border border-emerald-100 bg-emerald-50/40 px-2 py-1.5 text-left text-sm text-emerald-800 hover:bg-emerald-50"
                >
                  <p className="truncate line-through">{task.title}</p>
                  <p className="truncate text-xs text-emerald-700/80">{task.actual_time || '-'}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(DashboardTaskPanels)
