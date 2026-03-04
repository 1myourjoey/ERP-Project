import type { ActiveWorkflow, Task } from '../../lib/api'

export type FlowStageKey = 'waiting' | 'overdue' | 'today' | 'thisWeek' | 'upcoming'
export type FlowSeverity = 'idle' | 'normal' | 'warning' | 'danger'

export interface FlowRepresentativeItem {
  id: string
  type: 'task' | 'workflow'
  title: string
  subtext: string
}

export interface FlowStageSummary {
  key: FlowStageKey
  label: string
  totalCount: number
  taskCount: number
  workflowCount: number
  severity: FlowSeverity
  representatives: FlowRepresentativeItem[]
}

interface BuildFlowStageSummaryParams {
  todayTasks: Task[]
  tomorrowTasks: Task[]
  thisWeekTasks: Task[]
  upcomingTasks: Task[]
  noDeadlineTasks: Task[]
  activeWorkflows: ActiveWorkflow[]
  representativeLimit: number
}

const STAGE_ORDER: FlowStageKey[] = ['waiting', 'overdue', 'today', 'thisWeek', 'upcoming']

const STAGE_LABEL: Record<FlowStageKey, string> = {
  waiting: '대기',
  overdue: '지연',
  today: '오늘',
  thisWeek: '이번주',
  upcoming: '예정',
}

function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null
  if (value.includes('T')) return value.slice(0, 10)
  if (value.length >= 10) return value.slice(0, 10)
  return null
}

function localTodayIso(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function sundayIso(baseIso: string): string {
  const base = new Date(`${baseIso}T00:00:00`)
  const day = base.getDay()
  const diffToSunday = day === 0 ? 0 : 7 - day
  const sunday = new Date(base)
  sunday.setDate(base.getDate() + diffToSunday)
  return sunday.toISOString().slice(0, 10)
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

function resolveTaskStage(task: Task, todayIso: string, weekEndIso: string): FlowStageKey {
  const deadline = toDateOnly(task.deadline)
  if (!deadline) return 'waiting'
  if (deadline < todayIso) return 'overdue'
  if (deadline === todayIso) return 'today'
  if (deadline <= weekEndIso) return 'thisWeek'
  return 'upcoming'
}

function resolveWorkflowStage(workflow: ActiveWorkflow, todayIso: string, weekEndIso: string): FlowStageKey {
  const nextDate = toDateOnly(workflow.next_step_date)
  if (!nextDate) return 'waiting'
  if (nextDate < todayIso) return 'overdue'
  if (nextDate === todayIso) return 'today'
  if (nextDate <= weekEndIso) return 'thisWeek'
  return 'upcoming'
}

function stageSeverity(stage: FlowStageKey, totalCount: number): FlowSeverity {
  if (totalCount === 0) return 'idle'
  if (stage === 'overdue') return 'danger'
  if (stage === 'today' || stage === 'waiting') return 'warning'
  return 'normal'
}

export function buildFlowStageSummaries({
  todayTasks,
  tomorrowTasks,
  thisWeekTasks,
  upcomingTasks,
  noDeadlineTasks,
  activeWorkflows,
  representativeLimit,
}: BuildFlowStageSummaryParams): FlowStageSummary[] {
  const todayIso = localTodayIso()
  const weekEndIso = sundayIso(todayIso)
  const activeWorkflowIds = new Set(activeWorkflows.map((workflow) => workflow.id))

  const mergedTaskMap = new Map<number, Task>()
  for (const sourceTasks of [todayTasks, tomorrowTasks, thisWeekTasks, upcomingTasks, noDeadlineTasks]) {
    for (const task of sourceTasks) {
      if (task.status === 'completed') continue
      if (task.workflow_instance_id && activeWorkflowIds.has(task.workflow_instance_id)) continue
      mergedTaskMap.set(task.id, task)
    }
  }
  const filteredTasks = [...mergedTaskMap.values()]

  const byStage = new Map<FlowStageKey, { tasks: Task[]; workflows: ActiveWorkflow[] }>()
  for (const stage of STAGE_ORDER) {
    byStage.set(stage, { tasks: [], workflows: [] })
  }

  for (const task of filteredTasks) {
    const stage = resolveTaskStage(task, todayIso, weekEndIso)
    byStage.get(stage)!.tasks.push(task)
  }

  for (const workflow of activeWorkflows) {
    const stage = resolveWorkflowStage(workflow, todayIso, weekEndIso)
    byStage.get(stage)!.workflows.push(workflow)
  }

  return STAGE_ORDER.map((stage) => {
    const bucket = byStage.get(stage)!
    const sortedTasks = [...bucket.tasks].sort((a, b) => {
      const aDate = toDateOnly(a.deadline) || '9999-12-31'
      const bDate = toDateOnly(b.deadline) || '9999-12-31'
      if (aDate !== bDate) return aDate.localeCompare(bDate)
      return a.id - b.id
    })
    const sortedWorkflows = [...bucket.workflows].sort((a, b) => {
      const aDate = toDateOnly(a.next_step_date) || '9999-12-31'
      const bDate = toDateOnly(b.next_step_date) || '9999-12-31'
      if (aDate !== bDate) return aDate.localeCompare(bDate)
      return a.id - b.id
    })

    const representatives: FlowRepresentativeItem[] = [
      ...sortedWorkflows.map((workflow) => ({
        id: `wf-${workflow.id}`,
        type: 'workflow' as const,
        title: workflow.name,
        subtext: `${workflow.next_step || '다음 단계 확인'} · ${workflow.progress}`,
      })),
      ...sortedTasks.map((task) => ({
        id: `task-${task.id}`,
        type: 'task' as const,
        title: task.title,
        subtext: `${task.fund_name || task.gp_entity_name || '공통'} · ${
          task.deadline ? formatShortDate(task.deadline) : '기한 없음'
        }`,
      })),
    ].slice(0, representativeLimit)

    const taskCount = sortedTasks.length
    const workflowCount = sortedWorkflows.length
    const totalCount = taskCount + workflowCount

    return {
      key: stage,
      label: STAGE_LABEL[stage],
      totalCount,
      taskCount,
      workflowCount,
      severity: stageSeverity(stage, totalCount),
      representatives,
    }
  })
}

