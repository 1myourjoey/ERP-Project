import { memo, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, GitBranch, KanbanSquare, Plus } from 'lucide-react'

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
  onOpenQuickAdd,
  onOpenWorkflow,
  onOpenTaskBoard,
  onOpenPipeline,
  onUndoComplete,
}: DashboardDefaultViewProps) {
  const navigate = useNavigate()
  const [showAllUrgent, setShowAllUrgent] = useState(false)

  const taskGroups = useMemo(() => groupPrioritizedTasks(prioritizedTasks), [prioritizedTasks])
  const workflowGroups = useMemo(() => groupWorkflows(activeWorkflows), [activeWorkflows])

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
    const items: Array<{ key: string; icon: 'warning' | 'pin'; label: string; onClick?: () => void }> = []

    for (const item of overduePriorityTasks) {
      const task = item.task
      const dueLabel = item.d_day != null ? `D+${Math.abs(item.d_day)}` : '지연'
      items.push({
        key: `overdue-task-${task.id}`,
        icon: 'warning',
        label: `${task.fund_name || task.gp_entity_name || '공통'} ${task.title} · ${dueLabel} 지연`,
        onClick: () => onOpenTask(task, true),
      })
    }

    for (const item of todayPriorityTasks) {
      const task = item.task
      items.push({
        key: `today-task-${task.id}`,
        icon: 'pin',
        label: `${task.fund_name || task.gp_entity_name || '공통'} ${task.title} · D-day`,
        onClick: () => onOpenTask(task, true),
      })
    }

    for (const [index, alert] of urgentAlerts.entries()) {
      items.push({
        key: `alert-${index}-${alert.type}-${alert.due_date ?? 'none'}`,
        icon: alert.type === 'overdue' || alert.type === 'internal_review' ? 'warning' : 'pin',
        label: alert.message,
      })
    }

    return items
  }, [overduePriorityTasks, todayPriorityTasks, urgentAlerts, onOpenTask])

  const visibleUrgentItems = showAllUrgent ? urgentItems : urgentItems.slice(0, 3)

  return (
    <>
      {urgentItems.length > 0 && (
        <div className="warning-banner">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">긴급 알림</p>
            <button
              type="button"
              onClick={() => setShowAllUrgent((prev) => !prev)}
              className="cursor-pointer text-xs hover:opacity-80"
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
                className={`flex w-full items-start gap-2 rounded px-1 py-1 text-left text-sm ${
                  item.onClick ? 'cursor-pointer hover:bg-amber-100/70' : ''
                }`}
              >
                <span
                  className={`inline-flex min-w-8 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    item.icon === 'warning'
                      ? 'bg-amber-200/80 text-amber-900'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {item.icon === 'warning' ? '주의' : '안내'}
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
          {overdueTodayCount > 0 && (
            <p className="mt-1 text-[11px] text-amber-800">오늘 기한 지연 업무 {overdueTodayCount}건</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
          variant="default"
        />
        <DashboardStatCard
          label="진행 워크플로"
          value={activeWorkflows.length}
          onClick={() => onOpenPopup('workflows')}
          variant="default"
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
          variant="success"
        />
      </div>

      <div className="card-base py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700">빠른 실행</h3>
          <p className="text-xs text-slate-500">반복 동선을 줄이기 위한 바로가기</p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          <button
            type="button"
            onClick={() => onOpenQuickAdd('today')}
            className="secondary-btn justify-start gap-2"
          >
            <Plus size={14} />
            오늘 업무 추가
          </button>
          <button
            type="button"
            onClick={() => onOpenQuickAdd('tomorrow')}
            className="secondary-btn justify-start gap-2"
          >
            <CalendarDays size={14} />
            내일 일정 등록
          </button>
          <button
            type="button"
            onClick={onOpenPipeline}
            className="secondary-btn justify-start gap-2"
          >
            <KanbanSquare size={14} />
            파이프라인 보기
          </button>
          <button
            type="button"
            onClick={() => navigate('/workflows')}
            className="secondary-btn justify-start gap-2"
          >
            <GitBranch size={14} />
            워크플로 관리
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-2">
          <p className="mb-1 px-1 text-xs text-slate-400">
            업무 {prioritizedTasks.length}건 · {taskGroups.length}그룹
          </p>
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
          <p className="mb-1 px-1 text-xs text-slate-400">
            워크플로 {activeWorkflows.length}건 · {workflowGroups.length}그룹
          </p>
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

      <div className="mt-2">
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
      </div>
    </>
  )
}

export default memo(DashboardDefaultView)
