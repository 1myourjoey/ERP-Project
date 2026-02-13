export const STATUS_LABEL: Record<string, string> = {
  pending: '대기',
  in_progress: '진행중',
  completed: '완료',
  active: '운용중',
  closed: '청산',
  collected: '수집완료',
  archived: '보관',
  requested: '요청',
  reviewing: '검토중',
  exited: '회수완료',
  written_off: '손실처리',
  cancelled: '취소',
  scheduled: '예정중',
  deliberating: '심의중',
  approved: '가결',
  rejected: '부결',
  planned: '예정',
  done: '완료',
  예정중: '예정중',
  심의중: '심의중',
  가결: '가결',
  부결: '부결',
  요청전: '요청전',
  요청중: '요청중',
  수신: '수신',
  검수완료: '검수완료',
}

export const labelStatus = (status?: string | null): string => {
  if (!status) return '-'
  return STATUS_LABEL[status] ?? status
}

export const formatKRW = (amount: number | null): string => {
  if (amount == null) return '-'
  if (amount >= 100_000_000) return `${(amount / 100_000_000).toFixed(1)}억`
  if (amount >= 10_000) return `${Math.round(amount / 10_000).toLocaleString()}만`
  return amount.toLocaleString()
}
