import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Clock, GitBranch, Pencil, Plus, Tag, Trash2 } from 'lucide-react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import CompleteModal from '../components/CompleteModal'
import EmptyState from '../components/EmptyState'
import MiniCalendar from '../components/MiniCalendar'
import TaskPipelineView from '../components/TaskPipelineView'
import CompletedTasksSection from '../components/taskboard/CompletedTasksSection'
import TaskAlertPopup from '../components/taskboard/TaskAlertPopup'
import TaskSidePanel from '../components/taskboard/TaskSidePanel'
import TaskTopControlStrip from '../components/taskboard/TaskTopControlStrip'
import TaskAttachmentSection from '../components/common/TaskAttachmentSection'
import TimeSelect from '../components/TimeSelect'
import { HOUR_OPTIONS } from '../components/timeOptions'
import ConfirmDialog from '../components/ui/ConfirmDialog'
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
  undoCompleteTask,
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
  WorkflowInstance,
  WorkflowListItem,
} from '../lib/api'
import { invalidateFundRelated, invalidateTaskRelated } from '../lib/queryInvalidation'
import { queryKeys } from '../lib/queryKeys'
import { resolveDeadlineTone, type TaskDeadlineTone } from '../lib/taskUrgency'

const QUADRANTS = [
  { key: 'Q1', label: '긴급·중요 (Q1)', color: 'border-[#9fb7e5]', bg: 'bg-[#f5f9ff]', badge: 'bg-[#0f1f3d]' },
  { key: 'Q2', label: '중요·비긴급 (Q2)', color: 'border-[#9fb7e5]', bg: 'bg-[#f5f9ff]', badge: 'bg-[#558ef8]' },
  { key: 'Q3', label: '긴급·비중요 (Q3)', color: 'border-[#d9c89a]', bg: 'bg-[#f5f9ff]', badge: 'bg-[#1a3660]' },
  { key: 'Q4', label: '비긴급·비중요 (Q4)', color: 'border-[#bfcff0]', bg: 'bg-[#f5f9ff]', badge: 'bg-[#64748b]' },
] as const

const DEFAULT_TASK_CATEGORY_NAMES = ['투자실행', 'LP보고', '사후관리', '규약/총회', '서류관리', '일반'] as const

type BoardView = 'board' | 'calendar' | 'pipeline'
type QuadrantKey = (typeof QUADRANTS)[number]['key']

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

interface WorkflowProgressOverride {
  completedSteps: number
  totalSteps: number
  progressPercent: number
  progressLabel: string
}

interface QuadrantBoardBucket {
  allTasks: Task[]
  standalone: Task[]
  workflows: WorkflowGroup[]
}

interface WorkflowTimelineRow {
  id: number
  order: number
  title: string
  deadline: string | null
  status: string
  task: Task | null
  isCurrent: boolean
}

interface WorkflowLaneMeta {
  progressPercent: number
  completedLabel: string
  currentLabel: string
  nextLabel: string
  isBlocked: boolean
  blockedReason: string | null
  dependencyLabel: string | null
  tooltipCurrent: string
  tooltipNext: string
  tooltipSummary: string
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
  topBarClass: string
  badgeStatus: 'danger' | 'warning' | 'pending' | 'overdue' | null
  label: string | null
  priorityWeight: number
} {
  const tone: TaskDeadlineTone = task.status === 'completed' ? 'later' : resolveDeadlineTone(task.deadline)
  switch (tone) {
    case 'overdue':
      return {
        topBarClass: 'bg-[#bfa5a7]',
        badgeStatus: 'overdue',
        label: '지연',
        priorityWeight: 500,
      }
    case 'today':
      return {
        topBarClass: 'bg-[#bfa5a7]',
        badgeStatus: 'danger',
        label: '오늘마감',
        priorityWeight: 420,
      }
    case 'this_week':
      return {
        topBarClass: 'bg-[#558ef8]',
        badgeStatus: 'warning',
        label: '이번주',
        priorityWeight: 320,
      }
    case 'none':
      return {
        topBarClass: 'bg-[#d8e5fb]',
        badgeStatus: 'pending',
        label: '기한없음',
        priorityWeight: 80,
      }
    case 'later':
    default:
      return {
        topBarClass: task.status === 'completed' ? 'bg-emerald-300' : 'bg-[#d8e5fb]',
        badgeStatus: null,
        label: null,
        priorityWeight: 200,
      }
  }
}

function computeTaskPriorityScore(task: Task): number {
  const urgency = taskUrgencyMeta(task).priorityWeight
  const stale = Math.min(Math.max(task.stale_days ?? 0, 0), 14) * 4
  const compliance = task.obligation_id ? 70 : 0
  const workflow = task.workflow_instance_id ? 40 : 0
  const notice = task.is_notice || task.is_report ? 20 : 0
  return urgency + stale + compliance + workflow + notice
}

function resolveTaskPriorityGrade(score: number): { label: 'A' | 'B' | 'C' | 'D'; className: string } {
  if (score >= 500) {
    return { label: 'A', className: 'border-[#d6c3c5] bg-[#f1e8e9] text-[#73585c]' }
  }
  if (score >= 380) {
    return { label: 'B', className: 'border-[#e2d8bc] bg-[#fff7d6] text-[#8a6f2e]' }
  }
  if (score >= 260) {
    return { label: 'C', className: 'border-[#c8daf8] bg-[#f5f9ff] text-[#1a3660]' }
  }
  return { label: 'D', className: 'border-[#d8e5fb] bg-white text-[#64748b]' }
}

type DeleteConfirmState =
  | { type: 'task'; taskId: number }
  | { type: 'bulk'; taskIds: number[] }
  | { type: 'category'; category: TaskCategory }
  | null

function parseWorkflowProgress(progress: string | null | undefined): WorkflowProgressOverride | null {
  if (!progress) return null
  const matched = progress.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/)
  if (!matched) return null
  const completedSteps = Number(matched[1])
  const totalSteps = Number(matched[2])
  if (!Number.isFinite(completedSteps) || !Number.isFinite(totalSteps) || totalSteps <= 0) {
    return null
  }
  const normalizedCompleted = Math.max(0, Math.min(completedSteps, totalSteps))
  return {
    completedSteps: normalizedCompleted,
    totalSteps,
    progressPercent: Math.round((normalizedCompleted / totalSteps) * 100),
    progressLabel: `${normalizedCompleted}/${totalSteps}`,
  }
}

function groupTasksByWorkflow(
  tasks: Task[],
  progressOverrideMap?: Map<number, WorkflowProgressOverride>,
): { standalone: Task[]; workflows: WorkflowGroup[] } {
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
    const fallbackCompletedCount = sorted.filter((task) => task.status === 'completed').length
    const fallbackTotalSteps = sorted.length
    const override = progressOverrideMap?.get(workflowInstanceId)
    const hasOpenStep = sorted.some((task) => task.status !== 'completed')
    const totalSteps = override?.totalSteps ?? fallbackTotalSteps
    const rawCompletedCount = override?.completedSteps ?? fallbackCompletedCount
    const completedCount =
      hasOpenStep && totalSteps > 0
        ? Math.min(rawCompletedCount, Math.max(totalSteps - 1, 0))
        : rawCompletedCount
    workflows.push({
      workflowInstanceId,
      tasks: sorted,
      currentStep,
      nextStep,
      completedSteps: completedCount,
      totalSteps,
      progressPercent: override?.progressPercent ?? (totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0),
      progress: override?.progressLabel ?? `${completedCount}/${totalSteps}`,
    })
  }

  workflows.sort((a, b) => (a.currentStep?.workflow_step_order || 0) - (b.currentStep?.workflow_step_order || 0))
  return { standalone, workflows }
}

function formatTaskDday(deadline: string | null): string {
  if (!deadline) return '마감일 없음'
  const due = new Date(deadline)
  if (Number.isNaN(due.getTime())) return '마감일 없음'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  const diff = Math.floor((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  if (diff < 0) return `D+${Math.abs(diff)}`
  if (diff === 0) return 'D-day'
  return `D-${diff}`
}

function buildWorkflowLaneMeta(group: WorkflowGroup): WorkflowLaneMeta {
  const logicalStepCount = Math.max(group.totalSteps, group.tasks.length, 1)
  const progressPercent = Math.max(0, Math.min(group.progressPercent, 100))
  const safeTotalSteps = Math.max(group.totalSteps, logicalStepCount)
  const completedLabel = `${group.completedSteps}/${safeTotalSteps}`
  const currentIsOverdue =
    group.currentStep?.status !== 'completed' && resolveDeadlineTone(group.currentStep?.deadline ?? null) === 'overdue'
  const blockedReason = !group.currentStep
    ? '현재 진행 단계 없음'
    : currentIsOverdue
      ? '현재 단계 기한 경과'
      : null
  const isBlocked = blockedReason !== null
  const dependencyLabel = group.nextStep ? '다음 단계는 현재 단계 완료 후 진행' : null
  const currentLabel = group.currentStep?.title || '없음'
  const nextLabel = group.nextStep?.title || '없음'
  const tooltipCurrent = group.currentStep
    ? `${group.currentStep.title} · ${formatTaskDday(group.currentStep.deadline)}`
    : '없음'
  const tooltipNext = group.nextStep
    ? `${group.nextStep.title} · ${formatTaskDday(group.nextStep.deadline)}`
    : '없음'
  const tooltipSummary = `단계진행률 ${completedLabel} (${progressPercent}%)`

  return {
    progressPercent,
    completedLabel,
    currentLabel,
    nextLabel,
    isBlocked,
    blockedReason,
    dependencyLabel,
    tooltipCurrent,
    tooltipNext,
    tooltipSummary,
  }
}

interface TaskItemProps {
  task: Task
  onComplete: (task: Task) => void
  onDelete: (id: number) => void
  onEdit: (task: Task) => void
  onOpenDetail: (task: Task) => void
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
  onOpenDetail,
  selected,
  selectionMode,
  onToggleSelect,
  isBlinking = false,
}: TaskItemProps) {
  const deadlineStr = task.deadline
    ? new Date(task.deadline).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    : null
  const urgencyMeta = taskUrgencyMeta(task)
  const taskSurfaceToneClass =
    urgencyMeta.badgeStatus === 'overdue' || urgencyMeta.badgeStatus === 'danger'
      ? 'border-[#e8d9db] bg-[#fffdfd] shadow-[0_1px_2px_rgba(15,31,61,0.05)] hover:border-[#d5bdc0]'
      : urgencyMeta.badgeStatus === 'warning'
        ? 'border-[#d4e1f8] bg-[#fafdff] shadow-[0_1px_2px_rgba(15,31,61,0.05)] hover:border-[#bfd0f2]'
        : 'border-[#d8e5fb] bg-white shadow-[0_1px_2px_rgba(15,31,61,0.05)] hover:border-[#c3d4f2]'
  const priorityScore = computeTaskPriorityScore(task)
  const priorityGrade = resolveTaskPriorityGrade(priorityScore)
  const [isDragging, setIsDragging] = useState(false)
  const urgencyTag =
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
      : task.status === 'completed'
        ? { label: '완료', className: 'tag tag-emerald' }
        : { label: '예정', className: 'tag tag-blue' }
  const categoryTag = task.category
    ? { label: task.category, className: categoryBadgeClass(task.category) }
    : { label: '미분류', className: 'tag tag-gray' }
  const staleDays = typeof task.stale_days === 'number' ? task.stale_days : null
  const staleLabel = !task.deadline && staleDays != null && staleDays >= 5
    ? `기한 미설정 ${staleDays}일`
    : staleDays != null && staleDays >= 7
      ? `방치 ${staleDays}일`
      : staleDays != null && staleDays >= 3
        ? `방치 ${staleDays}일`
        : null
  const staleClass = staleDays != null && staleDays >= 7 ? 'tag tag-red' : 'tag tag-amber'
  const dDayLabel = (() => {
    if (!task.deadline) return '기한없음'
    const deadline = new Date(task.deadline)
    if (Number.isNaN(deadline.getTime())) return '기한없음'
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    deadline.setHours(0, 0, 0, 0)
    const diff = Math.floor((deadline.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
    if (diff < 0) return `D+${Math.abs(diff)}`
    if (diff === 0) return 'D-day'
    return `D-${diff}`
  })()
  const targetLabel = task.fund_name || task.gp_entity_name || '공통'
  const traitTag = [
    task.obligation_id ? { label: '컴플연계', className: 'tag tag-red' } : null,
    task.workflow_name ? { label: '워크플로', className: 'tag tag-indigo' } : null,
    task.is_notice || task.is_report ? { label: '통지/보고', className: 'tag tag-blue' } : null,
    staleLabel ? { label: staleLabel, className: staleClass } : null,
  ].filter(Boolean)[0] as { label: string; className: string } | undefined

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
      className={`group relative overflow-visible rounded-xl border px-2.5 py-2 transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_10px_22px_rgba(15,31,61,0.08)] ${taskSurfaceToneClass} ${
        isBlinking ? 'animate-pulse ring-2 ring-[#558ef8]' : ''
      } ${isDragging ? 'opacity-70' : ''}`}
    >
      <div className="min-w-0 cursor-pointer" onClick={() => onOpenDetail(task)}>
        <div className="flex items-start gap-1.5">
          <p className="line-clamp-2 min-w-0 flex-1 text-[12px] font-semibold leading-[1.3] text-[#0f1f3d]">
            {task.title}
          </p>
          <div className="inline-flex shrink-0 items-center gap-1">
            <span
              title={`우선순위 점수 ${priorityScore}`}
              className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-md border px-1 text-[10px] font-semibold ${priorityGrade.className}`}
            >
              {priorityGrade.label}
            </span>
            <span className={urgencyTag.className}>{urgencyTag.label}</span>
          </div>
        </div>
        <div className="mt-1 flex items-start justify-between gap-1 text-[10px] leading-none text-[#64748b]">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <span className={categoryTag.className}>{categoryTag.label}</span>
            {traitTag && <span className={traitTag.className}>{traitTag.label}</span>}
            <span className="max-w-[92px] truncate">{targetLabel}</span>
            {deadlineStr && <span>·</span>}
            {deadlineStr && <span>{deadlineStr}</span>}
            <span>{dDayLabel}</span>
            {task.estimated_time && (
              <span className="inline-flex items-center gap-0.5">
                <Clock size={10} /> {task.estimated_time}
              </span>
            )}
          </div>
          {selectionMode && (
            <button
              type="button"
              aria-pressed={selected}
              aria-label={`업무 선택: ${task.title}`}
              onClick={(event) => {
                event.stopPropagation()
                onToggleSelect(task.id, !selected)
              }}
              className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#558ef8]/45 ${
                selected
                  ? 'border-[#0f1f3d] bg-[#0f1f3d] text-white'
                  : 'border-[#d8e5fb] bg-white text-[#64748b] hover:border-[#bfcff0] hover:bg-[#f5f9ff]'
              }`}
            >
              <Check size={10} />
              <span>{selected ? '선택됨' : '선택'}</span>
            </button>
          )}
        </div>
      </div>
      <div className="absolute -top-2.5 right-1.5 z-20 inline-flex items-center gap-0.5 rounded-full border border-[#d8e5fb] bg-white/96 p-0.5 shadow-[0_5px_14px_rgba(15,31,61,0.14)] backdrop-blur-sm md:pointer-events-none md:translate-y-1 md:opacity-0 md:transition-all md:duration-200 md:group-hover:pointer-events-auto md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:pointer-events-auto md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100">
        <button
          onClick={() => onComplete(task)}
          className="icon-btn h-5 w-5 min-h-0 min-w-0 rounded-full p-0 text-emerald-700 hover:bg-emerald-50"
          title="완료"
          aria-label="완료"
        >
          <Check size={11} />
        </button>
        <button
          onClick={() => onEdit(task)}
          className="icon-btn h-5 w-5 min-h-0 min-w-0 rounded-full p-0 text-[#1a3660] hover:bg-[#eef4ff]"
          title="수정"
          aria-label="수정"
        >
          <Pencil size={10} />
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="icon-btn h-5 w-5 min-h-0 min-w-0 rounded-full p-0 text-[#64748b] hover:bg-[#f3f5fb] hover:text-red-500"
          title="삭제"
          aria-label="삭제"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
})
TaskItem.displayName = 'TaskItem'

function resolveWorkflowGroupTitle(group: WorkflowGroup): string {
  return (
    group.currentStep?.fund_name ||
    group.currentStep?.gp_entity_name ||
    group.currentStep?.company_name ||
    '워크플로우'
  )
}

interface WorkflowCompactCardProps {
  group: WorkflowGroup
  onOpenWorkflow: (workflowInstanceId: number) => void
}

const WorkflowCompactCard = memo(function WorkflowCompactCard({
  group,
  onOpenWorkflow,
}: WorkflowCompactCardProps) {
  const title = resolveWorkflowGroupTitle(group)
  const currentStep = group.currentStep
  const priorityScore = currentStep ? computeTaskPriorityScore(currentStep) : 0
  const priorityGrade = resolveTaskPriorityGrade(priorityScore)
  const laneMeta = buildWorkflowLaneMeta(group)
  const ringColor = laneMeta.isBlocked ? '#bfa5a7' : '#0f1f3d'
  const [animatedPercent, setAnimatedPercent] = useState(laneMeta.progressPercent)
  const animatedPercentRef = useRef(laneMeta.progressPercent)
  const animationFrameRef = useRef<number | null>(null)

  useEffect(() => {
    const target = laneMeta.progressPercent
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (animationFrameRef.current != null) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (reducedMotion) {
      animatedPercentRef.current = target
      setAnimatedPercent(target)
      return
    }

    const startValue = animatedPercentRef.current
    if (Math.abs(target - startValue) < 0.1) {
      animatedPercentRef.current = target
      setAnimatedPercent(target)
      return
    }

    const durationMs = 520
    const startAt = performance.now()

    const step = (now: number) => {
      const elapsed = Math.min(1, (now - startAt) / durationMs)
      const eased = 1 - Math.pow(1 - elapsed, 3)
      const value = startValue + (target - startValue) * eased
      animatedPercentRef.current = value
      setAnimatedPercent(value)
      if (elapsed < 1) {
        animationFrameRef.current = window.requestAnimationFrame(step)
      } else {
        animationFrameRef.current = null
      }
    }

    animationFrameRef.current = window.requestAnimationFrame(step)
    return () => {
      if (animationFrameRef.current != null) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [laneMeta.progressPercent])

  const displayPercent = Math.round(animatedPercent)
  const ringBackground = `conic-gradient(${ringColor} ${animatedPercent}%, #d8e5fb ${animatedPercent}% 100%)`

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenWorkflow(group.workflowInstanceId)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpenWorkflow(group.workflowInstanceId)
        }
      }}
      className={`group relative rounded-xl border px-2 py-2 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#558ef8]/45 ${
        laneMeta.isBlocked ? 'border-[#d6c3c5] bg-[#f7f0f1]' : 'border-[#c5d8fb] bg-[#f5f9ff]'
      }`}
    >
      <div className="grid grid-cols-[56px_minmax(0,1fr)] gap-2">
        <div className="relative h-14 w-14">
          <div className="absolute inset-0 rounded-full" style={{ background: ringBackground }} />
          <div className="absolute inset-[6px] flex flex-col items-center justify-center rounded-full border border-[#e4e7ee] bg-white">
            <span className="font-data text-[10px] font-semibold leading-none text-[#0f1f3d]">
              {displayPercent}%
            </span>
            <span className="font-data mt-0.5 text-[9px] leading-none text-[#64748b]">{laneMeta.completedLabel}</span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className={laneMeta.isBlocked ? 'text-[#7d6468]' : 'text-[#558ef8]'}>
              <GitBranch size={12} />
            </span>
            <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#0f1f3d]">{title}</p>
            <span
              title={`우선순위 점수 ${priorityScore}`}
              className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-md border px-1 text-[10px] font-semibold ${priorityGrade.className}`}
            >
              {priorityGrade.label}
            </span>
          </div>

          <p className="mt-1 truncate text-[10px] text-[#0f1f3d]">
            <span className="font-semibold text-[#1a3660]">현재</span> {laneMeta.currentLabel}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-[#64748b]">
            <span className="font-semibold text-[#1a3660]">다음</span> {laneMeta.nextLabel}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {laneMeta.isBlocked && (
              <span className="inline-flex items-center rounded border border-[#d4b9bc] bg-[#f1e8e9] px-1.5 py-0.5 text-[10px] font-semibold text-[#73585c]">
                BLOCKED
              </span>
            )}
            {laneMeta.dependencyLabel && (
              <span className="inline-flex items-center rounded border border-[#c8daf8] bg-[#f5f9ff] px-1.5 py-0.5 text-[10px] font-semibold text-[#1a3660]">
                선행
              </span>
            )}
            {laneMeta.blockedReason && (
              <span className="inline-flex items-center rounded border border-[#e4e7ee] bg-white px-1.5 py-0.5 text-[10px] text-[#64748b]">
                {laneMeta.blockedReason}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute left-2 right-2 top-[calc(100%+6px)] z-20 hidden rounded-lg border border-[#d8e5fb] bg-white/95 px-2.5 py-2 text-[10px] text-[#475569] shadow-lg opacity-0 transition-opacity duration-150 md:block md:group-hover:opacity-100 md:group-focus-visible:opacity-100">
        <p className="font-semibold text-[#0f1f3d]">{laneMeta.tooltipSummary}</p>
        <p className="mt-0.5">
          현재 단계: <span className="font-medium text-[#1a3660]">{laneMeta.tooltipCurrent}</span>
        </p>
        <p className="mt-0.5">
          다음 단계: <span className="font-medium text-[#1a3660]">{laneMeta.tooltipNext}</span>
        </p>
        {laneMeta.dependencyLabel && <p className="mt-1 text-[#64748b]">{laneMeta.dependencyLabel}</p>}
      </div>
    </div>
  )
})
WorkflowCompactCard.displayName = 'WorkflowCompactCard'

interface WorkflowSidePanelProps {
  group: WorkflowGroup | null
  workflowInstance: WorkflowInstance | null
  timelineTaskLookup: Map<number, Task>
  onClose: () => void
  onOpenTaskDetail: (task: Task) => void
  onOpenTaskEdit: (task: Task) => void
  onCompleteTask: (task: Task) => void
  onOpenWorkflowPage: (workflowInstanceId: number) => void
}

function WorkflowSidePanel({
  group,
  workflowInstance,
  timelineTaskLookup,
  onClose,
  onOpenTaskDetail,
  onOpenTaskEdit,
  onCompleteTask,
  onOpenWorkflowPage,
}: WorkflowSidePanelProps) {
  if (!group) return null

  const title = resolveWorkflowGroupTitle(group)
  const sorted = [...group.tasks].sort((a, b) => (a.workflow_step_order || 0) - (b.workflow_step_order || 0))
  const currentTask = group.currentStep
  const nextTask = group.nextStep
  const timelineRows: WorkflowTimelineRow[] = (() => {
    if (workflowInstance?.step_instances?.length) {
      const currentStepInstance =
        workflowInstance.step_instances.find((step) => step.status === 'in_progress') ||
        workflowInstance.step_instances.find((step) => step.status === 'pending') ||
        null

      return workflowInstance.step_instances.map((step, index) => {
        const relatedTask =
          (step.task_id != null ? timelineTaskLookup.get(step.task_id) : null) ||
          sorted.find((task) => task.id === step.task_id) ||
          null
        return {
          id: step.id,
          order: index + 1,
          title: step.step_name || relatedTask?.title || `단계 ${index + 1}`,
          deadline: step.calculated_date || relatedTask?.deadline || null,
          status: step.status,
          task: relatedTask,
          isCurrent: currentStepInstance ? currentStepInstance.id === step.id : false,
        }
      })
    }

    return sorted.map((task, index) => ({
      id: task.id,
      order: task.workflow_step_order || index + 1,
      title: task.title,
      deadline: task.deadline,
      status: task.status,
      task,
      isCurrent: currentTask?.id === task.id,
    }))
  })()

  return (
    <aside className="fixed right-0 top-[54px] z-40 h-[calc(100vh-54px)] w-full max-w-[500px] border-l border-[#d8e5fb] bg-white shadow-2xl sm:right-2 sm:top-[58px] sm:h-[calc(100vh-66px)] sm:rounded-2xl xl:right-4">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-[#d8e5fb] px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-[#64748b]">워크플로 상세</p>
            <h3 className="line-clamp-1 text-base font-semibold text-[#0f1f3d]">{title}</h3>
            <p className="mt-0.5 text-xs text-[#64748b]">
              단계진행률 {group.completedSteps}/{group.totalSteps} ({group.progressPercent}%)
            </p>
          </div>
          <button type="button" onClick={onClose} className="icon-btn text-[#64748b]" aria-label="워크플로 상세 닫기">
            ×
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-xl border border-[#d8e5fb] bg-[#f5f9ff] p-3">
            <p className="text-xs font-semibold text-[#1a3660]">현재 단계</p>
            <p className="mt-1 text-sm font-semibold text-[#0f1f3d]">{currentTask?.title || '진행 단계 없음'}</p>
            <p className="mt-1 text-xs text-[#64748b]">
              {currentTask?.deadline
                ? `마감 ${new Date(currentTask.deadline).toLocaleDateString('ko-KR')}`
                : '마감일 없음'}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {currentTask && (
                <>
                  <button type="button" onClick={() => onOpenTaskDetail(currentTask)} className="secondary-btn btn-xs">
                    상세 보기
                  </button>
                  <button type="button" onClick={() => onOpenTaskEdit(currentTask)} className="secondary-btn btn-xs">
                    수정
                  </button>
                  {currentTask.status !== 'completed' && (
                    <button type="button" onClick={() => onCompleteTask(currentTask)} className="primary-btn btn-xs">
                      현재 단계 완료
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[#d8e5fb] bg-white p-3">
            <p className="text-xs font-semibold text-[#1a3660]">다음 단계</p>
            <p className="mt-1 text-sm text-[#0f1f3d]">{nextTask?.title || '없음'}</p>
          </div>

          <div className="rounded-xl border border-[#d8e5fb] bg-white p-3">
            <p className="text-xs font-semibold text-[#1a3660]">단계 타임라인</p>
            <div className="mt-2 space-y-1.5">
              {timelineRows.map((row) => {
                const isDone = row.status === 'completed' || row.status === 'skipped'
                const statusClass =
                  row.status === 'completed' || row.status === 'skipped'
                    ? 'inline-flex items-center rounded border border-[#dbe3ee] bg-[#f3f6fa] px-1.5 py-0.5 text-[10px] font-semibold text-[#7a8da8]'
                    : row.status === 'in_progress'
                      ? 'inline-flex items-center rounded border border-[#bfd2f6] bg-[#eef4ff] px-1.5 py-0.5 text-[10px] font-semibold text-[#1a3660]'
                      : 'inline-flex items-center rounded border border-[#e4e7ee] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#64748b]'
                const rowToneClass = row.isCurrent
                  ? 'border-[#a9c4f4] bg-[#edf4ff] shadow-sm'
                  : isDone
                    ? 'border-[#e7edf5] bg-[#f8fafc] opacity-60'
                    : row.status === 'in_progress'
                      ? 'border-[#d2e2fb] bg-[#f5f9ff]'
                      : 'border-[#e4e7ee] bg-white'
                return (
                  <div
                    key={row.id}
                    className={`rounded-lg border px-2.5 py-2 transition-colors ${rowToneClass}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`truncate text-xs font-semibold ${row.isCurrent ? 'text-[#0f1f3d]' : isDone ? 'text-[#7d8da6]' : 'text-[#1f304f]'}`}>
                          {row.order}. {row.title}
                        </p>
                        <p className={`mt-0.5 text-[11px] ${isDone ? 'text-[#8ea0b8]' : 'text-[#64748b]'}`}>
                          {row.deadline ? new Date(row.deadline).toLocaleDateString('ko-KR') : '마감일 없음'}
                        </p>
                      </div>
                      <span className={statusClass}>
                        {row.status === 'completed' || row.status === 'skipped' ? '완료' : row.status === 'in_progress' ? '진행중' : '대기'}
                      </span>
                    </div>
                    {!isDone && row.task && (
                      <div className="mt-1.5 flex items-center gap-1">
                        <button type="button" onClick={() => onOpenTaskDetail(row.task!)} className="secondary-btn btn-xs">
                          상세
                        </button>
                        <button type="button" onClick={() => onOpenTaskEdit(row.task!)} className="secondary-btn btn-xs">
                          수정
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-t border-[#d8e5fb] px-5 py-3">
          <button
            type="button"
            onClick={() => onOpenWorkflowPage(group.workflowInstanceId)}
            className="secondary-btn btn-sm flex-1"
          >
            워크플로우 페이지로 이동
          </button>
          <button type="button" onClick={onClose} className="ghost-btn btn-sm">
            닫기
          </button>
        </div>
      </div>
    </aside>
  )
}

function AddTaskForm({
  quadrant,
  categoryOptions,
  compact = false,
}: {
  quadrant: string
  categoryOptions: string[]
  compact?: boolean
}) {
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
        className={
          compact
            ? 'secondary-btn btn-xs inline-flex items-center gap-1 text-[#64748b]'
            : 'secondary-btn btn-sm inline-flex w-full items-center justify-center gap-1 text-[#64748b]'
        }
      >
        <Plus size={14} /> 추가
      </button>
    )
  }

  const formContent = (
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

  if (!compact) {
    return formContent
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/35" onClick={() => setOpen(false)} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl" onClick={(event) => event.stopPropagation()}>
          {formContent}
        </div>
      </div>
    </>
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

  const [completingTask, setCompletingTask] = useState<Task | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [fundFilter, setFundFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [quickDueFilter, setQuickDueFilter] = useState<'all' | 'today' | 'this_week' | 'overdue'>('all')
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
  const [boardPanelTask, setBoardPanelTask] = useState<Task | null>(null)
  const [boardPanelMode, setBoardPanelMode] = useState<'detail' | 'edit'>('detail')
  const [workflowPanelInstanceId, setWorkflowPanelInstanceId] = useState<number | null>(null)
  const [completedSectionOpen, setCompletedSectionOpen] = useState(false)
  const [alertPopup, setAlertPopup] = useState<{ open: boolean; focus: 'overdue' | 'urgent' }>({
    open: false,
    focus: 'overdue',
  })
  const prevOverdueCountRef = useRef(0)
  const prevUrgentCountRef = useRef(0)
  const alertPopupTimerRef = useRef<number | null>(null)

  const { data: board, isLoading } = useQuery<TaskBoard>({
    queryKey: ['taskBoard', 'pending'],
    queryFn: () => fetchTaskBoard('pending'),
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

  const { data: completedTasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks', { status: 'completed-inline' }],
    queryFn: () => fetchTasks({ status: 'completed' }),
    enabled: boardView === 'board',
    staleTime: 30_000,
  })

  const { data: pipelineBaseData, isLoading: pipelineBaseLoading } = useQuery<DashboardBaseResponse>({
    queryKey: ['dashboard-base'],
    queryFn: fetchDashboardBase,
    enabled: boardView === 'pipeline',
    staleTime: 30_000,
  })

  const { data: pipelineWorkflowsData, isLoading: pipelineWorkflowsLoading } = useQuery<DashboardWorkflowsResponse>({
    queryKey: queryKeys.dashboard.workflows,
    queryFn: fetchDashboardWorkflows,
    enabled: boardView === 'board' || boardView === 'pipeline',
    staleTime: 30_000,
  })

  const calendarTaskMap = useMemo(
    () => new Map(calendarTasks.map((task) => [task.id, task])),
    [calendarTasks],
  )

  useEffect(() => {
    if (!highlightTaskId) return

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
    if (boardView !== 'board' && boardPanelTask) {
      setBoardPanelTask(null)
      setBoardPanelMode('detail')
    }
  }, [boardPanelTask, boardView])

  useEffect(() => {
    if (boardView !== 'board' && workflowPanelInstanceId != null) {
      setWorkflowPanelInstanceId(null)
    }
  }, [boardView, workflowPanelInstanceId])

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

  const applyCompletedTaskFilters = useCallback(
    (tasks: Task[]) => filterBySearch(filterByCategory(filterByFund(tasks))),
    [categoryFilter, fundFilter, searchKeyword],
  )

  const sortTasksForQuadrant = (tasks: Task[]): Task[] => {
    return [...tasks].sort((a, b) => {
      const scoreA = computeTaskPriorityScore(a)
      const scoreB = computeTaskPriorityScore(b)
      if (scoreA !== scoreB) return scoreB - scoreA

      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY
      if (aDeadline !== bDeadline) return aDeadline - bDeadline
      const aUpdated = a.updated_at ? new Date(a.updated_at).getTime() : 0
      const bUpdated = b.updated_at ? new Date(b.updated_at).getTime() : 0
      if (aUpdated !== bUpdated) return aUpdated - bUpdated
      return a.id - b.id
    })
  }

  const workflowProgressOverrideMap = useMemo(() => {
    const map = new Map<number, WorkflowProgressOverride>()
    for (const workflow of pipelineWorkflowsData?.active_workflows ?? []) {
      const parsed = parseWorkflowProgress(workflow.progress)
      if (parsed) {
        map.set(workflow.id, parsed)
      }
    }
    return map
  }, [pipelineWorkflowsData])

  const quadrantBuckets = useMemo(() => {
    const next = {} as Record<QuadrantKey, QuadrantBoardBucket>
    for (const quadrant of QUADRANTS) {
      const allTasks = sortTasksForQuadrant(applyTaskFilters(board?.[quadrant.key] || []))
      const { standalone, workflows } = groupTasksByWorkflow(allTasks, workflowProgressOverrideMap)
      next[quadrant.key] = { allTasks, standalone, workflows }
    }
    return next
  }, [applyTaskFilters, board, workflowProgressOverrideMap])

  const workflowGroupMap = useMemo(() => {
    const map = new Map<number, WorkflowGroup>()
    for (const quadrant of QUADRANTS) {
      const groups = quadrantBuckets[quadrant.key]?.workflows ?? []
      for (const group of groups) {
        const previous = map.get(group.workflowInstanceId)
        if (!previous) {
          map.set(group.workflowInstanceId, group)
          continue
        }
        const prevOrder = previous.currentStep?.workflow_step_order ?? Number.POSITIVE_INFINITY
        const nextOrder = group.currentStep?.workflow_step_order ?? Number.POSITIVE_INFINITY
        if (nextOrder < prevOrder) {
          map.set(group.workflowInstanceId, group)
        }
      }
    }
    return map
  }, [quadrantBuckets])

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TaskCreate> }) => updateTask(id, data),
    onSuccess: () => {
      invalidateTaskRelated(queryClient)
      setEditingTask(null)
      setBoardPanelTask(null)
      setBoardPanelMode('detail')
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

  const undoCompleteMutation = useMutation({
    mutationFn: (taskId: number) => undoCompleteTask(taskId),
    onSuccess: () => {
      invalidateTaskRelated(queryClient)
      addToast('success', '완료 상태를 되돌렸습니다.')
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
      setBoardPanelTask(null)
      setBoardPanelMode('detail')
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
        quadrantBuckets[quadrant.key]?.allTasks ?? [],
      ),
    [quadrantBuckets],
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

  const boardTaskLookup = useMemo(() => {
    const map = new Map<number, Task>()
    for (const quadrant of QUADRANTS) {
      for (const task of board?.[quadrant.key] || []) {
        map.set(task.id, task)
      }
    }
    return map
  }, [board])

  const workflowPanelGroup = useMemo(() => {
    if (workflowPanelInstanceId == null) return null
    return workflowGroupMap.get(workflowPanelInstanceId) ?? null
  }, [workflowGroupMap, workflowPanelInstanceId])

  const { data: workflowPanelInstance } = useQuery<WorkflowInstance>({
    queryKey: ['workflow-instance', workflowPanelInstanceId],
    queryFn: () => fetchWorkflowInstance(workflowPanelInstanceId as number),
    enabled: boardView === 'board' && workflowPanelInstanceId != null,
    staleTime: 10_000,
  })

  useEffect(() => {
    if (workflowPanelInstanceId != null && !workflowGroupMap.has(workflowPanelInstanceId)) {
      setWorkflowPanelInstanceId(null)
    }
  }, [workflowGroupMap, workflowPanelInstanceId])

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
  const urgentCount = useMemo(() => urgentTasks.length, [urgentTasks])
  const todayCompletedTasks = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const nextDay = new Date(today)
    nextDay.setDate(nextDay.getDate() + 1)
    return applyCompletedTaskFilters(
      completedTasks.filter((task) => {
        if (task.status !== 'completed' || !task.completed_at) return false
        const completedAt = new Date(task.completed_at).getTime()
        if (Number.isNaN(completedAt)) return false
        return completedAt >= today.getTime() && completedAt < nextDay.getTime()
      }),
    )
  }, [applyCompletedTaskFilters, completedTasks])
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
    if (boardView !== 'board') {
      prevOverdueCountRef.current = overdueCount
      prevUrgentCountRef.current = urgentCount
      setAlertPopup((prev) => (prev.open ? { ...prev, open: false } : prev))
      if (alertPopupTimerRef.current != null) {
        window.clearTimeout(alertPopupTimerRef.current)
        alertPopupTimerRef.current = null
      }
      return
    }

    const overdueIncreased = overdueCount > prevOverdueCountRef.current
    const urgentIncreased = urgentCount > prevUrgentCountRef.current

    if (overdueIncreased || urgentIncreased) {
      setAlertPopup({
        open: true,
        focus: overdueIncreased ? 'overdue' : 'urgent',
      })
      if (alertPopupTimerRef.current != null) {
        window.clearTimeout(alertPopupTimerRef.current)
      }
      alertPopupTimerRef.current = window.setTimeout(() => {
        setAlertPopup((prev) => (prev.open ? { ...prev, open: false } : prev))
        alertPopupTimerRef.current = null
      }, 4500)
    }

    prevOverdueCountRef.current = overdueCount
    prevUrgentCountRef.current = urgentCount
  }, [boardView, overdueCount, urgentCount])

  useEffect(() => {
    return () => {
      if (alertPopupTimerRef.current != null) {
        window.clearTimeout(alertPopupTimerRef.current)
      }
    }
  }, [])
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

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((prev) => {
      const next = !prev
      if (!next) {
        setSelectedTaskIds(new Set())
      }
      return next
    })
  }, [])

  const handleAllConfirm = useCallback(() => {
    setSearchKeyword('')
    setQuickDueFilter('all')
    setFundFilter('')
    setCategoryFilter('')
    setBoardView('board')
  }, [])

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

  const handleThisWeekConfirm = useCallback(() => {
    setFundFilter('')
    setCategoryFilter('')
    setSearchKeyword('')
    setQuickDueFilter('this_week')
    setBoardView('board')
  }, [])

  const openWorkflowSidePanel = useCallback((workflowInstanceId: number) => {
    setBoardPanelTask(null)
    setBoardPanelMode('detail')
    setWorkflowPanelInstanceId(workflowInstanceId)
  }, [])

  const openBoardSidePanel = useCallback((task: Task, mode: 'detail' | 'edit' = 'detail') => {
    setWorkflowPanelInstanceId(null)
    setBoardPanelTask(task)
    setBoardPanelMode(mode)
  }, [])

  const closeWorkflowSidePanel = useCallback(() => {
    setWorkflowPanelInstanceId(null)
  }, [])

  const closeAlertPopup = useCallback(() => {
    setAlertPopup((prev) => (prev.open ? { ...prev, open: false } : prev))
    if (alertPopupTimerRef.current != null) {
      window.clearTimeout(alertPopupTimerRef.current)
      alertPopupTimerRef.current = null
    }
  }, [])

  const renderQuadrantPanel = (quadrantKey: QuadrantKey, mini = false) => {
    const quadrant = QUADRANTS.find((row) => row.key === quadrantKey)
    if (!quadrant) return null

    const bucket = quadrantBuckets[quadrantKey] || { allTasks: [], standalone: [], workflows: [] }
    const allTasks = bucket.allTasks
    const standalone = bucket.standalone
    const workflows = bucket.workflows

    return (
      <div
        key={quadrant.key}
        onDragOver={(event) => {
          event.preventDefault()
          setDragOverQuadrant(quadrant.key)
        }}
        onDragLeave={() => setDragOverQuadrant((prev) => (prev === quadrant.key ? null : prev))}
        onDrop={(event) => {
          event.preventDefault()
          setDragOverQuadrant(null)
          const taskId = Number(event.dataTransfer.getData('taskId'))
          const fromQuadrant = event.dataTransfer.getData('fromQuadrant')
          if (!taskId || !fromQuadrant || fromQuadrant === quadrant.key) return
          moveMutation.mutate({ id: taskId, quadrant: quadrant.key })
        }}
        className={`flex h-full min-h-0 flex-col rounded-xl border border-[#d8e5fb] border-l-4 bg-white ${mini ? 'p-2' : 'p-2.5'} shadow-sm ${quadrant.color} ${
          dragOverQuadrant === quadrant.key ? 'border-dashed ring-2 ring-[#558ef8] bg-[#f5f9ff]/30' : ''
        }`}
      >
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${quadrant.badge}`} />
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">{quadrant.label}</h3>
          <span className="ml-auto text-xs text-[#94a3b8]">{allTasks.length}</span>
        </div>

        <div className={`pr-1 min-h-0 flex-1 overflow-y-auto ${mini ? '' : 'pt-2'}`}>
          {mini ? (
            <div className="space-y-1.5">
              {standalone.map((task) => {
                const urgency = taskUrgencyMeta(task)
                return (
                  <button
                    key={task.id}
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('taskId', String(task.id))
                      event.dataTransfer.setData('fromQuadrant', task.quadrant)
                    }}
                    onClick={() => openBoardSidePanel(task, 'detail')}
                    className={`w-full cursor-grab rounded-md border px-2 py-1.5 text-left transition-colors hover:bg-[#f5f9ff] active:cursor-grabbing ${blinkingId === task.id ? 'border-[#558ef8] ring-2 ring-[#558ef8]/35' : 'border-[#d8e5fb]'}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${urgency.topBarClass}`} />
                      <p className="truncate text-[11px] font-semibold text-[#0f1f3d]">{task.title}</p>
                    </div>
                    <p className="mt-0.5 text-[10px] text-[#64748b]">
                      {task.deadline ? new Date(task.deadline).toLocaleDateString('ko-KR') : '마감일 없음'}
                      {task.estimated_time ? ` · ${task.estimated_time}` : ''}
                    </p>
                  </button>
                )
              })}

              {workflows.map((group) => (
                <button
                  key={group.workflowInstanceId}
                  type="button"
                  draggable={Boolean(group.currentStep)}
                  onDragStart={(event) => {
                    const currentStep = group.currentStep
                    if (!currentStep) {
                      event.preventDefault()
                      return
                    }
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('taskId', String(currentStep.id))
                    event.dataTransfer.setData('fromQuadrant', currentStep.quadrant)
                  }}
                  onClick={() => openWorkflowSidePanel(group.workflowInstanceId)}
                  className={`w-full rounded-md border border-[#c5d8fb] bg-[#f5f9ff] px-2 py-1.5 text-left transition-colors hover:bg-white ${
                    group.currentStep ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] font-semibold text-[#1a3660]">
                      {group.currentStep?.title || '워크플로 단계'}
                    </p>
                    <span className="tag tag-blue">{group.progress}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-[#64748b]">
                    {group.nextStep ? `다음: ${group.nextStep.title}` : '다음 단계 없음'}
                  </p>
                </button>
              ))}

              {allTasks.length === 0 && (
                <div className="rounded-lg border border-dashed border-[#d8e5fb]">
                  <EmptyState message="등록된 업무가 없습니다." className="py-4" />
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {standalone.map((task) => (
                <div key={task.id} className="col-span-1">
                  <TaskItem
                    task={task}
                    onComplete={setCompletingTask}
                    onOpenDetail={(selectedTask) => openBoardSidePanel(selectedTask, 'detail')}
                    onEdit={(selectedTask) => openBoardSidePanel(selectedTask, 'edit')}
                    onDelete={handleDeleteTask}
                    selected={selectedTaskIds.has(task.id)}
                    selectionMode={selectionMode}
                    onToggleSelect={toggleTaskSelection}
                    isBlinking={blinkingId === task.id}
                  />
                </div>
              ))}

              {workflows.map((group) => (
                <div key={group.workflowInstanceId} className="col-span-1">
                  <WorkflowCompactCard
                    group={group}
                    onOpenWorkflow={openWorkflowSidePanel}
                  />
                </div>
              ))}

              {allTasks.length === 0 && (
                <div className="col-span-2 rounded-lg border border-dashed border-[#d8e5fb]">
                  <EmptyState message="등록된 업무가 없습니다." className="py-6" />
                </div>
              )}
            </div>
          )}
        </div>

        <div className={`mt-1.5 ${mini ? 'flex justify-end' : ''}`}>
          <AddTaskForm quadrant={quadrant.key} categoryOptions={categoryNames} compact={mini} />
        </div>
      </div>
    )
  }

  if (isLoading) return <PageLoading />

  return (
    <div className="page-container">
      <div className="page-header mb-2 items-center !px-4 !py-3">
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
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={toggleSelectionMode}
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] ${
              selectionMode
                ? 'border-[#c5d8fb] bg-[#f5f9ff] text-[#1a3660]'
                : 'border-[#d8e5fb] bg-white text-[#0f1f3d] hover:bg-[#f5f9ff]'
            }`}
          >
            {selectionMode ? '선택 모드 ON' : '선택 모드'}
          </button>
          <button
            onClick={() => setShowCategoryManager(true)}
            className="inline-flex items-center gap-1 rounded border border-[#d8e5fb] bg-white px-2 py-1 text-[11px] text-[#0f1f3d] hover:bg-[#f5f9ff]"
          >
            <Tag size={12} />
            카테고리 관리
          </button>
        </div>
      </div>

      <TaskTopControlStrip
        boardView={boardView}
        onChangeBoardView={setBoardView}
        summary={board?.summary}
        onClickAll={handleAllConfirm}
        onClickOverdue={handleOverdueConfirm}
        onClickToday={handleUrgentConfirm}
        onClickThisWeek={handleThisWeekConfirm}
      />

      {boardView === 'board' && (
        <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-[#64748b]">
          <span className="font-semibold text-[#1a3660]">우선순위</span>
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md border border-[#d6c3c5] bg-[#f1e8e9] px-1 text-[10px] font-semibold text-[#73585c]">A</span>
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md border border-[#e2d8bc] bg-[#fff7d6] px-1 text-[10px] font-semibold text-[#8a6f2e]">B</span>
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md border border-[#c8daf8] bg-[#f5f9ff] px-1 text-[10px] font-semibold text-[#1a3660]">C</span>
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md border border-[#d8e5fb] bg-white px-1 text-[10px] font-semibold text-[#64748b]">D</span>
          <span className="text-[#94a3b8]">기한·방치·컴플·워크플로·통지 기준</span>
        </div>
      )}

      <div
        className={
          boardView === 'board'
            ? 'mt-2 space-y-2 lg:space-y-2.5'
            : 'mt-2 space-y-4'
        }
      >
      {boardView === 'board' && (
        <TaskAlertPopup
          open={alertPopup.open}
          focus={alertPopup.focus}
          overdueCount={overdueCount}
          urgentCount={urgentCount}
          onClose={closeAlertPopup}
          onClickOverdue={() => {
            closeAlertPopup()
            handleOverdueConfirm()
          }}
          onClickUrgent={() => {
            closeAlertPopup()
            handleUrgentConfirm()
          }}
        />
      )}

      {boardView === 'board' && selectedVisibleTasks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#d8e5fb] bg-white px-2.5 py-1.5 shadow-sm">
          <span className="text-xs font-semibold text-[#0f1f3d]">{selectedVisibleTasks.length}개 선택됨</span>
          <button
            onClick={handleBulkComplete}
            disabled={bulkCompleteMutation.isPending || completeMutation.isPending}
            className="primary-btn btn-xs disabled:opacity-60"
          >
            일괄 완료
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleteMutation.isPending}
            className="danger-btn btn-xs disabled:opacity-60"
          >
            일괄 삭제
          </button>
          <button
            onClick={clearSelectedTasks}
            className="secondary-btn btn-xs"
          >
            선택 해제
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
        <>
          <div className="w-full">
          <div className="grid h-[calc(100dvh-220px)] min-h-[520px] grid-cols-1 gap-2.5 lg:grid-cols-[1.25fr_1fr]">
            {renderQuadrantPanel('Q1')}
            <div className="grid h-full min-h-0 grid-cols-1 gap-2.5 lg:grid-rows-[2fr_1fr]">
              {renderQuadrantPanel('Q2')}
              <div className="grid h-full min-h-0 grid-cols-1 gap-2.5 sm:grid-cols-2">
                {renderQuadrantPanel('Q3', true)}
                {renderQuadrantPanel('Q4', true)}
              </div>
            </div>
          </div>
        </div>
        <CompletedTasksSection
          tasks={todayCompletedTasks}
          open={completedSectionOpen}
          onToggle={() => setCompletedSectionOpen((prev) => !prev)}
          onUndo={(taskId) => undoCompleteMutation.mutate(taskId)}
          undoPending={undoCompleteMutation.isPending}
        />
        </>
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

      {boardView === 'board' && workflowPanelGroup && (
        <WorkflowSidePanel
          group={workflowPanelGroup}
          workflowInstance={
            workflowPanelInstance?.id === workflowPanelGroup.workflowInstanceId
              ? workflowPanelInstance
              : null
          }
          timelineTaskLookup={boardTaskLookup}
          onClose={closeWorkflowSidePanel}
          onOpenTaskDetail={(task) => openBoardSidePanel(task, 'detail')}
          onOpenTaskEdit={(task) => openBoardSidePanel(task, 'edit')}
          onCompleteTask={setCompletingTask}
          onOpenWorkflowPage={(workflowInstanceId) => {
            navigate('/workflows', { state: { expandInstanceId: workflowInstanceId } })
          }}
        />
      )}

      {boardView === 'board' && boardPanelTask && (
        <TaskSidePanel
          task={boardPanelTask}
          mode={boardPanelMode}
          onModeChange={setBoardPanelMode}
          onClose={() => {
            setBoardPanelTask(null)
            setBoardPanelMode('detail')
          }}
          onSave={(id, data) => updateMutation.mutate({ id, data })}
          onComplete={(task) => setCompletingTask(task)}
          onDelete={handleDeleteTask}
          fundsForFilter={fundsForFilter}
          gpEntities={gpEntities}
          categoryOptions={categoryNames}
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


