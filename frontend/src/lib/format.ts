export type DateStyle = 'short' | 'medium' | 'long' | 'relative'

function toDate(input: string | Date | null | undefined): Date | null {
  if (!input) return null
  const value = input instanceof Date ? input : new Date(input)
  return Number.isNaN(value.getTime()) ? null : value
}

export function formatDate(
  input: string | Date | null | undefined,
  style: DateStyle = 'medium',
): string {
  const date = toDate(input)
  if (!date) return '-'

  if (style === 'relative') {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const mins = Math.floor(diff / 60_000)
    const hours = Math.floor(diff / 3_600_000)
    const days = Math.floor(diff / 86_400_000)

    if (mins < 1) return '방금 전'
    if (mins < 60) return `${mins}분 전`
    if (hours < 24) return `${hours}시간 전`
    if (days === 1) return '어제'
    if (days < 7) return `${days}일 전`
    return formatDate(date, 'medium')
  }

  if (style === 'short') {
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  if (style === 'long') {
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return date
    .toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    .replace(/\. /g, '.')
    .replace(/\.$/, '')
}

export function formatKRW(amount: number | null | undefined, unit: 'won' | 'man' | 'eok' = 'won'): string {
  const value = Number(amount ?? 0)
  if (!Number.isFinite(value)) return '₩0'

  if (unit === 'eok') {
    const eok = value / 100_000_000
    return `${eok.toFixed(eok >= 10 ? 0 : 1)}억`
  }

  if (unit === 'man') {
    const man = value / 10_000
    return `${Math.round(man).toLocaleString('ko-KR')}만`
  }

  return `₩${Math.round(value).toLocaleString('ko-KR')}`
}

export function calcDday(deadline: string | Date): { text: string; urgency: 'warning' | 'danger' | 'info' | 'overdue' } {
  const target = toDate(deadline)
  if (!target) return { text: '-', urgency: 'info' }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  const diff = Math.floor((target.getTime() - today.getTime()) / 86_400_000)

  if (diff < 0) return { text: `D+${Math.abs(diff)}`, urgency: 'overdue' }
  if (diff === 0) return { text: 'D-day', urgency: 'danger' }
  if (diff <= 3) return { text: `D-${diff}`, urgency: 'danger' }
  if (diff <= 7) return { text: `D-${diff}`, urgency: 'warning' }
  return { text: `D-${diff}`, urgency: 'info' }
}

export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.floor(minutes || 0))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
