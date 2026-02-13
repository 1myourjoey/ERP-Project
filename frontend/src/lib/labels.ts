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
}

export const labelStatus = (status?: string | null): string => {
  if (!status) return '-'
  return STATUS_LABEL[status] ?? status
}
