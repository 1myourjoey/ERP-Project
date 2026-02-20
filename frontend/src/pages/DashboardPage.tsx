import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import CompleteModal from '../components/CompleteModal'
import EditTaskModal from '../components/EditTaskModal'
import PageLoading from '../components/PageLoading'
import TaskPipelineView from '../components/TaskPipelineView'
import DashboardDefaultView from '../components/dashboard/DashboardDefaultView'
import DashboardOverlayLayer from '../components/dashboard/DashboardOverlayLayer'
import { addDays, type PopupSection, weekRangeLabelMondayToSunday } from '../components/dashboard/dashboardUtils'
import { useToast } from '../contexts/ToastContext'
import {
  completeTask,
  createTask,
  fetchDashboardBase,
  fetchDashboardCompleted,
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
  type DashboardSidebarResponse,
  type DashboardWorkflowsResponse,
  type GPEntity,
  type Task,
  type TaskCreate,
  type WorkflowInstance,
} from '../lib/api'

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
  const [searchParams, setSearchParams] = useSearchParams()
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

  const dashboardView = searchParams.get('view') === 'pipeline' ? 'pipeline' : 'default'
  const shouldLoadSidebar = dashboardView === 'default' || editingTask !== null || showQuickAddModal
  const shouldLoadCompleted = dashboardView === 'default'

  const setDashboardView = useCallback((view: 'default' | 'pipeline') => {
    setSearchParams(view === 'pipeline' ? { view: 'pipeline' } : {}, { replace: false })
  }, [setSearchParams])

  const openTaskDetail = useCallback((task: Task, editable = true) => {
    if (dashboardView === 'pipeline' && editable) {
      setEditingTask(task)
      return
    }
    setSelectedTask(task)
    setSelectedTaskEditable(editable)
  }, [dashboardView])

  const { data: baseData, isLoading: baseLoading, error: baseError } = useQuery<DashboardBaseResponse>({
    queryKey: ['dashboard-base'],
    queryFn: fetchDashboardBase,
  })
  const { data: workflowsData, isLoading: workflowsLoading } = useQuery<DashboardWorkflowsResponse>({
    queryKey: ['dashboard-workflows'],
    queryFn: fetchDashboardWorkflows,
    staleTime: 30_000,
  })
  const { data: sidebarData, isLoading: sidebarLoading } = useQuery<DashboardSidebarResponse>({
    queryKey: ['dashboard-sidebar'],
    queryFn: fetchDashboardSidebar,
    enabled: shouldLoadSidebar,
    staleTime: 30_000,
  })
  const { data: completedData, isLoading: completedLoading } = useQuery<DashboardCompletedResponse>({
    queryKey: ['dashboard-completed'],
    queryFn: fetchDashboardCompleted,
    enabled: shouldLoadCompleted,
    staleTime: 30_000,
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
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-base'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-workflows'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-sidebar'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-completed'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-upcoming-notices'] })
    queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
    queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
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

  const activeWorkflows = workflowsData?.active_workflows ?? []
  const fundSummary = sidebarData?.fund_summary ?? []
  const missingDocuments = sidebarData?.missing_documents ?? []
  const upcomingReports = sidebarData?.upcoming_reports ?? []

  const completedTodayTasks = completedData?.completed_today ?? []
  const completedThisWeekTasks = completedData?.completed_this_week ?? []
  const completedLastWeekTasks = completedData?.completed_last_week ?? []
  const completedTodayCount = completedData?.completed_today_count ?? 0
  const completedThisWeekCount = completedData?.completed_this_week_count ?? 0

  return (
    <div className={dashboardView === 'pipeline' ? 'mx-auto w-full max-w-[1600px] space-y-4 px-4 py-6' : 'page-container space-y-6'}>
      <div className="page-header mb-0">
        <div>
          <h2 className="page-title">
            {dashboardView === 'pipeline'
              ? '업무 파이프라인'
              : `${new Date(baseData.date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} (${DAY_LABEL[baseData.day_of_week as keyof typeof DAY_LABEL] || baseData.day_of_week})`}
          </h2>
          <p className="page-subtitle">
            {dashboardView === 'pipeline' ? '업무 단계를 한 화면에서 확인하세요.' : '오늘의 업무와 마감 일정을 확인하세요.'}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
          <button
            onClick={() => setDashboardView('default')}
            className={`rounded-md px-3 py-1.5 text-xs transition ${dashboardView === 'default' ? 'bg-white font-medium text-gray-800 shadow' : 'text-gray-500 hover:text-gray-700'}`}
          >
            대시보드
          </button>
          <button
            onClick={() => setDashboardView('pipeline')}
            className={`rounded-md px-3 py-1.5 text-xs transition ${dashboardView === 'pipeline' ? 'bg-white font-medium text-gray-800 shadow' : 'text-gray-500 hover:text-gray-700'}`}
          >
            파이프라인
          </button>
        </div>
      </div>

      {dashboardView === 'default' ? (
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
          sidebarLoading={sidebarLoading}
          completedLoading={completedLoading}
          completingTaskId={completeTaskMut.variables?.id ?? null}
          onOpenPopup={setPopupSection}
          onGenerateMonthlyReminder={(yearMonth) => monthlyReminderMut.mutate(yearMonth)}
          onOpenTask={openTaskDetail}
          onQuickComplete={setCompletingTask}
          onOpenQuickAdd={openQuickAdd}
          onOpenWorkflow={setSelectedWorkflow}
          onUndoComplete={(taskId) => undoCompleteMut.mutate(taskId)}
        />
      ) : (
        <div className="mx-auto w-full max-w-[1400px] px-4">
          <TaskPipelineView
            todayTasks={todayTasks}
            tomorrowTasks={tomorrowTasks}
            thisWeekTasks={thisWeekTasks}
            upcomingTasks={upcomingTasks}
            noDeadlineTasks={noDeadlineTasks}
            activeWorkflows={activeWorkflows}
            onClickTask={(task, options) => openTaskDetail(task, options?.editable ?? true)}
            onClickWorkflow={setSelectedWorkflow}
            fullScreen
          />
        </div>
      )}

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
        onCreateTask={(task) => createTaskMut.mutate(task)}
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
