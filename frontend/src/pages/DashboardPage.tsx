import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import PageLoading from '../components/PageLoading'
import DashboardAlertBar from '../components/dashboard/DashboardAlertBar'
import DashboardBottomRow from '../components/dashboard/DashboardBottomRow'
import DashboardHeader from '../components/dashboard/DashboardHeader'
import DashboardHealthCards from '../components/dashboard/DashboardHealthCards'
import DashboardMainContent from '../components/dashboard/DashboardMainContent'
import {
  fetchDashboardBase,
  fetchDashboardDeadlines,
  fetchDashboardFundsSnapshot,
  fetchDashboardHealth,
  fetchDashboardPipeline,
  fetchDashboardWorkflows,
  type DashboardBaseResponse,
  type DashboardDeadlinesResponse,
  type DashboardFundsSnapshotResponse,
  type DashboardHealthDomain,
  type DashboardHealthResponse,
  type DashboardPipelineResponse,
  type DashboardWorkflowsResponse,
} from '../lib/api'
import { STALE_TIMES } from '../lib/constants'
import { formatDate } from '../lib/format'
import { queryKeys } from '../lib/queryKeys'

const DAY_LABEL = {
  Mon: '월',
  Tue: '화',
  Wed: '수',
  Thu: '목',
  Fri: '금',
  Sat: '토',
  Sun: '일',
} as const

function emptyDomain(label: string): DashboardHealthDomain {
  return {
    score: 100,
    factors: {},
    label,
    severity: 'good',
  }
}

export default function DashboardPage() {
  const navigate = useNavigate()

  const baseQuery = useQuery<DashboardBaseResponse>({
    queryKey: queryKeys.dashboard.base,
    queryFn: fetchDashboardBase,
    staleTime: STALE_TIMES.DASHBOARD,
  })
  const healthQuery = useQuery<DashboardHealthResponse>({
    queryKey: queryKeys.dashboard.health,
    queryFn: fetchDashboardHealth,
    staleTime: STALE_TIMES.DASHBOARD,
  })
  const deadlinesQuery = useQuery<DashboardDeadlinesResponse>({
    queryKey: queryKeys.dashboard.deadlines,
    queryFn: fetchDashboardDeadlines,
    staleTime: STALE_TIMES.DASHBOARD,
  })
  const fundsSnapshotQuery = useQuery<DashboardFundsSnapshotResponse>({
    queryKey: queryKeys.dashboard.fundsSnapshot,
    queryFn: fetchDashboardFundsSnapshot,
    staleTime: STALE_TIMES.DASHBOARD,
  })
  const workflowsQuery = useQuery<DashboardWorkflowsResponse>({
    queryKey: queryKeys.dashboard.workflows,
    queryFn: fetchDashboardWorkflows,
    staleTime: STALE_TIMES.DASHBOARD,
  })
  const pipelineQuery = useQuery<DashboardPipelineResponse>({
    queryKey: queryKeys.dashboard.pipeline,
    queryFn: fetchDashboardPipeline,
    staleTime: STALE_TIMES.DASHBOARD,
  })

  if (baseQuery.isLoading) return <PageLoading />
  if (baseQuery.isError || !baseQuery.data) {
    return <div className="page-container text-sm text-red-500">대시보드 데이터를 불러오지 못했습니다.</div>
  }

  const baseData = baseQuery.data
  const healthData: DashboardHealthResponse = healthQuery.data ?? {
    overall_score: 100,
    domains: {
      tasks: emptyDomain('대기 0건'),
      funds: emptyDomain('활성 0개'),
      investment_review: emptyDomain('심의 0건'),
      compliance: emptyDomain('의무 0건'),
      reports: emptyDomain('마감 0건'),
      documents: emptyDomain('미수 0건'),
    },
    alerts: [],
  }
  const deadlinesData: DashboardDeadlinesResponse = deadlinesQuery.data ?? {
    generated_at: baseData.date,
    today_priorities: [],
    this_week_deadlines: [],
  }
  const fundsSnapshotData: DashboardFundsSnapshotResponse = fundsSnapshotQuery.data ?? {
    rows: [],
    totals: {
      total_nav: 0,
      total_lp_count: 0,
      total_missing_documents: 0,
    },
  }
  const workflowsData = workflowsQuery.data ?? { active_workflows: [] }
  const pipelineData = pipelineQuery.data ?? { total_count: 0, stages: [] }
  const pipelineTodayTasks = Array.isArray(baseData.today?.tasks) ? baseData.today.tasks : []
  const pipelineTomorrowTasks = Array.isArray(baseData.tomorrow?.tasks) ? baseData.tomorrow.tasks : []
  const pipelineThisWeekTasks = Array.isArray(baseData.this_week) ? baseData.this_week : []
  const pipelineUpcomingTasks = Array.isArray(baseData.upcoming) ? baseData.upcoming : []
  const pipelineNoDeadlineTasks = Array.isArray(baseData.no_deadline) ? baseData.no_deadline : []

  const day = DAY_LABEL[baseData.day_of_week as keyof typeof DAY_LABEL] || baseData.day_of_week
  const dateLabel = `${formatDate(baseData.date, 'short')} (${day})`

  return (
    <div className="page-container space-y-3">
      <DashboardHeader
        dateLabel={dateLabel}
        overallScore={healthData.overall_score}
        onOpenTaskBoard={() => navigate('/tasks')}
        onOpenCalendar={() => navigate('/calendar')}
      />

      <DashboardAlertBar alerts={healthData.alerts} onNavigate={(path) => navigate(path)} />

      <DashboardHealthCards domains={healthData.domains} onNavigate={(path) => navigate(path)} />

      <DashboardMainContent
        todayPriorities={deadlinesData.today_priorities}
        weekDeadlines={deadlinesData.this_week_deadlines}
        prioritizedTasks={baseData.prioritized_tasks}
        pipelineTodayTasks={pipelineTodayTasks}
        pipelineTomorrowTasks={pipelineTomorrowTasks}
        pipelineThisWeekTasks={pipelineThisWeekTasks}
        pipelineUpcomingTasks={pipelineUpcomingTasks}
        pipelineNoDeadlineTasks={pipelineNoDeadlineTasks}
        pipelineActiveWorkflows={workflowsData.active_workflows}
        fundRows={fundsSnapshotData.rows}
        fundTotals={fundsSnapshotData.totals}
        onNavigate={(path) => navigate(path)}
        onOpenTask={(taskId) => navigate('/tasks', { state: { highlightTaskId: taskId } })}
        onOpenFund={(fundId) => navigate(`/funds/${fundId}`)}
      />

      <DashboardBottomRow
        pipeline={pipelineData}
        workflows={workflowsData.active_workflows}
        weekDeadlines={deadlinesData.this_week_deadlines}
        onNavigate={(path) => navigate(path)}
        onOpenWorkflow={(workflow) => navigate('/workflows', { state: { expandInstanceId: workflow.id } })}
      />
    </div>
  )
}
