import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, Clock, GitBranch, GripVertical, Plus, Tag, Trash2 } from 'lucide-react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import CompleteModal from '../components/CompleteModal'
import EmptyState from '../components/EmptyState'
import MiniCalendar from '../components/MiniCalendar'
import TaskPipelineView from '../components/TaskPipelineView'
import TaskAttachmentSection from '../components/common/TaskAttachmentSection'
import TimeSelect from '../components/TimeSelect'
import { HOUR_OPTIONS } from '../components/timeOptions'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import FilterPanel, { type FilterConfig } from '../components/ui/FilterPanel'
import PageLoading from '../components/PageLoading'
import { useToast } from '../contexts/ToastContext'
import {
  bulkCompleteTasks,
  bulkDeleteTasks,
  completeTask,
  createTaskCategory,
  createTask,
  deleteTaskCategory,
  deleteTask,
  fetchDashboardBase,
  fetchDashboardWorkflows,
  fetchFunds,
  fetchGPEntities,
  fetchWorkflow,
  fetchWorkflowInstance,
  fetchTask,
  fetchTaskCategories,
  fetchTasks,
  fetchWorkflows,
  fetchTaskBoard,
  instantiateWorkflow,
  moveTask,
  updateTask,
} from '../lib/api'
import type {
  ActiveWorkflow,
  DashboardBaseResponse,
  DashboardWorkflowsResponse,
  Fund,
  GPEntity,
  Task,
  TaskCategory,
  TaskBoard,
  TaskCreate,
  WorkflowListItem,
} from '../lib/api'
import { invalidateFundRelated, invalidateTaskRelated } from '../lib/queryInvalidation'
import { resolveDeadlineTone, type TaskDeadlineTone } from '../lib/taskUrgency'

const QUADRANTS = [
  { key: 'Q1', label: '긴급·중요 (Q1)', color: 'border-[#9fb7e5]', bg: 'bg-[#f5f9ff]', badge: 'bg-[#0f1f3d]' },
  { key: 'Q2', label: '중요·비긴급 (Q2)', color: 'border-[#9fb7e5]', bg: 'bg-[#f5f9ff]', badge: 'bg-[#558ef8]' },
  { key: 'Q3', label: '긴급·비중요 (Q3)', color: 'border-[#d9c89a]', bg: 'bg-[#f5f9ff]', badge: 'bg-[#1a3660]' },
  { key: 'Q4', label: '비긴급·비중요 (Q4)', color: 'border-[#bfcff0]', bg: 'bg-[#f5f9ff]', badge: 'bg-[#64748b]' },
] as const

const VIEW_TABS = [
  { key: 'board', label: '보드' },
  { key: 'calendar', label: '캘린더' },
  { key: 'pipeline', label: '파이프라인' },
] as const

const DEFAULT_TASK_CATEGORY_NAMES = ['투자실행', 'LP보고', '사후관리', '규약/총회', '서류관리', '일반'] as const

type BoardView = (typeof VIEW_TABS)[number]['key']

interface WorkflowGroup {
  workflowInstanceId: number
  tasks: Task[]
  currentStep: Task | null
  nextStep: Task | null
  completedSteps: number
  totalSteps: number
  progressPercent: number
  progress: string
}

function categoryBadgeClass(category: string): string {
  switch (category) {
    case '투자실행':
      return 'tag tag-red'
    case 'LP보고':
      return 'tag tag-green'
    case '사후관리':
      return 'tag tag-amber'
    case '규약/총회':
      return 'tag tag-indigo'
    case '서류관리':
      return 'tag tag-purple'
    default:
      return 'tag tag-gray'
  }
}

function splitDeadline(deadline: string | null): { date: string; hour: string } {
  if (!deadline) return { date: '', hour: '' }
  const [datePart = '', timePart = ''] = deadline.split('T')
  const hour = timePart.slice(0, 5)
  return { date: datePart, hour: hour || '' }
}

function combineDeadline(date: string, hour: string): string | null {
  if (!date) return null
  return hour ? `${date}T${hour}` : date
}

function isOverdueTask(task: Task, now = new Date()): boolean {
  if (task.status === 'completed') return false
  return resolveDeadlineTone(task.deadline, now) === 'overdue'
}

function taskUrgencyMeta(task: Task): {
  leftBorderClass: string
  badgeStatus: 'danger' | 'warning' | 'pending' | 'overdue' | null
  label: string | null
} {
  const tone: TaskDeadlineTone = task.status === 'completed' ? 'later' : resolveDeadlineTone(task.deadline)
  switch (tone) {
    case 'overdue':
      return {
        leftBorderClass: 'border-l-[var(--color-danger)]',
        badgeStatus: 'overdue',
        label: '지연',
      }
    case 'today':
      return {
        leftBorderClass: 'border-l-[var(--color-danger)]',
        badgeStatus: 'danger',
        label: '오늘마감',
      }
    case 'this_week':
      return {
        leftBorderClass: 'border-l-[var(--color-warning)]',
        badgeStatus: 'warning',
        label: '이번주',
      }
    case 'none':
      return {
        leftBorderClass: 'border-l-[#bfcff0]',
        badgeStatus: 'pending',
        label: '기한없음',
      }
    case 'later':
    default:
      return {
        leftBorderClass: 'border-l-[#bfcff0]',
        badgeStatus: null,
        label: null,
      }
  }
}

type DeleteConfirmState =
  | { type: 'task'; taskId: number }
  | { type: 'bulk'; taskIds: number[] }
  | { type: 'category'; category: TaskCategory }
  | null

function groupTasksByWorkflow(tasks: Task[]): { standalone: Task[]; workflows: WorkflowGroup[] } {
  const standalone: Task[] = []
  const wfMap = new Map<number, Task[]>()

  for (const task of tasks) {
    if (task.workflow_instance_id) {
      const id = task.workflow_instance_id
      const list = wfMap.get(id) || []
      list.push(task)
      wfMap.set(id, list)
    } else {
      standalone.push(task)
    }
  }

  const workflows: WorkflowGroup[] = []
  for (const [workflowInstanceId, wfTasks] of wfMap.entries()) {
    const sorted = [...wfTasks].sort((a, b) => (a.workflow_step_order || 0) - (b.workflow_step_order || 0))
    const currentStep = sorted.find((task) => task.status !== 'completed') || sorted[0] || null
    const nextStep = currentStep
      ? sorted.find(
        (task) =>
          task.id !== currentStep.id &&
          task.status !== 'completed' &&
          (task.workflow_step_order || 0) > (currentStep.workflow_step_order || 0),
      ) || null
      : null
    const completedCount = sorted.filter((task) => task.status === 'completed').length
    const totalSteps = sorted.length
    workflows.push({
      workflowInstanceId,
      tasks: sorted,
      currentStep,
      nextStep,
      completedSteps: completedCount,
      totalSteps,
      progressPercent: totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0,
      progress: `${completedCount}/${sorted.length}`,
    })
  }

  workflows.sort((a, b) => (a.currentStep?.workflow_step_order || 0) - (b.currentStep?.workflow_step_order || 0))
  return { standalone, workflows }
}

interface TaskItemProps {
  task: Task
  onComplete: (task: Task) => void
  onDelete: (id: number) => void
  onEdit: (task: Task) => void
  selected: boolean
  selectionMode: boolean
  onToggleSelect: (taskId: number, selected: boolean) => void
  isBlinking?: boolean
}

const TaskItem = memo(function TaskItem({
  task,
  onComplete,
  onDelete,
  onEdit,
  selected,
  selectionMode,
  onToggleSelect,
  isBlinking = false,
}: TaskItemProps) {
  const deadlineStr = task.deadline
    ? new Date(task.deadline).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    : null
  const urgencyMeta = taskUrgencyMeta(task)
  const [isDragging, setIsDragging] = useState(false)
  const displayTag =
    urgencyMeta.label && urgencyMeta.badgeStatus
      ? {
          label: urgencyMeta.label,
          className:
            urgencyMeta.badgeStatus === 'warning'
              ? 'tag tag-amber'
              : urgencyMeta.badgeStatus === 'pending'
                ? 'tag tag-gray'
                : 'tag tag-red',
        }
      : task.category
        ? {
            label: task.category,
            className: categoryBadgeClass(task.category),
          }
        : null

  return (
    <div
      id={`task-${task.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('taskId', String(task.id))
        e.dataTransfer.setData('fromQuadrant', task.quadrant)
        setIsDragging(true)
      }}
      onDragEnd={() => setIsDragging(false)}
      className={`group flex items-start gap-3 rounded-xl border border-[#d8e5fb] border-l-4 bg-white px-3.5 py-3 transition-shadow hover:shadow-sm ${
        urgencyMeta.leftBorderClass
      } ${
        isBlinking ? 'animate-pulse ring-2 ring-[#558ef8]' : ''
      } ${
        isDragging ? 'opacity-70' : ''
      }`}
    >
      <div className="hidden text-[#94a3b8] transition-colors group-hover:text-[#64748b] md:block">
        <GripVertical size={13} />
      </div>
      <div className="flex h-full items-start pt-1" onClick={(event) => event.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onToggleSelect(task.id, event.target.checked)}
          className={`h-4 w-4 cursor-pointer rounded border-[#bfcff0] text-[#558ef8] focus:ring-[#558ef8] ${
            selected || selectionMode ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'
          }`}
          aria-label={`업무 선택: ${task.title}`}
        />
      </div>
      <div className="min-w-0 flex-1 cursor-pointer space-y-1" onClick={() => onEdit(task)}>
        <p className="text-sm font-medium leading-snug text-[#0f1f3d]">{task.title}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#64748b]">
          {displayTag && <span className={displayTag.className}>{displayTag.label}</span>}
          {deadlineStr && <span>{deadlineStr}</span>}
          {task.estimated_time && (
            <span className="flex items-center gap-0.5">
              <Clock size={11} /> {task.estimated_time}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
        <button
          onClick={() => onComplete(task)}
          className="icon-btn text-emerald-700 hover:bg-emerald-50"
          title="완료"
        >
          <Check size={14} />
        </button>
        <button
          onClick={() => onEdit(task)}
          className="btn-sm rounded-lg border border-[#c5d8fb] bg-[#f5f9ff] px-3 py-1.5 text-xs font-medium text-[#1a3660] transition-colors hover:bg-[#e6efff]"
        >
          수정
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="icon-btn text-[#64748b] opacity-0 transition-all group-hover:opacity-100 hover:text-red-500"
          title="삭제"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
})
TaskItem.displayName = 'TaskItem'

interface WorkflowGroupCardProps {
  group: WorkflowGroup
  onComplete: (task: Task) => void
  onDelete: (id: number) => void
  onEdit: (task: Task) => void
  selectionMode: boolean
  selectedTaskIds: Set<number>
  onToggleSelect: (taskId: number, selected: boolean) => void
  blinkingId: number | null
}

const WorkflowGroupCard = memo(function WorkflowGroupCard({
  group,
  onComplete,
  onDelete,
  onEdit,
  selectionMode,
  selectedTaskIds,
  onToggleSelect,
  blinkingId,
}: WorkflowGroupCardProps) {
  const hasBlinkingTask = blinkingId != null && group.tasks.some((task) => task.id === blinkingId)
  const [expanded, setExpanded] = useState(hasBlinkingTask)

  useEffect(() => {
    if (hasBlinkingTask) {
      setExpanded(true)
    }
  }, [hasBlinkingTask])

  return (
    <div className="rounded-xl border border-[#c5d8fb] bg-[#f5f9ff] p-3">
      <button onClick={() => setExpanded((prev) => !prev)} className="flex w-full items-center gap-2.5 text-left">
        <span className="text-[#558ef8]">
          <GitBranch size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[#0f1f3d]">{group.currentStep?.fund_name || '워크플로'}</p>
          <p className="truncate text-xs text-[#64748b]">현재: {group.currentStep?.title || '-'}</p>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#d8e5fb]/80">
            <div
              className="h-1.5 rounded-full bg-[#558ef8] transition-all"
              style={{ width: `${group.progressPercent}%` }}
            />
          </div>
          <p className="mt-1.5 truncate text-[11px] text-[#1a3660]">
            진행률 {group.completedSteps}/{group.totalSteps} ({group.progressPercent}%)
            {group.nextStep ? ` | 다음: ${group.nextStep.title}` : ''}
          </p>
        </div>
        <span className="tag tag-blue shrink-0">
          {group.progress}
        </span>
        <ChevronDown size={14} className={`text-[#558ef8] transition-transform ${expanded ? '' : '-rotate-90'}`} />
      </button>

      {expanded && (
        <div className="ml-3 mt-2 space-y-2 border-l-2 border-[#c5d8fb] pl-3">
          {group.tasks.map((task) => {
            const isCurrent = group.currentStep?.id === task.id
            return (
              <div key={task.id} className={isCurrent ? 'rounded-md ring-2 ring-[#b2cbfb]' : ''}>
                <TaskItem
                  task={task}
                  onComplete={onComplete}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  selected={selectedTaskIds.has(task.id)}
                  selectionMode={selectionMode}
                  onToggleSelect={onToggleSelect}
                  isBlinking={blinkingId === task.id}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})
WorkflowGroupCard.displayName = 'WorkflowGroupCard'

function AddTaskForm({ quadrant, categoryOptions }: { quadrant: string; categoryOptions: string[] }) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [deadlineDate, setDeadlineDate] = useState('')
  const [deadlineHour, setDeadlineHour] = useState('')
  const [estimatedTime, setEstimatedTime] = useState('')
  const [relatedTarget, setRelatedTarget] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | ''>('')

  const { data: funds = [] } = useQuery<Fund[]>({
    queryKey: ['funds'],
    queryFn: fetchFunds,
  })
  const { data: gpEntities = [] } = useQuery<GPEntity[]>({
    queryKey: ['gp-entities'],
    queryFn: fetchGPEntities,
  })

  const { data: templates = [] } = useQuery<WorkflowListItem[]>({
    queryKey: ['workflow-templates'],
    queryFn: fetchWorkflows,
  })

  const createTaskMut = useMutation({
    mutationFn: createTask,
  })

  const instantiateMut = useMutation({
    mutationFn: ({
      workflowId,
      data,
    }: {
      workflowId: number
      data: { name: string; trigger_date: string; fund_id?: number; gp_entity_id?: number; memo?: string }
    }) =>
      instantiateWorkflow(workflowId, data),
  })

  const resetForm = () => {
    setTitle('')
    setDeadlineDate('')
    setDeadlineHour('')
    setEstimatedTime('')
    setRelatedTarget('')
    setSelectedCategory('')
    setSelectedTemplateId('')
    setOpen(false)
  }

  const submit = async () => {
    if (!title.trim()) return
    const selectedFundId = relatedTarget.startsWith('fund:') ? Number(relatedTarget.slice(5)) : null
    const selectedGpEntityId = relatedTarget.startsWith('gp:') ? Number(relatedTarget.slice(3)) : null

    if (selectedTemplateId && !relatedTarget) {
      addToast('error', '워크플로 템플릿 실행 시 관련 대상(조합/고유계정)을 선택해 주세요.')
      return
    }
    if (selectedTemplateId && !deadlineDate) {
      addToast('error', '워크플로 시작 기준일(마감일)을 입력해 주세요.')
      return
    }

    try {
      if (selectedTemplateId) {
        await instantiateMut.mutateAsync({
          workflowId: selectedTemplateId,
          data: {
            name: title.trim(),
            trigger_date: deadlineDate,
            fund_id: selectedFundId || undefined,
            gp_entity_id: selectedGpEntityId || undefined,
            memo: '',
          },
        })
        invalidateFundRelated(queryClient, selectedFundId)
        addToast('success', '워크플로 인스턴스를 생성했습니다.')
      } else {
        await createTaskMut.mutateAsync({
          title: title.trim(),
          quadrant,
          deadline: combineDeadline(deadlineDate, deadlineHour),
          estimated_time: estimatedTime || null,
          category: selectedCategory || null,
          fund_id: selectedFundId || null,
          gp_entity_id: selectedGpEntityId || null,
        })
        addToast('success', '작업이 추가되었습니다.')
      }

      invalidateTaskRelated(queryClient)
      resetForm()
    } catch {
      // Axios interceptor already shows toast.
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="secondary-btn btn-sm inline-flex w-full items-center justify-center gap-1 text-[#64748b]"
      >
        <Plus size={14} /> 추가
      </button>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-[#d8e5fb] bg-white p-3">
      <div>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="작업명을 입력하세요"
          className="form-input-sm"
        />
      </div>
      <div className="grid grid-cols-3 gap-1">
        <div>
          <label className="form-label text-[10px]">마감일</label>
          <input
            type="date"
            value={deadlineDate}
            onChange={(e) => setDeadlineDate(e.target.value)}
            className="form-input-sm"
          />
        </div>
        <div>
          <label className="form-label text-[10px]">시간</label>
          <select
            value={deadlineHour}
            onChange={(e) => setDeadlineHour(e.target.value)}
            className="form-input-sm"
          >
            <option value="">선택</option>
            {HOUR_OPTIONS.map((hour) => (
              <option key={hour} value={hour}>{hour}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label text-[10px]">예상 시간</label>
          <TimeSelect
            value={estimatedTime}
            onChange={setEstimatedTime}
            className="form-input-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-1 md:grid-cols-3">
        <div>
          <label className="form-label text-[10px]">관련 대상</label>
          <select
            value={relatedTarget}
            onChange={(e) => setRelatedTarget(e.target.value)}
            className="form-input-sm"
          >
            <option value="">관련 대상 선택</option>
            {gpEntities.length > 0 && (
              <optgroup label="고유계정">
                {gpEntities.map((entity) => (
                  <option key={`gp-${entity.id}`} value={`gp:${entity.id}`}>{entity.name}</option>
                ))}
              </optgroup>
            )}
            <optgroup label="조합">
              {funds.map((fund) => (
                <option key={`fund-${fund.id}`} value={`fund:${fund.id}`}>{fund.name}</option>
              ))}
            </optgroup>
          </select>
        </div>
        <div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="form-input-sm"
          >
            <option value="">카테고리</option>
            {categoryOptions.map((categoryName) => (
              <option key={categoryName} value={categoryName}>{categoryName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label text-[10px]">워크플로 템플릿</label>
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : '')}
            className="form-input-sm"
          >
            <option value="">템플릿 선택</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
        </div>
      </div>
      {relatedTarget.startsWith('fund:') && selectedTemplateId && (
        <p className="text-xs text-[#64748b]">
          선택한 조합의 통지기간을 반영해 단계 일정이 자동 계산됩니다.
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={createTaskMut.isPending || instantiateMut.isPending}
          className="primary-btn btn-sm flex-1 disabled:opacity-60"
        >
          {createTaskMut.isPending || instantiateMut.isPending ? '처리중...' : '추가'}
        </button>
        <button onClick={() => setOpen(false)} className="secondary-btn btn-sm flex-1">취소</button>
      </div>
    </div>
  )
}

function EditTaskModal({
  task,
  onSave,
  onCancel,
  fundsForFilter,
  gpEntities,
  categoryOptions,
}: {
  task: Task
  onSave: (id: number, data: Partial<TaskCreate>) => void
  onCancel: () => void
  fundsForFilter: Fund[]
  gpEntities: GPEntity[]
  categoryOptions: string[]
}) {
  const initialDeadline = splitDeadline(task.deadline)
  const [title, setTitle] = useState(task.title)
  const [deadlineDate, setDeadlineDate] = useState(initialDeadline.date)
  const [deadlineHour, setDeadlineHour] = useState(initialDeadline.hour)
  const [estimatedTime, setEstimatedTime] = useState(task.estimated_time || '')
  const [quadrant, setQuadrant] = useState(task.quadrant)
  const [memo, setMemo] = useState(task.memo || '')
  const [delegateTo, setDelegateTo] = useState(task.delegate_to || '')
  const [category, setCategory] = useState(task.category || '')
  const [relatedTarget, setRelatedTarget] = useState(
    task.fund_id ? `fund:${task.fund_id}` : task.gp_entity_id ? `gp:${task.gp_entity_id}` : '',
  )
  const { data: workflowInstance, isLoading: isWorkflowInstanceLoading } = useQuery({
    queryKey: ['workflow-instance', task.workflow_instance_id],
    queryFn: () => fetchWorkflowInstance(task.workflow_instance_id as number),
    enabled: !!task.workflow_instance_id,
  })
  const { data: workflowTemplate, isLoading: isWorkflowTemplateLoading } = useQuery({
    queryKey: ['workflow', workflowInstance?.workflow_id],
    queryFn: () => fetchWorkflow(workflowInstance?.workflow_id as number),
    enabled: !!workflowInstance?.workflow_id,
  })
  const stepDocuments = useMemo(() => {
    if (!workflowInstance || !workflowTemplate) return []
    const matchedStepInstance = workflowInstance.step_instances.find((step) => step.task_id === task.id)
    if (!matchedStepInstance) return []
    const matchedStep = workflowTemplate.steps.find((step) => step.id === matchedStepInstance.workflow_step_id)
    return matchedStep?.step_documents ?? []
  }, [workflowInstance, workflowTemplate, task.id])

  const submit = () => {
    if (!title.trim()) return
    const fundId = relatedTarget.startsWith('fund:') ? Number(relatedTarget.slice(5)) : null
    const gpEntityId = relatedTarget.startsWith('gp:') ? Number(relatedTarget.slice(3)) : null
    onSave(task.id, {
      title: title.trim(),
      deadline: combineDeadline(deadlineDate, deadlineHour),
      estimated_time: estimatedTime || null,
      quadrant,
      memo: memo || null,
      delegate_to: delegateTo || null,
      category: category || null,
      fund_id: fundId || null,
      gp_entity_id: gpEntityId || null,
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">작업 수정</h3>
            <button onClick={onCancel} className="icon-btn text-[#64748b] hover:text-[#64748b]">×</button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-[#64748b]">제목</label>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-[#d8e5fb] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#558ef8]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-[#64748b]">마감일</label>
                <input
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  className="w-full rounded-lg border border-[#d8e5fb] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#558ef8]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#64748b]">시간</label>
                <select
                  value={deadlineHour}
                  onChange={(e) => setDeadlineHour(e.target.value)}
                  className="w-full rounded-lg border border-[#d8e5fb] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#558ef8]"
                >
                  <option value="">선택</option>
                  {HOUR_OPTIONS.map((hour) => (
                    <option key={hour} value={hour}>{hour}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-[#64748b]">예상 시간</label>
                <TimeSelect value={estimatedTime} onChange={setEstimatedTime} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#64748b]">사분면</label>
                <select
                  value={quadrant}
                  onChange={(e) => setQuadrant(e.target.value)}
                  className="w-full rounded-lg border border-[#d8e5fb] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#558ef8]"
                >
                  <option value="Q1">긴급·중요 (Q1)</option>
                  <option value="Q2">중요·비긴급 (Q2)</option>
                  <option value="Q3">긴급·비중요 (Q3)</option>
                  <option value="Q4">비긴급·비중요 (Q4)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-[#64748b]">카테고리</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-[#d8e5fb] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#558ef8]"
                >
                  <option value="">없음</option>
                  {categoryOptions.map((categoryName) => (
                    <option key={categoryName} value={categoryName}>{categoryName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#64748b]">관련 대상</label>
                <select
                  value={relatedTarget}
                  onChange={(e) => setRelatedTarget(e.target.value)}
                  className="w-full rounded-lg border border-[#d8e5fb] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#558ef8]"
                >
                  <option value="">없음</option>
                  {gpEntities.length > 0 && (
                    <optgroup label="고유계정">
                      {gpEntities.map((entity) => (
                        <option key={`gp-${entity.id}`} value={`gp:${entity.id}`}>{entity.name}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="조합">
                    {fundsForFilter.map((fund) => (
                      <option key={`fund-${fund.id}`} value={`fund:${fund.id}`}>{fund.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-[#64748b]">담당자</label>
              <input
                value={delegateTo}
                onChange={(e) => setDelegateTo(e.target.value)}
                placeholder="선택 입력"
                className="w-full rounded-lg border border-[#d8e5fb] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#558ef8]"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-[#64748b]">메모</label>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border border-[#d8e5fb] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#558ef8]"
              />
            </div>

            {task.workflow_instance_id && (
              <div className="rounded-lg border border-[#c5d8fb] bg-[#f5f9ff] px-3 py-2">
                <p className="text-xs font-semibold text-[#1a3660]">연결 서류</p>
                {isWorkflowInstanceLoading || isWorkflowTemplateLoading ? (
                  <p className="mt-1 text-xs text-[#64748b]">불러오는 중...</p>
                ) : stepDocuments.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {stepDocuments.map((doc, idx) => (
                      <li key={`${doc.id ?? idx}-${doc.name}`} className="text-xs text-[#0f1f3d]">
                        • {doc.name}
                        {doc.document_template_id ? ' [템플릿]' : ''}
                        {doc.required ? ' (필수)' : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-[#64748b]">연결된 서류가 없습니다.</p>
                )}
              </div>
            )}
            <TaskAttachmentSection
              taskId={task.id}
              workflowInstanceId={task.workflow_instance_id}
              workflowStepOrder={task.workflow_step_order}
            />
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button onClick={onCancel} className="secondary-btn btn-sm">취소</button>
            <button onClick={submit} className="primary-btn btn-sm">저장</button>
          </div>
        </div>
      </div>
    </>
  )
}

function TaskDetailModal({
  task,
  onClose,
  onEdit,
  onComplete,
}: {
  task: Task
  onClose: () => void
  onEdit: (task: Task) => void
  onComplete: (task: Task) => void
}) {
  const { data: workflowInstance, isLoading: isWorkflowInstanceLoading } = useQuery({
    queryKey: ['workflow-instance', task.workflow_instance_id],
    queryFn: () => fetchWorkflowInstance(task.workflow_instance_id as number),
    enabled: !!task.workflow_instance_id,
  })

  const { data: workflowTemplate, isLoading: isWorkflowTemplateLoading } = useQuery({
    queryKey: ['workflow', workflowInstance?.workflow_id],
    queryFn: () => fetchWorkflow(workflowInstance?.workflow_id as number),
    enabled: !!workflowInstance?.workflow_id,
  })

  const stepDocuments = useMemo(() => {
    if (!workflowInstance || !workflowTemplate) return []
    const matchedStepInstance = workflowInstance.step_instances.find((step) => step.task_id === task.id)
    if (!matchedStepInstance) return []
    const matchedStep = workflowTemplate.steps.find((step) => step.id === matchedStepInstance.workflow_step_id)
    return matchedStep?.step_documents ?? []
  }, [workflowInstance, workflowTemplate, task.id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-[#0f1f3d]">{task.title}</h3>
          <button onClick={onClose} className="icon-btn text-[#64748b] hover:text-[#64748b]">×</button>
        </div>

        <div className="space-y-2 text-sm text-[#0f1f3d]">
          {task.deadline && (
            <div><span className="font-medium">마감:</span> {new Date(task.deadline).toLocaleString('ko-KR')}</div>
          )}
          {task.estimated_time && (
            <div><span className="font-medium">예상 시간:</span> {task.estimated_time}</div>
          )}
          {task.fund_name && (
            <div><span className="font-medium">조합:</span> {task.fund_name}</div>
          )}
          {task.gp_entity_name && (
            <div><span className="font-medium">고유계정:</span> {task.gp_entity_name}</div>
          )}
          {task.company_name && (
            <div><span className="font-medium">피투자사:</span> {task.company_name}</div>
          )}
          {task.category && (
            <div><span className="font-medium">카테고리:</span> {task.category}</div>
          )}
          <div><span className="font-medium">사분면:</span> {task.quadrant}</div>
          {task.memo && (
            <div><span className="font-medium">메모:</span> {task.memo}</div>
          )}
          {task.delegate_to && (
            <div><span className="font-medium">담당자:</span> {task.delegate_to}</div>
          )}
          {task.workflow_instance_id && (
            <div className="rounded border border-[#c5d8fb] bg-[#f5f9ff] px-3 py-2">
              <p className="text-xs font-semibold text-[#1a3660]">연결 서류</p>
              {isWorkflowInstanceLoading || isWorkflowTemplateLoading ? (
                <p className="mt-1 text-xs text-[#64748b]">불러오는 중...</p>
              ) : stepDocuments.length > 0 ? (
                <ul className="mt-1 space-y-1">
                  {stepDocuments.map((doc, idx) => (
                    <li key={`${doc.id ?? idx}-${doc.name}`} className="text-xs text-[#0f1f3d]">
                      • {doc.name}
                      {doc.document_template_id ? ' [템플릿]' : ''}
                      {doc.required ? ' (필수)' : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-[#64748b]">연결된 서류가 없습니다.</p>
              )}
            </div>
          )}
          <TaskAttachmentSection
            taskId={task.id}
            workflowInstanceId={task.workflow_instance_id}
            workflowStepOrder={task.workflow_step_order}
            readOnly
            compact
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {task.status !== 'completed' && (
            <>
              <button
                onClick={() => onComplete(task)}
                className="btn-sm rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
              >
                완료
              </button>
              <button
                onClick={() => onEdit(task)}
                className="btn-sm rounded-lg border border-[#c5d8fb] bg-[#f5f9ff] px-3 py-1.5 text-xs font-medium text-[#1a3660] transition-colors hover:bg-[#e6efff]"
              >
                수정
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="secondary-btn btn-sm"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

function BulkCompleteModal({
  count,
  onConfirm,
  onCancel,
}: {
  count: number
  onConfirm: (actualTime: string, autoWorklog: boolean) => void
  onCancel: () => void
}) {
  const [actualTime, setActualTime] = useState('')
  const [autoWorklog, setAutoWorklog] = useState(() => {
    const saved = window.localStorage.getItem('autoWorklog')
    return saved == null ? true : saved === 'true'
  })

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-emerald-700">일괄 완료</h3>
            <button onClick={onCancel} className="icon-btn text-[#64748b] hover:text-[#64748b]" aria-label="닫기">×</button>
          </div>

          <p className="mb-2 text-sm text-[#0f1f3d]">{count}개 업무를 한 번에 완료합니다.</p>

          <label className="mb-1 block text-xs text-[#64748b]">실제 소요 시간</label>
          <TimeSelect value={actualTime} onChange={setActualTime} />

          <label className="mb-4 mt-3 flex items-center gap-2 text-sm text-[#0f1f3d]">
            <input
              type="checkbox"
              checked={autoWorklog}
              onChange={(event) => {
                const nextValue = event.target.checked
                setAutoWorklog(nextValue)
                window.localStorage.setItem('autoWorklog', String(nextValue))
              }}
            />
            업무 기록 자동 생성
          </label>

          <div className="flex justify-end gap-2">
            <button onClick={onCancel} className="secondary-btn">취소</button>
            <button
              onClick={() => actualTime && onConfirm(actualTime, autoWorklog)}
              className="primary-btn"
              disabled={!actualTime}
            >
              일괄 완료
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function CategoryManagerModal({
  categories,
  newCategoryName,
  onChangeNewCategory,
  onCreate,
  onDelete,
  onClose,
  creating,
  deletingCategoryId,
}: {
  categories: TaskCategory[]
  newCategoryName: string
  onChangeNewCategory: (value: string) => void
  onCreate: () => void
  onDelete: (category: TaskCategory) => void
  onClose: () => void
  creating: boolean
  deletingCategoryId: number | null
}) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#0f1f3d]">카테고리 관리</h3>
            <button onClick={onClose} className="icon-btn text-[#64748b] hover:text-[#64748b]" aria-label="닫기">×</button>
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-[#d8e5fb] bg-[#f5f9ff] p-2">
            {categories.length === 0 ? (
              <p className="text-xs text-[#64748b]">등록된 카테고리가 없습니다.</p>
            ) : (
              categories.map((category) => (
                <div key={category.id} className="flex items-center justify-between rounded bg-white px-3 py-2">
                  <span className="text-sm text-[#0f1f3d]">{category.name}</span>
                  <button
                    onClick={() => onDelete(category)}
                    className="text-xs text-red-600 hover:text-red-700 disabled:opacity-60"
                    disabled={deletingCategoryId === category.id}
                  >
                    {deletingCategoryId === category.id ? '삭제 중...' : '삭제'}
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              value={newCategoryName}
              onChange={(event) => onChangeNewCategory(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onCreate()
              }}
              placeholder="새 카테고리 이름"
              className="flex-1 rounded-lg border border-[#d8e5fb] px-3 py-2 text-sm"
            />
            <button onClick={onCreate} disabled={creating || !newCategoryName.trim()} className="primary-btn btn-sm disabled:opacity-60">
              {creating ? '추가 중...' : '추가'}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-[#64748b]">사용 중인 카테고리는 삭제 시 경고가 표시됩니다.</p>
        </div>
      </div>
    </>
  )
}

export default function TaskBoardPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const location = useLocation()
  const highlightTaskId = (location.state as { highlightTaskId?: number } | null)?.highlightTaskId
  const requestedView = searchParams.get('view')
  const boardView: BoardView = requestedView === 'calendar' || requestedView === 'pipeline' ? requestedView : 'board'

  const setBoardView = (nextView: BoardView) => {
    setSearchParams(nextView === 'board' ? {} : { view: nextView }, { replace: false })
  }

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const [completingTask, setCompletingTask] = useState<Task | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all' | 'completed'>('pending')
  const [fundFilter, setFundFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [quickDueFilter, setQuickDueFilter] = useState<'all' | 'today' | 'this_week' | 'overdue'>('all')
  const [completedYear, setCompletedYear] = useState(currentYear)
  const [completedMonth, setCompletedMonth] = useState<number | ''>(currentMonth)
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [dragOverQuadrant, setDragOverQuadrant] = useState<string | null>(null)
  const [blinkingId, setBlinkingId] = useState<number | null>(null)
  const [pendingScrollId, setPendingScrollId] = useState<number | null>(null)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>(null)
  const [showBulkCompleteModal, setShowBulkCompleteModal] = useState(false)
  const [bulkCompleteQueue, setBulkCompleteQueue] = useState<Task[]>([])
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [deletingCategoryId, setDeletingCategoryId] = useState<number | null>(null)

  const completedYearOptions = [0, 1, 2].map((offset) => currentYear - offset)

  const { data: board, isLoading } = useQuery<TaskBoard>({
    queryKey: ['taskBoard', statusFilter, completedYear, completedMonth],
    queryFn: () =>
      fetchTaskBoard(
        statusFilter,
        statusFilter === 'completed' ? completedYear : undefined,
        statusFilter === 'completed' && completedMonth !== '' ? completedMonth : undefined,
      ),
  })

  const { data: taskCategories = [] } = useQuery<TaskCategory[]>({
    queryKey: ['task-categories'],
    queryFn: fetchTaskCategories,
    staleTime: 60_000,
  })

  const { data: fundsForFilter = [] } = useQuery<Fund[]>({
    queryKey: ['funds'],
    queryFn: fetchFunds,
  })
  const { data: gpEntities = [] } = useQuery<GPEntity[]>({
    queryKey: ['gp-entities'],
    queryFn: fetchGPEntities,
  })
  const { data: calendarTasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks', { status: 'all' }],
    queryFn: () => fetchTasks({ status: 'all' }),
    enabled: boardView === 'calendar',
  })

  const { data: pipelineBaseData, isLoading: pipelineBaseLoading } = useQuery<DashboardBaseResponse>({
    queryKey: ['dashboard-base'],
    queryFn: fetchDashboardBase,
    enabled: boardView === 'pipeline',
    staleTime: 30_000,
  })

  const { data: pipelineWorkflowsData, isLoading: pipelineWorkflowsLoading } = useQuery<DashboardWorkflowsResponse>({
    queryKey: ['dashboard-workflows'],
    queryFn: fetchDashboardWorkflows,
    enabled: boardView === 'pipeline',
    staleTime: 30_000,
  })

  const calendarTaskMap = useMemo(
    () => new Map(calendarTasks.map((task) => [task.id, task])),
    [calendarTasks],
  )

  useEffect(() => {
    if (!highlightTaskId) return

    setStatusFilter('all')
    setFundFilter('')
    if (boardView !== 'board') {
      setBoardView('board')
    }
    setBlinkingId(highlightTaskId)
    setPendingScrollId(highlightTaskId)

    const timer = window.setTimeout(() => {
      setBlinkingId((prev) => (prev === highlightTaskId ? null : prev))
    }, 3000)

    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`)

    return () => window.clearTimeout(timer)
  }, [boardView, highlightTaskId])

  useEffect(() => {
    if (!pendingScrollId || boardView !== 'board') return

    let cancelled = false
    let timer: number | null = null
    let attempts = 0

    const tryScroll = () => {
      if (cancelled) return
      const el = document.getElementById(`task-${pendingScrollId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setPendingScrollId(null)
        return
      }
      attempts += 1
      if (attempts >= 12) return
      timer = window.setTimeout(tryScroll, 120)
    }

    tryScroll()

    return () => {
      cancelled = true
      if (timer != null) {
        window.clearTimeout(timer)
      }
    }
  }, [board, boardView, pendingScrollId, blinkingId])

  const filterByFund = (tasks: Task[]) => {
    if (fundFilter === '') return tasks
    if (fundFilter.startsWith('gp:')) {
      const gpEntityId = Number(fundFilter.slice(3))
      return tasks.filter((task) => task.gp_entity_id === gpEntityId)
    }
    if (fundFilter.startsWith('fund:')) {
      const fundId = Number(fundFilter.slice(5))
      return tasks.filter((task) => task.fund_id === fundId)
    }
    const numeric = Number(fundFilter)
    return Number.isFinite(numeric) ? tasks.filter((task) => task.fund_id === numeric) : tasks
  }

  const filterByCategory = (tasks: Task[]) => {
    if (!categoryFilter) return tasks
    return tasks.filter((task) => (task.category || '').trim() === categoryFilter)
  }

  const matchesWorkflowByTarget = (workflow: ActiveWorkflow): boolean => {
    if (fundFilter === '') return true

    if (fundFilter.startsWith('gp:')) {
      const gpEntityId = Number(fundFilter.slice(3))
      const gpName = gpEntities.find((entity) => entity.id === gpEntityId)?.name
      if (!gpName) return false
      return (workflow.gp_entity_name || '').trim() === gpName.trim()
    }

    if (fundFilter.startsWith('fund:')) {
      const fundId = Number(fundFilter.slice(5))
      const fundName = fundsForFilter.find((fund) => fund.id === fundId)?.name
      if (!fundName) return false
      return (workflow.fund_name || '').trim() === fundName.trim()
    }

    return true
  }

  const filterByQuickDue = (tasks: Task[]) => {
    if (quickDueFilter === 'all') return tasks
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000
    const endOfWeek = startOfToday + 7 * 24 * 60 * 60 * 1000

    return tasks.filter((task) => {
      if (task.status === 'completed') return false
      if (!task.deadline) return false
      const deadlineMs = new Date(task.deadline).getTime()
      if (Number.isNaN(deadlineMs)) return false
      if (quickDueFilter === 'overdue') {
        return deadlineMs < startOfToday
      }
      if (quickDueFilter === 'today') {
        return deadlineMs >= startOfToday && deadlineMs < endOfToday
      }
      if (quickDueFilter === 'this_week') {
        return deadlineMs >= startOfToday && deadlineMs < endOfWeek
      }
      return true
    })
  }

  const filterBySearch = (tasks: Task[]) => {
    const keyword = searchKeyword.trim().toLowerCase()
    if (!keyword) return tasks

    return tasks.filter((task) =>
      [
        task.title,
        task.fund_name,
        task.gp_entity_name,
        task.category,
        ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    )
  }

  const applyTaskFilters = useCallback(
    (tasks: Task[]) => filterBySearch(filterByCategory(filterByQuickDue(filterByFund(tasks)))),
    [categoryFilter, fundFilter, quickDueFilter, searchKeyword],
  )

  const sortTasksForQuadrant = (tasks: Task[], quadrantKey: string): Task[] => {
    if (quadrantKey !== 'Q1') return tasks
    return [...tasks].sort((a, b) => {
      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY
      if (aDeadline !== bDeadline) return aDeadline - bDeadline
      return a.id - b.id
    })
  }

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TaskCreate> }) => updateTask(id, data),
    onSuccess: () => {
      invalidateTaskRelated(queryClient)
      setEditingTask(null)
      addToast('success', '작업이 수정되었습니다.')
    },
  })

  const completeMutation = useMutation({
    mutationFn: ({
      id,
      actualTime,
      autoWorklog,
      memo,
    }: {
      id: number
      actualTime: string
      autoWorklog: boolean
      memo?: string
    }) => completeTask(id, actualTime, autoWorklog, memo),
    onSuccess: () => {
      invalidateTaskRelated(queryClient)
    },
  })

  const bulkCompleteMutation = useMutation({
    mutationFn: ({
      taskIds,
      actualTime,
      autoWorklog,
    }: {
      taskIds: number[]
      actualTime: string
      autoWorklog: boolean
    }) => bulkCompleteTasks({ task_ids: taskIds, actual_time: actualTime, auto_worklog: autoWorklog }),
    onSuccess: (result) => {
      invalidateTaskRelated(queryClient)
      setShowBulkCompleteModal(false)
      setSelectedTaskIds(new Set())
      addToast('success', `일괄 완료 처리: ${result.completed_count}건`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      invalidateTaskRelated(queryClient)
      addToast('success', '작업이 삭제되었습니다.')
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: ({ taskIds }: { taskIds: number[] }) => bulkDeleteTasks({ task_ids: taskIds }),
    onSuccess: (result) => {
      invalidateTaskRelated(queryClient)
      setSelectedTaskIds(new Set())
      addToast('success', `일괄 삭제 완료: ${result.deleted_count}건`)
    },
  })

  const moveMutation = useMutation({
    mutationFn: ({ id, quadrant }: { id: number; quadrant: string }) => moveTask(id, quadrant),
    onSuccess: () => {
      invalidateTaskRelated(queryClient)
      addToast('success', '작업 위치가 변경되었습니다.')
    },
  })

  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => createTaskCategory(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-categories'] })
      setNewCategoryName('')
      addToast('success', '카테고리를 추가했습니다.')
    },
  })

  const deleteCategoryMutation = useMutation({
    mutationFn: (category: TaskCategory) => deleteTaskCategory(category.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-categories'] })
      setDeletingCategoryId(null)
      addToast('success', '카테고리를 삭제했습니다.')
    },
    onError: () => {
      setDeletingCategoryId(null)
    },
  })

  const handleDeleteTask = useCallback((id: number) => {
    setDeleteConfirm({ type: 'task', taskId: id })
  }, [])

  const handleCreateCategory = useCallback(() => {
    const normalized = newCategoryName.trim()
    if (!normalized) return
    createCategoryMutation.mutate(normalized)
  }, [createCategoryMutation, newCategoryName])

  const handleDeleteCategory = useCallback((category: TaskCategory) => {
    setDeleteConfirm({ type: 'category', category })
  }, [])

  const findTaskById = useCallback(async (taskId: number): Promise<Task | null> => {
    const normalizedTaskId = Math.abs(Number(taskId))
    if (!Number.isFinite(normalizedTaskId) || normalizedTaskId <= 0) return null

    const target = calendarTaskMap.get(normalizedTaskId)
    if (target) {
      return target
    }

    try {
      const fetched = await fetchTask(normalizedTaskId)
      return fetched
    } catch {
      try {
        const allTasks = await fetchTasks()
        const fallback = allTasks.find((task: Task) => task.id === normalizedTaskId)
        if (fallback) return fallback
      } catch {
        // fallback query failed, show default toast below
      }
      return null
    }
  }, [calendarTaskMap])

  const handleMiniCalendarTaskClick = useCallback(async (taskId: number) => {
    const target = await findTaskById(taskId)
    if (!target) {
      addToast('error', '업무 상세 정보를 찾지 못했습니다.')
      return
    }
    setDetailTask(target)
  }, [addToast, findTaskById])

  const handleMiniCalendarTaskComplete = useCallback(async (taskId: number) => {
    const target = await findTaskById(taskId)
    if (!target) {
      addToast('error', '완료할 업무 정보를 찾지 못했습니다.')
      return
    }
    if (target.status === 'completed') {
      addToast('info', '이미 완료된 업무입니다.')
      return
    }
    setCompletingTask(target)
  }, [addToast, findTaskById])

  const allVisibleTasks = useMemo(
    () =>
      QUADRANTS.flatMap((quadrant) =>
        applyTaskFilters(board?.[quadrant.key] || []),
      ),
    [applyTaskFilters, board],
  )
  const selectedVisibleTasks = useMemo(
    () => allVisibleTasks.filter((task) => selectedTaskIds.has(task.id)),
    [allVisibleTasks, selectedTaskIds],
  )
  const categoryNames = useMemo(() => {
    const names = new Set<string>(DEFAULT_TASK_CATEGORY_NAMES)
    for (const category of taskCategories) {
      const normalized = category.name.trim()
      if (normalized) names.add(normalized)
    }
    for (const quadrant of QUADRANTS) {
      for (const task of board?.[quadrant.key] || []) {
        if (task.category) names.add(task.category)
      }
    }
    return [...names]
  }, [board, taskCategories])

  const taskFilterConfigs = useMemo<FilterConfig[]>(
    () => [
      {
        key: 'status',
        label: '상태',
        type: 'select',
        options: [
          { value: 'pending', label: '진행 중' },
          { value: 'all', label: '전체' },
          { value: 'completed', label: '완료' },
        ],
      },
      {
        key: 'search',
        label: '검색',
        type: 'text',
        placeholder: '업무 검색...',
      },
      {
        key: 'due',
        label: '기한',
        type: 'select',
        options: [
          { value: 'all', label: '모든 업무' },
          { value: 'today', label: '오늘 마감' },
          { value: 'this_week', label: '이번 주' },
          { value: 'overdue', label: '기한 초과' },
        ],
      },
      {
        key: 'year',
        label: '완료 연도',
        type: 'select',
        options: completedYearOptions.map((year) => ({ value: String(year), label: `${year}년` })),
      },
      {
        key: 'month',
        label: '완료 월',
        type: 'select',
        options: Array.from({ length: 12 }, (_, idx) => ({ value: String(idx + 1), label: `${idx + 1}월` })),
      },
      {
        key: 'target',
        label: '대상',
        type: 'select',
        options: [
          ...gpEntities.map((entity) => ({ value: `gp:${entity.id}`, label: `고유계정 · ${entity.name}` })),
          ...fundsForFilter.map((fund) => ({ value: `fund:${fund.id}`, label: `조합 · ${fund.name}` })),
        ],
      },
      {
        key: 'category',
        label: '카테고리',
        type: 'select',
        options: categoryNames.map((name) => ({ value: name, label: name })),
      },
    ],
    [categoryNames, completedYearOptions, fundsForFilter, gpEntities],
  )

  const taskFilterValues = useMemo(
    () => ({
      status: statusFilter,
      search: searchKeyword,
      due: quickDueFilter,
      year: String(completedYear),
      month: completedMonth === '' ? '' : String(completedMonth),
      target: fundFilter,
      category: categoryFilter,
    }),
    [boardView, categoryFilter, completedMonth, completedYear, fundFilter, quickDueFilter, searchKeyword, statusFilter],
  )

  const overdueTasks = useMemo(
    () => allVisibleTasks.filter((task) => isOverdueTask(task)),
    [allVisibleTasks],
  )
  const overdueCount = useMemo(
    () => overdueTasks.length,
    [overdueTasks],
  )
  const urgentTasks = useMemo(
    () =>
      allVisibleTasks.filter((task) => {
        if (task.status === 'completed' || !task.deadline) return false
        const deadline = new Date(task.deadline).getTime()
        if (Number.isNaN(deadline)) return false
        const nowMs = Date.now()
        return deadline >= nowMs && deadline <= nowMs + 24 * 60 * 60 * 1000
      }),
    [allVisibleTasks],
  )
  const pipelineTodayTasks = useMemo(
    () => applyTaskFilters(pipelineBaseData?.today?.tasks ?? []),
    [applyTaskFilters, pipelineBaseData],
  )
  const pipelineTomorrowTasks = useMemo(
    () => applyTaskFilters(pipelineBaseData?.tomorrow?.tasks ?? []),
    [applyTaskFilters, pipelineBaseData],
  )
  const pipelineThisWeekTasks = useMemo(
    () => applyTaskFilters(pipelineBaseData?.this_week ?? []),
    [applyTaskFilters, pipelineBaseData],
  )
  const pipelineUpcomingTasks = useMemo(
    () => applyTaskFilters(pipelineBaseData?.upcoming ?? []),
    [applyTaskFilters, pipelineBaseData],
  )
  const pipelineNoDeadlineTasks = useMemo(
    () => applyTaskFilters(pipelineBaseData?.no_deadline ?? []),
    [applyTaskFilters, pipelineBaseData],
  )
  const pipelineActiveWorkflows = useMemo(
    () => (pipelineWorkflowsData?.active_workflows ?? []).filter(matchesWorkflowByTarget),
    [fundFilter, fundsForFilter, gpEntities, pipelineWorkflowsData],
  )
  const isPipelineLoading = boardView === 'pipeline' && (pipelineBaseLoading || pipelineWorkflowsLoading)

  useEffect(() => {
    const visibleTaskIdSet = new Set(allVisibleTasks.map((task) => task.id))
    setSelectedTaskIds((prev) => {
      if (prev.size === 0) return prev
      const next = new Set<number>()
      prev.forEach((taskId) => {
        if (visibleTaskIdSet.has(taskId)) {
          next.add(taskId)
        }
      })
      return next.size === prev.size ? prev : next
    })
  }, [allVisibleTasks])

  const toggleTaskSelection = useCallback((taskId: number, selected: boolean) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev)
      if (selected) {
        next.add(taskId)
      } else {
        next.delete(taskId)
      }
      return next
    })
  }, [])

  const clearSelectedTasks = useCallback(() => {
    setSelectedTaskIds(new Set())
  }, [])

  const handleFilterPanelChange = useCallback((key: string, value: string) => {
    switch (key) {
      case 'view':
        if (value === 'board' || value === 'calendar' || value === 'pipeline') {
          setBoardView(value)
        }
        break
      case 'status':
        if (value === 'pending' || value === 'all' || value === 'completed') {
          setStatusFilter(value)
        }
        break
      case 'search':
        setSearchKeyword(value)
        break
      case 'due':
        if (value === 'all' || value === 'today' || value === 'this_week' || value === 'overdue') {
          setQuickDueFilter(value)
        }
        break
      case 'year':
        if (value) setCompletedYear(Number(value))
        break
      case 'month':
        setCompletedMonth(value ? Number(value) : '')
        break
      case 'target':
        setFundFilter(value)
        break
      case 'category':
        setCategoryFilter(value)
        break
      default:
        break
    }
  }, [])

  const resetFilters = useCallback(() => {
    setBoardView('board')
    setStatusFilter('pending')
    setSearchKeyword('')
    setQuickDueFilter('all')
    setCompletedYear(currentYear)
    setCompletedMonth(currentMonth)
    setFundFilter('')
    setCategoryFilter('')
  }, [currentMonth, currentYear])

  const handleBulkComplete = useCallback(() => {
    const pendingTasks = selectedVisibleTasks.filter((task) => task.status !== 'completed')
    if (pendingTasks.length === 0) {
      addToast('error', '완료 가능한 업무가 선택되지 않았습니다.')
      return
    }

    const hasWorkflowTasks = pendingTasks.some((task) => task.workflow_instance_id != null)
    if (hasWorkflowTasks) {
      setBulkCompleteQueue(pendingTasks)
      setCompletingTask(pendingTasks[0])
      setShowBulkCompleteModal(false)
      return
    }

    setBulkCompleteQueue([])
    setShowBulkCompleteModal(true)
  }, [addToast, selectedVisibleTasks])

  const handleBulkDelete = useCallback(() => {
    if (selectedVisibleTasks.length === 0) {
      addToast('error', '선택된 업무가 없습니다.')
      return
    }
    setDeleteConfirm({ type: 'bulk', taskIds: selectedVisibleTasks.map((task) => task.id) })
  }, [addToast, selectedVisibleTasks])

  const deleteConfirmContent = useMemo(() => {
    if (!deleteConfirm) {
      return {
        title: '',
        message: '',
        confirmLabel: '삭제',
      }
    }

    if (deleteConfirm.type === 'task') {
      return {
        title: '업무 삭제',
        message: '이 업무를 삭제하시겠습니까?',
        confirmLabel: '삭제',
      }
    }

    if (deleteConfirm.type === 'bulk') {
      return {
        title: '업무 일괄 삭제',
        message: `선택한 ${deleteConfirm.taskIds.length}개 업무를 삭제하시겠습니까?`,
        confirmLabel: '일괄 삭제',
      }
    }

    return {
      title: '카테고리 삭제',
      message: `[${deleteConfirm.category.name}] 카테고리를 삭제하시겠습니까?`,
      confirmLabel: '삭제',
    }
  }, [deleteConfirm])

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteConfirm) return

    if (deleteConfirm.type === 'task') {
      deleteMutation.mutate(deleteConfirm.taskId)
    } else if (deleteConfirm.type === 'bulk') {
      bulkDeleteMutation.mutate({ taskIds: deleteConfirm.taskIds })
    } else {
      setDeletingCategoryId(deleteConfirm.category.id)
      deleteCategoryMutation.mutate(deleteConfirm.category)
    }

    setDeleteConfirm(null)
  }, [bulkDeleteMutation, deleteCategoryMutation, deleteConfirm, deleteMutation])

  const handleOverdueConfirm = useCallback(() => {
    setStatusFilter('pending')
    setFundFilter('')
    setCategoryFilter('')
    setSearchKeyword('')
    setQuickDueFilter('overdue')
    setBoardView('board')

    const firstOverdueTask = overdueTasks[0]
    if (!firstOverdueTask) return

    setPendingScrollId(firstOverdueTask.id)
    setBlinkingId(firstOverdueTask.id)
    window.setTimeout(() => {
      setBlinkingId((prev) => (prev === firstOverdueTask.id ? null : prev))
    }, 3000)
  }, [overdueTasks])

  const handleUrgentConfirm = useCallback(() => {
    setStatusFilter('pending')
    setFundFilter('')
    setCategoryFilter('')
    setSearchKeyword('')
    setQuickDueFilter('today')
    setBoardView('board')

    const firstUrgentTask = urgentTasks[0]
    if (!firstUrgentTask) return

    setPendingScrollId(firstUrgentTask.id)
    setBlinkingId(firstUrgentTask.id)
    window.setTimeout(() => {
      setBlinkingId((prev) => (prev === firstUrgentTask.id ? null : prev))
    }, 3000)
  }, [urgentTasks])

  if (isLoading) return <PageLoading />

  return (
    <div className="page-container">
      <div className="page-header mb-3 items-center">
        <div className="flex items-center gap-2">
          <h2 className="page-title">업무 보드</h2>
          {overdueCount > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              지연 {overdueCount}건
            </span>
          )}
          <Link
            to="/dashboard"
            className="rounded-md border border-[#c5d8fb] bg-[#f5f9ff] px-2 py-1 text-xs font-medium text-[#1a3660] hover:bg-[#e6efff]"
          >
            오늘의 현황
          </Link>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <button
            type="button"
            onClick={() => setSelectionMode((prev) => !prev)}
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${
              selectionMode
                ? 'border-[#c5d8fb] bg-[#f5f9ff] text-[#1a3660]'
                : 'border-[#d8e5fb] bg-white text-[#0f1f3d] hover:bg-[#f5f9ff]'
            }`}
          >
            {selectionMode ? '선택 모드 ON' : '선택 모드'}
          </button>
          <button
            onClick={() => setShowCategoryManager(true)}
            className="inline-flex items-center gap-1 rounded border border-[#d8e5fb] bg-white px-2 py-1 text-xs text-[#0f1f3d] hover:bg-[#f5f9ff]"
          >
            <Tag size={12} />
            카테고리 관리
          </button>
        </div>
      </div>

      <FilterPanel
        filters={taskFilterConfigs}
        values={taskFilterValues}
        onChange={handleFilterPanelChange}
        onReset={resetFilters}
        visibleCount={3}
      />

      <div className="mt-4 space-y-5">
        <div className="flex gap-1 rounded-xl bg-[#f5f9ff] p-1">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setBoardView(tab.key)}
              className={`tab-btn flex-1 justify-center rounded-lg px-4 py-1.5 text-sm font-medium ${
                boardView === tab.key
                  ? 'active bg-white shadow-sm'
                  : ''
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

      {boardView === 'board' && selectedVisibleTasks.length > 0 && (
        <div className="sticky top-3 z-20 mb-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-[#d8e5fb] bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
          <span className="text-sm font-semibold text-[#0f1f3d]">{selectedVisibleTasks.length}개 선택됨</span>
          <button
            onClick={handleBulkComplete}
            disabled={bulkCompleteMutation.isPending || completeMutation.isPending}
            className="primary-btn btn-sm disabled:opacity-60"
          >
            일괄 완료
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleteMutation.isPending}
            className="danger-btn btn-sm disabled:opacity-60"
          >
            일괄 삭제
          </button>
          <button
            onClick={clearSelectedTasks}
            className="secondary-btn btn-sm"
          >
            선택 해제
          </button>
        </div>
      )}

      {overdueTasks.length > 0 && (
        <div className="mb-2 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-900">기한 경과 업무가 {overdueTasks.length}건 있습니다.</p>
          <button onClick={handleOverdueConfirm} className="btn-sm rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100">
            업무 확인
          </button>
        </div>
      )}

      {urgentTasks.length > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
          <p className="text-sm font-medium text-orange-900">24시간 이내 마감 업무가 {urgentTasks.length}건 있습니다.</p>
          <button onClick={handleUrgentConfirm} className="btn-sm rounded-lg border border-orange-300 bg-white px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100">
            업무 확인
          </button>
        </div>
      )}

      {boardView === 'calendar' ? (
        <div className="w-full">
          <MiniCalendar
            onTaskClick={(taskId) => {
              void handleMiniCalendarTaskClick(taskId)
            }}
            onTaskComplete={(taskId) => {
              void handleMiniCalendarTaskComplete(taskId)
            }}
          />
        </div>
      ) : boardView === 'pipeline' ? (
        <div className="w-full">
          {isPipelineLoading ? (
            <div className="rounded-xl border border-[#d8e5fb] bg-white py-12 text-center text-sm text-[#64748b]">
              파이프라인 데이터를 불러오는 중입니다...
            </div>
          ) : (
            <TaskPipelineView
              todayTasks={pipelineTodayTasks}
              tomorrowTasks={pipelineTomorrowTasks}
              thisWeekTasks={pipelineThisWeekTasks}
              upcomingTasks={pipelineUpcomingTasks}
              noDeadlineTasks={pipelineNoDeadlineTasks}
              activeWorkflows={pipelineActiveWorkflows}
              onClickTask={(task, options) => {
                if (options?.editable) {
                  setEditingTask(task)
                  return
                }
                setDetailTask(task)
              }}
              onClickWorkflow={(workflow) => {
                navigate('/workflows', { state: { highlightWorkflowId: workflow.id } })
              }}
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {QUADRANTS.map((quadrant) => {
            const allTasks = sortTasksForQuadrant(
              applyTaskFilters(board?.[quadrant.key] || []),
              quadrant.key,
            )
            const { standalone, workflows } = groupTasksByWorkflow(allTasks)

            return (
              <div
                key={quadrant.key}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverQuadrant(quadrant.key)
                }}
                onDragLeave={() => setDragOverQuadrant((prev) => (prev === quadrant.key ? null : prev))}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOverQuadrant(null)
                  const taskId = Number(e.dataTransfer.getData('taskId'))
                  const fromQuadrant = e.dataTransfer.getData('fromQuadrant')
                  if (!taskId || !fromQuadrant || fromQuadrant === quadrant.key) return
                  moveMutation.mutate({ id: taskId, quadrant: quadrant.key })
                }}
                className={`rounded-xl border border-[#d8e5fb] border-l-4 bg-white p-4 shadow-sm ${quadrant.color} ${
                  dragOverQuadrant === quadrant.key ? 'border-dashed ring-2 ring-[#558ef8] bg-[#f5f9ff]/30' : ''
                }`}
              >
                <div className="mb-3.5 flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${quadrant.badge}`} />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">{quadrant.label}</h3>
                  <span className="ml-auto text-xs text-[#94a3b8]">{allTasks.length}</span>
                </div>

                <div className="space-y-3">
                  {standalone.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onComplete={setCompletingTask}
                      onEdit={setEditingTask}
                      onDelete={handleDeleteTask}
                      selected={selectedTaskIds.has(task.id)}
                      selectionMode={selectionMode}
                      onToggleSelect={toggleTaskSelection}
                      isBlinking={blinkingId === task.id}
                    />
                  ))}

                  {workflows.map((group) => (
                    <WorkflowGroupCard
                      key={group.workflowInstanceId}
                      group={group}
                      onComplete={setCompletingTask}
                      onEdit={setEditingTask}
                      onDelete={handleDeleteTask}
                      selectionMode={selectionMode}
                      selectedTaskIds={selectedTaskIds}
                      onToggleSelect={toggleTaskSelection}
                      blinkingId={blinkingId}
                    />
                  ))}
                  {allTasks.length === 0 && (
                    <div className="rounded-lg border border-dashed border-[#d8e5fb]">
                      <EmptyState message="등록된 업무가 없습니다." className="py-6" />
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <AddTaskForm quadrant={quadrant.key} categoryOptions={categoryNames} />
                </div>
              </div>
            )
          })}
        </div>
      )}
      </div>

      {showCategoryManager && (
        <CategoryManagerModal
          categories={taskCategories}
          newCategoryName={newCategoryName}
          onChangeNewCategory={setNewCategoryName}
          onCreate={handleCreateCategory}
          onDelete={handleDeleteCategory}
          onClose={() => {
            setShowCategoryManager(false)
            setNewCategoryName('')
          }}
          creating={createCategoryMutation.isPending}
          deletingCategoryId={deletingCategoryId}
        />
      )}

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          fundsForFilter={fundsForFilter}
          gpEntities={gpEntities}
          categoryOptions={categoryNames}
          onSave={(id, data) => updateMutation.mutate({ id, data })}
          onCancel={() => setEditingTask(null)}
        />
      )}

      {showBulkCompleteModal && (
        <BulkCompleteModal
          count={selectedVisibleTasks.filter((task) => task.status !== 'completed').length}
          onConfirm={(actualTime, autoWorklog) => {
            bulkCompleteMutation.mutate({
              taskIds: selectedVisibleTasks
                .filter((task) => task.status !== 'completed')
                .map((task) => task.id),
              actualTime,
              autoWorklog,
            })
          }}
          onCancel={() => setShowBulkCompleteModal(false)}
        />
      )}

      {completingTask && (
        <CompleteModal
          task={completingTask}
          onConfirm={(actualTime, autoWorklog, memo) => {
            const isBulkQueue = bulkCompleteQueue.length > 0
            const remainingQueue = isBulkQueue ? bulkCompleteQueue.slice(1) : []

            completeMutation.mutate(
              { id: completingTask.id, actualTime, autoWorklog, memo },
              {
                onSuccess: () => {
                  if (isBulkQueue) {
                    if (remainingQueue.length > 0) {
                      setBulkCompleteQueue(remainingQueue)
                      setCompletingTask(remainingQueue[0])
                    } else {
                      setBulkCompleteQueue([])
                      setCompletingTask(null)
                      setSelectedTaskIds(new Set())
                      addToast('success', '선택한 업무를 순차 완료했습니다.')
                    }
                    return
                  }

                  setCompletingTask(null)
                  addToast('success', '작업이 완료 처리되었습니다.')
                },
              },
            )
          }}
          onCancel={() => {
            setCompletingTask(null)
            setBulkCompleteQueue([])
          }}
        />
      )}

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          onClose={() => setDetailTask(null)}
          onEdit={(task) => {
            setDetailTask(null)
            setEditingTask(task)
          }}
          onComplete={(task) => {
            setDetailTask(null)
            setCompletingTask(task)
          }}
        />
      )}

      <ConfirmDialog
        open={deleteConfirm !== null}
        title={deleteConfirmContent.title}
        message={deleteConfirmContent.message}
        confirmLabel={deleteConfirmContent.confirmLabel}
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  )
}





