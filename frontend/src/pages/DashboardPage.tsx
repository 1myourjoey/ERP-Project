import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import CompleteModal from '../components/CompleteModal'
import EditTaskModal from '../components/EditTaskModal'
import PageLoading from '../components/PageLoading'
import DashboardDefaultView from '../components/dashboard/DashboardDefaultView'
import DashboardOverlayLayer from '../components/dashboard/DashboardOverlayLayer'
import { addDays, type PopupSection, weekRangeLabelMondayToSunday } from '../components/dashboard/dashboardUtils'
import { useToast } from '../contexts/ToastContext'
import {
  completeTask,
  createTask,
  fetchDashboardBase,
  fetchDashboardCompleted,
  fetchDashboardSummary,
  fetchDashboardSidebar,
  fetchDashboardWorkflows,
  fetchGPEntities,
  fetchWorkflowInstance,
  generateMonthlyReminders,
  undoCompleteTask,
  updateTask,
  type ActiveWorkflow,
  type DashboardBaseResponse,
  type DashboardCompletedResponse,
  type DashboardSummaryResponse,
  type DashboardSidebarResponse,
  type DashboardWorkflowsResponse,
  type GPEntity,
  type Task,
  type TaskCreate,
  type WorkflowInstance,
} from '../lib/api'
import { STALE_TIMES } from '../lib/constants'
import { formatDate } from '../lib/format'
import { queryKeys } from '../lib/queryKeys'
import { invalidateTaskRelated } from '../lib/queryInvalidation'

const DAY_LABEL = {
  Mon: '월',
  Tue: '화',
  Wed: '수',
  Thu: '목',
  Fri: '금',
  Sat: '토',
  Sun: '일',
} as const

export default function DashboardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [completingTask, setCompletingTask] = useState<Task | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [selectedTaskEditable, setSelectedTaskEditable] = useState(true)
  const [showQuickAddModal, setShowQuickAddModal] = useState(false)
  const [quickAddDefaultDate, setQuickAddDefaultDate] = useState('')
  const [quickAddDefaultFundId, setQuickAddDefaultFundId] = useState<number | null>(null)
  const [popupSection, setPopupSection] = useState<PopupSection | null>(null)
  const [selectedWorkflow, setSelectedWorkflow] = useState<ActiveWorkflow | null>(null)

  const shouldLoadSidebar = true
  const shouldLoadCompleted = true

  const openTaskDetail = useCallback((task: Task, editable = true) => {
    setSelectedTask(task)
    setSelectedTaskEditable(editable)
  }, [])

  const { data: baseData, isLoading: baseLoading, error: baseError } = useQuery<DashboardBaseResponse>({
    queryKey: queryKeys.dashboard.base,
    queryFn: fetchDashboardBase,
    staleTime: STALE_TIMES.DASHBOARD,
  })
  const { data: workflowsData, isLoading: workflowsLoading } = useQuery<DashboardWorkflowsResponse>({
    queryKey: queryKeys.dashboard.workflows,
    queryFn: fetchDashboardWorkflows,
    staleTime: STALE_TIMES.DASHBOARD,
  })
  const { data: sidebarData, isLoading: sidebarLoading } = useQuery<DashboardSidebarResponse>({
    queryKey: queryKeys.dashboard.sidebar,
    queryFn: fetchDashboardSidebar,
    enabled: shouldLoadSidebar,
    staleTime: STALE_TIMES.DASHBOARD,
  })
  const { data: completedData, isLoading: completedLoading } = useQuery<DashboardCompletedResponse>({
    queryKey: queryKeys.dashboard.completed,
    queryFn: fetchDashboardCompleted,
    enabled: shouldLoadCompleted,
    staleTime: STALE_TIMES.DASHBOARD,
  })
  const { data: summaryData, isError: summaryError } = useQuery<DashboardSummaryResponse>({
    queryKey: queryKeys.dashboard.summary,
    queryFn: fetchDashboardSummary,
    staleTime: STALE_TIMES.DASHBOARD,
  })
  const { data: gpEntities = [] } = useQuery<GPEntity[]>({
    queryKey: ['gp-entities'],
    queryFn: fetchGPEntities,
  })
  const { data: selectedWorkflowInstance, isLoading: selectedWorkflowLoading } = useQuery<WorkflowInstance>({
    queryKey: ['workflowInstance', selectedWorkflow?.id],
    queryFn: () => fetchWorkflowInstance(selectedWorkflow!.id),
    enabled: selectedWorkflow !== null,
  })

  const invalidateDashboardQueries = useCallback(() => {
    invalidateTaskRelated(queryClient)
    queryClient.invalidateQueries({ queryKey: ['funds'] })
  }, [queryClient])

  const completeTaskMut = useMutation({
    mutationFn: ({ id, actualTime, autoWorklog, memo }: { id: number; actualTime: string; autoWorklog: boolean; memo?: string }) =>
      completeTask(id, actualTime, autoWorklog, memo),
    onSuccess: () => {
      invalidateDashboardQueries()
      addToast('success', '업무를 완료했습니다.')
    },
  })
  const undoCompleteMut = useMutation({
    mutationFn: undoCompleteTask,
    onSuccess: () => {
      invalidateDashboardQueries()
      addToast('success', '완료를 취소했습니다.')
    },
  })
  const monthlyReminderMut = useMutation({
    mutationFn: generateMonthlyReminders,
    onSuccess: () => {
      invalidateDashboardQueries()
      addToast('success', '월간 보고 업무를 생성했습니다.')
    },
  })
  const createTaskMut = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      invalidateDashboardQueries()
      setShowQuickAddModal(false)
      addToast('success', '업무가 추가되었습니다.')
    },
  })
  const updateTaskMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TaskCreate> }) => updateTask(id, data),
    onSuccess: () => {
      invalidateDashboardQueries()
      setEditingTask(null)
      addToast('success', '업무를 수정했습니다.')
    },
  })

  const baseDate = baseData?.date ?? new Date().toISOString().slice(0, 10)
  const thisWeekRangeLabel = useMemo(() => weekRangeLabelMondayToSunday(baseDate), [baseDate])
  const popupTitle = useMemo(() => {
    if (popupSection === 'today') return '📋 오늘 업무'
    if (popupSection === 'tomorrow') return '📆 내일 업무'
    if (popupSection === 'this_week') return `📅 이번 주 업무 (${thisWeekRangeLabel})`
    if (popupSection === 'workflows') return '🔄 진행 워크플로'
    if (popupSection === 'documents') return '📁 미수집 서류'
    if (popupSection === 'reports') return '📊 보고 마감'
    return '✅ 오늘 완료'
  }, [popupSection, thisWeekRangeLabel])

  const openQuickAdd = useCallback((target: 'today' | 'tomorrow', fundId?: number | null) => {
    setQuickAddDefaultDate(target === 'today' ? baseDate : addDays(baseDate, 1))
    setQuickAddDefaultFundId(fundId ?? null)
    setShowQuickAddModal(true)
  }, [baseDate])

  if (baseLoading) return <PageLoading />
  if (baseError || !baseData) {
    return <div className="page-container text-sm text-red-500">대시보드 데이터를 불러오지 못했습니다.</div>
  }

  const todayTasks = Array.isArray(baseData.today?.tasks) ? baseData.today.tasks : []
  const tomorrowTasks = Array.isArray(baseData.tomorrow?.tasks) ? baseData.tomorrow.tasks : []
  const thisWeekTasks = Array.isArray(baseData.this_week) ? baseData.this_week : []
  const upcomingTasks = Array.isArray(baseData.upcoming) ? baseData.upcoming : []
  const noDeadlineTasks = Array.isArray(baseData.no_deadline) ? baseData.no_deadline : []
  const prioritizedTasks = Array.isArray(baseData.prioritized_tasks) ? baseData.prioritized_tasks : []

  const activeWorkflows = workflowsData?.active_workflows ?? []
  const fundSummary = sidebarData?.fund_summary ?? []
  const missingDocuments = sidebarData?.missing_documents ?? []
  const upcomingReports = sidebarData?.upcoming_reports ?? []

  const completedTodayTasks = completedData?.completed_today ?? []
  const completedThisWeekTasks = completedData?.completed_this_week ?? []
  const completedLastWeekTasks = completedData?.completed_last_week ?? []
  const completedTodayCount = completedData?.completed_today_count ?? 0
  const completedThisWeekCount = completedData?.completed_this_week_count ?? 0
  const briefingData: DashboardSummaryResponse = summaryData ?? {
    urgent_notifications: (baseData.urgent_alerts ?? []).map((item, index) => ({
      id: index + 1,
      title: item.message,
      message: item.due_date ? `마감일 ${item.due_date}` : null,
      action_url: item.type === 'compliance' ? '/compliance' : '/tasks',
    })),
    today_tasks: {
      total: todayTasks.length,
      completed: todayTasks.filter((task) => task.status === 'completed').length,
      in_progress: todayTasks.filter((task) => task.status === 'in_progress').length,
    },
    pending_approvals: {
      journals: 0,
      distributions: 0,
      fees: baseData.pending_fee_count || 0,
    },
    deadlines_this_week: thisWeekTasks.map((task) => ({
      type: 'task',
      id: task.id,
      title: task.title,
      due_date: task.deadline || null,
    })),
    weekly_events: upcomingReports.map((report) => ({
      id: report.id,
      title: report.report_target || report.fund_name || '보고 일정',
      date: report.due_date || null,
      type: 'report',
      status: report.status || null,
    })),
    fund_overview: {
      active_funds: fundSummary.length,
      total_aum: baseData.total_nav || 0,
      next_call: null,
    },
  }

  return (
    <div className="page-container space-y-6">
      <div className="page-header mb-0">
        <div>
          <h2 className="page-title">
            {`${formatDate(baseData.date, 'short')} (${DAY_LABEL[baseData.day_of_week as keyof typeof DAY_LABEL] || baseData.day_of_week})`}
          </h2>
          <p className="page-subtitle">
            오늘의 업무와 마감 일정을 확인하세요.
          </p>
        </div>
      </div>

      <div className="card-base space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-700">오늘의 브리핑</h3>
          <div className="text-xs text-[var(--theme-text-secondary)]">
            예상 작업시간: {baseData.today.total_estimated_time || '0m'}
          </div>
        </div>

        {summaryError && (
          <p className="text-xs text-[var(--color-warning)]">요약 API를 불러오지 못해 기본 데이터로 표시 중입니다.</p>
        )}

        {briefingData.urgent_notifications.length > 0 && (
          <div className="warning-banner">
            <div className="info-banner-icon">⚠</div>
            <div className="info-banner-text">
              긴급 알림 {briefingData.urgent_notifications.length}건
            </div>
          </div>
        )}

        {briefingData.urgent_notifications.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {briefingData.urgent_notifications.slice(0, 4).map((item) => (
              <button
                key={item.id}
                type="button"
                className="rounded border border-[var(--theme-border)] bg-[var(--theme-bg-elevated)] px-3 py-2 text-left hover:bg-[var(--theme-hover)]"
                onClick={() => navigate(item.action_url || '/dashboard')}
              >
                <p className="text-sm font-medium text-[var(--theme-text-primary)]">{item.title}</p>
                {item.message && (
                  <p className="mt-1 text-xs text-[var(--theme-text-secondary)] line-clamp-2">{item.message}</p>
                )}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--theme-text-secondary)]">긴급 알림이 없습니다.</p>
        )}

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <button type="button" onClick={() => navigate('/tasks')} className="rounded border border-[var(--theme-border)] p-3 text-left hover:bg-[var(--theme-hover)]">
            <p className="text-[11px] text-[var(--theme-text-secondary)]">오늘 태스크</p>
            <p className="text-lg font-semibold">{briefingData.today_tasks.total}건</p>
          </button>
          <button type="button" onClick={() => navigate('/accounting')} className="rounded border border-[var(--theme-border)] p-3 text-left hover:bg-[var(--theme-hover)]">
            <p className="text-[11px] text-[var(--theme-text-secondary)]">승인 대기</p>
            <p className="text-lg font-semibold">
              {briefingData.pending_approvals.journals + briefingData.pending_approvals.distributions + briefingData.pending_approvals.fees}건
            </p>
          </button>
          <button type="button" onClick={() => navigate('/tasks?due=week')} className="rounded border border-[var(--theme-border)] p-3 text-left hover:bg-[var(--theme-hover)]">
            <p className="text-[11px] text-[var(--theme-text-secondary)]">주간 마감</p>
            <p className="text-lg font-semibold">{briefingData.deadlines_this_week.length}건</p>
          </button>
          <button type="button" onClick={() => navigate('/funds')} className="rounded border border-[var(--theme-border)] p-3 text-left hover:bg-[var(--theme-hover)]">
            <p className="text-[11px] text-[var(--theme-text-secondary)]">활성 펀드</p>
            <p className="text-lg font-semibold">{briefingData.fund_overview.active_funds}개</p>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded border border-[var(--theme-border)] p-3">
            <h4 className="text-sm font-semibold text-[var(--theme-text-primary)]">이번 주 주요 일정</h4>
            <div className="mt-2 space-y-1.5">
              {briefingData.weekly_events.length === 0 && (
                <p className="text-xs text-[var(--theme-text-secondary)]">등록된 일정이 없습니다.</p>
              )}
              {briefingData.weekly_events.slice(0, 5).map((event) => (
                <div key={event.id} className="flex items-center justify-between rounded bg-[var(--theme-bg-elevated)] px-2.5 py-2">
                  <span className="text-xs font-medium text-[var(--theme-text-primary)]">{event.title}</span>
                  <span className="text-[11px] text-[var(--theme-text-secondary)]">{event.date ? formatDate(event.date, 'short') : '-'}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded border border-[var(--theme-border)] p-3">
            <h4 className="text-sm font-semibold text-[var(--theme-text-primary)]">빠른 처리</h4>
            <div className="mt-2 space-y-2 text-xs">
              <div className="flex items-center justify-between rounded bg-[var(--theme-bg-elevated)] px-2.5 py-2">
                <span>분개 미결재</span>
                <button type="button" className="secondary-btn btn-sm" onClick={() => navigate('/accounting')}>{briefingData.pending_approvals.journals}건</button>
              </div>
              <div className="flex items-center justify-between rounded bg-[var(--theme-bg-elevated)] px-2.5 py-2">
                <span>배분 초안</span>
                <button type="button" className="secondary-btn btn-sm" onClick={() => navigate('/funds')}>{briefingData.pending_approvals.distributions}건</button>
              </div>
              <div className="flex items-center justify-between rounded bg-[var(--theme-bg-elevated)] px-2.5 py-2">
                <span>수수료 승인</span>
                <button type="button" className="secondary-btn btn-sm" onClick={() => navigate('/fee-management')}>{briefingData.pending_approvals.fees}건</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DashboardDefaultView
        baseDate={baseData.date}
        thisWeekRangeLabel={thisWeekRangeLabel}
        monthlyReminder={baseData.monthly_reminder}
        monthlyReminderPending={monthlyReminderMut.isPending}
        todayTasks={todayTasks}
        tomorrowTasks={tomorrowTasks}
        thisWeekTasks={thisWeekTasks}
        upcomingTasks={upcomingTasks}
        noDeadlineTasks={noDeadlineTasks}
        prioritizedTasks={prioritizedTasks}
        completedForTaskPanel={completedTodayTasks}
        todayTotalEstimatedTime={baseData.today.total_estimated_time || '0m'}
        tomorrowTotalEstimatedTime={baseData.tomorrow.total_estimated_time || '0m'}
        activeWorkflows={activeWorkflows}
        workflowsLoading={workflowsLoading}
        fundSummary={fundSummary}
        missingDocuments={missingDocuments}
        upcomingReports={upcomingReports}
        completedTodayTasks={completedTodayTasks}
        completedThisWeekTasks={completedThisWeekTasks}
        completedLastWeekTasks={completedLastWeekTasks}
        completedTodayCount={completedTodayCount}
        completedThisWeekCount={completedThisWeekCount}
        investmentReviewActiveCount={baseData.investment_review_active_count || 0}
        totalNav={baseData.total_nav || 0}
        unpaidLpCount={baseData.unpaid_lp_count || 0}
        pendingFeeCount={baseData.pending_fee_count || 0}
        bizReportInProgressCount={baseData.biz_report_in_progress_count || 0}
        complianceSummary={baseData.compliance}
        docCollectionSummary={baseData.doc_collection}
        urgentAlerts={baseData.urgent_alerts}
        sidebarLoading={sidebarLoading}
        completedLoading={completedLoading}
        completingTaskId={completeTaskMut.variables?.id ?? null}
        onOpenPopup={setPopupSection}
        onGenerateMonthlyReminder={(yearMonth) => monthlyReminderMut.mutate(yearMonth)}
        onOpenTask={openTaskDetail}
        onQuickComplete={setCompletingTask}
        onOpenQuickAdd={openQuickAdd}
        onOpenWorkflow={setSelectedWorkflow}
        onOpenTaskBoard={() => navigate('/tasks')}
        onOpenPipeline={() => navigate('/tasks?view=pipeline')}
        onUndoComplete={(taskId) => undoCompleteMut.mutate(taskId)}
      />

      <DashboardOverlayLayer
        showQuickAddModal={showQuickAddModal}
        quickAddDefaultDate={quickAddDefaultDate}
        baseDate={baseData.date}
        fundSummary={fundSummary}
        gpEntities={gpEntities}
        quickAddDefaultFundId={quickAddDefaultFundId}
        popupSection={popupSection}
        popupTitle={popupTitle}
        todayTasks={todayTasks}
        tomorrowTasks={tomorrowTasks}
        thisWeekTasks={thisWeekTasks}
        activeWorkflows={activeWorkflows}
        missingDocuments={missingDocuments}
        upcomingReports={upcomingReports}
        completedTodayTasks={completedTodayTasks}
        selectedWorkflow={selectedWorkflow}
        selectedWorkflowInstance={selectedWorkflowInstance}
        selectedWorkflowLoading={selectedWorkflowLoading}
        selectedTask={selectedTask}
        selectedTaskEditable={selectedTaskEditable}
        onCreateTask={(task) => createTaskMut.mutateAsync(task)}
        onCloseQuickAddModal={() => setShowQuickAddModal(false)}
        onClosePopup={() => setPopupSection(null)}
        onOpenTask={openTaskDetail}
        onOpenWorkflow={setSelectedWorkflow}
        onUndoComplete={(taskId) => undoCompleteMut.mutate(taskId)}
        onCloseWorkflowModal={() => setSelectedWorkflow(null)}
        onCloseTaskModal={() => setSelectedTask(null)}
        onCompleteTask={(task) => {
          setSelectedTask(null)
          setCompletingTask(task)
        }}
      />

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          funds={fundSummary.map((fund) => ({ id: fund.id, name: fund.name }))}
          gpEntities={gpEntities}
          onSave={(id, payload) => updateTaskMut.mutate({ id, data: payload })}
          onCancel={() => setEditingTask(null)}
        />
      )}

      {completingTask && (
        <CompleteModal
          task={completingTask}
          onConfirm={(actualTime, autoWorklog, memo) => {
            completeTaskMut.mutate(
              { id: completingTask.id, actualTime, autoWorklog, memo },
              { onSettled: () => setCompletingTask(null) },
            )
          }}
          onCancel={() => setCompletingTask(null)}
        />
      )}
    </div>
  )
}
