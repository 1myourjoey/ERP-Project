import type {
  AnalyticsExecutiveCard,
  AnalyticsFilter,
  AnalyticsQueryRequest,
} from '../api/analytics'

export type ExecutiveDatePreset =
  | 'all'
  | 'recent_30_days'
  | 'this_quarter'
  | 'ytd'
  | 'last_12_months'

export interface ExecutiveFilterState {
  datePreset: ExecutiveDatePreset
  funds: string[]
}

export const EXECUTIVE_DATE_PRESET_OPTIONS: Array<{ value: ExecutiveDatePreset; label: string }> = [
  { value: 'all', label: '전체 기간' },
  { value: 'recent_30_days', label: '최근 30일' },
  { value: 'this_quarter', label: '이번 분기' },
  { value: 'ytd', label: '연초 이후' },
  { value: 'last_12_months', label: '최근 12개월' },
]

function formatIsoDate(value: Date) {
  return value.toISOString().slice(0, 10)
}

function getQuarterStart(today: Date) {
  const month = today.getMonth()
  const quarterStartMonth = Math.floor(month / 3) * 3
  return new Date(today.getFullYear(), quarterStartMonth, 1)
}

function getDateRange(preset: ExecutiveDatePreset) {
  const today = new Date()
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  switch (preset) {
    case 'recent_30_days': {
      const start = new Date(end)
      start.setDate(start.getDate() - 29)
      return { start: formatIsoDate(start), end: formatIsoDate(end) }
    }
    case 'this_quarter': {
      const start = getQuarterStart(end)
      return { start: formatIsoDate(start), end: formatIsoDate(end) }
    }
    case 'ytd': {
      const start = new Date(end.getFullYear(), 0, 1)
      return { start: formatIsoDate(start), end: formatIsoDate(end) }
    }
    case 'last_12_months': {
      const start = new Date(end)
      start.setMonth(start.getMonth() - 11, 1)
      return { start: formatIsoDate(start), end: formatIsoDate(end) }
    }
    default:
      return null
  }
}

export function buildExecutiveCardQuery(card: AnalyticsExecutiveCard, filters: ExecutiveFilterState): AnalyticsQueryRequest {
  const merged: AnalyticsQueryRequest = {
    ...card.query,
    rows: [...card.query.rows],
    columns: [...card.query.columns],
    values: card.query.values.map((value) => ({ ...value })),
    selected_fields: [...card.query.selected_fields],
    filters: [...card.query.filters],
    sorts: card.query.sorts.map((sort) => ({ ...sort })),
    options: { ...card.query.options },
  }

  const extraFilters: AnalyticsFilter[] = []
  if (filters.funds.length > 0 && card.filter_binding.fund_field) {
    extraFilters.push({
      field: card.filter_binding.fund_field,
      op: 'in',
      value: filters.funds,
    })
  }

  const dateRange = card.filter_binding.date_field ? getDateRange(filters.datePreset) : null
  if (dateRange && card.filter_binding.date_field) {
    extraFilters.push({
      field: card.filter_binding.date_field,
      op: 'between',
      value: dateRange.start,
      value_to: dateRange.end,
    })
  }

  merged.filters = [...merged.filters, ...extraFilters]
  return merged
}

export function getExecutiveDatePresetLabel(value: ExecutiveDatePreset) {
  return EXECUTIVE_DATE_PRESET_OPTIONS.find((item) => item.value === value)?.label ?? value
}
