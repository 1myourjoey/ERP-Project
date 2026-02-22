export type TaskDeadlineTone = 'overdue' | 'today' | 'this_week' | 'later' | 'none'

const DAY_MS = 24 * 60 * 60 * 1000

export function parseDateLike(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  )
}

export function resolveDateTone(
  value: string | Date | null | undefined,
  now = new Date(),
): TaskDeadlineTone {
  const parsed = parseDateLike(value)
  if (!parsed) return 'none'

  const diffDays = Math.floor((startOfLocalDay(parsed).getTime() - startOfLocalDay(now).getTime()) / DAY_MS)
  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'today'
  if (diffDays <= 7) return 'this_week'
  return 'later'
}

export function resolveDeadlineTone(
  value: string | Date | null | undefined,
  now = new Date(),
): TaskDeadlineTone {
  const parsed = parseDateLike(value)
  if (!parsed) return 'none'
  if (parsed.getTime() < now.getTime()) return 'overdue'
  if (isSameLocalDay(parsed, now)) return 'today'
  return resolveDateTone(parsed, now)
}
