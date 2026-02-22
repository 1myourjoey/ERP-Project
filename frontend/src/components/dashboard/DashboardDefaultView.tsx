import { memo } from 'react'
import { useNavigate } from 'react-router-dom'

import type {
  ActiveWorkflow,
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
  onUndoComplete: (taskId: number) => void
}

function DashboardDefaultView({
  baseDate,
  thisWeekRangeLabel,
  monthlyReminder,
  monthlyReminderPending,
  todayTasks,
  tomorrowTasks,
  thisWeekTasks,
  upcomingTasks,
  noDeadlineTasks,
  completedForTaskPanel,
  todayTotalEstimatedTime,
  tomorrowTotalEstimatedTime,
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
  sidebarLoading,
  completedLoading,
  completingTaskId,
  onOpenPopup,
  onGenerateMonthlyReminder,
  onOpenTask,
  onQuickComplete,
  onOpenQuickAdd,
  onOpenWorkflow,
  onOpenTaskBoard,
  onUndoComplete,
}: DashboardDefaultViewProps) {
  const navigate = useNavigate()
  const overdueTodayCount = todayTasks.filter((task) => {
    if (task.status === 'completed' || !task.deadline) return false
    const deadline = new Date(task.deadline)
    return !Number.isNaN(deadline.getTime()) && deadline.getTime() < Date.now()
  }).length

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <DashboardStatCard
          label="📋 오늘 업무"
          value={todayTasks.length}
          onClick={() => onOpenPopup('today')}
          variant={overdueTodayCount > 0 ? 'danger' : 'default'}
          valueSuffix={overdueTodayCount > 0 ? `(+${overdueTodayCount} 지연)` : null}
        />
        <DashboardStatCard label={`📅 이번 주 (${thisWeekRangeLabel})`} value={thisWeekTasks.length} onClick={() => onOpenPopup('this_week')} />
        <DashboardStatCard label="🔄 진행 워크플로" value={activeWorkflows.length} onClick={() => onOpenPopup('workflows')} />
        <DashboardStatCard label="📁 미수집 서류" value={missingDocuments.length} onClick={() => onOpenPopup('documents')} />
        <DashboardStatCard label="📊 보고 마감" value={upcomingReports.length} onClick={() => onOpenPopup('reports')} />
        <DashboardStatCard label="✅ 오늘 완료" value={completedTodayCount} onClick={() => onOpenPopup('completed')} variant="emerald" />
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <DashboardWorkflowPanel
            activeWorkflows={activeWorkflows}
            loading={workflowsLoading}
            onOpenPopup={() => onOpenPopup('workflows')}
            onOpenWorkflow={onOpenWorkflow}
            onOpenTaskBoard={onOpenTaskBoard}
            onOpenWorkflowPage={() => navigate('/workflows')}
          />
          <DashboardTaskPanels
            todayTasks={todayTasks}
            tomorrowTasks={tomorrowTasks}
            thisWeekTasks={thisWeekTasks}
            upcomingTasks={upcomingTasks}
            noDeadlineTasks={noDeadlineTasks}
            completedTasks={completedForTaskPanel}
            todayTotalEstimatedTime={todayTotalEstimatedTime}
            tomorrowTotalEstimatedTime={tomorrowTotalEstimatedTime}
            thisWeekRangeLabel={thisWeekRangeLabel}
            completingTaskId={completingTaskId}
            onOpenTask={onOpenTask}
            onQuickComplete={onQuickComplete}
            onOpenPopup={onOpenPopup}
            onOpenQuickAdd={onOpenQuickAdd}
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
