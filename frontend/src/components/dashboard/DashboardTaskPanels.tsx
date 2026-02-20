import { memo, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react'

import EmptyState from '../EmptyState'
import type { Task } from '../../lib/api'
import { categoryBadgeClass, formatShortDate, groupByCategory } from './dashboardUtils'
import DashboardTaskList from './DashboardTaskList'

interface DashboardTaskPanelsProps {
  todayTasks: Task[]
  tomorrowTasks: Task[]
  thisWeekTasks: Task[]
  upcomingTasks: Task[]
  noDeadlineTasks: Task[]
  completedTasks: Task[]
  todayTotalEstimatedTime: string
  tomorrowTotalEstimatedTime: string
  thisWeekRangeLabel: string
  completingTaskId: number | null
  onOpenTask: (task: Task, editable?: boolean) => void
  onQuickComplete: (task: Task) => void
  onOpenPopup: (section: 'today' | 'tomorrow' | 'this_week') => void
  onOpenQuickAdd: (target: 'today' | 'tomorrow') => void
}

function DashboardTaskPanels({
  todayTasks,
  tomorrowTasks,
  thisWeekTasks,
  upcomingTasks,
  noDeadlineTasks,
  completedTasks,
  todayTotalEstimatedTime,
  tomorrowTotalEstimatedTime,
  thisWeekRangeLabel,
  completingTaskId,
  onOpenTask,
  onQuickComplete,
  onOpenPopup,
  onOpenQuickAdd,
}: DashboardTaskPanelsProps) {
  const [taskPanel, setTaskPanel] = useState<'daily' | 'weekly'>('daily')
  const [upcomingCollapsed, setUpcomingCollapsed] = useState(false)
  const upcomingGrouped = useMemo(() => Array.from(groupByCategory(upcomingTasks).entries()), [upcomingTasks])

  return (
    <div className="space-y-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">업무 현황</h3>
      </div>

      <div className="space-y-3 md:hidden">
        <DashboardTaskList
          title={`📋 오늘 (${todayTasks.length}건 ${todayTotalEstimatedTime || '0m'})`}
          tasks={todayTasks}
          noDeadlineTasks={noDeadlineTasks}
          onClickTask={(task) => onOpenTask(task, true)}
          onQuickComplete={onQuickComplete}
          completingTaskId={completingTaskId}
          onHeaderClick={() => onOpenPopup('today')}
          headerAction={(
            <button
              onClick={(event) => {
                event.stopPropagation()
                onOpenQuickAdd('today')
              }}
              className="flex h-6 w-6 items-center justify-center rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
              title="업무 추가"
            >
              <Plus size={14} />
            </button>
          )}
          emptyEmoji="🎉"
          emptyMessage="오늘 예정된 업무가 없어요"
          emptyAction={() => onOpenQuickAdd('today')}
          emptyActionLabel="업무 추가"
        />
        <DashboardTaskList
          title={`내일 (${tomorrowTasks.length}건 ${tomorrowTotalEstimatedTime || '0m'})`}
          tasks={tomorrowTasks}
          onClickTask={(task) => onOpenTask(task, true)}
          onQuickComplete={onQuickComplete}
          completingTaskId={completingTaskId}
          onHeaderClick={() => onOpenPopup('tomorrow')}
          headerAction={(
            <button
              onClick={(event) => {
                event.stopPropagation()
                onOpenQuickAdd('tomorrow')
              }}
              className="flex h-6 w-6 items-center justify-center rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
              title="업무 추가"
            >
              <Plus size={14} />
            </button>
          )}
          defaultCollapsed={true}
        />
        <DashboardTaskList
          title={`📅 이번 주 ${thisWeekRangeLabel} (${thisWeekTasks.length}건)`}
          tasks={thisWeekTasks}
          onClickTask={(task) => onOpenTask(task, true)}
          onQuickComplete={onQuickComplete}
          completingTaskId={completingTaskId}
          onHeaderClick={() => onOpenPopup('this_week')}
          defaultCollapsed={true}
        />
        <DashboardTaskList
          title={`예정 (${upcomingTasks.length}건)`}
          tasks={upcomingTasks}
          onClickTask={(task) => onOpenTask(task, true)}
          onQuickComplete={onQuickComplete}
          completingTaskId={completingTaskId}
          defaultCollapsed={true}
        />
        <DashboardTaskList
          title={`완료 (${completedTasks.length}건)`}
          tasks={completedTasks}
          onClickTask={(task) => onOpenTask(task, true)}
          completingTaskId={completingTaskId}
          defaultCollapsed={true}
        />
      </div>

      <div className="relative hidden overflow-hidden md:block">
        <div
          className={`px-0.5 transition-all duration-300 ease-out ${taskPanel === 'daily' ? 'relative translate-x-0 opacity-100' : 'pointer-events-none absolute inset-0 -translate-x-8 opacity-0'}`}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DashboardTaskList
              title={`📋 오늘 (${todayTasks.length}건 ${todayTotalEstimatedTime || '0m'})`}
              tasks={todayTasks}
              noDeadlineTasks={noDeadlineTasks}
              onClickTask={(task) => onOpenTask(task, true)}
              onQuickComplete={onQuickComplete}
              completingTaskId={completingTaskId}
              onHeaderClick={() => onOpenPopup('today')}
              headerAction={(
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenQuickAdd('today')
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
                  title="업무 추가"
                >
                  <Plus size={14} />
                </button>
              )}
              emptyEmoji="🎉"
              emptyMessage="오늘 예정된 업무가 없어요"
              emptyAction={() => onOpenQuickAdd('today')}
              emptyActionLabel="업무 추가"
            />
            <DashboardTaskList
              title={`내일 (${tomorrowTasks.length}건 ${tomorrowTotalEstimatedTime || '0m'})`}
              tasks={tomorrowTasks}
              onClickTask={(task) => onOpenTask(task, true)}
              onQuickComplete={onQuickComplete}
              completingTaskId={completingTaskId}
              onHeaderClick={() => onOpenPopup('tomorrow')}
              headerAction={(
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenQuickAdd('tomorrow')
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
                  title="업무 추가"
                >
                  <Plus size={14} />
                </button>
              )}
            />
          </div>
        </div>

        <div
          className={`px-0.5 transition-all duration-300 ease-out ${taskPanel === 'weekly' ? 'relative translate-x-0 opacity-100' : 'pointer-events-none absolute inset-0 translate-x-8 opacity-0'}`}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DashboardTaskList
              title={`📅 이번 주 ${thisWeekRangeLabel} (${thisWeekTasks.length}건)`}
              tasks={thisWeekTasks}
              onClickTask={(task) => onOpenTask(task, true)}
              onQuickComplete={onQuickComplete}
              completingTaskId={completingTaskId}
              onHeaderClick={() => onOpenPopup('this_week')}
            />

            <div className="card-base dashboard-card">
              <button
                onClick={() => setUpcomingCollapsed((prev) => !prev)}
                className="mb-2 flex w-full items-center justify-between"
              >
                <h3 className="text-sm font-semibold text-gray-700">예정 업무</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{upcomingTasks.length}건</span>
                  <ChevronDown
                    size={14}
                    className={`text-gray-400 transition-transform ${upcomingCollapsed ? '-rotate-90' : ''}`}
                  />
                </div>
              </button>
              {!upcomingTasks.length ? (
                <div className="rounded-lg border border-dashed border-gray-200">
                  <EmptyState emoji="📅" message="등록된 일정이 없어요" className="py-6" />
                </div>
              ) : (
                !upcomingCollapsed && (
                  <div className="space-y-3">
                    {upcomingGrouped.map(([category, tasks]) => (
                      <div key={category}>
                        <div className="mb-1 flex items-center gap-2">
                          <span className={categoryBadgeClass(category)}>{category}</span>
                          <span className="text-[10px] text-gray-400">{tasks.length}건</span>
                        </div>
                        <div className="space-y-1">
                          {tasks.map((task) => (
                            <div
                              key={task.id}
                              onClick={() => onOpenTask(task, true)}
                              className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 hover:bg-gray-50"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-sm text-gray-800">{task.title}</p>
                                <span className="shrink-0 text-xs text-gray-400">
                                  {task.deadline ? formatShortDate(task.deadline) : ''}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => setTaskPanel('daily')}
          aria-label="이전 패널"
          className={`absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-gray-200 bg-white/95 p-1.5 text-gray-500 shadow-sm transition-all hover:bg-white hover:text-gray-700 ${taskPanel === 'weekly' ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={() => setTaskPanel('weekly')}
          aria-label="다음 패널"
          className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-gray-200 bg-white/95 p-1.5 text-gray-500 shadow-sm transition-all hover:bg-white hover:text-gray-700 ${taskPanel === 'daily' ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="hidden justify-center gap-1 md:flex">
        <button
          onClick={() => setTaskPanel('daily')}
          className={`h-1.5 w-6 rounded-full transition-colors ${taskPanel === 'daily' ? 'bg-blue-500' : 'bg-gray-300'}`}
          aria-label="오늘/내일 패널 보기"
        />
        <button
          onClick={() => setTaskPanel('weekly')}
          className={`h-1.5 w-6 rounded-full transition-colors ${taskPanel === 'weekly' ? 'bg-blue-500' : 'bg-gray-300'}`}
          aria-label="이번주/예정 패널 보기"
        />
      </div>
    </div>
  )
}

export default memo(DashboardTaskPanels)
