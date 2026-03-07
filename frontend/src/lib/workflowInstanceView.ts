import type { WorkflowInstance, WorkflowStepInstance } from './api'

export type InstanceDueTone = 'overdue' | 'today' | 'this_week' | 'later' | 'none'
export type WorkflowPrimaryBucket = 'not_started' | 'in_progress' | 'overdue'
export type WorkflowCompletionBucket = 'completed' | 'cancelled'

export interface WorkflowDueMeta {
  tone: InstanceDueTone
  diffDays: number | null
  dueTime: number
}

export interface WorkflowInstanceViewModel {
  inst: WorkflowInstance
  orderedSteps: WorkflowStepInstance[]
  currentStep: WorkflowStepInstance | null
  upcomingSteps: WorkflowStepInstance[]
  completedSteps: WorkflowStepInstance[]
  completedStepCount: number
  skippedStepCount: number
  totalStepCount: number
  remainingStepCount: number
  progressPercent: number
  dueMeta: WorkflowDueMeta
  primaryBucket: WorkflowPrimaryBucket | null
  completionBucket: WorkflowCompletionBucket | null
  isNotStarted: boolean
  isInProgress: boolean
  isOverdue: boolean
  isCompleted: boolean
  isCancelled: boolean
  displayConnection: string
  lastCompletedStep: WorkflowStepInstance | null
  completedAtMs: number
  createdAtMs: number
}

function parseProgress(progress: string): { percent: number; current: number; total: number } {
  const match = progress.match(/(\d+)\s*\/\s*(\d+)/)
  if (!match) return { percent: 0, current: 0, total: 0 }
  const current = Number.parseInt(match[1], 10)
  const total = Number.parseInt(match[2], 10)
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) {
    return { percent: 0, current: 0, total: 0 }
  }
  return {
    percent: Math.max(0, Math.min(100, Math.round((current / total) * 100))),
    current,
    total,
  }
}

function parseIsoAsLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const normalized = value.includes('T') ? value : `${value}T00:00:00`
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function isSameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  )
}

function isClosedStep(step: WorkflowStepInstance): boolean {
  return step.status === 'completed' || step.status === 'skipped'
}

function orderedSteps(instance: WorkflowInstance): WorkflowStepInstance[] {
  return [...(instance.step_instances ?? [])]
}

export function resolveWorkflowDueTone(
  nextStepDate: string | null | undefined,
  now = new Date(),
): WorkflowDueMeta {
  const parsedDate = parseIsoAsLocalDate(nextStepDate)
  if (!parsedDate) {
    return { tone: 'none', diffDays: null, dueTime: Number.MAX_SAFE_INTEGER }
  }

  const dueTime = parsedDate.getTime()
  const dayMs = 24 * 60 * 60 * 1000
  const diffDays = Math.floor(
    (startOfLocalDay(parsedDate).getTime() - startOfLocalDay(now).getTime()) / dayMs,
  )

  if (isSameLocalDate(parsedDate, now)) {
    return { tone: 'today', diffDays: 0, dueTime }
  }

  if (dueTime < now.getTime()) {
    return { tone: 'overdue', diffDays, dueTime }
  }

  if (diffDays >= 1 && diffDays <= 7) {
    return { tone: 'this_week', diffDays, dueTime }
  }

  return { tone: 'later', diffDays, dueTime }
}

export function workflowPrimaryBucketRank(bucket: WorkflowPrimaryBucket | null): number {
  switch (bucket) {
    case 'overdue':
      return 0
    case 'in_progress':
      return 1
    case 'not_started':
      return 2
    default:
      return 3
  }
}

export function buildWorkflowInstanceView(
  inst: WorkflowInstance,
  now = new Date(),
): WorkflowInstanceViewModel {
  const steps = orderedSteps(inst)
  const currentStep = steps.find((step) => !isClosedStep(step)) ?? null
  const upcomingSteps = currentStep
    ? steps.filter((step) => !isClosedStep(step) && step.id !== currentStep.id)
    : []
  const completedSteps = steps.filter((step) => isClosedStep(step))
  const completedStepCount = steps.filter((step) => step.status === 'completed').length
  const skippedStepCount = steps.filter((step) => step.status === 'skipped').length
  const totalStepCount = steps.length
  const remainingStepCount = steps.filter((step) => !isClosedStep(step)).length
  const progressFromString = parseProgress(inst.progress || '')
  const progressPercent =
    progressFromString.total > 0
      ? progressFromString.percent
      : totalStepCount > 0
        ? Math.round(((completedStepCount + skippedStepCount) / totalStepCount) * 100)
        : 0
  const dueMeta = resolveWorkflowDueTone(currentStep?.calculated_date, now)
  const isCompleted = inst.status === 'completed'
  const isCancelled = inst.status === 'cancelled'
  const isNotStarted = inst.status === 'active' && completedStepCount + skippedStepCount === 0
  const isOverdue = inst.status === 'active' && dueMeta.tone === 'overdue'
  const isInProgress = inst.status === 'active' && !isNotStarted && !isOverdue
  const primaryBucket = isOverdue
    ? 'overdue'
    : isNotStarted
      ? 'not_started'
      : inst.status === 'active'
        ? 'in_progress'
        : null
  const completionBucket = isCompleted ? 'completed' : isCancelled ? 'cancelled' : null
  const uniqueConnections = [
    inst.fund_name,
    inst.company_name,
    inst.gp_entity_name,
    inst.investment_name,
  ].filter((value, index, rows): value is string => Boolean(value) && rows.indexOf(value) === index)

  const lastCompletedStep =
    [...completedSteps]
      .sort((a, b) => {
        const aTime = parseIsoAsLocalDate(a.completed_at)?.getTime() ?? 0
        const bTime = parseIsoAsLocalDate(b.completed_at)?.getTime() ?? 0
        if (aTime !== bTime) return bTime - aTime
        return b.id - a.id
      })[0] ?? null

  return {
    inst,
    orderedSteps: steps,
    currentStep,
    upcomingSteps,
    completedSteps,
    completedStepCount,
    skippedStepCount,
    totalStepCount,
    remainingStepCount,
    progressPercent,
    dueMeta,
    primaryBucket,
    completionBucket,
    isNotStarted,
    isInProgress,
    isOverdue,
    isCompleted,
    isCancelled,
    displayConnection: uniqueConnections.join(' / ') || '-',
    lastCompletedStep,
    completedAtMs: parseIsoAsLocalDate(inst.completed_at)?.getTime() ?? 0,
    createdAtMs: parseIsoAsLocalDate(inst.created_at)?.getTime() ?? 0,
  }
}

export function isWithinRecentDays(
  value: string | null | undefined,
  days: number,
  now: Date,
): boolean {
  const parsed = parseIsoAsLocalDate(value)
  if (!parsed) return false
  const diff = now.getTime() - parsed.getTime()
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000
}

