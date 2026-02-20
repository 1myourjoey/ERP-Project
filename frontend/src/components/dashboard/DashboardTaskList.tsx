import { memo, useMemo, useState } from 'react'
import { ChevronDown, Pin } from 'lucide-react'

import EmptyState from '../EmptyState'
import type { Task } from '../../lib/api'
import { categoryBadgeClass, formatShortDate, groupByCategory } from './dashboardUtils'

interface DashboardTaskListProps {
  title: string
  tasks: Task[]
  noDeadlineTasks?: Task[]
  onClickTask: (task: Task) => void
  onQuickComplete?: (task: Task) => void
  completingTaskId: number | null
  onHeaderClick?: () => void
  headerAction?: React.ReactNode
  defaultCollapsed?: boolean
  emptyEmoji?: string
  emptyMessage?: string
  emptyAction?: () => void
  emptyActionLabel?: string
}

function DashboardTaskList({
  title,
  tasks,
  noDeadlineTasks = [],
  onClickTask,
  onQuickComplete,
  completingTaskId,
  onHeaderClick,
  headerAction,
  defaultCollapsed = false,
  emptyEmoji = '📋',
  emptyMessage = '등록된 업무가 없어요',
  emptyAction,
  emptyActionLabel,
}: DashboardTaskListProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const groupedTasks = useMemo(() => Array.from(groupByCategory(tasks).entries()), [tasks])
  const groupedNoDeadlineTasks = useMemo(
    () => Array.from(groupByCategory(noDeadlineTasks).entries()),
    [noDeadlineTasks],
  )
  const hasAnyTasks = tasks.length > 0 || noDeadlineTasks.length > 0

  return (
    <div className="card-base dashboard-card">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={onHeaderClick}
          className={`text-sm font-semibold ${onHeaderClick ? 'text-gray-700 hover:text-blue-600' : 'text-gray-700'}`}
        >
          {title}
        </button>
        <div className="flex items-center gap-1">
          {headerAction}
          <span className="text-xs text-gray-400">{tasks.length}건</span>
          <button
            onClick={() => setCollapsed((prev) => !prev)}
            className="rounded p-1 hover:bg-gray-100"
          >
            <ChevronDown
              size={14}
              className={`text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
            />
          </button>
        </div>
      </div>
      {!collapsed && (
        !hasAnyTasks ? (
          <div className="rounded-lg border border-dashed border-gray-200">
            <EmptyState
              emoji={emptyEmoji}
              message={emptyMessage}
              action={emptyAction}
              actionLabel={emptyActionLabel}
              className="py-6"
            />
          </div>
        ) : (
          <div className="space-y-3">
            {groupedTasks.map(([category, categoryTasks]) => (
              <div key={`${title}-${category}`}>
                <div className="mb-1 flex items-center gap-2">
                  <span className={categoryBadgeClass(category)}>{category}</span>
                  <span className="text-[10px] text-gray-400">{categoryTasks.length}건</span>
                </div>
                <div className="space-y-2">
                  {categoryTasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => onClickTask(task)}
                      className="w-full cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-2 text-left hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-800">{task.title}</p>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                            {task.deadline ? formatShortDate(task.deadline) : '마감 없음'}
                            {task.estimated_time && ` | 예상 ${task.estimated_time}`}
                            {task.fund_name && <span className="text-blue-600">{task.fund_name}</span>}
                          </div>
                        </div>
                        {onQuickComplete && task.status !== 'completed' && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation()
                              onQuickComplete(task)
                            }}
                            disabled={completingTaskId === task.id}
                            className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-60"
                          >
                            {completingTaskId === task.id ? '처리중' : '완료'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {noDeadlineTasks.length > 0 && (
              <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-2">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-amber-700">
                  <Pin size={12} />
                  <span>기한 미지정 ({noDeadlineTasks.length})</span>
                </div>
                <div className="space-y-2">
                  {groupedNoDeadlineTasks.map(([category, categoryTasks]) => (
                    <div key={`${title}-no-deadline-${category}`}>
                      <div className="mb-1 flex items-center gap-2">
                        <span className={categoryBadgeClass(category)}>{category}</span>
                        <span className="text-[10px] text-gray-400">{categoryTasks.length}건</span>
                      </div>
                      <div className="space-y-1.5">
                        {categoryTasks.map((task) => (
                          <div
                            key={task.id}
                            onClick={() => onClickTask(task)}
                            className="w-full cursor-pointer rounded-lg border border-amber-200 bg-white px-3 py-2 text-left hover:bg-amber-50"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-gray-800">{task.title}</p>
                                <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                                  {task.estimated_time && `예상 ${task.estimated_time}`}
                                  {task.fund_name && <span className="text-blue-600">{task.fund_name}</span>}
                                </div>
                              </div>
                              {onQuickComplete && task.status !== 'completed' && (
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    onQuickComplete(task)
                                  }}
                                  disabled={completingTaskId === task.id}
                                  className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-60"
                                >
                                  {completingTaskId === task.id ? '처리중' : '완료'}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}

export default memo(DashboardTaskList)
