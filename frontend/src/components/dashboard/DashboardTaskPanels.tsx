import { memo } from 'react'

import EmptyState from '../EmptyState'
import type { DashboardPrioritizedTask, Task } from '../../lib/api'
import { formatShortDate } from './dashboardUtils'

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
    return { text: `지연 D+${Math.abs(d_day ?? 0)}`, className: 'bg-red-100 text-red-700' }
  }
  if (urgency === 'today') {
    return { text: 'D-day', className: 'bg-orange-100 text-orange-700' }
  }
  if (urgency === 'tomorrow') {
    return { text: 'D-1', className: 'bg-amber-100 text-amber-700' }
  }
  if (urgency === 'this_week') {
    return { text: `D-${d_day ?? '-'}`, className: 'bg-blue-100 text-blue-700' }
  }
  return { text: d_day != null ? `D-${d_day}` : '예정', className: 'bg-gray-100 text-gray-700' }
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
  const topPrioritized = prioritizedTasks.slice(0, 10)
  const hiddenCount = Math.max(0, prioritizedTasks.length - topPrioritized.length)

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
          <h4 className="text-sm font-semibold text-gray-700">우선순위</h4>
          <span className="text-xs text-gray-400">{prioritizedTasks.length}건</span>
        </div>
        {topPrioritized.length === 0 ? (
          <EmptyState emoji="📌" message="우선순위 업무가 없습니다." className="py-6" />
        ) : (
          <div className="space-y-2">
            {topPrioritized.map((item, index) => {
              const badge = urgencyBadge(item)
              const task = item.task
              return (
                <div
                  key={`prio-${task.id}`}
                  onClick={() => onOpenTask(task, true)}
                  className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-2 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-gray-800">
                      {index + 1}. {task.title}
                    </p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>
                      {badge.text}
                    </span>
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
                        className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                      >
                        {completingTaskId === task.id ? '처리중' : '완료'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
            {hiddenCount > 0 && (
              <button
                onClick={onOpenTaskBoard}
                className="w-full rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
              >
                나머지 {hiddenCount}건 업무보드에서 보기
              </button>
            )}
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
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
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
