import type {
  AnalyticsFieldMeta,
  AnalyticsFilter,
  AnalyticsQueryOptions,
  AnalyticsSort,
} from '../../lib/api/analytics'
import { formatAnalyticsValue } from '../../lib/analytics/formatters'
import {
  getAnalyticsCompactFieldLabel,
  getAnalyticsFieldLabel,
  getAnalyticsOperatorLabel,
} from '../../lib/analytics/labels'
import { DEFAULT_ANALYTICS_OPTIONS } from '../../lib/analytics/queryReducer'

interface AnalyticsActiveSummaryBarProps {
  filters: AnalyticsFilter[]
  sorts: AnalyticsSort[]
  options: AnalyticsQueryOptions
  fieldMap: Record<string, AnalyticsFieldMeta>
}

function describeFilter(filter: AnalyticsFilter, fieldMap: Record<string, AnalyticsFieldMeta>) {
  const field = fieldMap[filter.field]
  const label = getAnalyticsCompactFieldLabel(filter.field, fieldMap)
  const operatorLabel = getAnalyticsOperatorLabel(filter.op)
  const omitValue =
    filter.op === 'is_true' ||
    filter.op === 'is_false' ||
    filter.op === 'is_empty' ||
    filter.op === 'is_not_empty'
  const valueLabel =
    filter.op === 'between'
      ? `${formatAnalyticsValue(filter.value, field?.data_type, filter.field)} ~ ${formatAnalyticsValue(
          filter.value_to,
          field?.data_type,
          filter.field,
        )}`
      : formatAnalyticsValue(filter.value, field?.data_type, filter.field)

  const text = omitValue ? `${label} · ${operatorLabel}` : `${label} · ${operatorLabel} · ${valueLabel}`
  const fullLabel = getAnalyticsFieldLabel(filter.field, fieldMap)
  return {
    text,
    title: omitValue ? `${fullLabel} · ${operatorLabel}` : `${fullLabel} · ${operatorLabel} · ${valueLabel}`,
  }
}

function renderChipRow(label: string, chips: Array<{ text: string; title: string }>, emphasis: 'primary' | 'muted') {
  if (chips.length === 0) return null

  const chipClass =
    emphasis === 'primary'
      ? 'border-[#d8e5fb] bg-[#f5f9ff] text-[#1a3660]'
      : 'border-[#e7efff] bg-[#fbfdff] text-[#64748b]'

  return (
    <div className="flex items-center gap-2">
      <span className="w-[52px] shrink-0 text-[11px] font-semibold text-[#64748b]">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overflow-y-hidden pb-0.5">
        {chips.map((chip, index) => (
          <span
            key={`${label}-${chip.text}-${index}`}
            title={chip.title}
            className={`h-7 shrink-0 max-w-[220px] truncate rounded-full border px-2.5 text-[11px] font-medium leading-[26px] ${chipClass}`}
          >
            {chip.text}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function AnalyticsActiveSummaryBar({
  filters,
  sorts,
  options,
  fieldMap,
}: AnalyticsActiveSummaryBarProps) {
  const optionChips: Array<{ text: string; title: string }> = []

  if (!options.show_subtotals) optionChips.push({ text: '소계 숨김', title: '소계 숨김' })
  if (!options.show_grand_totals) optionChips.push({ text: '전체합 숨김', title: '전체합 숨김' })
  if (options.hide_empty) optionChips.push({ text: '빈 값 숨김', title: '빈 값 숨김' })
  if (options.hide_zero) optionChips.push({ text: '0 값 숨김', title: '0 값 숨김' })
  if (options.row_limit !== DEFAULT_ANALYTICS_OPTIONS.row_limit) {
    optionChips.push({ text: `행 제한 ${options.row_limit}`, title: `행 제한 ${options.row_limit}` })
  }
  if (options.column_limit !== DEFAULT_ANALYTICS_OPTIONS.column_limit) {
    optionChips.push({ text: `열 제한 ${options.column_limit}`, title: `열 제한 ${options.column_limit}` })
  }

  const sortChips = sorts.map((sort) => {
    const compactLabel = getAnalyticsCompactFieldLabel(sort.field, fieldMap)
    const fullLabel = getAnalyticsFieldLabel(sort.field, fieldMap)
    const directionLabel = sort.direction === 'asc' ? '오름차순' : '내림차순'
    return {
      text: `${compactLabel} ${directionLabel}`,
      title: `${fullLabel} ${directionLabel}`,
    }
  })
  const filterChips = filters.map((filter) => describeFilter(filter, fieldMap))
  const secondaryChips = [...sortChips, ...optionChips]
  const hasSummary = filterChips.length > 0 || secondaryChips.length > 0

  if (!hasSummary) return null

  return (
    <div className="space-y-2 rounded-2xl border border-[#d8e5fb] bg-white px-3 py-2.5 shadow-sm">
      {renderChipRow('필터', filterChips, 'primary')}
      {renderChipRow('정렬/옵션', secondaryChips, 'muted')}
    </div>
  )
}
