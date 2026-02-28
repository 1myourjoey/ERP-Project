import { memo } from 'react'
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
  baseDate,
  thisWeekRangeLabel,
  monthlyReminder,
  monthlyReminderPending,
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
  onGenerateMonthlyReminder,
  onOpenTask,
  onQuickComplete,
  onOpenWorkflow,
  onOpenTaskBoard,
  onOpenPipeline,
  onUndoComplete,
}: DashboardDefaultViewProps) {
  const navigate = useNavigate()
  const overdueTodayCount = todayTasks.filter((task) => {
    if (task.status === 'completed' || !task.deadline) return false
    const deadline = new Date(task.deadline)
    return !Number.isNaN(deadline.getTime()) && deadline.getTime() < Date.now()
  }).length
  const priorityHotCount = prioritizedTasks.filter(
    (item) => item.urgency === 'overdue' || item.urgency === 'today',
  ).length

  return (
    <>
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
        />
        <DashboardStatCard
          label="진행 워크플로"
          value={activeWorkflows.length}
          onClick={() => onOpenPopup('workflows')}
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <DashboardStatCard label="심의 진행" value={investmentReviewActiveCount} onClick={() => navigate('/investment-reviews')} />
        <DashboardStatCard label="운용 NAV" value={Math.round(totalNav || 0)} valueSuffix="원" onClick={() => navigate('/valuations')} />
        <DashboardStatCard label="미납 LP" value={unpaidLpCount} onClick={() => navigate('/fund-operations')} variant={unpaidLpCount > 0 ? 'danger' : 'default'} />
        <DashboardStatCard
          label="컴플라이언스"
          value={complianceSummary?.overdue_count || 0}
          valueSuffix={`주간 ${complianceSummary?.due_this_week || 0}`}
          onClick={() => navigate('/compliance')}
          variant={(complianceSummary?.overdue_count || 0) > 0 ? 'danger' : 'default'}
        />
      </div>

      {monthlyReminder && (
        <div className="warning-banner">
          <p className="flex-1 text-sm text-amber-900">이번 달 월간 보고 Task가 아직 생성되지 않았습니다.</p>
          <button
            onClick={() => onGenerateMonthlyReminder(baseDate.slice(0, 7))}
            disabled={monthlyReminderPending}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs text-white hover:bg-amber-700 disabled:bg-amber-300"
          >
            {monthlyReminderPending ? '생성 중...' : '지금 생성'}
          </button>
        </div>
      )}

      {(urgentAlerts.length > 0 || overdueTodayCount > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="mb-2 text-sm font-semibold text-amber-900">긴급 알림</p>
          <div className="space-y-1">
            {overdueTodayCount > 0 && (
              <p className="text-sm text-amber-900">• 오늘 기준 지연 업무 {overdueTodayCount}건</p>
            )}
            {urgentAlerts.map((alert, index) => (
              <p key={`${alert.type}-${alert.due_date}-${index}`} className="text-sm text-amber-900">
                • {alert.message}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <DashboardWorkflowPanel
            activeWorkflows={activeWorkflows}
            loading={workflowsLoading}
            onOpenPopup={() => onOpenPopup('workflows')}
            onOpenWorkflow={onOpenWorkflow}
            onOpenTaskBoard={onOpenTaskBoard}
            onOpenPipeline={onOpenPipeline}
            onOpenWorkflowPage={() => navigate('/workflows')}
          />
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

        <DashboardRightPanel
          funds={fundSummary}
          reports={upcomingReports}
          missingDocuments={missingDocuments}
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
