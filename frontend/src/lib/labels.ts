export const STATUS_LABEL: Record<string, string> = {
  pending: '대기',
  in_progress: '진행중',
  completed: '완료',
  active: '운용중',
  closed: '청산',
  collected: '수집완료',
  archived: '보관',
  requested: '요청중',
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

  // Raw Korean status values from legacy DB rows
  '요청전': '요청전',
  '요청중': '요청중',
  '회신': '회신',
  '검토완료': '검토완료',
  '미작성': '미작성',
  '작성중': '작성중',
  '전송완료': '전송완료',
  '실패': '실패',
  '미결재': '미결재',
  '결재완료': '결재완료',
  '예정': '예정',
  '준비중': '준비중',
  '제출완료': '제출완료',
  '확인완료': '확인완료',
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
