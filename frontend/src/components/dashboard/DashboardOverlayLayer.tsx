import { lazy, Suspense, memo } from 'react'
import { useNavigate } from 'react-router-dom'

import type {
  ActiveWorkflow,
  FundSummary,
  GPEntity,
  MissingDocument,
  Task,
  TaskCreate,
  UpcomingReport,
  WorkflowInstance,
} from '../../lib/api'
import type { PopupSection } from './dashboardUtils'

const DashboardPopupModal = lazy(() => import('./modals/DashboardPopupModal'))
const QuickTaskAddModal = lazy(() => import('./modals/QuickTaskAddModal'))
const TaskDetailModal = lazy(() => import('./modals/TaskDetailModal'))
const WorkflowTimelineModal = lazy(() => import('./modals/WorkflowTimelineModal'))

interface DashboardOverlayLayerProps {
  showQuickAddModal: boolean
  quickAddDefaultDate: string
  baseDate: string
  fundSummary: FundSummary[]
  gpEntities: GPEntity[]
  quickAddDefaultFundId: number | null
  popupSection: PopupSection | null
  popupTitle: string
  todayTasks: Task[]
  tomorrowTasks: Task[]
  thisWeekTasks: Task[]
  activeWorkflows: ActiveWorkflow[]
  missingDocuments: MissingDocument[]
  upcomingReports: UpcomingReport[]
  completedTodayTasks: Task[]
  selectedWorkflow: ActiveWorkflow | null
  selectedWorkflowInstance?: WorkflowInstance
  selectedWorkflowLoading: boolean
  selectedTask: Task | null
  selectedTaskEditable: boolean
  onCreateTask: (task: TaskCreate) => void
  onCloseQuickAddModal: () => void
  onClosePopup: () => void
  onOpenTask: (task: Task, editable?: boolean) => void
  onOpenWorkflow: (workflow: ActiveWorkflow) => void
  onUndoComplete: (taskId: number) => void
  onCloseWorkflowModal: () => void
  onCloseTaskModal: () => void
  onCompleteTask: (task: Task) => void
}

function DashboardOverlayLayer({
  showQuickAddModal,
  quickAddDefaultDate,
  baseDate,
  fundSummary,
  gpEntities,
  quickAddDefaultFundId,
  popupSection,
  popupTitle,
  todayTasks,
  tomorrowTasks,
  thisWeekTasks,
  activeWorkflows,
  missingDocuments,
  upcomingReports,
  completedTodayTasks,
  selectedWorkflow,
  selectedWorkflowInstance,
  selectedWorkflowLoading,
  selectedTask,
  selectedTaskEditable,
  onCreateTask,
  onCloseQuickAddModal,
  onClosePopup,
  onOpenTask,
  onOpenWorkflow,
  onUndoComplete,
  onCloseWorkflowModal,
  onCloseTaskModal,
  onCompleteTask,
}: DashboardOverlayLayerProps) {
  const navigate = useNavigate()

  return (
    <Suspense fallback={null}>
      {showQuickAddModal && (
        <QuickTaskAddModal
          defaultDate={quickAddDefaultDate || baseDate}
          baseDate={baseDate}
          funds={fundSummary}
          gpEntities={gpEntities}
          defaultFundId={quickAddDefaultFundId}
          onAdd={onCreateTask}
          onCancel={onCloseQuickAddModal}
        />
      )}

      {popupSection && (
        <DashboardPopupModal
          popupSection={popupSection}
          title={popupTitle}
          todayTasks={todayTasks}
          tomorrowTasks={tomorrowTasks}
          thisWeekTasks={thisWeekTasks}
          activeWorkflows={activeWorkflows}
          missingDocuments={missingDocuments}
          upcomingReports={upcomingReports}
          completedTodayTasks={completedTodayTasks}
          onClose={onClosePopup}
          onOpenTask={onOpenTask}
          onOpenWorkflow={onOpenWorkflow}
          onNavigateInvestment={(investmentId) => navigate(`/investments/${investmentId}`)}
          onNavigateReport={(report) => {
            if (report.task_id) {
              navigate('/tasks', { state: { highlightTaskId: report.task_id } })
              return
            }
            navigate('/reports', { state: { highlightId: report.id } })
          }}
          onUndoComplete={onUndoComplete}
        />
      )}

      {selectedWorkflow && (
        <WorkflowTimelineModal
          workflow={selectedWorkflow}
          instance={selectedWorkflowInstance}
          loading={selectedWorkflowLoading}
          onClose={onCloseWorkflowModal}
          onOpenWorkflowPage={() => {
            const targetId = selectedWorkflow.id
            onCloseWorkflowModal()
            navigate('/workflows', { state: { expandInstanceId: targetId } })
          }}
        />
      )}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          editable={selectedTaskEditable}
          onClose={onCloseTaskModal}
          onComplete={onCompleteTask}
          onGoTaskBoard={(task) => {
            onCloseTaskModal()
            navigate('/tasks', { state: { highlightTaskId: task.id } })
          }}
        />
      )}
    </Suspense>
  )
}

export default memo(DashboardOverlayLayer)
