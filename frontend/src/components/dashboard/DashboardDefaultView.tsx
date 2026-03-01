import { memo, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type {
  ActiveWorkflow,
  DashboardComplianceWidget,
  DashboardDocCollectionWidget,
  DashboardPrioritizedTask,
  DashboardUrgentAlert,
  FundSummary,
  MissingDocument,
  Task,
  UpcomingReport,
} from '../../lib/api'
import type { PopupSection } from './dashboardUtils'
import { groupPrioritizedTasks, groupWorkflows } from './dashboardUtils'
import DashboardRightPanel from './DashboardRightPanel'
import DashboardStatCard from './DashboardStatCard'
import DashboardTaskPanels from './DashboardTaskPanels'
import DashboardWorkflowPanel from './DashboardWorkflowPanel'

interface DashboardDefaultViewProps {
  baseDate: string
  thisWeekRangeLabel: string
  monthlyReminder: boolean
  monthlyReminderPending: boolean
  todayTasks: Task[]
  tomorrowTasks: Task[]
  thisWeekTasks: Task[]
  upcomingTasks: Task[]
  noDeadlineTasks: Task[]
  prioritizedTasks: DashboardPrioritizedTask[]
  completedForTaskPanel: Task[]
  todayTotalEstimatedTime: string
  tomorrowTotalEstimatedTime: string
  activeWorkflows: ActiveWorkflow[]
  workflowsLoading: boolean
  fundSummary: FundSummary[]
  missingDocuments: MissingDocument[]
  upcomingReports: UpcomingReport[]
  completedTodayTasks: Task[]
  completedThisWeekTasks: Task[]
  completedLastWeekTasks: Task[]
  completedTodayCount: number
  completedThisWeekCount: number
  investmentReviewActiveCount: number
  totalNav: number
  unpaidLpCount: number
  pendingFeeCount: number
  bizReportInProgressCount: number
  complianceSummary?: DashboardComplianceWidget
  docCollectionSummary?: DashboardDocCollectionWidget
  urgentAlerts?: DashboardUrgentAlert[]
  sidebarLoading: boolean
  completedLoading: boolean
  completingTaskId: number | null
  onOpenPopup: (section: PopupSection) => void
  onGenerateMonthlyReminder: (yearMonth: string) => void
  onOpenTask: (task: Task, editable?: boolean) => void
  onQuickComplete: (task: Task) => void
  onOpenQuickAdd: (target: 'today' | 'tomorrow', fundId?: number | null) => void
  onOpenWorkflow: (workflow: ActiveWorkflow) => void
  onOpenTaskBoard: () => void
  onOpenPipeline: () => void
  onUndoComplete: (taskId: number) => void
}

function DashboardDefaultView({
  baseDate: _baseDate,
  thisWeekRangeLabel,
  monthlyReminder: _monthlyReminder,
  monthlyReminderPending: _monthlyReminderPending,
  todayTasks,
  thisWeekTasks,
  prioritizedTasks,
  completedForTaskPanel,
  activeWorkflows,
  workflowsLoading,
  fundSummary,
  missingDocuments,
  upcomingReports,
  completedTodayTasks,
  completedThisWeekTasks,
  completedLastWeekTasks,
  completedTodayCount,
  completedThisWeekCount,
  investmentReviewActiveCount,
  totalNav,
  unpaidLpCount,
  complianceSummary,
  urgentAlerts = [],
  sidebarLoading,
  completedLoading,
  completingTaskId,
  onOpenPopup,
  onGenerateMonthlyReminder: _onGenerateMonthlyReminder,
  onOpenTask,
  onQuickComplete,
  onOpenWorkflow,
  onOpenTaskBoard,
  onOpenPipeline,
  onUndoComplete,
}: DashboardDefaultViewProps) {
  const navigate = useNavigate()
  const [showAllUrgent, setShowAllUrgent] = useState(false)

  const taskGroups = useMemo(
    () => groupPrioritizedTasks(prioritizedTasks),
    [prioritizedTasks],
  )
  const workflowGroups = useMemo(
    () => groupWorkflows(activeWorkflows),
    [activeWorkflows],
  )

  const overdueTodayCount = todayTasks.filter((task) => {
    if (task.status === 'completed' || !task.deadline) return false
    const deadline = new Date(task.deadline)
    return !Number.isNaN(deadline.getTime()) && deadline.getTime() < Date.now()
  }).length
  const priorityHotCount = prioritizedTasks.filter(
    (item) => item.urgency === 'overdue' || item.urgency === 'today',
  ).length
  const overduePriorityTasks = prioritizedTasks.filter((item) => item.urgency === 'overdue')
  const todayPriorityTasks = prioritizedTasks.filter((item) => item.urgency === 'today')

  const urgentItems = useMemo(() => {
    const items: Array<{ key: string; icon: '❌' | '⚠️'; label: string; onClick?: () => void }> = []

    for (const item of overduePriorityTasks) {
      const task = item.task
      const dueLabel = item.d_day != null ? `D+${Math.abs(item.d_day)}` : '지연'
      items.push({
        key: `overdue-task-${task.id}`,
        icon: '❌',
        label: `${task.fund_name || task.gp_entity_name || '공통'} ${task.title} — ${dueLabel} 지연`,
        onClick: () => onOpenTask(task, true),
      })
    }

    for (const item of todayPriorityTasks) {
      const task = item.task
      items.push({
        key: `today-task-${task.id}`,
        icon: '⚠️',
        label: `${task.fund_name || task.gp_entity_name || '공통'} ${task.title} — D-day`,
        onClick: () => onOpenTask(task, true),
      })
    }

    for (const [index, alert] of urgentAlerts.entries()) {
      items.push({
        key: `alert-${index}-${alert.type}-${alert.due_date ?? 'none'}`,
        icon: alert.type === 'overdue' || alert.type === 'internal_review' ? '❌' : '⚠️',
        label: alert.message,
      })
    }

    return items
  }, [overduePriorityTasks, todayPriorityTasks, urgentAlerts, onOpenTask])

  const visibleUrgentItems = showAllUrgent ? urgentItems : urgentItems.slice(0, 3)

  return (
    <>
      {urgentItems.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-amber-900">긴급 알림</p>
            <button
              type="button"
              onClick={() => setShowAllUrgent((prev) => !prev)}
              className="cursor-pointer text-xs text-amber-700 hover:text-amber-900"
            >
              {showAllUrgent ? '접기' : `더보기 (${urgentItems.length})`}
            </button>
          </div>
          <div className="space-y-1">
            {visibleUrgentItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                className={`flex w-full items-start gap-2 rounded px-1 py-1 text-left text-xs text-amber-900 ${item.onClick ? 'cursor-pointer hover:bg-amber-100/70' : ''}`}
              >
                <span>{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
          {overdueTodayCount > 0 && (
            <p className="mt-1 text-[11px] text-amber-800">오늘 기준 지연 업무 {overdueTodayCount}건</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <DashboardStatCard
          label="오늘 우선업무"
          value={priorityHotCount}
          onClick={onOpenTaskBoard}
          variant={priorityHotCount > 0 ? 'danger' : 'default'}
          valueSuffix={priorityHotCount > 0 ? '즉시 확인' : null}
        />
        <DashboardStatCard
          label={`이번주 마감 (${thisWeekRangeLabel})`}
          value={thisWeekTasks.length}
          onClick={() => onOpenPopup('this_week')}
          variant="compact"
        />
        <DashboardStatCard
          label="진행 워크플로"
          value={activeWorkflows.length}
          onClick={() => onOpenPopup('workflows')}
          variant="compact"
        />
        <DashboardStatCard
          label="미수 서류"
          value={missingDocuments.length}
          onClick={() => onOpenPopup('documents')}
          variant={missingDocuments.length > 0 ? 'danger' : 'default'}
        />
        <DashboardStatCard
          label="오늘 완료"
          value={completedTodayCount}
          onClick={() => onOpenPopup('completed')}
          variant="emerald"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-2">
          <p className="px-1 text-xs text-gray-500">업무 {prioritizedTasks.length}건 · {taskGroups.length}그룹</p>
          <DashboardTaskPanels
            prioritizedTasks={prioritizedTasks}
            thisWeekTasks={thisWeekTasks}
            completedTasks={completedForTaskPanel}
            completingTaskId={completingTaskId}
            onOpenTask={onOpenTask}
            onQuickComplete={onQuickComplete}
            onOpenTaskBoard={onOpenTaskBoard}
          />
        </div>

        <div className="space-y-2">
          <p className="px-1 text-xs text-gray-500">워크플로 {activeWorkflows.length}건 · {workflowGroups.length}그룹</p>
          <DashboardWorkflowPanel
            activeWorkflows={activeWorkflows}
            loading={workflowsLoading}
            onOpenPopup={() => onOpenPopup('workflows')}
            onOpenWorkflow={onOpenWorkflow}
            onOpenTaskBoard={onOpenTaskBoard}
            onOpenPipeline={onOpenPipeline}
            onOpenWorkflowPage={() => navigate('/workflows')}
          />
        </div>
      </div>

      <DashboardRightPanel
        funds={fundSummary}
        reports={upcomingReports}
        missingDocuments={missingDocuments}
        investmentReviewActiveCount={investmentReviewActiveCount}
        totalNav={Math.round(totalNav || 0)}
        unpaidLpCount={unpaidLpCount}
        complianceOverdueCount={complianceSummary?.overdue_count || 0}
        completedTodayTasks={completedTodayTasks}
        completedThisWeekTasks={completedThisWeekTasks}
        completedLastWeekTasks={completedLastWeekTasks}
        completedTodayCount={completedTodayCount}
        completedThisWeekCount={completedThisWeekCount}
        widgetsLoading={sidebarLoading}
        completedLoading={completedLoading}
        onOpenTask={onOpenTask}
        onUndoComplete={onUndoComplete}
      />
    </>
  )
}

export default memo(DashboardDefaultView)
