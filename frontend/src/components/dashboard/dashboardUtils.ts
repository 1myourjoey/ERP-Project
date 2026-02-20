import type { Task } from '../../lib/api'

export const TASK_CATEGORY_OPTIONS = ['투자실행', 'LP보고', '사후관리', '규약/총회', '서류관리', '일반']

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
