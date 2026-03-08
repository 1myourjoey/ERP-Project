import type {
  AnalyticsAggregate,
  AnalyticsFieldMeta,
  AnalyticsSubjectMeta,
} from '../api/analytics'

const AGGREGATE_LABELS: Record<AnalyticsAggregate, string> = {
  sum: '합계',
  avg: '평균',
  min: '최솟값',
  max: '최댓값',
  count: '건수',
  distinct_count: '고유 건수',
}

const OPERATOR_LABELS: Record<string, string> = {
  eq: '같음',
  neq: '다름',
  contains: '포함',
  starts_with: '시작값',
  in: '목록 포함',
  gt: '초과',
  gte: '이상',
  lt: '미만',
  lte: '이하',
  between: '범위',
  on: '날짜 일치',
  before: '이전',
  after: '이후',
  relative_range: '상대 기간',
  is_true: '참',
  is_false: '거짓',
  is_empty: '비어 있음',
  is_not_empty: '값 있음',
}

const GENERIC_VALUE_LABELS: Record<string, string> = {
  pending: '대기',
  in_progress: '진행 중',
  completed: '완료',
  cancelled: '취소',
  skipped: '건너뜀',
  overdue: '지연',
  waived: '면제',
  draft: '초안',
  submitted: '제출',
  approved: '승인',
  rejected: '반려',
  requested: '요청',
  paid: '납입 완료',
  partially_paid: '부분 납입',
  failed: '실패',
  open: '열림',
  closed: '종료',
  true: '예',
  false: '아니오',
  active: '활성',
}

const COMPACT_LABELS: Record<string, string> = {
  '추정 순자산가치(NAV)': '추정 NAV',
  '미체크 필수 문서 수': '미체크 문서',
  '진행 워크플로 수': '워크플로',
  '미완료 업무 수': '미완료 업무',
  '총 약정액': '약정액',
  '총 납입액': '납입액',
  '최신 평가금액': '최신 평가',
  '완료 단계 수': '완료 단계',
  '남은 단계 수': '남은 단계',
  '전체 단계 수': '전체 단계',
}

export function getAnalyticsAggregateLabel(aggregate?: AnalyticsAggregate | null) {
  if (!aggregate) return '합계'
  return AGGREGATE_LABELS[aggregate] ?? aggregate
}

export function getAnalyticsOperatorLabel(operator: string) {
  return OPERATOR_LABELS[operator] ?? operator
}

export function getAnalyticsCompactLabel(label: string) {
  return COMPACT_LABELS[label] ?? label
}

export function getAnalyticsFieldLabel(
  fieldKey: string,
  fieldMap: Record<string, AnalyticsFieldMeta> | null | undefined,
) {
  return fieldMap?.[fieldKey]?.label ?? fieldKey
}

export function getAnalyticsCompactFieldLabel(
  fieldKey: string,
  fieldMap: Record<string, AnalyticsFieldMeta> | null | undefined,
) {
  return getAnalyticsCompactLabel(getAnalyticsFieldLabel(fieldKey, fieldMap))
}

export function getAnalyticsSubjectLabel(
  subjectKey: string,
  subjects: Array<Pick<AnalyticsSubjectMeta, 'key' | 'label'>> | null | undefined,
) {
  return subjects?.find((subject) => subject.key === subjectKey)?.label ?? subjectKey
}

export function getAnalyticsValueLabel(value: unknown, fieldKey?: string) {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? '예' : '아니오'
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase()
  if (!normalized) return null

  if (fieldKey === 'fund.status') {
    if (normalized === 'active') return '운용 중'
    if (normalized === 'closed') return '청산 완료'
  }

  if (fieldKey?.includes('workflow') && normalized === 'active') {
    return '진행 중'
  }

  return GENERIC_VALUE_LABELS[normalized] ?? null
}
