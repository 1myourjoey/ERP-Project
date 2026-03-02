export const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS]

export const QUADRANT = {
  Q1: 'Q1',
  Q2: 'Q2',
  Q3: 'Q3',
  Q4: 'Q4',
} as const

export type Quadrant = (typeof QUADRANT)[keyof typeof QUADRANT]

export const WORKFLOW_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const

export const FUND_STATUS = {
  FORMING: 'forming',
  ACTIVE: 'active',
  WINDING_DOWN: 'winding_down',
  DISSOLVED: 'dissolved',
} as const

export const TASK_STATUS_LABEL: Record<string, string> = {
  pending: '대기',
  in_progress: '진행중',
  completed: '완료',
}

export const QUADRANT_LABEL: Record<string, string> = {
  Q1: '긴급&중요',
  Q2: '중요&비긴급',
  Q3: '긴급&비중요',
  Q4: '비긴급&비중요',
}

export const STATUS_COLORS = {
  success: { bg: 'tag-green', icon: 'check', label: '완료' },
  warning: { bg: 'tag-amber', icon: 'alert', label: '주의' },
  danger: { bg: 'tag-red', icon: 'x', label: '위험' },
  info: { bg: 'tag-blue', icon: 'info', label: '정보' },
  pending: { bg: 'tag-gray', icon: 'circle', label: '대기' },
  overdue: { bg: 'tag-red', icon: 'clock', label: '지연' },
} as const

export const STALE_TIMES = {
  DASHBOARD: 30 * 1000,
  LIST: 60 * 1000,
  DETAIL: 5 * 60 * 1000,
  STATIC: 30 * 60 * 1000,
} as const
