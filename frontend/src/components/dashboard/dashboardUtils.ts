import type { ActiveWorkflow, DashboardPrioritizedTask, Task } from '../../lib/api'

export const TASK_CATEGORY_OPTIONS = ['투자실행', 'LP보고', '사후관리', '규약/총회', '서류관리', '일반']

const URGENCY_RANK: Record<DashboardPrioritizedTask['urgency'], number> = {
  overdue: 0,
  today: 1,
  tomorrow: 2,
  this_week: 3,
  upcoming: 4,
}

export interface TaskGroup {
  groupKey: string
  groupLabel: string
  groupType: 'category' | 'workflow' | 'individual'
  tasks: DashboardPrioritizedTask[]
  fundNames: string[]
  urgencyMax: DashboardPrioritizedTask['urgency']
  dDayMin: number | null
}

export function higherUrgency(
  current: DashboardPrioritizedTask['urgency'],
  next: DashboardPrioritizedTask['urgency'],
): DashboardPrioritizedTask['urgency'] {
  return URGENCY_RANK[next] < URGENCY_RANK[current] ? next : current
}

export function compareByUrgency(a: TaskGroup, b: TaskGroup): number {
  const urgencyGap = URGENCY_RANK[a.urgencyMax] - URGENCY_RANK[b.urgencyMax]
  if (urgencyGap !== 0) return urgencyGap

  const dDayA = a.dDayMin == null ? Number.POSITIVE_INFINITY : a.dDayMin
  const dDayB = b.dDayMin == null ? Number.POSITIVE_INFINITY : b.dDayMin
  if (dDayA !== dDayB) return dDayA - dDayB

  if (a.tasks.length !== b.tasks.length) return b.tasks.length - a.tasks.length
  return a.groupLabel.localeCompare(b.groupLabel, 'ko')
}

export function groupPrioritizedTasks(tasks: DashboardPrioritizedTask[]): TaskGroup[] {
  const groups = new Map<string, TaskGroup>()

  for (const item of tasks) {
    const task = item.task
    let groupKey = `ind_${task.id}`
    let groupLabel = task.title
    let groupType: TaskGroup['groupType'] = 'individual'

    if (task.category && task.category !== '일반') {
      groupKey = `cat_${task.category}`
      groupLabel = task.category
      groupType = 'category'
    } else if (item.workflow_info?.name) {
      groupKey = `wf_${item.workflow_info.name}`
      groupLabel = item.workflow_info.name
      groupType = 'workflow'
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        groupKey,
        groupLabel,
        groupType,
        tasks: [],
        fundNames: [],
        urgencyMax: item.urgency,
        dDayMin: item.d_day,
      })
    }

    const group = groups.get(groupKey)!
    group.tasks.push(item)

    const fundName = task.fund_name || task.gp_entity_name
    if (fundName && !group.fundNames.includes(fundName)) {
      group.fundNames.push(fundName)
    }

    group.urgencyMax = higherUrgency(group.urgencyMax, item.urgency)
    if (item.d_day != null && (group.dDayMin == null || item.d_day < group.dDayMin)) {
      group.dDayMin = item.d_day
    }
  }

  return Array.from(groups.values()).sort(compareByUrgency)
}

export interface WorkflowGroup {
  groupKey: string
  groupLabel: string
  workflows: ActiveWorkflow[]
  fundNames: string[]
}

function normalizeWorkflowTemplateName(workflow: ActiveWorkflow): string {
  const sourceName = (workflow.name || '').trim()
  if (!sourceName) return '워크플로'

  const prefixes = [workflow.fund_name, workflow.company_name, workflow.gp_entity_name]
    .filter((value): value is string => Boolean(value && value.trim()))
    .sort((a, b) => b.length - a.length)

  let normalized = sourceName
  for (const prefix of prefixes) {
    if (!normalized.startsWith(prefix)) continue
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    normalized = normalized.replace(
      new RegExp(`^${escapedPrefix}(?:\\s*[-|·/:]\\s*|\\s+)`),
      '',
    )
    break
  }

  normalized = normalized.trim()
  if (normalized) return normalized

  const tokens = sourceName.split(/\s+/).filter(Boolean)
  if (tokens.length >= 2) return tokens.slice(1).join(' ')
  return sourceName
}

export function groupWorkflows(workflows: ActiveWorkflow[]): WorkflowGroup[] {
  const groups = new Map<string, WorkflowGroup>()

  for (const workflow of workflows) {
    const groupLabel = normalizeWorkflowTemplateName(workflow)
    const groupKey = `wf_${groupLabel.toLowerCase()}`

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        groupKey,
        groupLabel,
        workflows: [],
        fundNames: [],
      })
    }

    const group = groups.get(groupKey)!
    group.workflows.push(workflow)
    const fundName = workflow.fund_name || workflow.gp_entity_name
    if (fundName && !group.fundNames.includes(fundName)) {
      group.fundNames.push(fundName)
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.workflows.length !== b.workflows.length) return b.workflows.length - a.workflows.length
    return a.groupLabel.localeCompare(b.groupLabel, 'ko')
  })
}

export type PopupSection = 'today' | 'tomorrow' | 'this_week' | 'workflows' | 'documents' | 'reports' | 'completed'

export function formatShortDate(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

export function safeFormatDate(value: string | null | undefined): string {
  if (!value) return '날짜 미지정'
  const date = new Date(`${value}T00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })
}

export function dueBadge(daysRemaining: number | null): { text: string; className: string } | null {
  if (daysRemaining == null) return null
  if (daysRemaining < 0) return { text: `지연 D+${Math.abs(daysRemaining)}`, className: 'tag tag-red' }
  if (daysRemaining <= 3) return { text: `D-${daysRemaining}`, className: 'tag tag-red' }
  if (daysRemaining <= 7) return { text: `D-${daysRemaining}`, className: 'tag tag-amber' }
  return { text: `D-${daysRemaining}`, className: 'tag tag-gray' }
}

export function categoryBadgeClass(category: string): string {
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

export function parseWorkflowProgress(progress: string): { current: number; total: number; percent: number } {
  const match = progress.match(/(\d+)\/(\d+)/)
  if (!match) return { current: 0, total: 1, percent: 0 }
  const current = Number.parseInt(match[1], 10)
  const total = Number.parseInt(match[2], 10)
  const percent = total > 0 ? Math.round((current / total) * 100) : 0
  return { current, total, percent }
}

export function groupByCategory(tasks: Task[]): Map<string, Task[]> {
  const groups = new Map<string, Task[]>()
  for (const task of tasks) {
    const key = task.category || task.fund_name || '일반'
    const existing = groups.get(key) || []
    existing.push(task)
    groups.set(key, existing)
  }
  return groups
}

export function groupTasksByDeadline(tasks: Task[]): Array<[string, Task[]]> {
  const grouped = new Map<string, Task[]>()
  for (const task of tasks) {
    const key = task.deadline || '기한 미지정'
    const list = grouped.get(key) || []
    list.push(task)
    grouped.set(key, list)
  }

  return Array.from(grouped.entries()).sort(([a], [b]) => {
    if (a === '기한 미지정') return 1
    if (b === '기한 미지정') return -1
    return a.localeCompare(b)
  })
}

export function addDays(baseDate: string, days: number): string {
  const value = new Date(`${baseDate}T00:00:00`)
  value.setDate(value.getDate() + days)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function weekRangeLabelMondayToSunday(baseDate: string): string {
  const base = new Date(`${baseDate}T00:00:00`)
  const day = base.getDay()
  const diffToMonday = day === 0 ? 6 : day - 1
  const monday = new Date(base)
  monday.setDate(base.getDate() - diffToMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = (target: Date) => `${target.getMonth() + 1}/${target.getDate()}`
  return `${fmt(monday)}~${fmt(sunday)}`
}

export function workflowStepBadgeClass(status: string): string {
  switch (status) {
    case 'completed':
      return 'tag tag-emerald'
    case 'in_progress':
      return 'tag tag-blue'
    case 'skipped':
      return 'tag tag-amber'
    case 'pending':
    default:
      return 'tag tag-gray'
  }
}
