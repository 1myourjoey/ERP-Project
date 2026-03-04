import type {
  ActiveWorkflow,
  DashboardDeadlineItem,
  DashboardFundSnapshotItem,
  DashboardFundsSnapshotResponse,
  Task,
} from '../../lib/api'
import FundSnapshot from './FundSnapshot'
import TodayPriorities from './TodayPriorities'

interface DashboardMainContentProps {
  todayPriorities: DashboardDeadlineItem[]
  weekDeadlines: DashboardDeadlineItem[]
  pipelineTodayTasks: Task[]
  pipelineTomorrowTasks: Task[]
  pipelineThisWeekTasks: Task[]
  pipelineUpcomingTasks: Task[]
  pipelineNoDeadlineTasks: Task[]
  pipelineActiveWorkflows: ActiveWorkflow[]
  fundRows: DashboardFundSnapshotItem[]
  fundTotals: DashboardFundsSnapshotResponse['totals']
  onNavigate: (path: string) => void
  onOpenFund: (fundId: number) => void
}

export default function DashboardMainContent({
  todayPriorities,
  weekDeadlines,
  pipelineTodayTasks,
  pipelineTomorrowTasks,
  pipelineThisWeekTasks,
  pipelineUpcomingTasks,
  pipelineNoDeadlineTasks,
  pipelineActiveWorkflows,
  fundRows,
  fundTotals,
  onNavigate,
  onOpenFund,
}: DashboardMainContentProps) {
  return (
    <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <TodayPriorities
          todayPriorities={todayPriorities}
          weekDeadlines={weekDeadlines}
          pipelineTodayTasks={pipelineTodayTasks}
          pipelineTomorrowTasks={pipelineTomorrowTasks}
          pipelineThisWeekTasks={pipelineThisWeekTasks}
          pipelineUpcomingTasks={pipelineUpcomingTasks}
          pipelineNoDeadlineTasks={pipelineNoDeadlineTasks}
          pipelineActiveWorkflows={pipelineActiveWorkflows}
          onNavigate={onNavigate}
        />
      </div>
      <div className="xl:col-span-1">
        <FundSnapshot
          rows={fundRows}
          totals={fundTotals}
          onOpenFund={onOpenFund}
          onOpenFunds={() => onNavigate('/funds')}
        />
      </div>
    </section>
  )
}
